import { DurableObject } from "cloudflare:workers";

import {
  ESQUEMA_GEMINI_EXTRACCION,
  requiereAprobacion,
  validarExtraccion,
  type ExtraccionPedido,
} from "../core/pedido/extraccion";
import { canalSaliente } from "../canales/salida";
import { crearProveedorGemini } from "../llm/gemini";
import { hoyEnZona } from "../db/id";
import { modelos, numero, type Env } from "../env";
import { obtenerGiro } from "../giros";
import type { ContextoNegocio } from "../giros/tipos";
import { filtrarCatalogo, filtrarFaq } from "../core/conocimiento/busqueda";
import { listarCatalogo, listarFaq } from "../db/repos/catalogo";
import { leerSetting, obtenerNegocio } from "../db/repos/negocio";
import {
  estaPausada,
  guardarMensaje,
  leerHilo,
  obtenerConversacion,
} from "../db/repos/conversacion";
import { yaHayEncargoVivo } from "../core/pedido/dedupe";
import { crearPedido, listarPedidosDeConversacion } from "../db/repos/pedido";
import { crearPropuesta, listarPendientes } from "../db/repos/propuesta";
import { auditar, buscarConocimiento, crearTicket } from "../db/repos/varios";
import { registrarContacto, registrarLead } from "../db/repos/crm";
import { registrarUso } from "../db/repos/uso";
import type { UsoLLM } from "../llm/tipos";
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
    const canal = await canalSaliente(this.env, negocioId, conversacion.canal);

    // El CRM se alimenta aquí: sin pantalla de captura y sin que nadie escriba
    // nada. Un CRM que exige que alguien capture los datos es un CRM que se
    // abandona a la semana.
    const contacto = await registrarContacto(
      db,
      negocioId,
      conversacion.canal,
      conversacion.canalChatId,
      conversacion.clienteNombre,
    );

    // El consumo se acumula en memoria y se escribe una sola vez al final, pase
    // lo que pase: contabilizar el gasto no puede costar un viaje a la base por
    // cada llamada al modelo, y una llamada que falló igual consumió cuota.
    const usos: UsoLLM[] = [];
    const llm = crearProveedorGemini(this.env.GEMINI_API_KEY, modelos(this.env), (u) =>
      usos.push(u),
    );

    try {

    const [conocimiento, catalogoCompleto, faqCompletas, tono] = await Promise.all([
      buscarConocimiento(db, negocioId, ultimoDelCliente.texto),
      listarCatalogo(db, negocioId),
      listarFaq(db, negocioId),
      leerSetting(db, negocioId, "tono"),
    ]);

    const contextoNegocio: ContextoNegocio = {
      nombre: negocio.nombre,
      hoy: hoyEnZona(negocio.zonaHoraria),
      zonaHoraria: negocio.zonaHoraria,
      conocimiento,
      catalogo: filtrarCatalogo(catalogoCompleto, ultimoDelCliente.texto),
      faq: filtrarFaq(faqCompletas, ultimoDelCliente.texto),
      tono,
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
      } else {
        // Un envío que falla en silencio es lo peor de los dos mundos: el
        // cliente no recibe nada y el dueño no se entera de que no recibió.
        // El motivo viene ya saneado del canal — nunca trae texto del mensaje.
        await auditar(db, negocioId, "envio_fallido", { motivo: envio.error }, "agente");
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

    const clienteNombre =
      extraccion.valor.clienteNombre ?? conversacion.clienteNombre ?? "Cliente";

    // Dos consecuencias posibles y ninguna se excluye: un cliente puede encargar
    // algo y de paso preguntar algo que el asistente no sabe.
    const escalo = await this.escalarSiHaceFalta(
      negocio.id,
      conversacion.id,
      extraccion.valor,
      clienteNombre,
    );
    const registro = await this.registrarPedido(
      negocio.id,
      conversacion.id,
      extraccion.valor,
      clienteNombre,
    );

    // Sin esta traza, una extracción correcta que no produce nada es
    // indistinguible de una que nunca corrió.
      if (!escalo && !registro) {
        await auditar(
          db,
          negocio.id,
          "sin_accion",
          { hayPedido: extraccion.valor.hayPedido, confianza: extraccion.valor.confianza },
          "agente",
        );
      }

      // Un contacto que encarga algo o que pregunta algo que no sabemos
      // responder es una oportunidad de venta. Uno que saluda, no.
      if (extraccion.valor.hayPedido || extraccion.valor.necesitaHumano) {
        await registrarLead(db, {
          negocioId,
          contactoId: contacto.id,
          interes:
            extraccion.valor.items.map((i) => i.descripcion).join(", ") ||
            extraccion.valor.preguntaPendiente,
          valorEstimadoCentavos: extraccion.valor.montoCentavos,
        });
      }
    } finally {
      await registrarUso(db, negocioId, usos);
    }
  }

  /**
   * El asistente le dijo al cliente "déjame confirmo con el dueño". Esto es lo
   * que hace que esa frase sea verdad.
   *
   * Deja en la bandeja un borrador vacío para que el dueño escriba la respuesta y
   * la envíe con un clic, más un ticket abierto para que quede el rastro.
   */
  private async escalarSiHaceFalta(
    negocioId: string,
    conversacionId: string,
    extraccion: ExtraccionPedido,
    clienteNombre: string,
  ): Promise<boolean> {
    if (!extraccion.necesitaHumano || !extraccion.preguntaPendiente) return false;

    const primerNombre = clienteNombre.split(" ")[0] ?? clienteNombre;
    const pregunta = extraccion.preguntaPendiente;

    const propuesta = await crearPropuesta(this.env.DB, {
      negocioId,
      payload: {
        tipo: "enviar_aviso",
        conversacionId,
        pedidoId: null,
        texto: `Hola ${primerNombre}, sobre lo que me preguntaste: `,
      },
      motivo: `${clienteNombre} preguntó: "${pregunta}". No está en la información que tienes cargada. Escríbele la respuesta y yo se la envío.`,
      confianza: null,
      // La misma pregunta no vuelve a la bandeja; una distinta sí.
      claveDedupe: `pregunta:${conversacionId}:${pregunta.slice(0, 60)}`,
    });

    if (!propuesta) return false;

    await crearTicket(this.env.DB, negocioId, conversacionId, pregunta);
    await auditar(this.env.DB, negocioId, "escalado_a_humano", { conversacionId }, "agente");

    return true;
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
    clienteNombre: string,
  ): Promise<boolean> {
    const db = this.env.DB;

    if (!extraccion.hayPedido) return false;

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
      return true;
    }

    // Antes de registrar nada: ¿este encargo ya está registrado?
    //
    // El agente re-lee el hilo completo en cada ráfaga, así que tres mensajes
    // seguidos del mismo cliente son tres extracciones del mismo encargo. Hay
    // que preguntar por los dos caminos a la vez, porque el de alta confianza
    // deja una fila en `pedidos` y el de baja confianza deja una propuesta sin
    // decidir: mirar solo uno deja pasar el duplicado por el otro.
    const [previos, pendientes] = await Promise.all([
      listarPedidosDeConversacion(db, negocioId, conversacionId),
      listarPendientes(db, negocioId),
    ]);

    const hayPropuestaDePedido = pendientes.some(
      (p) => p.payload.tipo === "crear_pedido" && p.payload.conversacionId === conversacionId,
    );

    if (yaHayEncargoVivo(previos.map((p) => p.estado), hayPropuestaDePedido)) {
      await auditar(
        db,
        negocioId,
        "pedido_duplicado_evitado",
        { conversacionId, previos: previos.length },
        "agente",
      );
      return true;
    }

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
      return true;
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

    return true;
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
