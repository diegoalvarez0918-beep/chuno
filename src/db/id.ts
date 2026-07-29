/**
 * Ids con prefijo legible: `ped_a1b2…`, `prop_c3d4…`.
 *
 * El prefijo no es decoración — cuando algo falla en producción, un id te dice
 * de qué tabla salió sin tener que ir a buscarlo.
 */
export function nuevoId(prefijo: string): string {
  return `${prefijo}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

/** ISO 8601 en UTC. Toda fecha guardada en la base usa este formato. */
export function ahoraISO(): string {
  return new Date().toISOString();
}

/**
 * "Hoy" en la zona horaria del negocio, como YYYY-MM-DD.
 *
 * Importa de verdad: a las 8 p.m. en Bogotá ya es el día siguiente en UTC, y un
 * vigía que use UTC marcaría como vencidos pedidos que todavía tienen un día.
 */
export function hoyEnZona(zonaHoraria: string, referencia: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referencia);

  return partes; // en-CA ya entrega YYYY-MM-DD
}
