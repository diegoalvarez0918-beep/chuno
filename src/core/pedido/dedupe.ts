import { esTerminal } from "./estado";
import type { EstadoPedido } from "./tipos";

/**
 * ¿El encargo de esta conversación ya está registrado?
 *
 * El agente re-lee el hilo COMPLETO en cada ráfaga: un cliente que escribe
 * "quiero unas gafas", "para el jueves" y "¿cuánto vale?" produce tres
 * extracciones del mismo encargo. Sin esta pregunta, tres pedidos.
 *
 * Son dos caminos y hay que tapar los dos, porque la extracción de alta
 * confianza crea el pedido directo y la de baja confianza deja una propuesta:
 * mirar solo la tabla de pedidos deja pasar el duplicado mientras el dueño no
 * ha decidido, y mirar solo la bandeja lo deja pasar en cuanto decidió.
 *
 * "Vivo" y no "existe" es lo que hace que el cliente pueda volver: una vez el
 * pedido llega a entregado o cancelado, el mismo cliente en la misma
 * conversación puede encargar otra cosa. Eso solo tiene sentido desde que los
 * pedidos avanzan de estado de verdad; mientras nadie los movía, "un pedido por
 * conversación" habría significado "uno para siempre".
 */
export function yaHayEncargoVivo(
  estadosDeLaConversacion: readonly EstadoPedido[],
  hayPropuestaDePedidoPendiente: boolean,
): boolean {
  if (hayPropuestaDePedidoPendiente) return true;

  return estadosDeLaConversacion.some((estado) => !esTerminal(estado));
}
