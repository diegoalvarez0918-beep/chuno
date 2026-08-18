import { fallo, ok, type Resultado } from "../resultado";

/**
 * La puerta de entrada de los webhooks de Meta.
 *
 * Vive en `core` a pesar de sonar a infraestructura, por la misma razón que
 * `cifrado.ts`: es puro en el sentido que importa aquí. WebCrypto es estándar
 * en Workers, en Node y en vitest, no toca red ni reloj, y así la puerta se
 * prueba en milisegundos. Los secretos entran como parámetro — core no lee `env`.
 */

export type RechazoEntrada =
  | "parametros_incompletos"
  | "modo_no_soportado"
  | "token_no_coincide";

/**
 * ¿Le faltan a la petición los parámetros que Meta siempre manda?
 *
 * Existe aparte para que la ruta pueda descartar basura ANTES de ir a D1 a
 * buscar la credencial y descifrarla, sin duplicar la regla: `resolverHandshake`
 * la usa también. Una petición anónima no puede costarnos una consulta.
 */
export function handshakeIncompleto(parametros: URLSearchParams): boolean {
  return (
    !parametros.get("hub.mode") ||
    !parametros.get("hub.challenge") ||
    !parametros.get("hub.verify_token")
  );
}

/**
 * El verify token se compara con `===` y no en tiempo constante a propósito:
 * solo gobierna el alta de la suscripción, nunca la autenticidad de un mensaje.
 * Lo que protege los mensajes es el HMAC de `firmaValida`.
 */
export function resolverHandshake(
  parametros: URLSearchParams,
  tokenEsperado: string,
): Resultado<string, RechazoEntrada> {
  if (handshakeIncompleto(parametros)) return fallo("parametros_incompletos");
  if (parametros.get("hub.mode") !== "subscribe") return fallo("modo_no_soportado");
  if (parametros.get("hub.verify_token") !== tokenEsperado) return fallo("token_no_coincide");

  // Como texto y no como número: Meta lo documenta como entero, pero espera de
  // vuelta exactamente lo que mandó.
  return ok(parametros.get("hub.challenge") as string);
}

const PREFIJO_FIRMA = "sha256=";
const LARGO_HEX = 64; // SHA-256 son 32 bytes

function hexDeLaCabecera(cabecera: string | null): string | null {
  if (!cabecera || !cabecera.startsWith(PREFIJO_FIRMA)) return null;

  const hex = cabecera.slice(PREFIJO_FIRMA.length);
  if (hex.length !== LARGO_HEX || !/^[0-9a-f]+$/i.test(hex)) return null;

  return hex;
}

/**
 * ¿Tiene la cabecera forma de firma, sin verificar todavía el HMAC?
 *
 * Es el filtro barato: descarta a quien ni siquiera intentó firmar, antes de
 * que la ruta vaya a D1 por el App Secret y lo descifre. Sin esto la puerta es
 * un amplificador — el atacante gasta un paquete y nosotros una consulta.
 */
export function firmaConFormaValida(cabecera: string | null): boolean {
  return hexDeLaCabecera(cabecera) !== null;
}

/**
 * Verifica el HMAC-SHA256 del cuerpo con `crypto.subtle.verify` en vez de
 * comparar cadenas: la comparación de un HMAC pertenece dentro de WebCrypto,
 * no en un `===` nuestro.
 */
export async function firmaValida(
  cuerpoCrudo: string,
  cabecera: string | null,
  appSecret: string,
): Promise<boolean> {
  const hex = hexDeLaCabecera(cabecera);
  if (!hex) return false;

  const firma = new Uint8Array(hex.length / 2);
  for (let i = 0; i < firma.length; i++) {
    firma[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("HMAC", llave, firma, new TextEncoder().encode(cuerpoCrudo));
}
