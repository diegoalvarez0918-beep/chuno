import { comoFaq, yaEstaEnFaq } from "../core/conocimiento/aprendizaje";
import { guardarFaq, listarFaq } from "../db/repos/catalogo";
import { transicionar } from "../core/pedido/estado";
import { resolver, type Decision, type PayloadPropuesta, type Propuesta } from "../core/propuesta/tipos";
import { fallo, ok, type Resultado } from "../core/resultado";
import { canalSaliente } from "../canales/salida";
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
  /** El dueño marcó que su respuesta sirve para la próxima vez. */
  aprender = false,
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

  const ejecutado = await ejecutar(env, negocioId, resuelta.valor, aprender);
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

/**
 * Convierte la respuesta que el dueño acaba de aprobar en conocimiento suyo.
 *
 * Si esa pregunta ya estaba guardada, se ACTUALIZA en vez de duplicarse: el
 * bloque de preguntas frecuentes entra entero al prompt, y dos versiones de lo
 * mismo son ruido que el modelo tiene que desempatar solo.
 */
async function aprenderDeLaRespuesta(
  env: Env,
  negocioId: string,
  pregunta: string,
  respuesta: string,
): Promise<void> {
  const aprendida = comoFaq(pregunta, respuesta);
  if (!aprendida.ok) {
    await auditar(env.DB, negocioId, "aprendizaje_descartado", { motivo: aprendida.error }, "admin");
    return;
  }

  const existentes = await listarFaq(env.DB, negocioId);
  const previa = yaEstaEnFaq(existentes, aprendida.valor.pregunta);

  await guardarFaq(env.DB, {
    id: previa?.id ?? null,
    negocioId,
    pregunta: aprendida.valor.pregunta,
    respuesta: aprendida.valor.respuesta,
  });

  await auditar(
    env.DB,
    negocioId,
    "conocimiento_aprendido",
    { actualizada: previa !== null },
    "admin",
  );
}

async function ejecutar(
  env: Env,
  negocioId: string,
  propuesta: Propuesta,
  aprender: boolean,
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

      const canal = await canalSaliente(env, negocioId, conversacion.canal);
      const envio = await canal.enviar(conversacion.canalChatId, p.texto);
      if (!envio.ok) return fallo(`no se pudo enviar: ${envio.error}`);

      await guardarMensaje(env.DB, negocioId, p.conversacionId, "dueno", p.texto);
      await auditar(env.DB, negocioId, "aviso_enviado", { pedidoId: p.pedidoId }, "admin");

      // El lazo que hace que el asistente moleste cada vez menos. Va DESPUÉS
      // del envío y nunca antes: si el mensaje no salió, no hay nada aprendido
      // que valga. Y si aprender falla, el cliente ya recibió su respuesta, así
      // que no se devuelve error: se audita y se sigue.
      if (aprender && p.pregunta) {
        await aprenderDeLaRespuesta(env, negocioId, p.pregunta, p.texto);
      }

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
