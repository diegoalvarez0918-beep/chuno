import { fallo, ok, type Resultado } from "../resultado";
import type { EstadoLead, Lead } from "./tipos";

/**
 * Embudo de leads.
 *
 * "perdido" no es terminal a propósito: un cliente que no compró hace tres meses
 * y vuelve a escribir es el mismo contacto reactivado, no uno nuevo. Tratarlo
 * como nuevo perdería su historial, que es justo lo que hace útil un CRM.
 */
const TRANSICIONES: Readonly<Record<EstadoLead, readonly EstadoLead[]>> = {
  nuevo: ["contactado", "perdido"],
  contactado: ["interesado", "cliente", "perdido"],
  interesado: ["cliente", "perdido"],
  cliente: [],
  perdido: ["contactado"],
};

/** Solo "cliente" cierra el embudo: de "perdido" se puede volver. */
export function esCerrado(estado: EstadoLead): boolean {
  return estado === "cliente";
}

export function transicionLeadValida(desde: EstadoLead, hacia: EstadoLead): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function avanzarLead(lead: Lead, hacia: EstadoLead, ahora: string): Resultado<Lead, string> {
  if (lead.estado === hacia) return fallo(`el lead ya está en "${hacia}"`);

  if (!transicionLeadValida(lead.estado, hacia)) {
    const posibles = TRANSICIONES[lead.estado];
    const detalle =
      posibles.length === 0
        ? `"${lead.estado}" ya cerró el embudo`
        : `desde "${lead.estado}" solo se puede pasar a: ${posibles.join(", ")}`;
    return fallo(`transición inválida a "${hacia}" — ${detalle}`);
  }

  return ok({ ...lead, estado: hacia, actualizadoEn: ahora });
}
