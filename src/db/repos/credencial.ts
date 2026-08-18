import { cifrar, descifrar } from "../../core/cifrado";
import { ahoraISO } from "../id";

/**
 * Credenciales por negocio, siempre cifradas.
 *
 * Este repo es el ÚNICO camino hacia la tabla `credenciales`, y no tiene
 * función que devuelva el valor cifrado crudo ni que escriba sin cifrar. El
 * token de un bot jamás pasa por aquí en claro más tiempo que el necesario.
 */

export type ClaveCredencial =
  | "telegram_token"
  | "telegram_webhook_secret"
  // Solo las dos que necesita la puerta. El token de envío y el phone_number_id
  // los pide D2, cuando haya código que los use.
  | "meta_app_secret"
  | "meta_verify_token"
  // La llave del cerebro del negocio. Va cifrada como cualquier otra: es el
  // secreto con el que se le factura a alguien.
  | "llm_api_key";

export async function guardarCredencial(
  db: D1Database,
  negocioId: string,
  clave: ClaveCredencial,
  valorPlano: string,
  claveCifrado: string,
): Promise<void> {
  const valorCifrado = await cifrar(valorPlano, claveCifrado);

  await db
    .prepare(
      `INSERT INTO credenciales (negocio_id, clave, valor_cifrado, actualizado_en)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (negocio_id, clave) DO UPDATE SET
         valor_cifrado = excluded.valor_cifrado,
         actualizado_en = excluded.actualizado_en`,
    )
    .bind(negocioId, clave, valorCifrado, ahoraISO())
    .run();
}

/**
 * null cuando no existe O cuando no descifra (llave rotada, fila corrupta):
 * en ambos casos quien llama la trata como ausente — cae al token global de
 * la instancia o rechaza el webhook.
 */
export async function leerCredencial(
  db: D1Database,
  negocioId: string,
  clave: ClaveCredencial,
  claveCifrado: string,
): Promise<string | null> {
  const fila = await db
    .prepare("SELECT valor_cifrado FROM credenciales WHERE negocio_id = ? AND clave = ?")
    .bind(negocioId, clave)
    .first<{ valor_cifrado: string }>();

  if (!fila) return null;
  return descifrar(fila.valor_cifrado, claveCifrado);
}
