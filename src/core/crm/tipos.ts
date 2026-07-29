import { z } from "zod";

/**
 * El CRM se alimenta solo desde las conversaciones. Por eso el contacto no tiene
 * campos que alguien tenga que capturar a mano: todo lo que hay aquí se puede
 * deducir de un mensaje que llegó.
 */

export const ESTADOS_LEAD = ["nuevo", "contactado", "interesado", "cliente", "perdido"] as const;
export type EstadoLead = (typeof ESTADOS_LEAD)[number];

export const ContactoSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  nombre: z.string().trim().min(1).max(120),
  canal: z.string().min(1),
  /** Identificador del contacto dentro del canal. Es PII: nunca va a logs. */
  canalChatId: z.string().min(1),
  primeraInteraccion: z.string(),
  ultimaInteraccion: z.string(),
  totalMensajes: z.number().int().nonnegative(),
});

export type Contacto = z.infer<typeof ContactoSchema>;

export const LeadSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  contactoId: z.string().min(1),
  estado: z.enum(ESTADOS_LEAD),
  /** Qué quiere, en una línea. Lo deduce el agente de la conversación. */
  interes: z.string().trim().max(300).nullable(),
  valorEstimadoCentavos: z.number().int().nonnegative().nullable(),
  creadoEn: z.string(),
  actualizadoEn: z.string(),
});

export type Lead = z.infer<typeof LeadSchema>;
