import { z } from "zod";

/**
 * El pedido es el objeto central de CHUNO y lo que lo separa de un chatbot: un
 * chatbot produce respuestas, CHUNO produce estado operativo — algo con fecha
 * comprometida, responsable y ciclo de vida.
 */

export const ESTADOS_PEDIDO = [
  "borrador",
  "confirmado",
  "en_proceso",
  "listo",
  "entregado",
  "cancelado",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Fechas siempre como YYYY-MM-DD. Sin horas: la promesa al cliente es un día. */
export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const ItemPedidoSchema = z.object({
  descripcion: z.string().trim().min(1).max(200),
  cantidad: z.number().int().positive().max(999).default(1),
});

export type ItemPedido = z.infer<typeof ItemPedidoSchema>;

export const PedidoSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  conversacionId: z.string().min(1),
  clienteNombre: z.string().trim().min(1).max(120),
  items: z.array(ItemPedidoSchema).min(1).max(20),
  /** En centavos y entero: nunca flotantes para dinero. */
  montoCentavos: z.number().int().nonnegative().nullable(),
  fechaComprometida: z.string().regex(FECHA_ISO).nullable(),
  estado: z.enum(ESTADOS_PEDIDO),
  notas: z.string().max(1000).nullable(),
  creadoEn: z.string(),
  actualizadoEn: z.string(),
});

export type Pedido = z.infer<typeof PedidoSchema>;
