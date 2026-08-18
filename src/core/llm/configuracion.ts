/**
 * De dónde sale la configuración del cerebro de un negocio.
 *
 * La regla es TODO-O-NADA y esa es la decisión importante de este archivo: si
 * el negocio tiene llave propia, toda su configuración sale de sus ajustes; si
 * no, toda sale del entorno. Mezclar campo por campo suena más flexible y
 * produce el peor estado posible —la llave de uno contra el endpoint del
 * otro—, que además se lee como "la llave del cliente no sirve".
 */

export type ProveedorId = "gemini" | "compatible";

/** Verificados contra la capa gratuita: responden y devuelven JSON limpio. */
export const MODELOS_GEMINI = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
] as const;

export interface ConfiguracionLLM {
  readonly proveedor: ProveedorId;
  readonly apiKey: string;
  /** Solo para `compatible`. Gemini trae la suya en el adaptador. */
  readonly baseUrl: string | null;
  readonly modelos: readonly string[];
  readonly topeDiario: number;
}

/**
 * Lo que se leyó de los ajustes del negocio. Cualquier campo puede faltar: son
 * filas sueltas de `settings` y una credencial, no un objeto atómico.
 */
export interface ConfiguracionParcial {
  readonly apiKey: string | null;
  readonly proveedor: string | null;
  readonly baseUrl: string | null;
  readonly modelos: readonly string[];
  readonly topeDiario: number | null;
}

export function resolverConfiguracionLLM(
  delNegocio: ConfiguracionParcial,
  deLaInstalacion: ConfiguracionLLM,
): ConfiguracionLLM {
  // Sin llave no hay con qué llamar, digan lo que digan los demás ajustes.
  if (!delNegocio.apiKey) return deLaInstalacion;

  // Sin proveedor declarado se asume Gemini: es el único que no necesita URL, y
  // es el caso del negocio que solo quiere pagar su propia cuota gratuita.
  const proveedor = delNegocio.proveedor ?? "gemini";

  if (proveedor === "gemini") {
    return {
      proveedor: "gemini",
      apiKey: delNegocio.apiKey,
      baseUrl: null,
      modelos: delNegocio.modelos.length > 0 ? delNegocio.modelos : MODELOS_GEMINI,
      topeDiario: delNegocio.topeDiario ?? deLaInstalacion.topeDiario,
    };
  }

  // Un endpoint compatible sin URL o sin modelos no se puede completar: no hay
  // valor por defecto honesto que inventarle, y tomar el del entorno sería la
  // mezcla que esta regla existe para prohibir. Se descarta entero.
  if (proveedor === "compatible" && delNegocio.baseUrl && delNegocio.modelos.length > 0) {
    return {
      proveedor: "compatible",
      apiKey: delNegocio.apiKey,
      baseUrl: delNegocio.baseUrl,
      modelos: delNegocio.modelos,
      topeDiario: delNegocio.topeDiario ?? deLaInstalacion.topeDiario,
    };
  }

  return deLaInstalacion;
}
