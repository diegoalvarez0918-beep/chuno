import { esTerminal } from "../pedido/estado";
import type { EstadoPedido } from "../pedido/tipos";

/**
 * El vigía: la pieza que convierte una lista de pedidos en una alerta útil.
 *
 * Reglas puras sobre fechas, sin base de datos y sin reloj propio — `hoy` entra
 * como parámetro. Así se prueban los bordes (hoy, ayer, mañana) sin viajar en el
 * tiempo ni depender de la zona horaria del servidor.
 */

export const RIESGOS = ["ok", "sin_fecha", "en_riesgo", "vencida"] as const;
export type Riesgo = (typeof RIESGOS)[number];

export interface EvaluacionPromesa {
  readonly riesgo: Riesgo;
  /** Negativo si ya pasó. null cuando no hay nada que contar. */
  readonly diasRestantes: number | null;
}

/** Días calendario entre dos fechas YYYY-MM-DD, en UTC para que no dependa del huso. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** A cuántos días de la fecha comprometida empezamos a avisar. */
export const UMBRAL_RIESGO_DIAS = 1;

export function evaluarPromesa(
  pedido: { readonly estado: EstadoPedido; readonly fechaComprometida: string | null },
  hoy: string,
  umbralDias: number = UMBRAL_RIESGO_DIAS,
): EvaluacionPromesa {
  // "listo" cuenta como promesa cumplida: lo que se prometió fue tenerlo listo.
  // Que el cliente no haya pasado a recogerlo no es un incumplimiento del negocio.
  if (pedido.estado === "listo" || esTerminal(pedido.estado)) {
    return { riesgo: "ok", diasRestantes: null };
  }

  if (pedido.fechaComprometida === null) {
    return { riesgo: "sin_fecha", diasRestantes: null };
  }

  const diasRestantes = diasEntre(hoy, pedido.fechaComprometida);

  if (diasRestantes < 0) return { riesgo: "vencida", diasRestantes };
  if (diasRestantes <= umbralDias) return { riesgo: "en_riesgo", diasRestantes };

  return { riesgo: "ok", diasRestantes };
}

/** Los que el dueño tiene que ver hoy, y en qué orden. */
export const RIESGOS_ACCIONABLES: readonly Riesgo[] = ["vencida", "en_riesgo", "sin_fecha"];

export function esAccionable(riesgo: Riesgo): boolean {
  return RIESGOS_ACCIONABLES.includes(riesgo);
}

/** Lo vencido primero, luego lo que está por vencerse, y de último lo que le falta fecha. */
export function prioridad(riesgo: Riesgo): number {
  const orden: Record<Riesgo, number> = { vencida: 0, en_riesgo: 1, sin_fecha: 2, ok: 3 };
  return orden[riesgo];
}
