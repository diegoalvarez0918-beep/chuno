import type { Faq, ItemCatalogo } from "./tipos";

/** $180.000 — el formato en que el dueño y el cliente hablan de plata. */
export function precioTexto(centavos: number | null): string {
  if (centavos === null) return "precio por confirmar";
  return `$${Math.round(centavos / 100).toLocaleString("es-CO")}`;
}

/**
 * El catálogo como texto para el prompt de respuesta y para el de extracción.
 *
 * "puedes citarlos tal cual" es la mitad de la Fase 2: con esto el agente
 * responde precios sin escalar. La otra mitad —escalar lo que NO está aquí—
 * ya existe: la regla de `necesitaHumano` en la extracción.
 *
 * La instrucción de emparejar por significado se ganó midiendo. El 2026-09-14
 * un cliente pidió "gafas progresivas" y el bot contestó que no tenía la
 * información, teniendo "Lentes progresivos · $420.000 · entrega en 7 días"
 * en este bloque. La búsqueda no falló —se reprodujo con el catálogo real y sí
 * le pasó el producto—: falló que el modelo comparara palabra por palabra.
 *
 * Vive aquí, en el bloque compartido, porque no es un problema de ópticas. En
 * una panadería el cliente pide "un pastel" y el catálogo dice "torta"; pide
 * "envío" y el catálogo dice "domicilio". El cliente nunca usa las palabras
 * del catálogo, en ningún negocio.
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
    return `- ${partes.join(" · ")}`;
  });

  return [
    "CATÁLOGO Y PRECIOS (puedes citarlos tal cual):",
    ...lineas,
    "",
    "El cliente va a nombrar estos productos con OTRAS PALABRAS que las de la",
    "lista, y casi nunca con el nombre exacto. Emparéjalos por significado: si",
    "lo que pide se parece a algo de arriba, ES eso, y le respondes con su",
    "precio y su tiempo de entrega. «Gafas» y «lentes» son lo mismo; «pastel» y",
    "«torta» son lo mismo; «envío» y «domicilio» son lo mismo. Solo dices que no",
    "tienes el dato cuando de verdad no hay nada parecido en la lista.",
  ].join("\n");
}

export function bloqueFaq(faqs: readonly Faq[]): string {
  if (faqs.length === 0) return "";

  const lineas = faqs.map((f) => `- ${f.pregunta} → ${f.respuesta}`);
  return `PREGUNTAS FRECUENTES (responde con esto cuando aplique):\n${lineas.join("\n")}`;
}
