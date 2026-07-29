import { evaluarPromesa, type Riesgo } from "../core/vigia/reglas";
import type { Pedido } from "../core/pedido/tipos";
import { hoyEnZona } from "../db/id";
import { listarNegocios, type Negocio } from "../db/repos/negocio";
import { listarPedidosVivos } from "../db/repos/pedido";
import { crearPropuesta } from "../db/repos/propuesta";
import { auditar } from "../db/repos/varios";

/**
 * El vigía.
 *
 * Recorre los pedidos vivos de cada negocio y deja en la bandeja del dueño un
 * aviso listo para aprobar cuando una promesa se está cayendo. Es la pieza que
 * convierte "tengo un tablero" en "me avisan antes de que el cliente reclame".
 *
 * Corre cada 30 minutos. La idempotencia no está aquí sino en la clave de
 * deduplicación de la propuesta: repetir la ejecución no repite el aviso.
 */

/** Redacción determinista, sin LLM. */
function redactarAviso(pedido: Pedido, riesgo: Riesgo): string {
  const nombre = pedido.clienteNombre.split(" ")[0] ?? pedido.clienteNombre;
  const que = pedido.items.map((i) => i.descripcion).join(", ");

  if (riesgo === "vencida") {
    return [
      `Hola ${nombre}, te escribo por tu pedido de ${que}.`,
      "Se nos corrió la fecha que te había prometido y quiero avisarte antes de que preguntes.",
      "Te confirmo hoy mismo una fecha nueva. Mil disculpas.",
    ].join(" ");
  }

  return [
    `Hola ${nombre}, tu pedido de ${que} sigue en proceso`,
    `y va para el ${pedido.fechaComprometida}.`,
    "Te aviso apenas esté listo.",
  ].join(" ");
}

function motivoParaElDueno(pedido: Pedido, riesgo: Riesgo, diasRestantes: number | null): string {
  if (riesgo === "vencida") {
    const dias = diasRestantes === null ? "" : ` (${Math.abs(diasRestantes)} día(s) de atraso)`;
    return `El pedido de ${pedido.clienteNombre} venció el ${pedido.fechaComprometida}${dias} y sigue sin estar listo.`;
  }
  return `El pedido de ${pedido.clienteNombre} vence el ${pedido.fechaComprometida} y todavía no está listo.`;
}

export interface ResumenVigia {
  readonly negocios: number;
  readonly revisados: number;
  readonly avisosNuevos: number;
}

export async function correrVigia(db: D1Database): Promise<ResumenVigia> {
  const negocios = await listarNegocios(db);
  let revisados = 0;
  let avisosNuevos = 0;

  for (const negocio of negocios) {
    const nuevos = await revisarNegocio(db, negocio);
    revisados += nuevos.revisados;
    avisosNuevos += nuevos.avisos;
  }

  return { negocios: negocios.length, revisados, avisosNuevos };
}

async function revisarNegocio(
  db: D1Database,
  negocio: Negocio,
): Promise<{ revisados: number; avisos: number }> {
  // Cada negocio se evalúa contra SU día, no contra UTC. A las 8 p.m. en Bogotá
  // ya es el día siguiente en UTC, y usar UTC marcaría como vencidos pedidos que
  // todavía tienen un día por delante.
  const hoy = hoyEnZona(negocio.zonaHoraria);
  const pedidos = await listarPedidosVivos(db, negocio.id);
  let avisos = 0;

  for (const pedido of pedidos) {
    const { riesgo, diasRestantes } = evaluarPromesa(pedido, hoy);

    // "sin_fecha" se ve en el tablero pero no genera mensaje al cliente: no hay
    // nada concreto que decirle todavía.
    if (riesgo !== "vencida" && riesgo !== "en_riesgo") continue;

    const propuesta = await crearPropuesta(db, {
      negocioId: negocio.id,
      payload: {
        tipo: "enviar_aviso",
        conversacionId: pedido.conversacionId,
        pedidoId: pedido.id,
        texto: redactarAviso(pedido, riesgo),
      },
      motivo: motivoParaElDueno(pedido, riesgo, diasRestantes),
      confianza: null,
      // Un aviso por pedido y por nivel de riesgo. Cuando un pedido pasa de
      // "en riesgo" a "vencido", la clave cambia y sí se genera uno nuevo.
      claveDedupe: `aviso:${pedido.id}:${riesgo}`,
    });

    if (propuesta) avisos++;
  }

  if (avisos > 0) {
    await auditar(db, negocio.id, "vigia_avisos", { avisos, revisados: pedidos.length }, "cron");
  }

  return { revisados: pedidos.length, avisos };
}
