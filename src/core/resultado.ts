/**
 * Resultado explícito en vez de excepciones.
 *
 * El núcleo no lanza: devuelve. Una transición inválida o una extracción que no
 * pasa validación son casos esperados del dominio, no fallas del programa, y
 * quien llama está obligado por el tipo a decidir qué hace con ellos.
 */
export type Resultado<T, E = string> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(valor: T): Resultado<T, never> {
  return { ok: true, valor };
}

export function fallo<E>(error: E): Resultado<never, E> {
  return { ok: false, error };
}
