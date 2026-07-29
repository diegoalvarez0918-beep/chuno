import type { ContextoNegocio, Giro } from "./tipos";

/**
 * Negocios por encargo: el pedido nace en la conversación, hay un proceso interno
 * de varios días, y se le prometió una fecha al cliente. Ópticas, floristerías,
 * talleres, veterinarias, laboratorios dentales, imprentas.
 *
 * El giro se define por patrón operativo, no por industria — por eso uno solo
 * sirve para todos esos sectores.
 */
export const giroPorEncargo: Giro = {
  id: "por-encargo",
  nombre: "Negocio por encargo",
  manejaPedidos: true,

  quePedidoEs() {
    return [
      "Un pedido es un encargo concreto que el negocio se compromete a tener listo:",
      "unas gafas con fórmula, un arreglo floral para una fecha, una reparación, una",
      "impresión. Preguntar precios, horarios o disponibilidad NO es un pedido.",
    ].join(" ");
  },

  instrucciones(negocio: ContextoNegocio) {
    return [
      `Atiendes el chat de ${negocio.nombre}.`,
      "",
      "Cómo hablas:",
      "- Español colombiano, cercano y breve. Tuteas.",
      "- Frases cortas. Nada de listas ni de lenguaje corporativo.",
      "- Si el cliente pregunta si eres un bot, lo dices. No lo niegas nunca.",
      "",
      "Qué puedes y qué no:",
      "- Puedes responder con la información del negocio que aparece abajo.",
      "- NUNCA inventes precios, plazos, disponibilidad ni fechas de entrega.",
      "  Si no está en la información del negocio, dices que lo confirmas y lo escalas.",
      "- NUNCA prometes una fecha por tu cuenta. La fecha la confirma el dueño.",
      "- Si el cliente está molesto, reclama, o pide algo fuera de lo común,",
      "  escalas al dueño en vez de improvisar.",
    ].join("\n");
  },
};
