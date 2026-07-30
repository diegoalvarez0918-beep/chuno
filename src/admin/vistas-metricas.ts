import type { Pedido } from "../core/pedido/tipos";
import { evaluarPromesa, prioridad, type Riesgo } from "../core/vigia/reglas";
import type { Metricas } from "../db/repos/metricas";
import { esc, pesos } from "./html";

const ROTULO_SALUD = {
  bien: "Todo bien",
  atencion: "Requiere atención",
  critico: "Con problemas",
} as const;

const ROTULO_RIESGO: Record<Riesgo, string> = {
  vencida: "Vencido",
  en_riesgo: "Vence hoy",
  sin_fecha: "Sin fecha",
  ok: "A tiempo",
};

function tarjeta(cifra: string, rotulo: string, alerta = false): string {
  return `<div class="metrica ${alerta ? "alerta" : ""}">
    <div class="cifra">${esc(cifra)}</div>
    <div class="rotulo">${esc(rotulo)}</div>
  </div>`;
}

/**
 * Los pedidos que el dueño tiene que mirar hoy.
 *
 * La pantalla de inicio no puede terminar en las cifras: un número no le dice
 * a nadie qué hacer. Esto pone nombre y fecha debajo de "5 esperando tu
 * decisión", que es lo que convierte el tablero en una lista de trabajo.
 */
function seccionAtencion(pedidos: readonly Pedido[], hoy: string): string {
  const urgentes = pedidos
    .map((pedido) => ({ pedido, ...evaluarPromesa(pedido, hoy) }))
    .filter(({ riesgo }) => riesgo === "vencida" || riesgo === "en_riesgo")
    .sort((a, b) => prioridad(a.riesgo) - prioridad(b.riesgo))
    .slice(0, 5);

  if (urgentes.length === 0) {
    return `<div class="seccion">Necesita tu atención</div>
      <div class="tarjeta vacio">
        <strong>Ninguna promesa en riesgo</strong>
        Todos los pedidos con fecha van a tiempo.
      </div>`;
  }

  const filas = urgentes
    .map(({ pedido, riesgo }) => {
      const que = pedido.items.map((i) => i.descripcion).join(", ");
      return `<div class="riesgo ${riesgo}">
        <div>
          <div class="quien">${esc(pedido.clienteNombre)}</div>
          <div class="que">${esc(que)}</div>
        </div>
        <div class="cuando">
          <span class="chip ${riesgo}">${esc(ROTULO_RIESGO[riesgo])}</span>
          <div class="que">${esc(pedido.fechaComprometida ?? "sin fecha")} · ${esc(pesos(pedido.montoCentavos))}</div>
        </div>
      </div>`;
    })
    .join("");

  return `<div class="seccion">Necesita tu atención</div>
    <div class="atencion">${filas}</div>`;
}

/** La pantalla que el dueño abre en la mañana: cómo va el negocio hoy. */
export function vistaMetricas(
  m: Metricas,
  pedidos: readonly Pedido[] = [],
  hoy = "",
): string {
  const gasto = m.todoGratis ? "Gratis" : pesos(m.gastoMesCentavos);

  return `<div class="seccion">Hoy</div>
  <div class="metricas">
    ${tarjeta(String(m.mensajesHoy), "Mensajes hoy")}
    ${tarjeta(String(m.clientesUnicosHoy), "Clientes hoy")}
    ${tarjeta(String(m.leadsAbiertos), "Leads abiertos")}
    ${tarjeta(String(m.decisionesPendientes), "Esperando tu decisión", m.decisionesPendientes > 0)}
  </div>
  <div class="metricas">
    <div class="metrica">
      <div class="salud"><span class="punto ${m.salud}"></span>${esc(ROTULO_SALUD[m.salud])}</div>
      <div class="rotulo">Salud del asistente</div>
    </div>
    ${tarjeta(gasto, "Gasto de los últimos 30 días")}
  </div>
  ${hoy ? seccionAtencion(pedidos, hoy) : ""}`;
}
