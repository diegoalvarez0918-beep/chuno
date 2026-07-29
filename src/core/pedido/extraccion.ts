import { z } from "zod";
import { FECHA_ISO, ItemPedidoSchema } from "./tipos";

/**
 * LA FRONTERA DE SEGURIDAD.
 *
 * Esto es todo lo que el modelo tiene permitido proponer al leer una conversación.
 * Importa tanto lo que está como lo que NO está: no hay `id`, no hay `estado`, no
 * hay `negocioId`, no hay timestamps.
 *
 * El modelo no puede marcar un pedido como "entregado" ni inventarse un id ni
 * escribir en el negocio de otro — no porque se lo pidamos amablemente en el
 * prompt, sino porque esos campos no existen en el contrato. Todo lo que salga
 * del LLM se valida contra este esquema antes de acercarse a la base de datos.
 *
 * Consecuencia práctica: la superficie de inyección de prompt para *acciones* es
 * cero. Lo peor que logra un atacante que controle el texto de la conversación es
 * proponer un pedido feo, que además cae en la bandeja de aprobación del dueño.
 */
export const ExtraccionPedidoSchema = z.object({
  /** false cuando la conversación es una consulta y no un encargo. */
  hayPedido: z.boolean(),

  clienteNombre: z.string().trim().min(1).max(120).nullable().default(null),
  items: z.array(ItemPedidoSchema).max(20).default([]),

  /** Tope de cordura: atrapa al modelo alucinando cifras absurdas. */
  montoCentavos: z.number().int().nonnegative().max(5_000_000_000).nullable().default(null),

  fechaComprometida: z.string().regex(FECHA_ISO).nullable().default(null),
  notas: z.string().max(1000).nullable().default(null),

  /** Autoevaluación del modelo. Se usa para decidir si hace falta un humano. */
  confianza: z.number().min(0).max(1),

  /**
   * Lo que el modelo no logró resolver: "dijo 'el jueves' pero no sé cuál",
   * "mencionó dos monturas y no aclaró cuál quiere". Cada entrada aquí es una
   * razón para no actuar solo.
   */
  ambiguedades: z.array(z.string().max(200)).max(10).default([]),
});

export type ExtraccionPedido = z.infer<typeof ExtraccionPedidoSchema>;

/** Por debajo de esto, no se actúa sin un humano. */
export const UMBRAL_CONFIANZA = 0.8;

/**
 * La regla que decide si algo pasa directo o va a la bandeja del dueño.
 *
 * Es deliberadamente conservadora: ante la duda, interrumpe al humano. Un pedido
 * creado de más cuesta un clic; una fecha inventada le cuesta un cliente al
 * negocio.
 */
export function requiereAprobacion(
  extraccion: ExtraccionPedido,
  umbral: number = UMBRAL_CONFIANZA,
): boolean {
  if (!extraccion.hayPedido) return false;
  if (extraccion.confianza < umbral) return true;
  if (extraccion.ambiguedades.length > 0) return true;

  // Un pedido sin fecha comprometida no sirve para nada en CHUNO: el vigía no
  // tiene qué vigilar. Que lo confirme el dueño.
  if (extraccion.fechaComprometida === null) return true;

  if (extraccion.items.length === 0) return true;
  if (extraccion.clienteNombre === null) return true;

  return false;
}
