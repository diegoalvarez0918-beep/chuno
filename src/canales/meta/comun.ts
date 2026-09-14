/**
 * Lo que comparten los tres productos de Meta.
 *
 * La app de Meta es UNA sola —la del negocio—, así que los tres comparten
 * Callback URL, App Secret y firma. Lo único que cambia entre ellos es la forma
 * del payload y el endpoint de envío.
 */

import { firmaConFormaValida, firmaValida } from "../../core/meta/entrada";
import { fallo, ok, type Resultado } from "../../core/resultado";

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

export const GRAPH = "https://graph.facebook.com/v25.0";
export const GRAPH_IG = "https://graph.instagram.com/v25.0";

const TIMEOUT_MS = 10_000;

/**
 * Un POST al Graph con timeout, sin SDK.
 *
 * El cuerpo del error NO entra en el mensaje: puede traer el teléfono o el
 * texto del mensaje, y eso es PII. Solo el código.
 */
export async function postAlGraph(
  url: string,
  cuerpo: unknown,
  token: string | null,
  etiqueta: string,
): Promise<Resultado<void, string>> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });

    if (!respuesta.ok) {
      return fallo(`${etiqueta}: HTTP ${respuesta.status}${await codigo(respuesta)}`);
    }
    return ok(undefined);
  } catch (e) {
    const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
    return fallo(`${etiqueta}: fallo de ${razon}`);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * El código del error de Meta, y SOLO el código.
 *
 * Nuestro reloj de la ventana es una optimización; la autoridad es Meta. Cuando
 * rechaza un envío hay que poder saber por qué, y el motivo tiene que llegar a
 * la bandeja del dueño. Pero `error.message` puede traer el teléfono o el texto
 * del mensaje, así que de ahí solo salen los números.
 *
 * No se mapea ningún código a "ventana cerrada" todavía, a propósito: no hemos
 * visto uno real. Inventarse el número sería exactamente el detector sin
 * control que ya nos costó un diagnóstico falso. Cuando aparezca el primer
 * rechazo de verdad, ahí se mapea — con la medición delante.
 */
async function codigo(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as {
      error?: { code?: unknown; error_subcode?: unknown };
    };
    const c = Number(cuerpo?.error?.code);
    const sub = Number(cuerpo?.error?.error_subcode);
    if (!Number.isFinite(c)) return "";
    return Number.isFinite(sub) ? ` (código ${c}/${sub})` : ` (código ${c})`;
  } catch {
    return "";
  }
}
