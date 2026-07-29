import { transicionar } from "../core/pedido/estado";
import { resolver, type Decision, type PayloadPropuesta, type Propuesta } from "../core/propuesta/tipos";
import { fallo, ok, type Resultado } from "../core/resultado";
import { canalDemo } from "../canales/demo";
import { crearCanalTelegram } from "../canales/telegram";
import type { Canal } from "../canales/tipos";
import { ahoraISO } from "../db/id";
import type { Env } from "../env";
import { guardarMensaje, obtenerConversacion } from "../db/repos/conversacion";
import { crearPedido, guardarPedido, obtenerPedido } from "../db/repos/pedido";
import { guardarResolucion, obtenerPropuesta } from "../db/repos/propuesta";
import { auditar } from "../db/repos/varios";

/**
 * Ejecuta lo que el dueño acaba de aprobar.
 *
 * El orden importa y es deliberado: primero se marca la propuesta como resuelta
 * —con un UPDATE condicionado a que siga pendiente— y solo si eso gana se ejecuta
 * la acción. Al revés, dos clics simultáneos mandarían dos mensajes al cliente.
 */
export async function decidirPropuesta(
  env: Env,
  negocioId: string,
  propuestaId: string,
  decision: "aprobar" | "rechazar",
  edicion: { texto?: string; fecha?: string },
): Promise<Resultado<string, string>> {
  const propuesta = await obtenerPropuesta(env.DB, negocioId, propuestaId);
  if (!propuesta) return fallo("esa decisión ya no existe");

  const payloadEditado = aplicarEdicion(propuesta.payload, edicion);

  const orden: Decision = {
    decision: decision === "aprobar" ? "aplicada" : "descartada",
    porQuien: "admin",
    ...(payloadEditado ? { payloadEditado } : {}),
  };

  const resuelta = resolver(propuesta, orden, ahoraISO());
  if (!resuelta.ok) return fallo(resuelta.error);

  const gano = await guardarResolucion(env.DB, resuelta.valor);
  if (!gano) return fallo("otra persona ya decidió esto");

  if (decision === "rechazar") {
    await auditar(env.DB, negocioId, "propuesta_rechazada", { tipo: propuesta.payload.tipo }, "admin");
    return ok("Descartado");
  }

  const ejecutado = await ejecutar(env, negocioId, resuelta.valor);
  await auditar(
    env.DB,
    negocioId,
    "propuesta_aprobada",
    { tipo: propuesta.payload.tipo, exito: ejecutado.ok },
    "admin",
  );

  return ejecutado;
}

/** Solo se admite editar lo que la vista ofrece editar, y sin cambiar el tipo. */
function aplicarEdicion(
  payload: PayloadPropuesta,
  edicion: { texto?: string; fecha?: string },
): PayloadPropuesta | null {
  if (payload.tipo === "enviar_aviso" && edicion.texto && edicion.texto.trim() !== payload.texto) {
    return { ...payload, texto: edicion.texto.trim() };
  }

  if (payload.tipo === "crear_pedido" && edicion.fecha !== undefined) {
    const fecha = edicion.fecha.trim() === "" ? null : edicion.fecha.trim();
    if (fecha !== payload.fechaComprometida) return { ...payload, fechaComprometida: fecha };
  }

  return null;
}

async function ejecutar(
  env: Env,
  negocioId: string,
  propuesta: Propuesta,
): Promise<Resultado<string, string>> {
  const p = propuesta.payload;

  switch (p.tipo) {
    case "crear_pedido": {
      await crearPedido(env.DB, {
        negocioId,
        conversacionId: p.conversacionId,
        clienteNombre: p.clienteNombre,
        items: p.items,
        montoCentavos: p.montoCentavos,
        fechaComprometida: p.fechaComprometida,
        notas: p.notas,
        // Lo aprobó un humano: nace confirmado, no en borrador.
        estado: "confirmado",
      });
      return ok("Pedido creado");
    }

    case "enviar_aviso": {
      const conversacion = await obtenerConversacion(env.DB, negocioId, p.conversacionId);
      if (!conversacion) return fallo("la conversación ya no existe");

      const canal = canalPara(env, conversacion.canal);
      const envio = await canal.enviar(conversacion.canalChatId, p.texto);
      if (!envio.ok) return fallo(`no se pudo enviar: ${envio.error}`);

      await guardarMensaje(env.DB, negocioId, p.conversacionId, "dueno", p.texto);
      await auditar(env.DB, negocioId, "aviso_enviado", { pedidoId: p.pedidoId }, "admin");
      return ok("Mensaje enviado");
    }

    case "cambiar_estado": {
      const pedido = await obtenerPedido(env.DB, negocioId, p.pedidoId);
      if (!pedido) return fallo("el pedido ya no existe");

      const movido = transicionar(pedido, p.hacia, ahoraISO());
      if (!movido.ok) return fallo(movido.error);

      await guardarPedido(env.DB, movido.valor);
      return ok("Pedido actualizado");
    }

    case "cambiar_fecha": {
      const pedido = await obtenerPedido(env.DB, negocioId, p.pedidoId);
      if (!pedido) return fallo("el pedido ya no existe");

      await guardarPedido(env.DB, {
        ...pedido,
        fechaComprometida: p.fechaComprometida,
        actualizadoEn: ahoraISO(),
      });
      return ok("Fecha actualizada");
    }
  }
}

function canalPara(env: Env, id: string): Canal {
  return id === "telegram" ? crearCanalTelegram(env.TELEGRAM_BOT_TOKEN) : canalDemo;
}
