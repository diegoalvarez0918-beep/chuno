/**
 * Contrato de "giro" (vertical).
 *
 * Un giro no es un producto distinto: es un puñado de instrucciones y un par de
 * interruptores sobre el mismo motor. Agregar floristerías o talleres es agregar
 * un archivo aquí, no tocar el agente. Ese es el LEGO.
 */

export interface ContextoNegocio {
  readonly nombre: string;
  /** YYYY-MM-DD en la zona horaria del negocio. Resuelve "el jueves". */
  readonly hoy: string;
  readonly zonaHoraria: string;
  /** Fragmentos de la base de conocimiento relevantes a la conversación. */
  readonly conocimiento: readonly string[];
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
