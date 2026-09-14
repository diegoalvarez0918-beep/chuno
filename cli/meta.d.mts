/**
 * Tipos de `meta.mjs`, para que los tests lo importen sin `@ts-ignore`.
 *
 * El CLI es JavaScript a propósito —el paquete publicado no lleva un paso de
 * compilación—, así que sus tipos se declaran aquí en vez de inferirse.
 */

export interface ProductoMeta {
  readonly credencial: string;
  readonly ajusteId: string;
  readonly graph: string;
  readonly comoSeLlamaElId: string;
}

export declare const PRODUCTOS_META: Record<"whatsapp" | "messenger" | "instagram", ProductoMeta>;

export type ResultadoMeta =
  | { ok: true }
  | { ok: false; culpa?: "token" | "id"; motivo: string };

export declare function clasificarErrorMeta(
  status: number,
  cuerpo: unknown,
  id: string,
): ResultadoMeta;

export declare function sqlGuardarCredencial(
  negocioId: string,
  clave: string,
  cifrado: string,
  ahora: string,
): string;

export declare function sqlGuardarMeta(
  negocioId: string,
  cfg: ProductoMeta,
  cifrado: string,
  id: string,
  ahora: string,
): string;

export declare function sqlGuardarAjuste(
  negocioId: string,
  clave: string,
  valor: string,
): string;

export declare function urlWebhookMeta(urlPublica: string, negocioId: string): string;

export declare function validarAppMeta(
  appId: string,
  appSecret: string,
): Promise<ResultadoMeta>;

export declare function comprobarHandshake(
  urlPublica: string,
  negocioId: string,
  verifyToken: string,
): Promise<ResultadoMeta>;

export declare function validarMeta(
  producto: "whatsapp" | "messenger" | "instagram",
  token: string,
  id: string,
): Promise<ResultadoMeta>;
