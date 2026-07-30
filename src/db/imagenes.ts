import type { Env } from "../env";

/**
 * El almacén de fotos del catálogo.
 *
 * La base guarda una llave; los bytes viven aquí. Se separó así porque el
 * agente consulta el catálogo en cada mensaje para poder citar precios, y si
 * la foto viviera en la misma fila se traería los bytes en cada consulta sin
 * usarlos nunca. Eso se paga en latencia justo mientras un cliente espera
 * respuesta.
 *
 * Detrás hay KV, pero este módulo es la única parte del código que lo sabe.
 * Cambiarlo por R2 el día que haya tarjeta es reescribir estas tres funciones.
 */

/** Tope por foto. El navegador ya la deja muy por debajo; esto atrapa el caso raro. */
export const MAXIMO_BYTES = 400 * 1024;

export const TIPOS_ACEPTADOS = ["image/webp", "image/jpeg", "image/png"] as const;

export function tipoAceptado(tipo: string): boolean {
  return (TIPOS_ACEPTADOS as readonly string[]).includes(tipo);
}

/**
 * La llave lleva el negocio adentro.
 *
 * No es cosmético: es el aislamiento multi-tenant de la regla 1 aplicado a un
 * almacén que no tiene WHERE. Sin el prefijo, adivinar el id de un producto de
 * otro negocio bastaría para leerle la foto.
 */
export function claveImagen(negocioId: string, itemId: string, version: number): string {
  return `cat/${negocioId}/${itemId}/${version}`;
}

/** Un negocio solo puede tocar llaves que empiecen por su propio prefijo. */
export function claveEsDelNegocio(clave: string, negocioId: string): boolean {
  return clave.startsWith(`cat/${negocioId}/`);
}

export async function guardarImagen(
  env: Env,
  clave: string,
  bytes: ArrayBuffer,
  tipo: string,
): Promise<void> {
  await env.IMAGENES.put(clave, bytes, { metadata: { tipo } });
}

export interface ImagenGuardada {
  readonly bytes: ArrayBuffer;
  readonly tipo: string;
}

export async function leerImagen(env: Env, clave: string): Promise<ImagenGuardada | null> {
  const r = await env.IMAGENES.getWithMetadata<{ tipo?: string }>(clave, "arrayBuffer");
  if (!r.value) return null;

  return { bytes: r.value, tipo: r.metadata?.tipo ?? "image/webp" };
}

export async function borrarImagen(env: Env, clave: string): Promise<void> {
  await env.IMAGENES.delete(clave);
}
