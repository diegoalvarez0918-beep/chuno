import type { Pedido } from "../core/pedido/tipos";
import type { Propuesta } from "../core/propuesta/tipos";
import { transicionesPosibles } from "../core/pedido/estado";
import { evaluarPromesa, prioridad, type Riesgo } from "../core/vigia/reglas";
import type { EntradaAuditoria } from "../db/repos/varios";
import { esc, fechaCorta, pesos } from "./html";

const NOMBRE_RIESGO: Record<Riesgo, string> = {
  vencida: "Vencido",
  en_riesgo: "Vence ya",
  sin_fecha: "Sin fecha",
  ok: "A tiempo",
};

const NOMBRE_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  confirmado: "Confirmado",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

function vacio(titulo: string, detalle: string): string {
  return `<div class="tarjeta vacio"><strong>${esc(titulo)}</strong>${esc(detalle)}</div>`;
}

// ────────────────────────────────────────────────────── bandeja de decisiones ──

/**
 * La bandeja es la pantalla central del producto: el dueño no abre 400 mensajes,
 * abre las decisiones que de verdad necesitan su criterio.
 */
export function vistaBandeja(propuestas: readonly Propuesta[], accionDecidir: string): string {
  if (propuestas.length === 0) {
    return vacio("Todo al día", "Cuando algo necesite tu criterio, aparece aquí.");
  }

  return propuestas.map((p) => tarjetaPropuesta(p, accionDecidir)).join("");
}

function tarjetaPropuesta(propuesta: Propuesta, accionDecidir: string): string {
  const urgente = propuesta.payload.tipo === "enviar_aviso";

  return `<div class="tarjeta ${urgente ? "urgente" : ""}">
    <p class="motivo">${esc(propuesta.motivo)}</p>
    <form method="post" action="${accionDecidir}">
      <input type="hidden" name="id" value="${esc(propuesta.id)}">
      ${cuerpoPropuesta(propuesta)}
      <div class="acciones">
        <button class="primario" name="decision" value="aprobar">${esc(
          etiquetaAprobar(propuesta),
        )}</button>
        <button name="decision" value="rechazar">Descartar</button>
      </div>
    </form>
  </div>`;
}

function etiquetaAprobar(propuesta: Propuesta): string {
  switch (propuesta.payload.tipo) {
    case "enviar_aviso":
      return "Aprobar y enviar";
    case "crear_pedido":
      return "Crear pedido";
    default:
      return "Aprobar";
  }
}

function cuerpoPropuesta(propuesta: Propuesta): string {
  const p = propuesta.payload;

  if (p.tipo === "enviar_aviso") {
    return `<div class="propuesto">
      <div class="etiqueta">Mensaje que se le enviará al cliente. Puedes editarlo</div>
      <textarea name="texto" maxlength="1000">${esc(p.texto)}</textarea>
    </div>`;
  }

  if (p.tipo === "crear_pedido") {
    const que = p.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join(", ");
    return `<div class="propuesto">
      <div class="etiqueta">Pedido detectado en la conversación</div>
      <div><strong>${esc(p.clienteNombre)}</strong>: ${esc(que)}</div>
      <div style="color:var(--suave);font-size:14px;margin-top:4px">Valor: ${esc(
        pesos(p.montoCentavos),
      )}</div>
      <div class="etiqueta" style="margin-top:12px">Fecha comprometida</div>
      <input type="date" name="fecha" value="${esc(p.fechaComprometida ?? "")}"
             style="font:inherit;background:transparent;color:var(--texto);border:1px solid var(--borde);border-radius:6px;padding:6px 8px">
    </div>`;
  }

  return `<div class="propuesto"><div class="etiqueta">Acción</div>${esc(p.tipo)}</div>`;
}

// ───────────────────────────────────────────────────────────────────  pedidos ──

/**
 * Los botones que mueven un pedido por su máquina de estados.
 *
 * Solo se ofrecen los destinos que `transicionesPosibles` acepta: un botón que
 * lleva a un error no es una opción, es una trampa. Es la misma regla del
 * embudo de clientes, y el mismo motivo por el que la lista sale del núcleo y
 * no de una constante escrita a mano en la vista.
 *
 * En la demo se esconde "cancelado": es el único movimiento que deja el tablero
 * peor que antes, y ahí nadie puede devolverlo. La ruta lo rechaza igual.
 */
