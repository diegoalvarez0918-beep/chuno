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
