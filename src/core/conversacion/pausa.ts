/**
 * Cuando el dueño toma el chat, el agente se hace a un lado.
 *
 * La columna `pausado_hasta` y la comprobación `estaPausada` existen desde el
 * primer día, y el agente ya las respeta: si la conversación está pausada, se
 * calla sin gastar un token. Lo que nunca existió fue **quién decide hasta
 * cuándo** — `pausarConversacion` recibe un `hasta` ya calculado y no había
 * nadie que lo calculara, porque no había pantalla desde donde pausar.
 *
 * Esa decisión vive aquí y no en la ruta por la razón de siempre: es aritmética
 * sobre fechas, se prueba en milisegundos y no necesita ni base ni red. `ahora`
 * entra como parámetro; este módulo no tiene reloj propio.
 */

/**
 * Dos horas.
 *
 * Es el tiempo de una atención de mostrador, no el de un turno completo. Corto
 * a propósito: el modo de falla que importa no es que el agente vuelva pronto
 * —eso se nota y se vuelve a pausar— sino que el dueño pause para atender a
 * alguien, se le olvide, y el asistente quede mudo tres días mientras los
 * clientes escriben. Una pausa que se vence sola no puede causar ese daño.
 */
export const PAUSA_POR_DEFECTO_MINUTOS = 120;

/**
 * Hasta cuándo se calla el agente, en ISO-8601 con `T` y `Z`.
 *
 * El formato no es un detalle: D1 no tiene tipo fecha y compara como texto.
 * `datetime('now')` de SQLite escribe `2026-08-15 14:00:00`, con espacio, y el
 * espacio ordena antes que la `T`. `estaPausada` es literalmente una
 * comparación de texto contra "ahora", así que mezclar formatos la rompería en
 * silencio — una pausa que nunca empieza, o que no termina nunca.
 *
 * Cero minutos devuelve el propio instante, y eso ES reanudar: la comparación
 * de `estaPausada` es estricta, así que una pausa que vence ahora ya no está
 * activa. Reanudar no necesita ni una operación distinta ni una columna nueva.
 */
export function hastaCuandoPausar(
  ahora: string,
  minutos: number = PAUSA_POR_DEFECTO_MINUTOS,
): string {
  return new Date(Date.parse(ahora) + minutos * 60_000).toISOString();
}

/**
 * Cuántos minutos le faltan al agente para volver. Cero si ya volvió, si nunca
 * se pausó, o si la fecha guardada no se puede leer.
 *
 * Redondea hacia arriba para que la pantalla nunca diga "vuelve en 0 minutos"
 * mientras el agente todavía está callado: mostrar cero cuando aún falta medio
 * minuto es decirle al dueño algo que no es cierto.
 *
 * Una fecha ilegible cuenta como "sin pausa" y no como pausa eterna. Si el dato
 * está corrupto, el modo de falla seguro es que el asistente responda —que es
 * lo que el cliente espera— y no que se quede mudo para siempre sin que nadie
 * entienda por qué.
 */
export function minutosRestantesDePausa(pausadoHasta: string | null, ahora: string): number {
  if (pausadoHasta === null) return 0;

  const restanMs = Date.parse(pausadoHasta) - Date.parse(ahora);
  if (!Number.isFinite(restanMs) || restanMs <= 0) return 0;

  return Math.ceil(restanMs / 60_000);
}
