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
