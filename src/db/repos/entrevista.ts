import { EstadoEntrevistaSchema, type EstadoEntrevista } from "../../core/onboarding/tipos";
import { ahoraISO } from "../id";

/**
 * Una entrevista por negocio: la clave primaria ES el negocio_id. El estado
 * viaja como JSON y se valida con Zod al leer — no se confía en la fila solo
 * porque la escribimos nosotros.
 */

export async function crearEntrevista(
  db: D1Database,
  negocioId: string,
  estado: EstadoEntrevista,
): Promise<void> {
  const ahora = ahoraISO();
  await db
    .prepare(
      "INSERT INTO entrevistas (negocio_id, estado_json, creado_en, actualizado_en) VALUES (?, ?, ?, ?)",
    )
    .bind(negocioId, JSON.stringify(estado), ahora, ahora)
    .run();
}

export async function leerEntrevista(
  db: D1Database,
  negocioId: string,
): Promise<EstadoEntrevista | null> {
  const fila = await db
    .prepare("SELECT estado_json FROM entrevistas WHERE negocio_id = ?")
    .bind(negocioId)
    .first<{ estado_json: string }>();

  if (!fila) return null;

  try {
    const r = EstadoEntrevistaSchema.safeParse(JSON.parse(fila.estado_json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function guardarEntrevista(
  db: D1Database,
  negocioId: string,
  estado: EstadoEntrevista,
): Promise<void> {
  await db
    .prepare("UPDATE entrevistas SET estado_json = ?, actualizado_en = ? WHERE negocio_id = ?")
    .bind(JSON.stringify(estado), ahoraISO(), negocioId)
    .run();
}

/** La entrevista se borra al materializar: ya cumplió. */
export async function borrarEntrevista(db: D1Database, negocioId: string): Promise<void> {
  await db.prepare("DELETE FROM entrevistas WHERE negocio_id = ?").bind(negocioId).run();
}
