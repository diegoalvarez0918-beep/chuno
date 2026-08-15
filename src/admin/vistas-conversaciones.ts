import { esc, fechaCorta } from "./html";
import { minutosRestantesDePausa } from "../core/conversacion/pausa";
import { LIMITE_CONVERSACIONES, type Conversacion } from "../db/repos/conversacion";

/**
 * La lista de conversaciones.
 *
 * Existe porque hasta ahora el dueño aprobaba mensajes hacia su cliente **sin
 * poder leer lo que el cliente escribió**. La bandeja de decisiones muestra la
 * propuesta; esta pantalla muestra de dónde salió.
 *
 * Ordena por último movimiento, no por antigüedad: lo que se movió hace un
 * minuto es lo que el dueño está atendiendo ahora.
 */

const CANALES: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  demo: "Demostración",
};

function vacio(): string {
  return `<div class="tarjeta vacio"><strong>Todavía no hay conversaciones</strong>Cuando alguien le escriba a tu asistente, el chat aparece aquí completo.</div>`;
}

export function vistaConversaciones(
  conversaciones: readonly Conversacion[],
  pendientesPorConversacion: ReadonlyMap<string, number>,
  ahora: string,
): string {
  if (conversaciones.length === 0) return vacio();

  const filas = conversaciones
    .map((c) => {
      const pendientes = pendientesPorConversacion.get(c.id) ?? 0;
      const minutosPausa = minutosRestantesDePausa(c.pausadoHasta, ahora);

      // Sin nombre no es un error: Telegram no obliga a tener nombre visible, y
      // un chat sin nombre sigue siendo un cliente al que hay que responderle.
      const quien = c.clienteNombre?.trim() || "Sin nombre";

      const marcas = [
        pendientes > 0
          ? `<span class="globo">${pendientes}</span><span class="marca-texto">${
              pendientes === 1 ? "espera tu decisión" : "esperan tu decisión"
            }</span>`
          : "",
        minutosPausa > 0
          ? `<span class="marca-pausa">Lo estás atendiendo tú · el asistente vuelve en ${minutosPausa} min</span>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      return `<li class="conversacion${pendientes > 0 ? " con-pendientes" : ""}">
        <div class="conversacion-quien">
          <strong>${esc(quien)}</strong>
          <span class="canal">${esc(CANALES[c.canal] ?? c.canal)}</span>
        </div>
        <div class="conversacion-marcas">${marcas}</div>
        <time class="conversacion-cuando">${esc(fechaCorta(c.actualizadoEn))}</time>
      </li>`;
    })
    .join("");

  /**
   * Si la lista viene llena hasta el tope, hay más y hay que decirlo. Una lista
   * cortada en silencio se lee como "esto es todo", y el dueño que busca un
   * chat viejo y no lo encuentra concluye que se perdió.
   */
  const aviso =
    conversaciones.length >= LIMITE_CONVERSACIONES
      ? `<p class="nota-lista">Se muestran las ${LIMITE_CONVERSACIONES} conversaciones con movimiento más reciente. Hay más.</p>`
      : "";

  return `<ul class="conversaciones">${filas}</ul>${aviso}`;
}
