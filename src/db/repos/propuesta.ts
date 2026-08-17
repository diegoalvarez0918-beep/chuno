import {
  PropuestaSchema,
  TIPOS_CON_CONVERSACION,
  type PayloadPropuesta,
  type Propuesta,
} from "../../core/propuesta/tipos";
import { ahoraISO, nuevoId } from "../id";

interface FilaPropuesta {
  id: string;
  negocio_id: string;
  tipo: string;
  payload_json: string;
  motivo: string;
  confianza: number | null;
  estado: string;
  creado_en: string;
  resuelto_en: string | null;
  resuelto_por: string | null;
}

const COLUMNAS = `id, negocio_id, tipo, payload_json, motivo, confianza, estado,
                  creado_en, resuelto_en, resuelto_por`;

function aPropuesta(f: FilaPropuesta): Propuesta {
  let payload: unknown;
  try {
    payload = JSON.parse(f.payload_json);
  } catch {
    throw new Error(`propuesta ${f.id}: payload_json corrupto`);
  }

  const r = PropuestaSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    estado: f.estado,
    payload,
    motivo: f.motivo,
    confianza: f.confianza,
    creadoEn: f.creado_en,
    resueltoEn: f.resuelto_en,
    resueltoPor: f.resuelto_por,
  });

  if (!r.success) {
    throw new Error(`propuesta ${f.id}: fila inválida: ${r.error.issues[0]?.message ?? "?"}`);
  }

  return r.data;
}

export interface NuevaPropuesta {
  readonly negocioId: string;
  readonly payload: PayloadPropuesta;
  readonly motivo: string;
  readonly confianza: number | null;
  /**
   * Idempotencia. El vigía corre cada 30 minutos sobre los mismos pedidos: sin
   * esto, el dueño abriría la bandeja y encontraría el mismo aviso cuarenta
   * veces. Formato sugerido: `aviso:<pedidoId>:<riesgo>`.
   */
  readonly claveDedupe?: string | null;
}

/**
 * Crea una propuesta. Devuelve null si ya existía una con la misma clave de
 * deduplicación — no es un error, es el caso normal cuando el cron repite.
 */
export async function crearPropuesta(
  db: D1Database,
  nueva: NuevaPropuesta,
): Promise<Propuesta | null> {
  const propuesta: Propuesta = PropuestaSchema.parse({
    id: nuevoId("prop"),
    negocioId: nueva.negocioId,
    estado: "propuesta",
    payload: nueva.payload,
    motivo: nueva.motivo,
    confianza: nueva.confianza,
    creadoEn: ahoraISO(),
    resueltoEn: null,
    resueltoPor: null,
  });

  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO propuestas
         (id, negocio_id, tipo, payload_json, motivo, confianza, estado, clave_dedupe, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, 'propuesta', ?, ?)`,
    )
    .bind(
      propuesta.id,
      propuesta.negocioId,
      propuesta.payload.tipo,
      JSON.stringify(propuesta.payload),
      propuesta.motivo,
      propuesta.confianza,
      nueva.claveDedupe ?? null,
      propuesta.creadoEn,
    )
    .run();

  // meta.changes === 0 significa que el índice único la rechazó: ya existía.
  return r.meta.changes > 0 ? propuesta : null;
}

export async function obtenerPropuesta(
  db: D1Database,
  negocioId: string,
  propuestaId: string,
): Promise<Propuesta | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} FROM propuestas WHERE negocio_id = ? AND id = ?`)
    .bind(negocioId, propuestaId)
    .first<FilaPropuesta>();

  return fila ? aPropuesta(fila) : null;
}

/** La bandeja: lo que el dueño tiene pendiente por decidir, lo más viejo arriba. */
export async function listarPendientes(
  db: D1Database,
  negocioId: string,
  limite = 50,
): Promise<Propuesta[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM propuestas
       WHERE negocio_id = ? AND estado = 'propuesta'
       ORDER BY creado_en ASC LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<FilaPropuesta>();

  return results.map(aPropuesta);
}

/**
 * Los `?` de la cláusula IN, tantos como tipos haya.
 *
 * Se arma desde `TIPOS_CON_CONVERSACION` y no se escribe a mano para que
 * agregar un tipo nuevo no exija acordarse de tocar dos consultas.
 */
const MARCAS_TIPO = TIPOS_CON_CONVERSACION.map(() => "?").join(", ");

/**
 * Cuántas decisiones esperan al dueño en cada conversación.
 *
 * Cuenta en SQL a propósito. Hacerlo en memoria sobre `listarPendientes` —que
 * corta en 50, de la más vieja a la más nueva— daba cuentas por debajo del real
 * sin que nada lo dijera, y lo que se caía eran justo las decisiones recientes,
 * que son las que el dueño necesita ver.
 */
export async function contarPendientesPorConversacion(
  db: D1Database,
  negocioId: string,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT json_extract(payload_json, '$.conversacionId') AS conv, COUNT(*) AS n
       FROM propuestas
       WHERE negocio_id = ? AND estado = 'propuesta' AND tipo IN (${MARCAS_TIPO})
       GROUP BY conv`,
    )
    .bind(negocioId, ...TIPOS_CON_CONVERSACION)
    .all<{ conv: string | null; n: number }>();

  const cuenta = new Map<string, number>();
  for (const f of results) {
    if (f.conv !== null) cuenta.set(f.conv, f.n);
  }

  return cuenta;
}

/**
 * Las decisiones pendientes de una conversación, las más viejas arriba.
 *
 * Sin límite: son las de un solo hilo, y esconder una tarjeta en la pantalla
 * donde el dueño decide es peor que traer de más.
 */
export async function listarPendientesDeConversacion(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
): Promise<Propuesta[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM propuestas
       WHERE negocio_id = ? AND estado = 'propuesta' AND tipo IN (${MARCAS_TIPO})
         AND json_extract(payload_json, '$.conversacionId') = ?
       ORDER BY creado_en ASC`,
    )
    .bind(negocioId, ...TIPOS_CON_CONVERSACION, conversacionId)
    .all<FilaPropuesta>();

  return results.map(aPropuesta);
}

export async function contarPendientes(db: D1Database, negocioId: string): Promise<number> {
  const fila = await db
    .prepare("SELECT COUNT(*) AS n FROM propuestas WHERE negocio_id = ? AND estado = 'propuesta'")
    .bind(negocioId)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}

/**
 * Persiste una propuesta ya resuelta por el núcleo.
 *
 * El WHERE exige que siga en estado 'propuesta': si otra pestaña la resolvió un
 * segundo antes, este UPDATE no toca ninguna fila y devolvemos false. Es lo que
 * evita mandarle dos veces el mismo mensaje al cliente.
 */
export async function guardarResolucion(db: D1Database, propuesta: Propuesta): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE propuestas
         SET estado = ?, payload_json = ?, resuelto_en = ?, resuelto_por = ?
       WHERE negocio_id = ? AND id = ? AND estado = 'propuesta'`,
    )
    .bind(
      propuesta.estado,
      JSON.stringify(propuesta.payload),
      propuesta.resueltoEn,
      propuesta.resueltoPor,
      propuesta.negocioId,
      propuesta.id,
    )
    .run();

  return r.meta.changes > 0;
}
