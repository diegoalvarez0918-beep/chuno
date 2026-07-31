/**
 * Contrato de "giro" (vertical).
 *
 * Un giro no es un producto distinto: es un puñado de instrucciones y un par de
 * interruptores sobre el mismo motor. Agregar floristerías o talleres es agregar
 * un archivo aquí, no tocar el agente. Ese es el LEGO.
 */

import type { Faq, ItemCatalogo } from "../core/conocimiento/tipos";

export interface ContextoNegocio {
  readonly nombre: string;
  /** YYYY-MM-DD en la zona horaria del negocio. Resuelve "el jueves". */
  readonly hoy: string;
  readonly zonaHoraria: string;
  /** Fragmentos de la base de conocimiento relevantes a la conversación. */
  readonly conocimiento: readonly string[];
  /** Ítems del catálogo relevantes (o el catálogo acotado si nada coincide). */
  readonly catalogo: readonly ItemCatalogo[];
  readonly faq: readonly Faq[];
  /** Cómo quiere el dueño que hable el asistente. Sale del onboarding. */
  readonly tono: string | null;
  /** Link de Cal, Calendly o similar. El asistente lo comparte solo si se lo piden. */
  readonly agendaUrl: string | null;
}

export interface Giro {
  readonly id: string;
  readonly nombre: string;
  /** Si es false, el agente no intenta extraer pedidos ni vigilar promesas. */
  readonly manejaPedidos: boolean;
  /** Qué cuenta como pedido en este giro, en palabras del negocio. */
  quePedidoEs(): string;
  /** Instrucciones de tono y alcance que se inyectan al prompt de respuesta. */
  instrucciones(negocio: ContextoNegocio): string;
}
