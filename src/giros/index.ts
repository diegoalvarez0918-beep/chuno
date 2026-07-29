import { giroPorEncargo } from "./por-encargo";
import type { Giro } from "./tipos";

/**
 * Giro genérico: atiende y escala, pero no maneja pedidos. Sirve de red de
 * seguridad para un negocio mal configurado — mejor un asistente limitado que un
 * asistente inventando compromisos.
 */
const giroGenerico: Giro = {
  id: "generico",
  nombre: "Genérico",
  manejaPedidos: false,
  quePedidoEs: () => "Este negocio no maneja pedidos con fecha comprometida.",
  instrucciones: (negocio) =>
    [
      `Atiendes el chat de ${negocio.nombre}.`,
      "Español colombiano, cercano y breve. Tuteas.",
      "Responde solo con la información del negocio que aparece abajo.",
      "Si no la tienes, dilo y escala al dueño. Nunca inventes.",
      "Si te preguntan si eres un bot, lo admites.",
    ].join("\n"),
};

const GIROS: Readonly<Record<string, Giro>> = {
  [giroPorEncargo.id]: giroPorEncargo,
  [giroGenerico.id]: giroGenerico,
};

/** Un giro desconocido cae al genérico: nunca deja al agente sin instrucciones. */
export function obtenerGiro(id: string): Giro {
  return GIROS[id] ?? giroGenerico;
}

export { giroGenerico, giroPorEncargo };
export type { ContextoNegocio, Giro } from "./tipos";
