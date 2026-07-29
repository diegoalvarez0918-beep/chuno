import { FaqSchema, ItemCatalogoSchema, type Faq, type ItemCatalogo } from "../../core/conocimiento/tipos";
import { ahoraISO, nuevoId } from "../id";

interface FilaCatalogo {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion: string | null;
  precio_centavos: number | null;
  dias_entrega: number | null;
}

const COLS_CATALOGO = "id, negocio_id, nombre, descripcion, precio_centavos, dias_entrega";

function aItem(f: FilaCatalogo): ItemCatalogo {
  const r = ItemCatalogoSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    precioCentavos: f.precio_centavos,
    diasEntrega: f.dias_entrega,
  });
  if (!r.success) throw new Error(`catálogo ${f.id}: fila inválida`);
  return r.data;
}

export interface EntradaCatalogo {
  /** null = crear; con id = actualizar ese ítem. */
  readonly id: string | null;
  readonly negocioId: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly precioCentavos: number | null;
  readonly diasEntrega: number | null;
}

/**
 * Alta o edición en una sola función: el formulario del panel y el onboarding
 * pasan por aquí. Se valida ANTES de escribir — la base no recibe nada que el
 * esquema no haya aceptado.
 */
export async function guardarItemCatalogo(
  db: D1Database,
  entrada: EntradaCatalogo,
): Promise<ItemCatalogo> {
  const item = ItemCatalogoSchema.parse({
    id: entrada.id ?? nuevoId("cat"),
    negocioId: entrada.negocioId,
    nombre: entrada.nombre,
    descripcion: entrada.descripcion,
    precioCentavos: entrada.precioCentavos,
    diasEntrega: entrada.diasEntrega,
  });

  const ahora = ahoraISO();
  await db
    .prepare(
      `INSERT INTO catalogo
         (id, negocio_id, nombre, descripcion, precio_centavos, dias_entrega, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         nombre = excluded.nombre,
         descripcion = excluded.descripcion,
         precio_centavos = excluded.precio_centavos,
         dias_entrega = excluded.dias_entrega,
         actualizado_en = excluded.actualizado_en
       -- La condición de tenant también en el upsert: un id ajeno no se toca.
       WHERE catalogo.negocio_id = excluded.negocio_id`,
    )
    .bind(item.id, item.negocioId, item.nombre, item.descripcion, item.precioCentavos, item.diasEntrega, ahora, ahora)
    .run();

  return item;
}

export async function listarCatalogo(db: D1Database, negocioId: string): Promise<ItemCatalogo[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS_CATALOGO} FROM catalogo WHERE negocio_id = ? ORDER BY nombre`)
    .bind(negocioId)
    .all<FilaCatalogo>();

  return results.map(aItem);
}

export async function borrarItemCatalogo(db: D1Database, negocioId: string, id: string): Promise<void> {
  await db.prepare("DELETE FROM catalogo WHERE negocio_id = ? AND id = ?").bind(negocioId, id).run();
}

interface FilaFaq {
  id: string;
  negocio_id: string;
  pregunta: string;
  respuesta: string;
}

function aFaq(f: FilaFaq): Faq {
  const r = FaqSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    pregunta: f.pregunta,
    respuesta: f.respuesta,
  });
  if (!r.success) throw new Error(`faq ${f.id}: fila inválida`);
  return r.data;
}

export interface EntradaFaq {
  readonly id: string | null;
  readonly negocioId: string;
  readonly pregunta: string;
  readonly respuesta: string;
}

export async function guardarFaq(db: D1Database, entrada: EntradaFaq): Promise<Faq> {
  const faq = FaqSchema.parse({
    id: entrada.id ?? nuevoId("faq"),
    negocioId: entrada.negocioId,
    pregunta: entrada.pregunta,
    respuesta: entrada.respuesta,
  });

  const ahora = ahoraISO();
  await db
    .prepare(
      `INSERT INTO faq (id, negocio_id, pregunta, respuesta, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         pregunta = excluded.pregunta,
         respuesta = excluded.respuesta,
         actualizado_en = excluded.actualizado_en
       WHERE faq.negocio_id = excluded.negocio_id`,
    )
    .bind(faq.id, faq.negocioId, faq.pregunta, faq.respuesta, ahora, ahora)
    .run();

  return faq;
}

export async function listarFaq(db: D1Database, negocioId: string): Promise<Faq[]> {
  const { results } = await db
    .prepare("SELECT id, negocio_id, pregunta, respuesta FROM faq WHERE negocio_id = ? ORDER BY creado_en")
    .bind(negocioId)
    .all<FilaFaq>();

  return results.map(aFaq);
}

export async function borrarFaq(db: D1Database, negocioId: string, id: string): Promise<void> {
  await db.prepare("DELETE FROM faq WHERE negocio_id = ? AND id = ?").bind(negocioId, id).run();
}
