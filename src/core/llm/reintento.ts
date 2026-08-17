/**
 * Cuándo vale la pena intentar con el siguiente modelo, y cuánto puede durar
 * ese intento.
 *
 * Vive en `core` por la misma razón que `cifrado.ts`: es una decisión, no una
 * llamada. No toca red ni reloj — el tiempo restante entra como parámetro — y
 * por eso la política se prueba en milisegundos, que es justo lo que no pasó
 * las tres veces que esta lista se quedó corta en producción.
 */

/** El tope de un intento suelto. */
const TOPE_POR_INTENTO_MS = 20_000;

/**
 * Lo que puede durar el recorrido entero por la lista de modelos.
 *
 * Sin esto, tres modelos a 20 segundos son un minuto de silencio para alguien
 * que está esperando en un chat. Vale más un mensaje de respaldo a los treinta
 * segundos que la respuesta buena a los sesenta.
 */
export const PRESUPUESTO_TOTAL_MS = 30_000;

/**
 * Por debajo de esto, un intento nace condenado: no alcanza para que el modelo
 * conteste, sale timeout igual y encima retrasa el mensaje de respaldo.
 */
const MINIMO_UTIL_MS = 3_000;

/**
 * Síntomas de que el problema es de ESE modelo y no nuestro.
 *
 * 404 = jubilado. 429 = cuota agotada. 503 = saturado ahora mismo. El timeout
 * entró el 2026-08-17: es la misma saturación del 503, pero manifestada como
 * lentitud en vez de como un error que Google se digne a nombrar. Sin él, un
 * modelo lento tumbaba la lista entera con dos respaldos sanos sin tocar.
 *
 * "fallo de red" NO está, y es deliberado: los modelos comparten host, así que
 * si la red falló, cambiar de modelo no la arregla.
 */
const SINTOMAS_DEL_MODELO = ["HTTP 404", "HTTP 429", "HTTP 503", "fallo de timeout"] as const;

export function otroModeloPuedeAyudar(error: string): boolean {
  return SINTOMAS_DEL_MODELO.some((sintoma) => error.includes(sintoma));
}

/**
 * Cuánto puede durar el siguiente intento, o `null` si ya no queda tiempo útil
 * y hay que rendirse con lo que haya.
 */
export function msParaElSiguienteIntento(msRestantes: number): number | null {
  if (msRestantes < MINIMO_UTIL_MS) return null;
  return Math.min(msRestantes, TOPE_POR_INTENTO_MS);
}
