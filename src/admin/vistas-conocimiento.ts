import type { Faq, ItemCatalogo } from "../core/conocimiento/tipos";
import { esc, pesos } from "./html";

/**
 * CRUD básico de catálogo y FAQ.
 *
 * Sin esto, un precio mal capturado en el onboarding obligaría a repetir la
 * entrevista completa. Dos acciones por fila sin anidar formularios: los
 * inputs usan el atributo `form` de HTML5 contra formularios ocultos.
 *
 * `soloLectura` es lo que hace presentable la demo pública. Sus rutas de
 * escritura no se registran siquiera en el router, así que un botón aquí sería
 * un botón que devuelve 404: cuando no se puede escribir, no se dibujan
 * controles.
 */
export function vistaConocimiento(
  items: readonly ItemCatalogo[],
  faqs: readonly Faq[],
  base: string,
  consulta = "",
  soloLectura = false,
): string {
  const aviso = soloLectura
    ? `<div class="tarjeta vacio" style="padding:16px">
         Esto es lo que el asistente puede responder sin preguntarte.
         En la demo se muestra tal cual lo dejó el onboarding; en tu panel lo editas.
       </div>`
    : "";

  return `${aviso}${seccionCatalogo(items, base, consulta, soloLectura)}${seccionFaq(
    faqs,
    base,
    consulta,
    soloLectura,
  )}${soloLectura ? "" : GUION_FOTOS}`;
}

/** La ruta pública de la foto. La llave ya trae negocio, producto y versión. */
function urlImagen(clave: string): string {
  return `/img/${clave.split("/").slice(1).join("/")}`;
}

function miniatura(i: ItemCatalogo): string {
  if (!i.imagenClave) return `<span class="sin-foto" title="Sin foto">-</span>`;
  return `<img class="miniatura" src="${esc(urlImagen(i.imagenClave))}" alt="${esc(i.nombre)}" loading="lazy">`;
}

/**
 * La celda de foto en modo edición.
 *
 * Un formulario por producto, con el input de archivo escondido detrás de la
 * miniatura: el dueño hace clic en la foto y elige otra. El guion de la página
 * intercepta el cambio, procesa la imagen en el navegador y recién ahí envía.
 */
function celdaFoto(i: ItemCatalogo, accion: string): string {
  const id = esc(i.id);
  return `<form method="post" action="${accion}" enctype="multipart/form-data" class="foto-form" data-item="${id}">
    <input type="hidden" name="id" value="${id}">
    <label class="foto-caja" title="Clic para ${i.imagenClave ? "cambiar" : "subir"} la foto">
      ${miniatura(i)}
      <input type="file" name="archivo" accept="image/*" hidden>
      ${i.imagenClave ? "" : '<span class="foto-mas">+</span>'}
    </label>
    ${i.imagenClave ? `<button class="foto-quitar" name="quitar" value="1" title="Quitar la foto">quitar</button>` : ""}
  </form>`;
}

function seccionCatalogo(
  items: readonly ItemCatalogo[],
  base: string,
  consulta: string,
  soloLectura: boolean,
): string {
  const guardar = `${base}/conocimiento/catalogo/guardar${consulta}`;
  const borrar = `${base}/conocimiento/catalogo/borrar${consulta}`;

  const filas = items
    .map((i) => {
      if (soloLectura) {
        return `<tr>
          <td>${miniatura(i)}</td>
          <td><strong>${esc(i.nombre)}</strong></td>
          <td style="color:var(--suave)">${esc(i.descripcion ?? "-")}</td>
          <td>${esc(pesos(i.precioCentavos))}</td>
          <td>${i.diasEntrega === null ? "-" : esc(String(i.diasEntrega))}</td>
        </tr>`;
      }

      const fg = `cg-${i.id}`;
      const fb = `cb-${i.id}`;
      return `<tr>
        <td>${celdaFoto(i, `${base}/conocimiento/catalogo/imagen${consulta}`)}</td>
        <td><input form="${fg}" name="nombre" value="${esc(i.nombre)}" required maxlength="120"></td>
        <td><input form="${fg}" name="descripcion" value="${esc(i.descripcion ?? "")}" maxlength="300"></td>
        <td><input form="${fg}" name="precio" inputmode="numeric" value="${i.precioCentavos === null ? "" : Math.round(i.precioCentavos / 100)}" placeholder="-"></td>
        <td><input form="${fg}" name="dias" inputmode="numeric" value="${i.diasEntrega ?? ""}" placeholder="-"></td>
        <td class="acciones">
          <button form="${fg}" class="primario">Guardar</button>
          <button form="${fb}">Borrar</button>
        </td>
      </tr>`;
    })
    .join("");

  const formulariosOcultos = soloLectura
    ? ""
    : items
        .map(
          (i) => `<form id="cg-${i.id}" method="post" action="${guardar}"><input type="hidden" name="id" value="${esc(i.id)}"></form>
<form id="cb-${i.id}" method="post" action="${borrar}"><input type="hidden" name="id" value="${esc(i.id)}"></form>`,
        )
        .join("\n");

  const tabla =
    items.length === 0
      ? `<p class="motivo" style="color:var(--suave)">Todavía no hay productos.${soloLectura ? "" : " Agrega el primero abajo, con el precio en pesos."}</p>`
      : `<table>
          <thead><tr><th>Foto</th><th>Producto</th><th>Descripción</th><th>Precio ($)</th><th>Días</th>${soloLectura ? "" : "<th></th>"}</tr></thead>
          <tbody>${filas}</tbody>
        </table>`;

  const alta = soloLectura
    ? ""
    : `<form method="post" action="${guardar}" class="fila-alta">
        <input name="nombre" placeholder="Producto o servicio" required maxlength="120">
        <input name="descripcion" placeholder="Descripción (opcional)" maxlength="300">
        <input name="precio" inputmode="numeric" placeholder="Precio en pesos">
        <input name="dias" inputmode="numeric" placeholder="Días de entrega">
        <button class="primario">Agregar</button>
      </form>`;

  return `<div class="tarjeta">
    <div class="etiqueta">Catálogo y precios: lo que el asistente puede citar sin preguntarte</div>
    ${tabla}
    ${alta}
  </div>
  ${formulariosOcultos}`;
}

