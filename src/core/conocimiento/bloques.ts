import type { Faq, ItemCatalogo } from "./tipos";

/** $180.000 — el formato en que el dueño y el cliente hablan de plata. */
export function precioTexto(centavos: number | null): string {
  if (centavos === null) return "precio por confirmar";
  return `$${Math.round(centavos / 100).toLocaleString("es-CO")}`;
}

/**
 * El catálogo como texto para el prompt de respuesta.
 *
 * "puedes citarlos tal cual" es la mitad de la Fase 2: con esto el agente
 * responde precios sin escalar. La otra mitad —escalar lo que NO está aquí—
 * ya existe: la regla de `necesitaHumano` en la extracción.
 */
export function bloqueCatalogo(items: readonly ItemCatalogo[]): string {
  if (items.length === 0) return "";

  const lineas = items.map((i) => {
    const partes = [i.nombre];
    if (i.descripcion) partes.push(i.descripcion);
    partes.push(precioTexto(i.precioCentavos));
    if (i.diasEntrega !== null) {
      partes.push(`entrega en ${i.diasEntrega} ${i.diasEntrega === 1 ? "día" : "días"}`);
    }
    return `- ${partes.join(" — ")}`;
  });

  return `CATÁLOGO Y PRECIOS (puedes citarlos tal cual):\n${lineas.join("\n")}`;
}

export function bloqueFaq(faqs: readonly Faq[]): string {
  if (faqs.length === 0) return "";

  const lineas = faqs.map((f) => `- ${f.pregunta} → ${f.respuesta}`);
  return `PREGUNTAS FRECUENTES (responde con esto cuando aplique):\n${lineas.join("\n")}`;
}
