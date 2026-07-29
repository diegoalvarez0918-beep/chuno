import { ContactoSchema, LeadSchema, type Contacto, type Lead } from "../../core/crm/tipos";
import { ahoraISO, nuevoId } from "../id";

interface FilaContacto {
  id: string;
  negocio_id: string;
  nombre: string;
  canal: string;
  canal_chat_id: string;
  primera_interaccion: string;
  ultima_interaccion: string;
  total_mensajes: number;
}

const COLS_CONTACTO = `id, negocio_id, nombre, canal, canal_chat_id,
                       primera_interaccion, ultima_interaccion, total_mensajes`;

function aContacto(f: FilaContacto): Contacto {
  const r = ContactoSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    nombre: f.nombre,
    canal: f.canal,
    canalChatId: f.canal_chat_id,
    primeraInteraccion: f.primera_interaccion,
    ultimaInteraccion: f.ultima_interaccion,
    totalMensajes: f.total_mensajes,
  });
  if (!r.success) throw new Error(`contacto ${f.id}: fila inválida`);
  return r.data;
}

/**
 * Alta o actualización del contacto en un solo viaje.
 *
 * El INSERT OR IGNORE contra el índice único hace esto seguro ante dos mensajes
 * simultáneos: el segundo pierde contra el índice y el UPDATE posterior aplica
 * a la misma fila. Nunca quedan dos contactos para la misma persona.
 */
export async function registrarContacto(
  db: D1Database,
  negocioId: string,
  canal: string,
  canalChatId: string,
  nombre: string | null,
): Promise<Contacto> {
  const ahora = ahoraISO();
  const nombreFinal = nombre?.trim() || "Cliente";

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO contactos
           (id, negocio_id, nombre, canal, canal_chat_id,
            primera_interaccion, ultima_interaccion, total_mensajes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .bind(nuevoId("cont"), negocioId, nombreFinal, canal, canalChatId, ahora, ahora),
    db
      .prepare(
        `UPDATE contactos
            SET ultima_interaccion = ?,
                total_mensajes = total_mensajes + 1,
                -- Solo mejora el nombre: no lo degrada a "Cliente" si ya lo sabíamos.
                nombre = CASE WHEN nombre = 'Cliente' THEN ? ELSE nombre END
          WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?`,
      )
      .bind(ahora, nombreFinal, negocioId, canal, canalChatId),
  ]);

  const fila = await db
    .prepare(
      `SELECT ${COLS_CONTACTO} FROM contactos
        WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?`,
    )
    .bind(negocioId, canal, canalChatId)
    .first<FilaContacto>();

  if (!fila) throw new Error("no se pudo registrar el contacto");
  return aContacto(fila);
}

export async function listarContactos(
  db: D1Database,
  negocioId: string,
  limite = 100,
): Promise<Contacto[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLS_CONTACTO} FROM contactos WHERE negocio_id = ?
        ORDER BY ultima_interaccion DESC LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<FilaContacto>();

  return results.map(aContacto);
}

/** Clientes únicos que escribieron desde una fecha. */
export async function contarContactosActivos(
  db: D1Database,
  negocioId: string,
  desdeISO: string,
): Promise<number> {
  const fila = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM contactos WHERE negocio_id = ? AND ultima_interaccion >= ?",
    )
    .bind(negocioId, desdeISO)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}

interface FilaLead {
  id: string;
  negocio_id: string;
  contacto_id: string;
  estado: string;
  interes: string | null;
  valor_estimado_centavos: number | null;
  creado_en: string;
  actualizado_en: string;
}

const COLS_LEAD = `id, negocio_id, contacto_id, estado, interes,
                   valor_estimado_centavos, creado_en, actualizado_en`;

function aLead(f: FilaLead): Lead {
  const r = LeadSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    contactoId: f.contacto_id,
    estado: f.estado,
    interes: f.interes,
    valorEstimadoCentavos: f.valor_estimado_centavos,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  });
  if (!r.success) throw new Error(`lead ${f.id}: fila inválida`);
  return r.data;
}

export interface NuevoLead {
  readonly negocioId: string;
  readonly contactoId: string;
  readonly interes: string | null;
  readonly valorEstimadoCentavos: number | null;
}

/**
 * Registra el interés de un contacto. Devuelve null si ya tenía un lead: el
 * mismo cliente escribiendo tres veces no son tres oportunidades de venta.
 */
export async function registrarLead(db: D1Database, nuevo: NuevoLead): Promise<Lead | null> {
  const ahora = ahoraISO();
  const lead = LeadSchema.parse({
    id: nuevoId("lead"),
    negocioId: nuevo.negocioId,
    contactoId: nuevo.contactoId,
    estado: "nuevo",
    interes: nuevo.interes,
    valorEstimadoCentavos: nuevo.valorEstimadoCentavos,
    creadoEn: ahora,
    actualizadoEn: ahora,
  });

  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO leads
         (id, negocio_id, contacto_id, estado, interes, valor_estimado_centavos,
          creado_en, actualizado_en)
       VALUES (?, ?, ?, 'nuevo', ?, ?, ?, ?)`,
    )
    .bind(
      lead.id,
      lead.negocioId,
      lead.contactoId,
      lead.interes,
      lead.valorEstimadoCentavos,
      lead.creadoEn,
      lead.actualizadoEn,
    )
    .run();

  return r.meta.changes > 0 ? lead : null;
}

export async function listarLeads(db: D1Database, negocioId: string): Promise<Lead[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS_LEAD} FROM leads WHERE negocio_id = ? ORDER BY actualizado_en DESC`)
    .bind(negocioId)
    .all<FilaLead>();

  return results.map(aLead);
}

/** Los que todavía pueden convertirse: ni ganados ni descartados. */
export async function contarLeadsAbiertos(db: D1Database, negocioId: string): Promise<number> {
  const fila = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads
        WHERE negocio_id = ? AND estado NOT IN ('cliente','perdido')`,
    )
    .bind(negocioId)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}
