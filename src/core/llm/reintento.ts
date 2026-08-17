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
 * Lo que NO se arregla cambiando de modelo, porque el problema es nuestro.
 *
 * La lista está invertida a propósito, y esa es la decisión importante de este
 * archivo. Durante tres incidentes se enumeró lo contrario —qué errores SÍ
 * merecían otro modelo— y las tres veces se quedó corta: primero faltó el 404,
 * después el 503, y el 2026-08-17 el timeout, que dejó al bot mudo con dos
 * respaldos sanos sin intentar. Enumerar lo que se reintenta hace que todo
 * error nuevo caiga del lado del silencio, que es el peor lado. Enumerado al
 * revés, cae del lado de degradar, que es recuperable.
 *
 * 400 es una petición mal armada por nosotros y sale igual en cualquier modelo.
 * 401 y 403 son la llave, que es una sola para toda la lista: si no sirve para
 * un modelo, no sirve para ninguno.
 *
 * Esto solo es seguro con `PRESUPUESTO_TOTAL_MS`: sin un tope de tiempo,
 * "reintentar por defecto" convierte un error raro en un minuto de espera.
 */
const CULPA_NUESTRA = ["HTTP 400", "HTTP 401", "HTTP 403"] as const;

export function otroModeloPuedeAyudar(error: string): boolean {
  return !CULPA_NUESTRA.some((codigo) => error.includes(codigo));
}

/**
 * Cuánto puede durar el siguiente intento, o `null` si ya no queda tiempo útil
 * y hay que rendirse con lo que haya.
 */
export function msParaElSiguienteIntento(msRestantes: number): number | null {
  if (msRestantes < MINIMO_UTIL_MS) return null;
  return Math.min(msRestantes, TOPE_POR_INTENTO_MS);
}
