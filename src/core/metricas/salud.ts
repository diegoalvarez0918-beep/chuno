export type EstadoSalud = "bien" | "atencion" | "critico";

/** Por debajo de esto, la proporción de fallos no es evidencia de nada. */
const MUESTRA_MINIMA = 3;
const UMBRAL_ATENCION = 0.15;
const UMBRAL_CRITICO = 0.5;

/**
 * Salud del agente a partir de sus fallos recientes.
 *
 * La muestra mínima importa: sin ella, el primer mensaje que falle pintaría el
 * panel de rojo con un 100% de fallos sobre un solo intento, y el dueño dejaría
 * de creerle al indicador el primer día.
 */
export function evaluarSalud(conteo: { fallos: number; total: number }): EstadoSalud {
  if (conteo.total < MUESTRA_MINIMA) return "bien";

  const proporcion = conteo.fallos / conteo.total;
  if (proporcion >= UMBRAL_CRITICO) return "critico";
  if (proporcion >= UMBRAL_ATENCION) return "atencion";
  return "bien";
}
