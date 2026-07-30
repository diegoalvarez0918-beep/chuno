import { fallo, ok, type Resultado } from "../resultado";
import type { EstadoPedido, Pedido } from "./tipos";

/**
 * Máquina de estados del pedido.
 *
 * Vive en código y no en el prompt. El modelo puede pedir cualquier transición;
 * si no está en esta tabla, se rechaza. Es la mitad de "el LLM propone, el código
 * dispone" — la otra mitad es la validación de esquema en la frontera.
 */
const TRANSICIONES: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  borrador: ["confirmado", "cancelado"],
  confirmado: ["en_proceso", "cancelado"],
  en_proceso: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

/** Estados desde los que ya no se mueve nada. */
export const ESTADOS_TERMINALES: readonly EstadoPedido[] = ["entregado", "cancelado"];

export function esTerminal(estado: EstadoPedido): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

export function transicionesPosibles(desde: EstadoPedido): readonly EstadoPedido[] {
  return TRANSICIONES[desde];
}

export function transicionValida(desde: EstadoPedido, hacia: EstadoPedido): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/**
 * Aplica una transición. No muta el pedido original: devuelve uno nuevo.
 */
export function transicionar(
  pedido: Pedido,
  hacia: EstadoPedido,
  ahora: string,
): Resultado<Pedido, string> {
  if (pedido.estado === hacia) {
    return fallo(`el pedido ya está en "${hacia}"`);
  }

  if (!transicionValida(pedido.estado, hacia)) {
    const posibles = transicionesPosibles(pedido.estado);
    const desde = esTerminal(pedido.estado)
      ? `"${pedido.estado}" es un estado terminal`
      : `desde "${pedido.estado}" solo se puede pasar a: ${posibles.join(", ")}`;
    return fallo(`transición inválida a "${hacia}": ${desde}`);
  }

  return ok({ ...pedido, estado: hacia, actualizadoEn: ahora });
}
