import { PedidoSchema, type EstadoPedido, type Pedido } from "../../core/pedido/tipos";
import { ESTADOS_TERMINALES } from "../../core/pedido/estado";
import { ahoraISO, nuevoId } from "../id";

interface FilaPedido {
  id: string;
  negocio_id: string;
  conversacion_id: string;
  cliente_nombre: string;
  items_json: string;
  monto_centavos: number | null;
  fecha_comprometida: string | null;
  estado: string;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
}

const COLUMNAS = `id, negocio_id, conversacion_id, cliente_nombre, items_json,
                  monto_centavos, fecha_comprometida, estado, notas, creado_en, actualizado_en`;

/**
 * Convierte una fila en un Pedido validado.
 *
 * Se valida al LEER, no solo al escribir. Que el dato haya salido de nuestra
 * propia tabla no lo hace confiable: `items_json` es texto libre para SQLite, y
 * una migración a medias o una escritura vieja pueden dejar basura. Si la fila
 * no cumple el contrato, preferimos saberlo aquí y no tres capas más arriba.
 */
function aPedido(f: FilaPedido): Pedido {
  let items: unknown;
  try {
    items = JSON.parse(f.items_json);
  } catch {
    throw new Error(`pedido ${f.id}: items_json corrupto`);
  }

  const r = PedidoSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    conversacionId: f.conversacion_id,
    clienteNombre: f.cliente_nombre,
    items,
    montoCentavos: f.monto_centavos,
    fechaComprometida: f.fecha_comprometida,
    estado: f.estado,
    notas: f.notas,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  });

  if (!r.success) {
    throw new Error(`pedido ${f.id}: fila inválida: ${r.error.issues[0]?.message ?? "?"}`);
  }

  return r.data;
}

export interface NuevoPedido {
  readonly negocioId: string;
  readonly conversacionId: string;
  readonly clienteNombre: string;
  readonly items: Pedido["items"];
  readonly montoCentavos: number | null;
  readonly fechaComprometida: string | null;
  readonly notas: string | null;
  readonly estado?: EstadoPedido;
}

export async function crearPedido(db: D1Database, nuevo: NuevoPedido): Promise<Pedido> {
  const ahora = ahoraISO();

  const pedido: Pedido = PedidoSchema.parse({
    id: nuevoId("ped"),
    negocioId: nuevo.negocioId,
    conversacionId: nuevo.conversacionId,
    clienteNombre: nuevo.clienteNombre,
    items: nuevo.items,
    montoCentavos: nuevo.montoCentavos,
    fechaComprometida: nuevo.fechaComprometida,
    // Nace confirmado cuando lo aprobó un humano; en borrador si lo creó el agente.
    estado: nuevo.estado ?? "confirmado",
    notas: nuevo.notas,
    creadoEn: ahora,
    actualizadoEn: ahora,
  });

  await db
    .prepare(
      `INSERT INTO pedidos (${COLUMNAS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      pedido.id,
      pedido.negocioId,
      pedido.conversacionId,
      pedido.clienteNombre,
      JSON.stringify(pedido.items),
      pedido.montoCentavos,
      pedido.fechaComprometida,
      pedido.estado,
      pedido.notas,
      pedido.creadoEn,
      pedido.actualizadoEn,
    )
    .run();

  return pedido;
}

export async function obtenerPedido(
  db: D1Database,
  negocioId: string,
  pedidoId: string,
): Promise<Pedido | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} FROM pedidos WHERE negocio_id = ? AND id = ?`)
    .bind(negocioId, pedidoId)
    .first<FilaPedido>();

  return fila ? aPedido(fila) : null;
}

export async function listarPedidos(
  db: D1Database,
  negocioId: string,
  limite = 100,
): Promise<Pedido[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM pedidos WHERE negocio_id = ?
       ORDER BY fecha_comprometida IS NULL, fecha_comprometida ASC, creado_en DESC
       LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<FilaPedido>();

  return results.map(aPedido);
}

/** Los que el vigía tiene que revisar: todo lo que no está entregado ni cancelado. */
export async function listarPedidosVivos(db: D1Database, negocioId: string): Promise<Pedido[]> {
  const marcadores = ESTADOS_TERMINALES.map(() => "?").join(", ");

  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM pedidos
       WHERE negocio_id = ? AND estado NOT IN (${marcadores})
       ORDER BY fecha_comprometida IS NULL, fecha_comprometida ASC`,
    )
    .bind(negocioId, ...ESTADOS_TERMINALES)
    .all<FilaPedido>();

  return results.map(aPedido);
}

export async function listarPedidosDeConversacion(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
): Promise<Pedido[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} FROM pedidos WHERE negocio_id = ? AND conversacion_id = ?
       ORDER BY creado_en DESC`,
    )
    .bind(negocioId, conversacionId)
    .all<FilaPedido>();

  return results.map(aPedido);
}

/**
 * Guarda un pedido ya modificado por el núcleo.
 *
 * No recibe "campos a cambiar": recibe el pedido completo que devolvió
 * `transicionar()` u otra función del núcleo. La lógica de qué cambio es válido
 * vive allá, no aquí.
 */
export async function guardarPedido(db: D1Database, pedido: Pedido): Promise<void> {
  await db
    .prepare(
      `UPDATE pedidos SET
         cliente_nombre = ?, items_json = ?, monto_centavos = ?,
         fecha_comprometida = ?, estado = ?, notas = ?, actualizado_en = ?
       WHERE negocio_id = ? AND id = ?`,
    )
    .bind(
      pedido.clienteNombre,
      JSON.stringify(pedido.items),
      pedido.montoCentavos,
      pedido.fechaComprometida,
      pedido.estado,
      pedido.notas,
      pedido.actualizadoEn,
      pedido.negocioId,
      pedido.id,
    )
    .run();
}
