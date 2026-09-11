import type { MensajeEntrante } from "../../canales/tipos";
import { trocear } from "../../core/meta/lote";
import { ahoraISO } from "../id";

/**
 * La bandeja de entrada de los canales que llegan en lote.
 *
 * Único camino hacia la tabla `entrantes`. Todo va filtrado por negocio menos
 * `negociosConPendientes`, que es un barrido de cron y devuelve SOLO ids, nunca
 * contenido — el mismo trato que ya tienen el vigía y la purga.
 */

/**
 * Cinco y no seis: `procesado_en` va como literal NULL en el SQL, no como
 * parámetro vinculado. Contarlo reservaría un hueco de más en cada fila y el
 * troceo desperdiciaría un quinto del cupo de D1.
 */
const COLUMNAS = 5; // negocio_id, canal, id_externo, carga, creado_en

/**
 * Deja el lote en la bandeja.
 *
 * Idempotente por la llave primaria compuesta: cuando Meta reintenta —y
 * reintenta durante 36 horas— la segunda entrega choca contra ella y se
 * descarta sin ruido. Eso es lo que convierte su reintento de tormenta de
 * duplicados en red de seguridad.
 *
 * Quien llama DEBE esperar a que esto termine antes de responder 200: la
 * durabilidad sale de que la fila esté escrita, no de que el Worker sobreviva.
 */
export async function encolar(
  db: D1Database,
  negocioId: string,
  mensajes: readonly MensajeEntrante[],
): Promise<number> {
  // Sin id externo no hay llave de idempotencia, y encolarlo dejaría que un
  // reintento lo duplicara. Se descarta aquí y no en `interpretar` para que el
  // intérprete no tenga que conocer la política de la bandeja.
  const conId = mensajes.filter((m) => m.idExterno);
  if (conId.length === 0) return 0;

  const ahora = ahoraISO();
  const sentencias = trocear(conId, COLUMNAS).map((trozo) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO entrantes
           (negocio_id, canal, id_externo, carga, creado_en, procesado_en)
         VALUES ${trozo.map(() => "(?, ?, ?, ?, ?, NULL)").join(", ")}`,
      )
      .bind(...trozo.flatMap((m) => [negocioId, m.canal, m.idExterno, JSON.stringify(m), ahora])),
  );

  await db.batch(sentencias);
  return conId.length;
}

export async function pendientesDe(
  db: D1Database,
  negocioId: string,
  limite: number,
): Promise<MensajeEntrante[]> {
  const { results } = await db
    .prepare(
      `SELECT carga FROM entrantes
       WHERE negocio_id = ? AND procesado_en IS NULL
       ORDER BY creado_en LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<{ carga: string }>();

  return (results ?? []).flatMap((f) => {
    try {
      return [JSON.parse(f.carga) as MensajeEntrante];
    } catch {
      // Una carga ilegible no puede bloquear la bandeja entera. Se salta; la
      // fila queda pendiente y se ve en la consulta de diagnóstico.
      return [];
    }
  });
}

export async function marcarProcesado(
  db: D1Database,
  negocioId: string,
  canal: string,
  idExterno: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE entrantes SET procesado_en = ?
       WHERE negocio_id = ? AND canal = ? AND id_externo = ?`,
    )
    .bind(ahoraISO(), negocioId, canal, idExterno)
    .run();
}

/**
 * Qué negocios tienen algo sin drenar.
 *
 * Barrido de cron: cruza negocios a propósito, como el vigía y la purga, y por
 * eso devuelve solo ids. El contenido se lee después, ya filtrado por negocio.
 */
export async function negociosConPendientes(db: D1Database, limite: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT negocio_id FROM entrantes
       WHERE procesado_en IS NULL LIMIT ?`,
    )
    .bind(limite)
    .all<{ negocio_id: string }>();

  return (results ?? []).map((f) => f.negocio_id);
}
