import { esc, fechaCorta } from "./html";
import { minutosRestantesDePausa } from "../core/conversacion/pausa";
import type { Propuesta } from "../core/propuesta/tipos";
import { tarjetaPropuesta } from "./vistas";
import {
  LIMITE_CONVERSACIONES,
  LIMITE_HILO,
  type Conversacion,
  type MensajeHilo,
} from "../db/repos/conversacion";

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
  /** Cómo se arma el link al hilo. La vista no sabe de rutas ni de query. */
  enlace: (id: string) => string,
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
        <a class="conversacion-enlace" href="${esc(enlace(c.id))}">
          <div class="conversacion-quien">
            <strong>${esc(quien)}</strong>
            <span class="canal">${esc(CANALES[c.canal] ?? c.canal)}</span>
          </div>
          <div class="conversacion-marcas">${marcas}</div>
          <time class="conversacion-cuando">${esc(fechaCorta(c.actualizadoEn))}</time>
        </a>
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

const AUTOR: Record<string, string> = {
  cliente: "Cliente",
  agente: "Asistente",
  dueno: "Tú",
};

/**
 * El hilo de una conversación, con las decisiones pendientes al lado.
 *
 * Es la pantalla que cierra el "aprobar a ciegas": hasta ahora el dueño
 * decidía sobre un texto suelto, sin poder leer lo que el cliente escribió.
 *
 * Muestra exactamente las decisiones que cuenta el globo de la lista, porque
 * las dos salen de `esDeConversacion`. Un globo que dice 3 sobre una página
 * con 5 tarjetas es un bug a ojos del dueño, aunque las dos cifras tengan
 * explicación.
 */
export function vistaHilo(opciones: {
  conversacion: Conversacion;
  mensajes: readonly MensajeHilo[];
  pendientes: readonly Propuesta[];
  accionDecidir: string;
  accionPausa: string;
  ahora: string;
}): string {
  const { conversacion, mensajes, pendientes, accionDecidir, accionPausa, ahora } = opciones;

  const minutosPausa = minutosRestantesDePausa(conversacion.pausadoHasta, ahora);

  /**
   * Tomar el chat y devolverlo.
   *
   * El botón dice qué pasa, no cómo se llama por dentro: el dueño no piensa
   * "pausar la conversación", piensa "esta la atiendo yo". Y cuando está
   * pausada, lo que necesita saber es cuándo vuelve solo — la pausa se vence
   * sola justo para que olvidarse de reanudar no deje al asistente mudo.
   */
  const pausa =
    minutosPausa > 0
      ? `<span class="marca-pausa">Lo estás atendiendo tú · el asistente vuelve en ${minutosPausa} min</span>
         <form method="post" action="${accionPausa}" class="pausa-form">
           <button name="accion" value="reanudar" class="enlace-boton">Devolvérselo al asistente</button>
         </form>`
      : `<form method="post" action="${accionPausa}" class="pausa-form">
           <button name="accion" value="pausar" class="enlace-boton">Esta la atiendo yo</button>
         </form>`;

  /**
   * Sin `<h1>` a propósito: `pagina()` ya pinta uno con el `titulo`, y la ruta
   * le pasa ahí el nombre del cliente. Un segundo encabezado de nivel 1 en la
   * misma página rompe la estructura del documento y se ve como un error.
   */
  const cabecera = `<div class="hilo-cabecera">
    <span class="canal">${esc(CANALES[conversacion.canal] ?? conversacion.canal)}</span>
    ${pausa}
  </div>`;

  const burbujas =
    mensajes.length === 0
      ? `<div class="tarjeta vacio"><strong>Este hilo está vacío</strong>No hay mensajes guardados todavía.</div>`
      : mensajes
          .map(
            (m) => `<div class="mensaje ${esc(m.autor)}">
              <span class="quien">${esc(AUTOR[m.autor] ?? m.autor)}</span>
              <p>${esc(m.texto)}</p>
              <span class="cuando">${esc(fechaCorta(m.creadoEn))}</span>
            </div>`,
          )
          .join("");

  /**
   * Si el hilo viene lleno hasta el tope, hay más arriba y hay que decirlo.
   * El dueño que busca un mensaje viejo y no lo ve tiene que saber que está
   * mirando una ventana, no el historial completo.
   */
  const recorte =
    mensajes.length >= LIMITE_HILO
      ? `<p class="nota-lista">Se muestran los últimos ${LIMITE_HILO} mensajes. La conversación es más larga.</p>`
      : "";

  const decisiones =
    pendientes.length === 0
      ? `<p class="nota-lista">Nada que decidir en esta conversación.</p>`
      : pendientes.map((p) => tarjetaPropuesta(p, accionDecidir, conversacion.id)).join("");

  const rotulo =
    pendientes.length === 1 ? "1 espera tu decisión" : `${pendientes.length} esperan tu decisión`;

  return `${cabecera}
    <div class="hilo-armazon">
      <div>
        ${recorte}
        <div class="hilo">${burbujas}</div>
      </div>
      <aside class="hilo-decisiones">
        <span class="rotulo">${esc(rotulo)}</span>
        ${decisiones}
      </aside>
    </div>`;
}
