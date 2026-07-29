import type { Faq, ItemCatalogo } from "../core/conocimiento/tipos";
import { esc } from "./html";

/**
 * CRUD básico de catálogo y FAQ.
 *
 * Sin esto, un precio mal capturado en el onboarding obligaría a repetir la
 * entrevista completa. Dos acciones por fila sin anidar formularios: los
 * inputs usan el atributo `form` de HTML5 contra formularios ocultos.
 */
export function vistaConocimiento(
  items: readonly ItemCatalogo[],
  faqs: readonly Faq[],
  base: string,
  consulta = "",
): string {
  return `${seccionCatalogo(items, base, consulta)}${seccionFaq(faqs, base, consulta)}`;
}

function seccionCatalogo(items: readonly ItemCatalogo[], base: string, consulta: string): string {
  const guardar = `${base}/conocimiento/catalogo/guardar${consulta}`;
  const borrar = `${base}/conocimiento/catalogo/borrar${consulta}`;

  const filas = items
    .map((i) => {
      const fg = `cg-${i.id}`;
      const fb = `cb-${i.id}`;
      return `<tr>
        <td><input form="${fg}" name="nombre" value="${esc(i.nombre)}" required maxlength="120"></td>
        <td><input form="${fg}" name="descripcion" value="${esc(i.descripcion ?? "")}" maxlength="300"></td>
        <td><input form="${fg}" name="precio" inputmode="numeric" value="${i.precioCentavos === null ? "" : Math.round(i.precioCentavos / 100)}" placeholder="—"></td>
        <td><input form="${fg}" name="dias" inputmode="numeric" value="${i.diasEntrega ?? ""}" placeholder="—"></td>
        <td class="acciones">
          <button form="${fg}" class="primario">Guardar</button>
          <button form="${fb}">Borrar</button>
        </td>
      </tr>`;
    })
    .join("");

  const formulariosOcultos = items
    .map(
      (i) => `<form id="cg-${i.id}" method="post" action="${guardar}"><input type="hidden" name="id" value="${esc(i.id)}"></form>
<form id="cb-${i.id}" method="post" action="${borrar}"><input type="hidden" name="id" value="${esc(i.id)}"></form>`,
    )
    .join("\n");

  const tabla =
    items.length === 0
      ? `<p class="motivo" style="color:var(--suave)">Todavía no hay productos. Agrega el primero abajo, con el precio en pesos.</p>`
      : `<table>
          <thead><tr><th>Producto</th><th>Descripción</th><th>Precio ($)</th><th>Días</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>`;

  return `<div class="tarjeta">
    <div class="etiqueta">Catálogo y precios — lo que el asistente puede citar sin preguntarte</div>
    ${tabla}
    <form method="post" action="${guardar}" class="fila-alta">
      <input name="nombre" placeholder="Producto o servicio" required maxlength="120">
      <input name="descripcion" placeholder="Descripción (opcional)" maxlength="300">
      <input name="precio" inputmode="numeric" placeholder="Precio en pesos">
      <input name="dias" inputmode="numeric" placeholder="Días de entrega">
      <button class="primario">Agregar</button>
    </form>
  </div>
  ${formulariosOcultos}`;
}

function seccionFaq(faqs: readonly Faq[], base: string, consulta: string): string {
  const guardar = `${base}/conocimiento/faq/guardar${consulta}`;
  const borrar = `${base}/conocimiento/faq/borrar${consulta}`;

  const filas = faqs
    .map((f) => {
      const fg = `fg-${f.id}`;
      const fb = `fb-${f.id}`;
      return `<tr>
        <td><input form="${fg}" name="pregunta" value="${esc(f.pregunta)}" required maxlength="300"></td>
        <td><input form="${fg}" name="respuesta" value="${esc(f.respuesta)}" required maxlength="1000"></td>
        <td class="acciones">
          <button form="${fg}" class="primario">Guardar</button>
          <button form="${fb}">Borrar</button>
        </td>
      </tr>`;
    })
    .join("");

  const formulariosOcultos = faqs
    .map(
      (f) => `<form id="fg-${f.id}" method="post" action="${guardar}"><input type="hidden" name="id" value="${esc(f.id)}"></form>
<form id="fb-${f.id}" method="post" action="${borrar}"><input type="hidden" name="id" value="${esc(f.id)}"></form>`,
    )
    .join("\n");

  const tabla =
    faqs.length === 0
      ? `<p class="motivo" style="color:var(--suave)">Todavía no hay preguntas frecuentes.</p>`
      : `<table>
          <thead><tr><th>Pregunta</th><th>Respuesta</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>`;

  return `<div class="tarjeta">
    <div class="etiqueta">Preguntas frecuentes — el asistente responde con esto cuando aplique</div>
    ${tabla}
    <form method="post" action="${guardar}" class="fila-alta">
      <input name="pregunta" placeholder="¿Qué te preguntan siempre?" required maxlength="300">
      <input name="respuesta" placeholder="Qué respondes" required maxlength="1000">
      <button class="primario">Agregar</button>
    </form>
  </div>
  ${formulariosOcultos}`;
}
