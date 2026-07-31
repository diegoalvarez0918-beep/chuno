import type { UsoLLM } from "../../llm/tipos";
import { ahoraISO, nuevoId } from "../id";

/**
 * Cuántas veces se llamó al modelo desde `desde`.
 *
 * Es la lectura que sostiene el tope diario. Cuenta llamadas y no tokens a
 * propósito: lo que agota la capa gratuita de Gemini son las peticiones por
 * minuto y por día, no el tamaño de cada una.
 */
export async function contarUsoDesde(
  db: D1Database,
  negocioId: string,
  desde: string,
): Promise<number> {
  const fila = await db
    .prepare("SELECT COUNT(*) AS n FROM uso_llm WHERE negocio_id = ? AND creado_en >= ?")
    .bind(negocioId, desde)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}

/** Escribe el consumo en lote: una pasada del agente genera dos o tres usos. */
export async function registrarUso(
  db: D1Database,
  negocioId: string,
  usos: readonly UsoLLM[],
): Promise<void> {
  if (usos.length === 0) return;

  const ahora = ahoraISO();
  await db.batch(
    usos.map((u) =>
      db
        .prepare(
          `INSERT INTO uso_llm
             (id, negocio_id, modelo, tokens_entrada, tokens_salida, exito, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          nuevoId("uso"),
          negocioId,
          u.modelo,
          u.tokensEntrada,
          u.tokensSalida,
          u.exito ? 1 : 0,
          ahora,
        ),
    ),
  );
}
