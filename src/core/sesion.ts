/**
 * Sesión del panel: un token firmado que vive en una cookie.
 *
 * Vive en `core` por la misma razón que `cifrado.ts`: WebCrypto es un estándar
 * disponible en Workers, Node y vitest, no toca red ni base de datos, y el
 * reloj entra como parámetro. Así se prueba en milisegundos lo único que
 * importa aquí, que es qué se acepta y qué se rechaza.
 *
 * No hay tabla de sesiones y no hace falta: el panel tiene un solo dueño. Todo
 * el estado va dentro del token, y la firma es lo que impide fabricarlo.
 *
 * Formato: `v1:<vencimiento en segundos epoch>:<hmac en hex>`
 *
 * El mensaje que se firma incluye la huella de la contraseña, no solo el
 * vencimiento. Es lo que hace que rotar `PANEL_PASSWORD` eche abajo todas las
 * sesiones abiertas — que es lo que cualquiera espera al cambiar una
 * contraseña, y no ocurriría si la firma cubriera únicamente la fecha.
 */

const VERSION = "v1";

/** Siete días. Suficiente para no pedirle la clave cada mañana al dueño. */
export const DURACION_SESION_SEGUNDOS = 7 * 24 * 60 * 60;

function aHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function huellaDe(password: string): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return aHex(resumen).slice(0, 16);
}

async function firmar(claveBase64: string, mensaje: string): Promise<string> {
  const bytes = Uint8Array.from(atob(claveBase64), (c) => c.charCodeAt(0));

  const llave = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return aHex(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(mensaje)));
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre strings sale en el primer carácter distinto, y esa diferencia
 * de tiempo es medible: deja adivinar la firma byte a byte. Aquí se recorre
 * siempre lo mismo pase lo que pase.
 */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diferencia === 0;
}

export async function firmarSesion(
  claveBase64: string,
  password: string,
  vencimientoEpoch: number,
): Promise<string> {
  const exp = Math.floor(vencimientoEpoch);
  const mensaje = `${VERSION}:${exp}:${await huellaDe(password)}`;

  return `${VERSION}:${exp}:${await firmar(claveBase64, mensaje)}`;
}

/**
 * `false` en vez de excepción: un token vencido, manipulado o simplemente
 * ausente es el caso normal —no un error del programa— y quien llama solo
 * necesita saber si deja pasar o manda al login.
 */
export async function verificarSesion(
  token: string,
  claveBase64: string,
  password: string,
  ahoraEpoch: number,
): Promise<boolean> {
  try {
    const partes = token.split(":");
    if (partes.length !== 3) return false;

    const [version, expTexto, firmaRecibida] = partes;
    if (version !== VERSION || !expTexto || !firmaRecibida) return false;

    // Sin esto, "12abc" pasaría por Number() como NaN y "1e99" como infinito
    // práctico: el vencimiento tiene que ser dígitos y nada más.
    if (!/^\d+$/.test(expTexto)) return false;

    const exp = Number(expTexto);
    if (exp < ahoraEpoch) return false;

    const esperada = await firmar(claveBase64, `${VERSION}:${exp}:${await huellaDe(password)}`);

    return igualesEnTiempoConstante(firmaRecibida, esperada);
  } catch {
    return false;
  }
}
