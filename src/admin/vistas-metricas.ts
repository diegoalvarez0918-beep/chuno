import type { Metricas } from "../db/repos/metricas";
import { esc, pesos } from "./html";

const ROTULO_SALUD = {
  bien: "Todo bien",
  atencion: "Requiere atención",
  critico: "Con problemas",
} as const;

function tarjeta(cifra: string, rotulo: string, alerta = false): string {
  return `<div class="metrica ${alerta ? "alerta" : ""}">
    <div class="cifra">${esc(cifra)}</div>
    <div class="rotulo">${esc(rotulo)}</div>
  </div>`;
}

/** La pantalla que el dueño abre en la mañana: cómo va el negocio hoy. */
export function vistaMetricas(m: Metricas): string {
  const gasto = m.todoGratis ? "Gratis" : pesos(m.gastoMesCentavos);

  return `<div class="metricas">
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
  </div>`;
}
