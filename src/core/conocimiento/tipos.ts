import { z } from "zod";

/**
 * Conocimiento estructurado del negocio.
 *
 * La tabla `conocimiento` (texto libre) sigue existiendo para lo narrativo:
 * dirección, garantías, políticas. Esto es lo otro: datos con forma — un
 * producto tiene precio y tiempo de entrega, una FAQ tiene pregunta y
 * respuesta. Con forma, el agente puede citar precios sin inventar y el
 * onboarding puede generarlos desde una lista pegada.
 */

export const ItemCatalogoSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().max(300).nullable(),
  /** Tope de cordura, igual que en la extracción de pedidos. */
  precioCentavos: z.number().int().nonnegative().max(5_000_000_000).nullable(),
  diasEntrega: z.number().int().positive().max(365).nullable(),
  /**
   * Llave del objeto en el almacén de imágenes, nunca la imagen.
   * El núcleo no sabe qué hay detrás de la llave ni le importa: hoy es KV y
   * mañana puede ser otra cosa sin tocar este contrato.
   */
  imagenClave: z.string().trim().min(1).max(200).nullable().default(null),
});

export type ItemCatalogo = z.infer<typeof ItemCatalogoSchema>;

export const FaqSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  pregunta: z.string().trim().min(1).max(300),
  respuesta: z.string().trim().min(1).max(1000),
});

export type Faq = z.infer<typeof FaqSchema>;
