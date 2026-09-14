/**
 * Tipos de `cifrado.mjs`, para que el test cruzado lo importe sin `@ts-ignore`.
 *
 * El CLI es JavaScript a propósito —el paquete publicado no lleva un paso de
 * compilación—, así que sus tipos se declaran aquí en vez de inferirse.
 */

export declare function cifrarValor(textoPlano: string, claveBase64: string): Promise<string>;

export declare function descifrarValor(
  cifradoBase64: string,
  claveBase64: string,
): Promise<string | null>;
