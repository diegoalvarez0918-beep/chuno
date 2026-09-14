/**
 * Cifrado AES-GCM para el CLI, en el formato exacto de `src/core/cifrado.ts`.
 *
 * Es una segunda escritura del mismo algoritmo y eso es deuda a la vista: el
 * CLI corre en Node y no puede importar el TypeScript del Worker sin arrastrar
 * un paso de compilación al paquete publicado, que hoy es un solo archivo sin
 * dependencias.
 *
 * La duplicación NO se sostiene con este comentario: la sostiene
 * `test/cli/cifrado-cruzado.test.ts`, que cifra con este módulo y descifra con
 * el del núcleo, y al revés. Si los formatos divergen, ese test cae.
 *
 * Formato, idéntico al del núcleo: base64(iv de 12 bytes ‖ ciphertext+tag).
 */

import { webcrypto } from "node:crypto";

/**
 * `webcrypto` explícito y no el `crypto` global: el paquete declara Node >=18 y
 * ahí el global todavía va detrás de una bandera experimental.
 */
async function importarLlave(claveBase64) {
  const bytes = Buffer.from(claveBase64, "base64");
  return webcrypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifrarValor(textoPlano, claveBase64) {
  const llave = await importarLlave(claveBase64);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const cifrado = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    llave,
    new TextEncoder().encode(textoPlano),
  );

  const junto = new Uint8Array(iv.length + cifrado.byteLength);
  junto.set(iv);
  junto.set(new Uint8Array(cifrado), iv.length);

  return Buffer.from(junto).toString("base64");
}

/**
 * null cuando no descifra, igual que el núcleo: llave rotada, valor manipulado
 * o basura. Quien llama lo trata como credencial ausente, nunca como excepción.
 */
export async function descifrarValor(cifradoBase64, claveBase64) {
  try {
    const junto = Buffer.from(cifradoBase64, "base64");
    if (junto.length <= 12) return null;

    const llave = await importarLlave(claveBase64);
    const claro = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: junto.subarray(0, 12) },
      llave,
      junto.subarray(12),
    );

    return new TextDecoder().decode(claro);
  } catch {
    return null;
  }
}
