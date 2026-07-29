import { DurableObject } from "cloudflare:workers";

import {
  ESQUEMA_GEMINI_EXTRACCION,
  requiereAprobacion,
  validarExtraccion,
  type ExtraccionPedido,
} from "../core/pedido/extraccion";
import { crearCanalTelegram } from "../canales/telegram";
import { crearProveedorGemini } from "../llm/gemini";
import { hoyEnZona } from "../db/id";
import { modelos, numero, type Env } from "../env";
import { obtenerGiro } from "../giros";
import type { ContextoNegocio } from "../giros/tipos";
import { obtenerNegocio } from "../db/repos/negocio";
import {
  estaPausada,
  guardarMensaje,
  leerHilo,
  obtenerConversacion,
} from "../db/repos/conversacion";
import { crearPedido } from "../db/repos/pedido";
import { crearPropuesta } from "../db/repos/propuesta";
import { auditar, buscarConocimiento } from "../db/repos/varios";
import { comoMensajesLLM, comoTranscripcion, promptExtraccion, promptRespuesta } from "./prompt";

/**
 * Un Durable Object por conversación.
 *
 * Hace dos cosas que un Worker suelto no puede:
 *
 * 1. **Agrupa ráfagas.** La gente escribe "hola", "necesito unas gafas", "para el
 *    jueves" en tres mensajes seguidos. Sin buffer, el agente contestaría tres
 *    veces y extraería tres pedidos a medias. Se espera unos segundos y se procesa
 *    el hilo completo una sola vez.
 *
 * 2. **Serializa.** Dos mensajes simultáneos de la misma conversación no pueden
 *    crear dos pedidos duplicados, porque los atiende el mismo objeto en orden.
 *
 * Conversaciones distintas corren en objetos distintos y en paralelo: el
 * aislamiento no cuesta concurrencia.
 */

interface ContextoConversacion {
  readonly negocioId: string;
  readonly conversacionId: string;
  readonly canalChatId: string;
}

export class AgenteConversacion extends DurableObject<Env> {
  override async fetch(peticion: Request): Promise<Response> {
    const contexto = (await peticion.json()) as ContextoConversacion;

    await this.ctx.storage.put("contexto", contexto);

    // Si ya hay una alarma pendiente no la corremos hacia adelante: el cliente
    // que escribe sin parar recibiría respuesta solo cuando se callara.
    const pendiente = await this.ctx.storage.getAlarm();
    if (pendiente === null) {
      const espera = numero(this.env.BUFFER_SEGUNDOS, 15) * 1000;
      await this.ctx.storage.setAlarm(Date.now() + espera);
    }

    return new Response(null, { status: 202 });
  }

  override async alarm(): Promise<void> {
    const contexto = await this.ctx.storage.get<ContextoConversacion>("contexto");
    if (!contexto) return;

    try {
      await this.procesar(contexto);
    } catch (e) {
      // Nunca dejamos que una excepción tumbe el objeto en silencio, y nunca
      // metemos el contenido del mensaje en el log.
      console.error("agente: fallo procesando", {
        conversacion: contexto.conversacionId.slice(-4),
        error: e instanceof Error ? e.message : "desconocido",
      });
    }
  }