function botonesPedido(pedido: Pedido, accion: string, esDemo: boolean): string {
  const destinos = transicionesPosibles(pedido.estado).filter(
    (e) => !(esDemo && e === "cancelado"),
  );

  if (destinos.length === 0) return "";

  const botones = destinos
    .map(
      (e) => `<button name="hacia" value="${e}" class="mover">${esc(
        NOMBRE_ESTADO[e] ?? e,
      )}</button>`,
    )
    .join("");

  return `<form method="post" action="${accion}" class="fila-mover">
    <input type="hidden" name="id" value="${esc(pedido.id)}">
    ${botones}
  </form>`;
}

export function vistaPedidos(
  pedidos: readonly Pedido[],
  hoy: string,
  accion: string,
  esDemo: boolean,
): string {
  if (pedidos.length === 0) {
    return vacio("Todavía no hay pedidos", "Aparecerán solos a medida que lleguen por el chat.");
  }

  const conRiesgo = pedidos
    .map((pedido) => ({ pedido, ...evaluarPromesa(pedido, hoy) }))
    .sort((a, b) => prioridad(a.riesgo) - prioridad(b.riesgo));

  const filas = conRiesgo
    .map(
      ({ pedido, riesgo }) => `<tr>
        <td><strong>${esc(pedido.clienteNombre)}</strong><br>
            <span style="color:var(--suave)">${esc(
              pedido.items.map((i) => i.descripcion).join(", "),
            )}</span></td>
        <td>${esc(pedido.fechaComprometida ?? "-")}</td>
        <td>${esc(NOMBRE_ESTADO[pedido.estado] ?? pedido.estado)}
            ${botonesPedido(pedido, accion, esDemo)}</td>
        <td>${esc(pesos(pedido.montoCentavos))}</td>
        <td><span class="chip ${riesgo}">${esc(NOMBRE_RIESGO[riesgo])}</span></td>
      </tr>`,
    )
    .join("");

  return `<div class="tarjeta"><table>
    <thead><tr><th>Cliente</th><th>Para</th><th>Estado</th><th>Valor</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

// ──────────────────────────────────────────────────────────────────  registro ──

/**
 * Auditoría. Es lo que un dueño necesita para soltarle su operación a un
 * asistente: sin registro de qué propuso el agente y qué aprobó él, delegar es
 * un acto de fe.
 */
export function vistaRegistro(entradas: readonly EntradaAuditoria[]): string {
  if (entradas.length === 0) {
    return vacio("Sin actividad todavía", "Aquí queda registro de todo lo que hace el asistente.");
  }

  const legible: Record<string, string> = {
    pedido_creado: "Creó un pedido automáticamente",
    pedido_movido: "El dueño movió un pedido de estado",
    lead_movido: "El dueño movió un cliente en el embudo",
    propuesta_creada: "Dejó una decisión en la bandeja",
    propuesta_aprobada: "El dueño aprobó una decisión",
    propuesta_rechazada: "El dueño descartó una decisión",
    aviso_enviado: "Envió un aviso al cliente",
    escalado_a_humano: "Le pasó una pregunta al dueño",
    vigia_avisos: "El vigía detectó promesas en riesgo",
    extraccion_fallida: "No logró entender un pedido",
    respuesta_fallida: "No pudo responderle al cliente",
    envio_fallido: "No pudo entregar un mensaje al cliente",
    pedido_descartado: "Descartó un pedido sin datos concretos",
    pedido_duplicado_evitado: "Reconoció un encargo que ya estaba registrado",
    negocio_configurado: "Se configuró un asistente nuevo",
    imagen_cargada: "Le cargó la foto a un producto",
  };

  const filas = entradas
    .map(
      (e) => `<div class="registro">
        <time>${esc(fechaCorta(e.creadoEn))}</time>
        <span>${esc(legible[e.accion] ?? e.accion)}</span>
        <span style="margin-left:auto;opacity:.7">${esc(e.actor)}</span>
      </div>`,
    )
    .join("");

  return `<div class="tarjeta">${filas}</div>`;
}
