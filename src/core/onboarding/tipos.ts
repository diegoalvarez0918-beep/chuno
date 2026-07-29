import { z } from "zod";

/**
 * La entrevista de onboarding: 7 preguntas y un estado que avanza.
 *
 * El orden de PASOS ES la entrevista. "listo" no es una pregunta: es el
 * resumen final esperando confirmación.
 */
export const PASOS = [
  "nombre",
  "queVendes",
  "horario",
  "catalogo",
  "faq",
  "tono",
  "telegram",
  "listo",
] as const;

export type Paso = (typeof PASOS)[number];

/** Lo que la entrevista sabe de un producto ANTES de que exista en la base. */
export const ItemCatalogoEntradaSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().max(300).nullable().default(null),
  precioCentavos: z.number().int().nonnegative().max(5_000_000_000).nullable().default(null),
  diasEntrega: z.number().int().positive().max(365).nullable().default(null),
});

export type ItemCatalogoEntrada = z.infer<typeof ItemCatalogoEntradaSchema>;

export const FaqEntradaSchema = z.object({
  pregunta: z.string().trim().min(1).max(300),
  respuesta: z.string().trim().min(1).max(1000),
});

export type FaqEntrada = z.infer<typeof FaqEntradaSchema>;

/**
 * El estado completo de una entrevista. Es un esquema Zod y no solo un tipo
 * porque viaja por D1 como JSON: al leerlo se valida, no se confía.
 *
 * Nótese qué NO hay aquí: ids, negocioId, estados de pedido. La entrevista
 * solo puede expresar respuestas.
 */
export const EstadoEntrevistaSchema = z.object({
  paso: z.enum(PASOS),
  datos: z.object({
    nombre: z.string().optional(),
    queVendes: z.string().optional(),
    horario: z.string().optional(),
    catalogo: z.array(ItemCatalogoEntradaSchema).max(60).optional(),
    faq: z.array(FaqEntradaSchema).max(40).optional(),
    /** null = el dueño saltó la pregunta; ausente = aún no la contesta. */
    tono: z.string().nullable().optional(),
    telegramToken: z.string().nullable().optional(),
  }),
});

export type EstadoEntrevista = z.infer<typeof EstadoEntrevistaSchema>;
export type DatosEntrevista = EstadoEntrevista["datos"];

/** Una respuesta ya estructurada, lista para aplicarse al estado. */
export type RespuestaPaso =
  | { paso: "nombre"; nombre: string }
  | { paso: "queVendes"; queVendes: string }
  | { paso: "horario"; horario: string }
  | { paso: "catalogo"; items: ItemCatalogoEntrada[] }
  | { paso: "faq"; faqs: FaqEntrada[] }
  | { paso: "tono"; tono: string | null }
  | { paso: "telegram"; token: string | null };
