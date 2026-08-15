import { z } from "zod";
import { fallo, ok, type Resultado } from "../resultado";
import { ESTADOS_PEDIDO, FECHA_ISO, ItemPedidoSchema } from "../pedido/tipos";

/**
 * La bandeja de decisiones.
 *
 * Cuando el agente quiere hacer algo que sale hacia el cliente, o algo sobre lo
 * que no tiene certeza, no lo hace: deja una propuesta. El dueño aprueba, edita o
 * rechaza. Esa es la promesa del producto — "el agente nunca le habla a tu cliente
 * sin que tú lo autorices" — y por eso vive en el núcleo y no en la interfaz.
 */

export const ESTADOS_PROPUESTA = ["propuesta", "aplicada", "descartada"] as const;
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number];

const PayloadCrearPedido = z.object({
  tipo: z.literal("crear_pedido"),
  conversacionId: z.string().min(1),
  clienteNombre: z.string().trim().min(1).max(120),
  items: z.array(ItemPedidoSchema).min(1).max(20),
  montoCentavos: z.number().int().nonnegative().nullable(),
  fechaComprometida: z.string().regex(FECHA_ISO).nullable(),
  notas: z.string().max(1000).nullable(),
});

const PayloadCambiarEstado = z.object({
  tipo: z.literal("cambiar_estado"),
  pedidoId: z.string().min(1),
  hacia: z.enum(ESTADOS_PEDIDO),
});

const PayloadCambiarFecha = z.object({
  tipo: z.literal("cambiar_fecha"),
  pedidoId: z.string().min(1),
  fechaComprometida: z.string().regex(FECHA_ISO),
});

const PayloadEnviarAviso = z.object({
  tipo: z.literal("enviar_aviso"),
  conversacionId: z.string().min(1),
  pedidoId: z.string().min(1).nullable(),
  /** El texto que saldría al cliente. El dueño puede editarlo antes de aprobar. */
  texto: z.string().trim().min(1).max(1000),
  /**
   * La pregunta que obligó a escalar, cuando la hubo. Viaja con la propuesta
   * para que al aprobarla se pueda guardar la pareja pregunta-respuesta como
   * conocimiento del negocio: es lo que hace que el asistente moleste cada vez
   * menos. Opcional porque los avisos del vigía no nacen de una pregunta, y
   * porque las propuestas guardadas antes de esto no lo traen.
   */
  pregunta: z.string().trim().min(1).max(500).nullish(),
});

export const PayloadPropuestaSchema = z.discriminatedUnion("tipo", [
  PayloadCrearPedido,
  PayloadCambiarEstado,
  PayloadCambiarFecha,
  PayloadEnviarAviso,
]);

export type PayloadPropuesta = z.infer<typeof PayloadPropuestaSchema>;
export type TipoPropuesta = PayloadPropuesta["tipo"];

export const PropuestaSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  estado: z.enum(ESTADOS_PROPUESTA),
  payload: PayloadPropuestaSchema,
  /** En lenguaje de dueño: por qué el agente está pidiendo permiso. */
  motivo: z.string().trim().min(1).max(500),
  confianza: z.number().min(0).max(1).nullable(),
  creadoEn: z.string(),
  resueltoEn: z.string().nullable(),
  resueltoPor: z.string().nullable(),
});

export type Propuesta = z.infer<typeof PropuestaSchema>;

export interface Decision {
  readonly decision: "aplicada" | "descartada";
  readonly porQuien: string;
  /** Presente cuando el dueño editó antes de aprobar. */
  readonly payloadEditado?: PayloadPropuesta;
}

/**
 * Resuelve una propuesta. Una propuesta se resuelve una sola vez: reintentar
 * sobre una ya resuelta es un error, no una operación idempotente — si dos
 * pestañas abiertas aprueban lo mismo, el segundo clic tiene que fallar en vez de
 * mandarle dos mensajes al cliente.
 */
export function resolver(
  propuesta: Propuesta,
  decision: Decision,
  ahora: string,
): Resultado<Propuesta, string> {
  if (propuesta.estado !== "propuesta") {
    return fallo(`la propuesta ya fue ${propuesta.estado}`);
  }

  if (decision.payloadEditado && decision.payloadEditado.tipo !== propuesta.payload.tipo) {
    return fallo(
      `la edición cambia el tipo de "${propuesta.payload.tipo}" a "${decision.payloadEditado.tipo}"`,
    );
  }

  return ok({
    ...propuesta,
    estado: decision.decision,
    payload: decision.payloadEditado ?? propuesta.payload,
    resueltoEn: ahora,
    resueltoPor: decision.porQuien,
  });
}

export function estaPendiente(propuesta: Propuesta): boolean {
  return propuesta.estado === "propuesta";
}

/**
 * ¿Esta conversación ya tiene una pregunta esperando respuesta del dueño?
 *
 * El agente escala cuando el cliente pregunta algo que no está en el
 * conocimiento cargado, y la clave de deduplicación se armaba con el texto de
 * la pregunta **tal como la redacta el modelo**. Ese texto cambia en cada
 * pasada: "¿tienen gafas de sol?" y "El cliente consulta por disponibilidad y
 * precios de gafas de sol" son la misma pregunta y dos claves distintas. El
 * dedupe no deduplicaba nada — en producción se midieron ONCE tarjetas de una
 * sola conversación, todas la misma pregunta.
 *
 * La lección, y por eso vive en el núcleo: **una clave de deduplicación no
 * puede salir de texto que escribe un modelo.** La regla que sí se sostiene no
 * depende de la redacción: mientras el dueño no haya contestado la pregunta que
 * tiene, no se le apila otra. Cuando conteste, una pregunta nueva vuelve a
 * escalar — que es justo lo que un aviso por día no permitiría.
 *
 * El discriminante contra los avisos del vigía es `pedidoId`: aquellos siempre
 * traen el pedido del que hablan, y una escalación nace de una pregunta.
 */
export function yaHayEscalacionPendiente(
  propuestas: readonly Propuesta[],
  conversacionId: string,
): boolean {
  return propuestas.some(
    (p) =>
      p.estado === "propuesta" &&
      p.payload.tipo === "enviar_aviso" &&
      p.payload.pedidoId === null &&
      p.payload.conversacionId === conversacionId,
  );
}
