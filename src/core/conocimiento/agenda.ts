import { fallo, ok, type Resultado } from "../resultado";

/**
 * El link de agenda del negocio: Cal.com, Calendly o el que use.
 *
 * **Por qué solo un link y no una integración.** Agendar de verdad es escribir
 * en un sistema ajeno, y eso es una acción hacia fuera: tendría que pasar por
 * la bandeja como cualquier otra, con su credencial cifrada, su manejo de
 * huecos y sus cancelaciones. Compartir el link resuelve el noventa por ciento
 * del caso con cero credenciales y cero superficie nueva, y deja la integración
 * completa para cuando exista de verdad.
 *
 * Se guarda como un `setting` del negocio, igual que el tono.
 */

export const CLAVE_AGENDA = "agenda_url";

/**
 * Valida y normaliza lo que el dueño pegó en el panel.
 *
 * Acepta que lo pegue sin esquema, que es como la gente copia un link de la
 * barra del navegador. Exige HTTPS: este link se le manda a clientes finales
 * por chat, y mandar un http:// es enseñarle a la gente a confiar en enlaces
 * sin cifrar.
 */
export function normalizarUrlAgenda(texto: string): Resultado<string, string> {
  const limpio = texto.trim();
  if (limpio === "") return fallo("Pega el link de tu agenda, o déjalo vacío para quitarlo.");

  const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;

  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    return fallo("Eso no parece un link. Debe verse como cal.com/tu-negocio.");
  }

  if (url.protocol !== "https:") {
    return fallo("El link tiene que ser https: se lo vas a mandar a tus clientes.");
  }

  // Un host sin punto es "localhost" o una palabra suelta, no una agenda.
  if (!url.hostname.includes(".")) {
    return fallo("Eso no parece un link. Debe verse como cal.com/tu-negocio.");
  }

  return ok(url.toString());
}
