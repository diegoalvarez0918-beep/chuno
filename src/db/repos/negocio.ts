/**
 * Acceso a negocios y a su configuración.
 *
 * Regla que aplica a TODO este directorio: ninguna función consulta sin
 * `negocio_id`. No hay una función "listar todos los pedidos" — no existe y no
 * debe existir. El aislamiento entre negocios está en la firma, no en la
 * disciplina de quien llama.
 */

export interface Negocio {
  readonly id: string;
  readonly nombre: string;
  readonly giro: string;
  readonly zonaHoraria: string;
}

interface FilaNegocio {
  id: string;
  nombre: string;
  giro: string;
  zona_horaria: string;
}

export async function obtenerNegocio(db: D1Database, negocioId: string): Promise<Negocio | null> {
  const fila = await db
    .prepare("SELECT id, nombre, giro, zona_horaria FROM negocios WHERE id = ?")
    .bind(negocioId)
    .first<FilaNegocio>();

  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    giro: fila.giro,
    zonaHoraria: fila.zona_horaria,
  };
}

/** Todos los negocios activos. Solo la usa el cron, que por definición no tiene tenant. */
export async function listarNegocios(db: D1Database): Promise<Negocio[]> {
  const { results } = await db
    .prepare("SELECT id, nombre, giro, zona_horaria FROM negocios")
    .all<FilaNegocio>();

  return results.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    giro: f.giro,
    zonaHoraria: f.zona_horaria,
  }));
}

export async function leerSetting(
  db: D1Database,
  negocioId: string,
  clave: string,
): Promise<string | null> {
  const fila = await db
    .prepare("SELECT valor FROM settings WHERE negocio_id = ? AND clave = ?")
    .bind(negocioId, clave)
    .first<{ valor: string }>();

  return fila?.valor ?? null;
}
