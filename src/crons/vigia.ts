import { claveAviso, evaluarPromesa, type Riesgo } from "../core/vigia/reglas";
import type { Pedido } from "../core/pedido/tipos";
import { hoyEnZona } from "../db/id";
import { listarNegocios, type Negocio } from "../db/repos/negocio";
import { listarPedidosVivos } from "../db/repos/pedido";
import { crearPropuesta, listarPendientes } from "../db/repos/propuesta";
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
  const [pedidos, pendientes] = await Promise.all([
    listarPedidosVivos(db, negocio.id),
    listarPendientes(db, negocio.id),
  ]);
  let avisos = 0;

  /**
   * Pedidos que ya tienen un aviso esperando decisión.
   *
   * La clave de deduplicación evita repetir el MISMO aviso; esto evita apilar
   * avisos DISTINTOS del mismo pedido. Sin ello, un dueño que deja la bandeja
   * sin mirar tres días encuentra tres tarjetas del mismo encargo, y cuando el
   * riesgo escala de "en_riesgo" a "vencida" la clave cambia y entraría una
   * segunda aunque la primera siga sin decidirse.
   *
   * Una tarjeta por pedido a la vez, y es lo correcto además de lo cómodo:
   * cada tarjeta es un mensaje que saldría al cliente, y mandarle dos mensajes
   * distintos sobre el mismo encargo sería un error, no una mejora.
   */
  const conAvisoPendiente = new Set(
    // `flatMap` y no `filter().map()`: dentro del ternario TypeScript sí estrecha
    // el payload a su variante y `pedidoId` a string, así que no hace falta cast.
    pendientes.flatMap((p) =>
      p.payload.tipo === "enviar_aviso" && p.payload.pedidoId !== null ? [p.payload.pedidoId] : [],
    ),
  );

  for (const pedido of pedidos) {
    const { riesgo, diasRestantes } = evaluarPromesa(pedido, hoy);

    // "sin_fecha" se ve en el tablero pero no genera mensaje al cliente: no hay
    // nada concreto que decirle todavía.
    if (riesgo !== "vencida" && riesgo !== "en_riesgo") continue;

    if (conAvisoPendiente.has(pedido.id)) continue;

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
      // Un aviso por pedido, por nivel de riesgo y por DÍA. El día es lo que
      // hace que descartar un aviso no silencie ese pedido para siempre.
      claveDedupe: claveAviso(pedido.id, riesgo, hoy),
    });

    if (propuesta) avisos++;
  }

  if (avisos > 0) {
    await auditar(db, negocio.id, "vigia_avisos", { avisos, revisados: pedidos.length }, "cron");
  }

  return { revisados: pedidos.length, avisos };
}
