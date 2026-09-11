/**
 * Lo que comparten los tres productos de Meta.
 *
 * La app de Meta es UNA sola —la del negocio—, así que los tres comparten
 * Callback URL, App Secret y firma. Lo único que cambia entre ellos es la forma
 * del payload y el endpoint de envío.
 */

import { firmaConFormaValida, firmaValida } from "../../core/meta/entrada";

/**
 * La autenticación de los tres productos, en un solo cuerpo.
 *
 * La llama la ruta directamente —tiene que autenticar ANTES de saber qué
 * producto es, y un canal no se construye sin producto— y los tres canales la
 * asignarán como su `autenticar`. Misma función, un llamador real en
 * producción: nada de un método que solo ejerciten los tests.
 *
 * El cuerpo entra como función porque leerlo cuesta: primero se comprueba que
 * la cabecera tenga forma de firma, y solo entonces se lee.
 */
export async function autenticarMeta(
  peticion: Request,
  leerCuerpo: () => Promise<string>,
  appSecret: string,
): Promise<boolean> {
  const cabecera = peticion.headers.get("x-hub-signature-256");
  if (!firmaConFormaValida(cabecera)) return false;

  return firmaValida(await leerCuerpo(), cabecera, appSecret);
}

/**
 * Un evento del cliente, con su hora, sirva o no su contenido.
 *
 * Existe aparte de `interpretar` porque las dos preguntas son distintas:
 * `interpretar` responde "¿hay algo que contestar?" y esto responde "¿el cliente
 * dio señales de vida?". Meta reinicia su ventana de 24 h con lo segundo, así
 * que un reloj que solo cuente lo primero se cierra antes que el suyo — y nos
 * haría pagar una plantilla pudiendo escribir gratis.
 */
export interface MarcaActividad {
  readonly canalChatId: string;
  readonly enISO: string;
}

/**
 * Los `timestamp` de WhatsApp son segundos Unix, y llegan como número o como
 * texto según el campo. Sin hora legible se devuelve null y quien llama
 * descarta la marca: mejor una ventana que se cierra de más —y manda plantilla—
 * que una hora inventada que la abra de menos y deje el mensaje sin salir.
 */
export function horaDeMeta(timestamp: unknown): string | null {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || segundos <= 0) return null;
  return new Date(segundos * 1000).toISOString();
}

/** `entry` y compañía llegan de fuera: nunca asumimos que sean listas. */
export function lista<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}
