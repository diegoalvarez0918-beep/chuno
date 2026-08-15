import { ahoraISO, nuevoId } from "../id";

export type AutorMensaje = "cliente" | "agente" | "dueno";

export interface Conversacion {
  readonly id: string;
  readonly negocioId: string;
  readonly canal: string;
  readonly canalChatId: string;
  readonly clienteNombre: string | null;
  readonly pausadoHasta: string | null;
  /** Último movimiento del hilo. Es el orden natural de la lista del panel. */
  readonly actualizadoEn: string;
}

export interface MensajeHilo {
  readonly autor: AutorMensaje;
  readonly texto: string;
  readonly creadoEn: string;
}

interface FilaConv {
  id: string;
  negocio_id: string;
  canal: string;
  canal_chat_id: string;
  cliente_nombre: string | null;
  pausado_hasta: string | null;
  actualizado_en: string;
}

function aConversacion(f: FilaConv): Conversacion {
  return {
    id: f.id,
    negocioId: f.negocio_id,
    canal: f.canal,
    canalChatId: f.canal_chat_id,
    clienteNombre: f.cliente_nombre,
    pausadoHasta: f.pausado_hasta,
    actualizadoEn: f.actualizado_en,
  };
}

const COLUMNAS =
  "id, negocio_id, canal, canal_chat_id, cliente_nombre, pausado_hasta, actualizado_en";

/**
 * Busca la conversación de un chat, y la crea si es la primera vez.
 *
 * El índice único sobre (negocio_id, canal, canal_chat_id) es lo que hace esto
 * seguro: si dos mensajes del mismo cliente llegan a la vez, el INSERT pierde
 * contra el índice y el SELECT posterior devuelve la misma fila. Nunca quedan
 * dos conversaciones para un mismo chat.
 */
export async function obtenerOCrearConversacion(
  db: D1Database,
  negocioId: string,
  canal: string,
  canalChatId: string,
  clienteNombre: string | null,
): Promise<Conversacion> {
  const ahora = ahoraISO();

  await db
    .prepare(
      `INSERT OR IGNORE INTO conversaciones
         (id, negocio_id, canal, canal_chat_id, cliente_nombre, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(nuevoId("conv"), negocioId, canal, canalChatId, clienteNombre, ahora, ahora)
    .run();

  const fila = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM conversaciones
       WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?`,
    )
    .bind(negocioId, canal, canalChatId)
    .first<FilaConv>();

  if (!fila) throw new Error("no se pudo crear ni recuperar la conversación");

  // Si ya existía sin nombre y ahora lo sabemos, lo completamos.
  if (clienteNombre && !fila.cliente_nombre) {
    await db
      .prepare(
        "UPDATE conversaciones SET cliente_nombre = ?, actualizado_en = ? WHERE negocio_id = ? AND id = ?",
      )
      .bind(clienteNombre, ahora, negocioId, fila.id)
      .run();

    return aConversacion({ ...fila, cliente_nombre: clienteNombre });
  }

  return aConversacion(fila);
}

export async function obtenerConversacion(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
): Promise<Conversacion | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} FROM conversaciones WHERE negocio_id = ? AND id = ?`)
    .bind(negocioId, conversacionId)
    .first<FilaConv>();

  return fila ? aConversacion(fila) : null;
}

/**
 * Cuántas conversaciones trae la lista del panel.
 *
 * Se exporta para que la vista pueda avisar cuando hay más: una lista cortada
 * en silencio se lee como "esto es todo lo que tengo", y eso es una mentira que
 * el dueño no tiene forma de detectar.
 */
export const LIMITE_CONVERSACIONES = 50;

export async function listarConversaciones(
  db: D1Database,
  negocioId: string,
  limite = LIMITE_CONVERSACIONES,
): Promise<Conversacion[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM conversaciones
       WHERE negocio_id = ? ORDER BY actualizado_en DESC LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<FilaConv>();

  return results.map(aConversacion);
}

export async function guardarMensaje(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  autor: AutorMensaje,
  texto: string,
): Promise<void> {
  const ahora = ahoraISO();

  await db.batch([
    db
      .prepare(
        `INSERT INTO mensajes (id, negocio_id, conversacion_id, autor, texto, creado_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(nuevoId("msg"), negocioId, conversacionId, autor, texto, ahora),
    db
      .prepare("UPDATE conversaciones SET actualizado_en = ? WHERE negocio_id = ? AND id = ?")
      .bind(ahora, negocioId, conversacionId),
  ]);
}

/**
 * El hilo en orden cronológico.
 *
 * `limite` acota lo que se le manda al modelo: una conversación de seis meses no
 * cabe en una ventana de contexto y tampoco aporta. Se traen los últimos y se
 * devuelven en orden natural de lectura.
 */
export async function leerHilo(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  limite = 30,
): Promise<MensajeHilo[]> {
  const { results } = await db
    .prepare(
      `SELECT autor, texto, creado_en FROM mensajes
       WHERE negocio_id = ? AND conversacion_id = ?
       ORDER BY creado_en DESC LIMIT ?`,
    )
    .bind(negocioId, conversacionId, limite)
    .all<{ autor: AutorMensaje; texto: string; creado_en: string }>();

  return results
    .map((f) => ({ autor: f.autor, texto: f.texto, creadoEn: f.creado_en }))
    .reverse();
}

/** El agente se hace a un lado mientras el dueño atiende personalmente. */
export async function pausarConversacion(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  hasta: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE conversaciones SET pausado_hasta = ?, actualizado_en = ? WHERE negocio_id = ? AND id = ?",
    )
    .bind(hasta, ahoraISO(), negocioId, conversacionId)
    .run();
}

export function estaPausada(conversacion: Conversacion, ahora: string = ahoraISO()): boolean {
  return conversacion.pausadoHasta !== null && conversacion.pausadoHasta > ahora;
}
