/**
 * Cifrado AES-GCM para credenciales por negocio.
 *
 * Vive en `core` a pesar de sonar a infraestructura porque es puro en el
 * sentido que importa aquí: WebCrypto es un estándar disponible en Workers,
 * Node y vitest, no toca red ni reloj, y así el round-trip se prueba en
 * milisegundos. La llave maestra entra como parámetro — core no lee `env`.
 *
 * Formato del valor guardado: base64(iv de 12 bytes ‖ ciphertext+tag).
 */

async function importarLlave(claveBase64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(claveBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function cifrar(textoPlano: string, claveBase64: string): Promise<string> {
  const llave = await importarLlave(claveBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    llave,
    new TextEncoder().encode(textoPlano),
  );

  const junto = new Uint8Array(iv.length + cifrado.byteLength);
  junto.set(iv);
  junto.set(new Uint8Array(cifrado), iv.length);

  let binario = "";
  for (const byte of junto) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/**
 * null en vez de excepción: un valor que no descifra (llave rotada, fila
 * manipulada, basura) es un caso esperado y quien llama decide qué hacer —
 * normalmente tratarlo como credencial ausente.
 */
export async function descifrar(cifradoBase64: string, claveBase64: string): Promise<string | null> {
  try {
    const junto = Uint8Array.from(atob(cifradoBase64), (c) => c.charCodeAt(0));
    if (junto.length <= 12) return null;

    const llave = await importarLlave(claveBase64);
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: junto.slice(0, 12) },
      llave,
      junto.slice(12),
    );

    return new TextDecoder().decode(claro);
  } catch {
    return null;
  }
}
