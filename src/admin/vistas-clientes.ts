import type { Contacto, EstadoLead, Lead } from "../core/crm/tipos";
import { esc, fechaCorta, pesos } from "./html";

const ROTULO_LEAD: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  cliente: "Cliente",
  perdido: "Perdido",
};

/**
 * El CRM que nadie llena a mano.
 *
 * Cada fila salió de una conversación real: nadie abrió un formulario para
 * crearla. Ese es el punto de la pantalla.
 */
export function vistaClientes(contactos: readonly Contacto[], leads: readonly Lead[]): string {
  if (contactos.length === 0) {
    return `<div class="tarjeta vacio">
      <strong>Todavía no hay clientes</strong>
      Se van creando solos con cada conversación que entra.
    </div>`;
  }

  const porContacto = new Map(leads.map((l) => [l.contactoId, l]));

  const filas = contactos
    .map((c) => {
      const lead = porContacto.get(c.id);
      return `<tr>
        <td><strong>${esc(c.nombre)}</strong><br>
            <span style="color:var(--suave)">${esc(c.canal)}</span></td>
        <td>${esc(lead?.interes ?? "—")}</td>
        <td>${lead ? `<span class="chip ok">${esc(ROTULO_LEAD[lead.estado])}</span>` : "—"}</td>
        <td>${esc(pesos(lead?.valorEstimadoCentavos ?? null))}</td>
        <td>${esc(String(c.totalMensajes))}</td>
        <td>${esc(fechaCorta(c.ultimaInteraccion))}</td>
      </tr>`;
    })
    .join("");

  return `<div class="tarjeta"><table>
    <thead><tr>
      <th>Cliente</th><th>Interés</th><th>Estado</th>
      <th>Valor</th><th>Msjs</th><th>Último contacto</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}