  private async procesar(contexto: ContextoConversacion): Promise<void> {
    const { negocioId, conversacionId, canalChatId } = contexto;
    const db = this.env.DB;

    const negocio = await obtenerNegocio(db, negocioId);
    const conversacion = await obtenerConversacion(db, negocioId, conversacionId);
    if (!negocio || !conversacion) return;

    // El dueño está atendiendo personalmente: el agente se queda callado.
    if (estaPausada(conversacion)) return;

    const hilo = await leerHilo(db, negocioId, conversacionId);
    if (hilo.length === 0) return;

    const ultimoDelCliente = [...hilo].reverse().find((m) => m.autor === "cliente");
    if (!ultimoDelCliente) return;

    const giro = obtenerGiro(negocio.giro);
    const llm = crearProveedorGemini(this.env.GEMINI_API_KEY, modelos(this.env));
    const canal = crearCanalTelegram(this.env.TELEGRAM_BOT_TOKEN);

    const contextoNegocio: ContextoNegocio = {
      nombre: negocio.nombre,
      hoy: hoyEnZona(negocio.zonaHoraria),
      zonaHoraria: negocio.zonaHoraria,
      conocimiento: await buscarConocimiento(db, negocioId, ultimoDelCliente.texto),
    };

    // ── 1. Responderle al cliente ─────────────────────────────────────────
    const respuesta = await llm.generarTexto({
      sistema: promptRespuesta(giro, contextoNegocio),
      mensajes: comoMensajesLLM(hilo),
    });

    if (respuesta.ok) {
      const envio = await canal.enviar(canalChatId, respuesta.valor);
      if (envio.ok) {
        await guardarMensaje(db, negocioId, conversacionId, "agente", respuesta.valor);
      }
    } else {
      // Que el cerebro falle no puede dejar al cliente hablando solo.
      await canal.enviar(
        canalChatId,
        "Recibí tu mensaje. Déjame confirmarlo con el equipo y te escribo.",
      );
      await auditar(db, negocioId, "respuesta_fallida", { motivo: respuesta.error }, "agente");
    }

    // ── 2. Extraer el pedido ──────────────────────────────────────────────
    if (!giro.manejaPedidos) return;

    const extraccion = await llm.generarJSON<ExtraccionPedido>({
      sistema: promptExtraccion(giro, contextoNegocio),
      mensajes: [{ rol: "usuario", texto: comoTranscripcion(hilo) }],
      esquema: ESQUEMA_GEMINI_EXTRACCION,
      validar: validarExtraccion,
    });

    if (!extraccion.ok) {
      await auditar(db, negocioId, "extraccion_fallida", { motivo: extraccion.error }, "agente");
      return;
    }

    await this.registrarPedido(negocio.id, conversacion.id, extraccion.valor, conversacion.clienteNombre);
  }

  /**
   * Aquí termina lo probabilístico. La extracción ya pasó por el esquema; lo que
   * queda es una decisión determinista: ¿esto lo puede hacer el agente solo, o
   * necesita el criterio del dueño?
   */
  private async registrarPedido(
    negocioId: string,
    conversacionId: string,
    extraccion: ExtraccionPedido,
    nombreConversacion: string | null,
  ): Promise<void> {
    const db = this.env.DB;

    if (!extraccion.hayPedido) return;

    // Sin nada concreto que pedir no hay pedido, por más seguro que esté el
    // modelo. Se deja rastro para poder afinar el prompt después.
    if (extraccion.items.length === 0) {
      await auditar(
        db,
        negocioId,
        "pedido_descartado",
        { motivo: "sin items", confianza: extraccion.confianza },
        "agente",
      );
      return;
    }

    const clienteNombre = extraccion.clienteNombre ?? nombreConversacion ?? "Cliente";

    if (requiereAprobacion(extraccion)) {
      const razones = [
        ...extraccion.ambiguedades,
        extraccion.fechaComprometida === null ? "no quedó clara la fecha de entrega" : null,
        extraccion.confianza < 0.8 ? "el asistente no está seguro de los datos" : null,
      ].filter((r): r is string => r !== null);

      await crearPropuesta(db, {
        negocioId,
        payload: {
          tipo: "crear_pedido",
          conversacionId,
          clienteNombre,
          items: extraccion.items,
          montoCentavos: extraccion.montoCentavos,
          fechaComprometida: extraccion.fechaComprometida,
          notas: extraccion.notas,
        },
        motivo: razones[0] ?? "revisa los datos antes de confirmar",
        confianza: extraccion.confianza,
      });

      await auditar(
        db,
        negocioId,
        "propuesta_creada",
        { tipo: "crear_pedido", confianza: extraccion.confianza, razones: razones.length },
        "agente",
      );
      return;
    }

    const pedido = await crearPedido(db, {
      negocioId,
      conversacionId,
      clienteNombre,
      items: extraccion.items,
      montoCentavos: extraccion.montoCentavos,
      fechaComprometida: extraccion.fechaComprometida,
      notas: extraccion.notas,
      estado: "confirmado",
    });

    await auditar(
      db,
      negocioId,
      "pedido_creado",
      { pedidoId: pedido.id, confianza: extraccion.confianza, automatico: true },
      "agente",
    );
  }
}

/** Un objeto por conversación, siempre el mismo para el mismo par negocio+chat. */
export function idDeConversacion(
  namespace: DurableObjectNamespace,
  negocioId: string,
  conversacionId: string,
): DurableObjectStub {
  return namespace.get(namespace.idFromName(`${negocioId}:${conversacionId}`));
}
