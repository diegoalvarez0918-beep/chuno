import { ESTADOS_LEAD, type Contacto, type EstadoLead, type Lead } from "../core/crm/tipos";
import { transicionLeadValida } from "../core/crm/embudo";
import { esc, fechaCorta, pesos } from "./html";

const ROTULO_LEAD: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  cliente: "Cliente",
  perdido: "Perdido",
};

/**
 * Qué significa cada columna para el dueño.
 *
 * Un tablero con cinco columnas rotuladas "Nuevo / Contactado / Interesado" se
 * lee como cualquier CRM y no dice qué hacer en cada una. La línea de abajo sí.
 */
const AYUDA_LEAD: Record<EstadoLead, string> = {
  nuevo: "Escribió y mostró interés. Nadie le ha respondido todavía.",
  contactado: "Ya hubo ida y vuelta. Falta saber si compra.",
  interesado: "Dijo que sí quiere. Falta cerrar.",
  cliente: "Compró.",
  perdido: "No cerró. Si vuelve a escribir, se reactiva.",
};

/** Las iniciales, como en cualquier CRM: identifican sin ocupar una foto. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function tarjetaLead(
  lead: Lead,
  contacto: Contacto | undefined,
  accion: string,
  soloLectura: boolean,
): string {
  const nombre = contacto?.nombre ?? "Cliente";

  // Solo se ofrecen las transiciones que el núcleo acepta. Un botón que lleva a
  // un error no es una opción: es una trampa. Y en la demo no se ofrece ninguna:
  // su ruta de mover ni siquiera está registrada.
  const destinos = soloLectura
    ? []
    : ESTADOS_LEAD.filter((e) => transicionLeadValida(lead.estado, e));

  const mover = destinos
    .map(
      (e) => `<button name="hacia" value="${e}" class="mover" title="Mover a ${esc(
        ROTULO_LEAD[e],
      )}">${esc(ROTULO_LEAD[e])}</button>`,
    )
    .join("");

  return `<article class="trato" ${soloLectura ? "" : 'draggable="true"'} data-lead="${esc(
    lead.id,
  )}" data-estado="${esc(lead.estado)}">
    <div class="trato-cab">
      <span class="avatar">${esc(iniciales(nombre))}</span>
      <strong>${esc(nombre)}</strong>
    </div>
    ${lead.interes ? `<p class="trato-interes">${esc(lead.interes)}</p>` : ""}
    <div class="trato-pie">
      <span class="valor">${esc(pesos(lead.valorEstimadoCentavos))}</span>
      ${contacto ? `<span class="canal">${esc(contacto.canal)}</span>` : ""}
    </div>
    ${
      mover === ""
        ? ""
        : `<form method="post" action="${accion}" class="trato-mover">
             <input type="hidden" name="id" value="${esc(lead.id)}">
             ${mover}
           </form>`
    }
  </article>`;
}

function columna(
  estado: EstadoLead,
  leads: readonly Lead[],
  porId: Map<string, Contacto>,
  accion: string,
  soloLectura: boolean,
): string {
  const total = leads.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0);
  const plural = leads.length === 1 ? "oportunidad" : "oportunidades";

  const tarjetas =
    leads.length === 0
      ? `<div class="columna-vacia">Nada aquí</div>`
      : leads.map((l) => tarjetaLead(l, porId.get(l.contactoId), accion, soloLectura)).join("");

  return `<section class="columna ${estado}" data-estado="${estado}">
    <header class="columna-cab">
      <h3>${esc(ROTULO_LEAD[estado])}</h3>
      <p class="columna-cifras">${esc(pesos(total))} · ${leads.length} ${plural}</p>
      <p class="columna-ayuda">${esc(AYUDA_LEAD[estado])}</p>
    </header>
    <div class="columna-cuerpo">${tarjetas}</div>
  </section>`;
}

/**
 * El CRM que nadie llena a mano, ahora como tablero.
 *
 * Cada tarjeta salió de una conversación real: nadie abrió un formulario para
 * crearla. Ese sigue siendo el punto de la pantalla — lo nuevo es que el embudo
 * se puede mover, que hasta ahora era código probado que nadie llamaba.
 */
export function vistaClientes(
  contactos: readonly Contacto[],
  leads: readonly Lead[],
  accionMover: string,
  soloLectura = false,
): string {
  if (contactos.length === 0) {
    return `<div class="tarjeta vacio">
      <strong>Todavía no hay clientes</strong>
      Se van creando solos con cada conversación que entra.
    </div>`;
  }

  const porId = new Map(contactos.map((c) => [c.id, c]));
  const accion = soloLectura ? "" : accionMover;

  const tablero = ESTADOS_LEAD.map((e) =>
    columna(
      e,
      leads.filter((l) => l.estado === e),
      porId,
      accion,
      soloLectura,
    ),
  ).join("");

  // Un contacto sin lead no es una oportunidad: preguntó algo y se fue. Va
  // aparte para que no infle el embudo con humo.
  const conLead = new Set(leads.map((l) => l.contactoId));
  const sueltos = contactos.filter((c) => !conLead.has(c.id));

  const cola =
    sueltos.length === 0
      ? ""
      : `<div class="seccion">Contactos sin oportunidad</div>
         <div class="tarjeta"><table>
           <thead><tr><th>Cliente</th><th>Canal</th><th>Msjs</th><th>Último contacto</th></tr></thead>
           <tbody>${sueltos
             .map(
               (c) => `<tr>
                 <td><strong>${esc(c.nombre)}</strong></td>
                 <td>${esc(c.canal)}</td>
                 <td>${esc(String(c.totalMensajes))}</td>
                 <td>${esc(fechaCorta(c.ultimaInteraccion))}</td>
               </tr>`,
             )
             .join("")}</tbody>
         </table></div>`;

  // El arrastre es una mejora, no el mecanismo: los botones de cada tarjeta
  // hacen lo mismo con un POST normal. Sin JS el tablero sigue siendo usable, y
  // esto se abre desde un teléfono en un mostrador.
  const arrastre = soloLectura
    ? ""
    : `<script>
(function () {
  var llevando = null;
  document.querySelectorAll('.trato').forEach(function (t) {
    t.addEventListener('dragstart', function (e) {
      llevando = t; t.classList.add('llevando');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    t.addEventListener('dragend', function () { t.classList.remove('llevando'); llevando = null; });
  });

  document.querySelectorAll('.columna').forEach(function (col) {
    col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('encima'); });
    col.addEventListener('dragleave', function () { col.classList.remove('encima'); });
    col.addEventListener('drop', function (e) {
      e.preventDefault(); col.classList.remove('encima');
      if (!llevando) return;

      var hacia = col.getAttribute('data-estado');
      if (hacia === llevando.getAttribute('data-estado')) return;

      var cuerpo = new URLSearchParams();
      cuerpo.set('id', llevando.getAttribute('data-lead'));
      cuerpo.set('hacia', hacia);

      fetch(${JSON.stringify(accion)}, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: cuerpo.toString(),
      }).then(function () { location.reload(); });
    });
  });
})();
</script>`;

  return `<div class="embudo">${tablero}</div>${cola}${arrastre}`;
}
