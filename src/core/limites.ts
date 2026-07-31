/**
 * Los topes que impiden que un solo chat se coma la instalación.
 *
 * Un asistente conectado a un canal público tiene tres formas de arruinarle el
 * día a su dueño, y las tres son baratas de disparar desde afuera:
 *
 * 1. **Quemarle la cuota del modelo.** Es el recurso escaso de verdad: la capa
 *    gratuita de Gemini se agota y el asistente deja de responderle a los
 *    clientes reales. Un tope diario por negocio lo acota.
 * 2. **Inundar una conversación.** Alguien mandando mensajes sin parar.
 * 3. **Mandar un mensaje enorme.** El costo de una llamada crece con el texto
 *    que entra, así que un solo mensaje de cien mil caracteres vale por cientos
 *    de mensajes normales.
 *
 * Todo esto es aritmética pura y por eso vive aquí: se prueba en milisegundos y
 * no depende de Cloudflare ni del reloj del sistema. La hora entra como dato.
 */

/** Cuántos mensajes del historial ve el modelo. Más allá, la plata se va en repetir. */
export const HILO_MAXIMO = 20;

/** Un mensaje de chat de verdad no pasa de aquí. Lo que sobra es ruido o ataque. */
export const TEXTO_MAXIMO = 2000;

/** Llamadas al modelo por negocio y por día. */
export const TOPE_DIARIO = 500;

/** Mensajes que una sola conversación puede procesar en una hora. */
export const TOPE_POR_CONVERSACION = 30;

export const VENTANA_MINUTOS = 60;

/**
 * Recorta lo que entra antes de que llegue al modelo.
 *
 * No se rechaza el mensaje: se recorta. Un cliente real que pegó una fórmula
 * médica larga merece respuesta, y quien está atacando no gana nada por que el
 * texto se corte en 2000 caracteres.
 */
export function recortarTexto(texto: string, maximo = TEXTO_MAXIMO): string {
  const limpio = texto.trim();
  return limpio.length <= maximo ? limpio : limpio.slice(0, maximo);
}

export interface Marca {
  /** Cuántos mensajes van en la ventana actual. */
  readonly cuenta: number;
  /** Cuándo empezó la ventana, en milisegundos epoch. */
  readonly desde: number;
}

export interface Veredicto {
  readonly permitido: boolean;
  readonly marca: Marca;
}

/**
 * Ventana deslizante por conversación, en su forma más simple: se cuenta hasta
 * que la ventana expira y entonces se reinicia.
 *
 * Se eligió esta y no una ventana exacta porque el estado cabe en dos números.
 * Guardar la marca de tiempo de cada mensaje para ser precisos costaría memoria
 * proporcional al ataque, que es exactamente lo que un tope no debe hacer.
 */
export function registrarEnVentana(
  previa: Marca | null,
  ahoraMs: number,
  tope = TOPE_POR_CONVERSACION,
  ventanaMinutos = VENTANA_MINUTOS,
): Veredicto {
  const ventanaMs = ventanaMinutos * 60_000;

  const vigente = previa !== null && ahoraMs - previa.desde < ventanaMs;
  const marca: Marca = vigente
    ? { cuenta: previa.cuenta + 1, desde: previa.desde }
    : { cuenta: 1, desde: ahoraMs };

  return { permitido: marca.cuenta <= tope, marca };
}

/**
 * ¿Le queda cuota al negocio para hoy?
 *
 * El tope se compara contra lo YA gastado, no contra lo que se va a gastar: una
 * pasada del agente hace dos o tres llamadas y contarlas por adelantado sería
 * adivinar. Pasarse por dos llamadas no le hace daño a nadie; quedarse corto
 * por miedo, sí.
 */
export function hayCuotaHoy(usadasHoy: number, tope = TOPE_DIARIO): boolean {
  return usadasHoy < tope;
}
