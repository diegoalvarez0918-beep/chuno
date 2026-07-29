import type { Resultado } from "../core/resultado";

/**
 * Interfaz del proveedor de LLM.
 *
 * CHUNO arranca con Gemini en su capa gratuita para que un negocio pueda probarlo
 * sin poner tarjeta. Cambiar de proveedor es cambiar una variable de entorno: el
 * agente no sabe con quién está hablando.
 *
 * Nótese que NO hay método de "herramientas". Es deliberado: en CHUNO el modelo
 * solo lee. Las escrituras nacen de una extracción validada contra esquema, no de
 * una herramienta que el modelo pueda invocar por su cuenta.
 */

export type RolLLM = "usuario" | "modelo";

export interface MensajeLLM {
  readonly rol: RolLLM;
  readonly texto: string;
}

export interface OpcionesTexto {
  readonly sistema: string;
  readonly mensajes: readonly MensajeLLM[];
  readonly maxTokens?: number;
  readonly temperatura?: number;
}

export interface OpcionesJSON<T> {
  readonly sistema: string;
  readonly mensajes: readonly MensajeLLM[];
  /** Esquema en el dialecto que entiende el proveedor. */
  readonly esquema: unknown;
  /** Valida y tipa la respuesta cruda. Si falla, el resultado es un error. */
  readonly validar: (crudo: unknown) => Resultado<T, string>;
  readonly maxTokens?: number;
}

export interface ProveedorLLM {
  readonly nombre: string;
  generarTexto(opciones: OpcionesTexto): Promise<Resultado<string, string>>;
  generarJSON<T>(opciones: OpcionesJSON<T>): Promise<Resultado<T, string>>;
}
