import { canalDemo } from "./demo";
import { crearCanalTelegram } from "./telegram";
import type { Canal } from "./tipos";
import { leerCredencial } from "../db/repos/credencial";
import type { Env } from "../env";

/**
 * El canal de salida de un negocio. Multi-bot: si el negocio tiene su propio
 * token (cifrado en D1) se usa ese; si no, el token global de la instancia.
 * Todo envío al cliente —del agente o de una aprobación— pasa por aquí.
 */
export async function canalSaliente(env: Env, negocioId: string, canalId: string): Promise<Canal> {
  if (canalId !== "telegram") return canalDemo;

  const propio = await leerCredencial(env.DB, negocioId, "telegram_token", env.CLAVE_CIFRADO);
  return crearCanalTelegram(propio ?? env.TELEGRAM_BOT_TOKEN);
}
