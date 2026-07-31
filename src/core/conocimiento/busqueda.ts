import type { Faq, ItemCatalogo } from "./tipos";

/**
 * Relevancia por coincidencia de términos, en memoria.
 *
 * El catálogo de una mipyme cabe entero en una consulta a D1; lo que hace la
 * base es traerlo y lo que hace esto es ordenarlo. Al ser puro se prueba en
 * milisegundos, y cuando llegue el RAG con embeddings (Fase 8) se cambia esta
 * función sin tocar al agente.
 */

/** Palabras de 4+ letras, sin acentos y sin las vacías del español. */
const VACIAS = new Set([
  "para", "como", "pero", "esta", "este", "esto", "hola", "gracias", "porque",
  "cuando", "donde", "sobre", "tiene", "tienen", "puedo", "quiero", "necesito",
]);

export function tokenizar(texto: string): string[] {
  return [
    ...new Set(
      texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !VACIAS.has(t)),
    ),
  ].slice(0, 6);
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function puntuar(texto: string, terminos: readonly string[]): number {
  const plano = normalizar(texto);
  return terminos.filter((t) => plano.includes(t)).length;
}

/**
 * Los ítems que coinciden, primero. Si nada coincide, el catálogo acotado:
 * los precios son la pregunta más frecuente del chat y es mejor darle al
 * modelo el catálogo completo que dejarlo sin nada y tentarlo a inventar.
 */
export function filtrarCatalogo(
  items: readonly ItemCatalogo[],
  consulta: string,
  limite = 8,
): ItemCatalogo[] {
  const terminos = tokenizar(consulta);
  if (terminos.length === 0) return items.slice(0, limite);

  const puntuados = items
    .map((item) => ({ item, puntos: puntuar(`${item.nombre} ${item.descripcion ?? ""}`, terminos) }))
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);

  const elegidos = puntuados.length > 0 ? puntuados.map((p) => p.item) : [...items];
  return elegidos.slice(0, limite);
}

/**
 * El producto cuya foto vale la pena mandar, si es que hay alguno.
 *
 * No se apoya en `filtrarCatalogo` a propósito. Esa función, cuando nada
 * coincide, devuelve el catálogo entero para que el modelo tenga con qué
 * responder en vez de inventar. Eso está bien para texto y es pésimo para una
 * foto: convertiría un "hola" en la foto de un producto al azar, que es
 * exactamente como se comporta un bot de publicidad.
 *
 * Aquí la exigencia es otra: **coincidencia real y sin empate.** Si el cliente
 * nombró un producto y solo uno, se manda su foto. Si nombró dos, o ninguno,
 * no se manda nada — el texto ya lleva la información.
 */
export function fotoParaResponder(
  items: readonly ItemCatalogo[],
  consulta: string,
): ItemCatalogo | null {
  const terminos = tokenizar(consulta);
  if (terminos.length === 0) return null;

  const conFoto = items.filter((i) => i.imagenClave !== null);
  if (conFoto.length === 0) return null;

  const puntuados = conFoto
    .map((item) => ({ item, puntos: puntuar(`${item.nombre} ${item.descripcion ?? ""}`, terminos) }))
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);

  const mejor = puntuados[0];
  if (!mejor) return null;

  // Empate: el cliente preguntó por algo que toca dos productos. Mandar la foto
  // de uno solo sería elegir por él.
  if (puntuados[1] && puntuados[1].puntos === mejor.puntos) return null;

  return mejor.item;
}

export function filtrarFaq(faqs: readonly Faq[], consulta: string, limite = 4): Faq[] {
  const terminos = tokenizar(consulta);
  if (terminos.length === 0) return faqs.slice(0, limite);

  const puntuados = faqs
    .map((faq) => ({ faq, puntos: puntuar(`${faq.pregunta} ${faq.respuesta}`, terminos) }))
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);

  const elegidas = puntuados.length > 0 ? puntuados.map((p) => p.faq) : [...faqs];
  return elegidas.slice(0, limite);
}
