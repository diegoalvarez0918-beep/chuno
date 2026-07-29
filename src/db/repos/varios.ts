import { ahoraISO, nuevoId } from "../id";

// ─────────────────────────────────────────────────────────────── auditoría ───

export type Actor = "agente" | "admin" | "cron";

export interface EntradaAuditoria {
  readonly id: string;
  readonly accion: string;
  readonly detalle: unknown;
  readonly actor: string;
  readonly creadoEn: string;
}

/**
 * Registro append-only de todo lo que pasó.
 *
 * `detalle` lleva ids y descripciones cortas — **nunca** teléfonos, nombres
 * completos ni el texto de los mensajes. La auditoría existe para reconstruir
 * decisiones, no para ser una segunda copia de las conversaciones.
 */
export async function auditar(
  db: D1Database,
  negocioId: string,
  accion: string,
  detalle: unknown,
  actor: Actor,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auditoria (id, negocio_id, accion, detalle_json, actor, creado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(nuevoId("aud"), negocioId, accion, JSON.stringify(detalle), actor, ahoraISO())
    .run();
}

export async function listarAuditoria(
  db: D1Database,
  negocioId: string,
  limite = 100,
): Promise<EntradaAuditoria[]> {
  const { results } = await db
    .prepare(
      `SELECT id, accion, detalle_json, actor, creado_en FROM auditoria
       WHERE negocio_id = ? ORDER BY creado_en DESC LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<{
      id: string;
      accion: string;
      detalle_json: string;
      actor: string;
      creado_en: string;
    }>();

  return results.map((f) => ({
    id: f.id,
    accion: f.accion,
    detalle: safeParse(f.detalle_json),
    actor: f.actor,
    creadoEn: f.creado_en,
  }));
}

function safeParse(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return { crudo: texto };
  }
}

// ──────────────────────────────────────────────────────────── conocimiento ───

/**
 * Búsqueda por palabras clave sobre D1.
 *
 * Vectorize (búsqueda semántica) exige plan pago de Workers, y para la base de
 * conocimiento de un negocio pequeño —una o dos docenas de párrafos— buscar por
 * términos alcanza de sobra. Cuando haya plan pago se cambia el cuerpo de esta
 * función por embeddings y el agente ni se entera: la firma es la misma.
 */
export async function buscarConocimiento(
  db: D1Database,
  negocioId: string,
  consulta: string,
  limite = 4,
): Promise<string[]> {
  const terminos = tokenizar(consulta);

  // Sin términos útiles devolvemos lo más reciente: es mejor darle algo de
  // contexto al modelo que dejarlo sin nada y tentarlo a inventar.
  if (terminos.length === 0) {
    const { results } = await db
      .prepare(
        `SELECT titulo, contenido FROM conocimiento WHERE negocio_id = ?
         ORDER BY creado_en DESC LIMIT ?`,
      )
      .bind(negocioId, limite)
      .all<{ titulo: string; contenido: string }>();

    return results.map((f) => `${f.titulo}: ${f.contenido}`);
  }

  const condiciones = terminos.map(() => "(titulo LIKE ? OR contenido LIKE ?)").join(" OR ");
  const parametros = terminos.flatMap((t) => [`%${t}%`, `%${t}%`]);

  const { results } = await db
    .prepare(
      `SELECT titulo, contenido FROM conocimiento
       WHERE negocio_id = ? AND (${condiciones}) LIMIT ?`,
    )
    .bind(negocioId, ...parametros, limite)
    .all<{ titulo: string; contenido: string }>();

  return results.map((f) => `${f.titulo}: ${f.contenido}`);
}

/** Palabras de 4+ letras, sin acentos y sin las vacías del español. */
const VACIAS = new Set([
  "para", "como", "pero", "esta", "este", "esto", "hola", "gracias", "porque",
  "cuando", "donde", "sobre", "tiene", "tienen", "puedo", "quiero", "necesito",
]);

function tokenizar(texto: string): string[] {
  return [
    ...new Set(
      texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !VACIAS.has(t)),
    ),
  ].slice(0, 6);
}

// ───────────────────────────────────────────────────────────────── tickets ───

export interface Ticket {
  readonly id: string;
  readonly conversacionId: string;
  readonly motivo: string;
  readonly estado: string;
  readonly creadoEn: string;
}

export async function crearTicket(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  motivo: string,
): Promise<Ticket> {
  const ticket: Ticket = {
    id: nuevoId("tkt"),
    conversacionId,
    motivo,
    estado: "abierto",
    creadoEn: ahoraISO(),
  };

  await db
    .prepare(
      `INSERT INTO tickets (id, negocio_id, conversacion_id, motivo, estado, creado_en)
       VALUES (?, ?, ?, ?, 'abierto', ?)`,
    )
    .bind(ticket.id, negocioId, conversacionId, motivo, ticket.creadoEn)
    .run();

  return ticket;
}

export async function listarTicketsAbiertos(
  db: D1Database,
  negocioId: string,
): Promise<Ticket[]> {
  const { results } = await db
    .prepare(
      `SELECT id, conversacion_id, motivo, estado, creado_en FROM tickets
       WHERE negocio_id = ? AND estado = 'abierto' ORDER BY creado_en DESC`,
    )
    .bind(negocioId)
    .all<{
      id: string;
      conversacion_id: string;
      motivo: string;
      estado: string;
      creado_en: string;
    }>();

  return results.map((f) => ({
    id: f.id,
    conversacionId: f.conversacion_id,
    motivo: f.motivo,
    estado: f.estado,
    creadoEn: f.creado_en,
  }));
}

// ─────────────────────────────────────────────────────────────────── purga ───

/** Retención declarada en el README: los mensajes no se guardan para siempre. */
export async function purgarMensajesViejos(db: D1Database, dias: number): Promise<number> {
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString();
  const r = await db.prepare("DELETE FROM mensajes WHERE creado_en < ?").bind(limite).run();
  return r.meta.changes;
}