function seccionFaq(
  faqs: readonly Faq[],
  base: string,
  consulta: string,
  soloLectura: boolean,
): string {
  const guardar = `${base}/conocimiento/faq/guardar${consulta}`;
  const borrar = `${base}/conocimiento/faq/borrar${consulta}`;

  const filas = faqs
    .map((f) => {
      if (soloLectura) {
        return `<tr>
          <td><strong>${esc(f.pregunta)}</strong></td>
          <td style="color:var(--suave)">${esc(f.respuesta)}</td>
        </tr>`;
      }

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

  const formulariosOcultos = soloLectura
    ? ""
    : faqs
        .map(
          (f) => `<form id="fg-${f.id}" method="post" action="${guardar}"><input type="hidden" name="id" value="${esc(f.id)}"></form>
<form id="fb-${f.id}" method="post" action="${borrar}"><input type="hidden" name="id" value="${esc(f.id)}"></form>`,
        )
        .join("\n");

  const tabla =
    faqs.length === 0
      ? `<p class="motivo" style="color:var(--suave)">Todavía no hay preguntas frecuentes.</p>`
      : `<table>
          <thead><tr><th>Pregunta</th><th>Respuesta</th>${soloLectura ? "" : "<th></th>"}</tr></thead>
          <tbody>${filas}</tbody>
        </table>`;

  const alta = soloLectura
    ? ""
    : `<form method="post" action="${guardar}" class="fila-alta">
        <input name="pregunta" placeholder="¿Qué te preguntan siempre?" required maxlength="300">
        <input name="respuesta" placeholder="Qué respondes" required maxlength="1000">
        <button class="primario">Agregar</button>
      </form>`;

  return `<div class="tarjeta">
    <div class="etiqueta">Preguntas frecuentes: el asistente responde con esto cuando aplique</div>
    ${tabla}
    ${alta}
  </div>
  ${formulariosOcultos}`;
}

/**
 * El procesado de la foto, en el navegador y antes de subirla.
 *
 * Aquí es donde un catálogo pasa de verse disparejo a verse cuidado: todas las
 * fotos salen cuadradas, del mismo tamaño, sobre blanco y comprimidas. Se hace
 * en el navegador y no en el servidor porque procesar imágenes en el borde de
 * Cloudflare es un producto aparte y de pago, y porque así lo que viaja por la
 * red del mostrador son 40 KB en vez de los 4 MB que saca un teléfono.
 *
 * Lo que esto NO hace: recortar el fondo ni corregir la luz. Para eso hace
 * falta Cloudflare Images. Lo que sí deja parejo es encuadre, tamaño y peso.
 */
const GUION_FOTOS = `<script>
(function () {
  var LADO = 600;          // cuadrado, suficiente para verse bien en un chat
  var CALIDAD = 0.82;

  function procesar(archivo) {
    return new Promise(function (listo, falla) {
      var lector = new FileReader();
      lector.onerror = function () { falla(new Error('no se pudo leer')); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { falla(new Error('no es una imagen')); };
        img.onload = function () {
          var lienzo = document.createElement('canvas');
          lienzo.width = LADO; lienzo.height = LADO;
          var ctx = lienzo.getContext('2d');

          // Fondo blanco: un PNG con transparencia sobre el crema del panel se
          // ve sucio, y en un chat cada app pinta el vacío de un color distinto.
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, LADO, LADO);

          // Recorte centrado al cuadrado, sin deformar.
          var lado = Math.min(img.width, img.height);
          var sx = (img.width - lado) / 2;
          var sy = (img.height - lado) / 2;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);

          lienzo.toBlob(function (blob) {
            if (!blob) { falla(new Error('no se pudo comprimir')); return; }
            listo(new File([blob], 'foto.webp', { type: 'image/webp' }));
          }, 'image/webp', CALIDAD);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  document.querySelectorAll('.foto-form').forEach(function (form) {
    var entrada = form.querySelector('input[type=file]');
    var caja = form.querySelector('.foto-caja');
    if (!entrada) return;

    entrada.addEventListener('change', function () {
      var archivo = entrada.files && entrada.files[0];
      if (!archivo) return;

      caja.classList.add('trabajando');

      procesar(archivo).then(function (listo) {
        // Sustituir el archivo del input por el ya procesado: así el POST es
        // un envío de formulario normal y funciona igual sin fetch.
        var dt = new DataTransfer();
        dt.items.add(listo);
        entrada.files = dt.files;
        form.submit();
      }).catch(function () {
        caja.classList.remove('trabajando');
        alert('No pude leer esa imagen. Prueba con un JPG o un PNG.');
        entrada.value = '';
      });
    });
  });
})();
</script>`;
