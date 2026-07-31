import { fallo, ok, type Resultado } from "../resultado";
import type { Faq } from "./tipos";

/**
 * Convertir lo que el dueño acaba de contestar en conocimiento del negocio.
 *
 * Es el lazo que hace que el asistente moleste cada vez menos: la pregunta que
 * no supo responder ya quedó guardada al escalar, y la respuesta la escribe el
 * dueño en la bandeja. Las dos se cruzan ahí y hasta hoy se perdían.
 *
 * **Por qué esto es una decisión y no un guardado automático.** No toda
 * respuesta es conocimiento. "Sí Marta, tus gafas ya están listas" sirve para
 * Marta y para nadie más; guardarla la manda al prompt y el asistente se la
 * repite a otro cliente. Por eso el dueño marca una casilla, y por eso aquí se
 * rechaza lo que claramente no sirve aunque él la haya marcado.
 */

/** Debajo de esto no es una respuesta reutilizable, es un acuse de recibo. */
const MINIMO_RESPUESTA = 15;
const MINIMO_PREGUNTA = 8;

export interface FaqAprendida {
  readonly pregunta: string;
  readonly respuesta: string;
}

/**
 * ¿Esta pareja merece entrar al conocimiento del negocio?
 *
 * El saludo del principio no viaja: el borrador de la bandeja arranca con
 * "Hola Marta, sobre lo que me preguntaste:" y ese pedazo es de Marta, no del
 * negocio. Guardarlo haría que el asistente salude a todo el mundo por su
 * nombre.
 */
export function comoFaq(pregunta: string, respuesta: string): Resultado<FaqAprendida, string> {
  const p = pregunta.trim();
  const r = sinSaludo(respuesta);

  if (p.length < MINIMO_PREGUNTA) {
    return fallo("la pregunta es demasiado corta para guardarla");
  }

  if (r.length < MINIMO_RESPUESTA) {
    return fallo("la respuesta es demasiado corta para servirle a otro cliente");
  }

  return ok({ pregunta: p.slice(0, 500), respuesta: r.slice(0, 1000) });
}

/**
 * Quita el saludo inicial que trae el borrador.
 *
 * Solo corta cuando queda algo sustancial después: si el dueño escribió una
 * frase entera que casualmente empieza con "hola", vale más conservarla de más
 * que mutilarla.
 */
function sinSaludo(texto: string): string {
  const limpio = texto.trim();
  const corte = limpio.match(/^hola[^,:]*[,:]\s*(?:sobre lo que me preguntaste[,:]?\s*)?/i);

  if (!corte) return limpio;

  const resto = limpio.slice(corte[0].length).trim();
  return resto.length >= MINIMO_RESPUESTA ? resto : limpio;
}

/**
 * ¿El negocio ya sabe esto?
 *
 * Comparación laxa a propósito: sin tildes, sin signos y sin mayúsculas. Dos
 * dueños escriben "¿Hacen domicilios?" y "hacen domicilios" y son la misma
 * pregunta; guardarlas por separado infla el prompt con ruido.
 */
export function yaEstaEnFaq(faqs: readonly Faq[], pregunta: string): Faq | null {
  const buscada = normalizar(pregunta);
  return faqs.find((f) => normalizar(f.pregunta) === buscada) ?? null;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
