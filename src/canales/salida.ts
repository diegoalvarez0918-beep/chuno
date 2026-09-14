import { canalDemo } from "./demo";
import { crearCanalTelegram } from "./telegram";
import { crearCanalWhatsApp } from "./meta/whatsapp";
import { crearCanalMessenger } from "./meta/messenger";
import { crearCanalInstagram } from "./meta/instagram";
import type { Canal } from "./tipos";
import { estadoVentana, resolverModo, type ModoEnvio } from "../core/meta/ventana";
import { leerCredencial } from "../db/repos/credencial";
import { leerSetting } from "../db/repos/negocio";
import type { Conversacion } from "../db/repos/conversacion";
import { ahoraISO } from "../db/id";
import type { Env } from "../env";

/**
 * El canal de salida de una conversación.
 *
 * Recibe la conversación entera y no solo su canal, porque la ventana de 24 h
 * de Meta se decide AQUÍ: el canal se construye ya sabiendo en qué modo está.
 * Así la firma de `enviar` no cambia y quien envía —el agente, o el dueño
 * aprobando— no sabe nada de ventanas ni de plantillas.
 *
 * Multi-bot como siempre: si el negocio tiene su propio token (cifrado en D1)
 * se usa ese; en Telegram, si no, el token global de la instancia.
 */
export async function canalSaliente(
  env: Env,
  negocioId: string,
  conversacion: Conversacion,
  ahora: string = ahoraISO(),
): Promise<Canal> {
  const canalId = conversacion.canal;

  if (canalId === "telegram") {
    const propio = await leerCredencial(env.DB, negocioId, "telegram_token", env.CLAVE_CIFRADO);
    return crearCanalTelegram(propio ?? env.TELEGRAM_BOT_TOKEN);
  }

  if (canalId !== "whatsapp" && canalId !== "messenger" && canalId !== "instagram") {
    return canalDemo;
  }

  const modo: ModoEnvio = resolverModo(estadoVentana(conversacion.ultimoClienteEn, ahora), {
    plantilla: canalId === "whatsapp" ? await plantillaDe(env.DB, negocioId) : null,
    etiquetaAgenteHumano: (await leerSetting(env.DB, negocioId, "meta_agente_humano")) === "si",
  });

  // Todo-o-nada, la misma regla del cerebro configurable: token e id van
  // juntos. Uno sin el otro es el peor estado posible — se lee como "el token
  // del cliente no sirve" cuando lo que falta es el id.
  if (canalId === "whatsapp") {
    const token = await leerCredencial(env.DB, negocioId, "whatsapp_token", env.CLAVE_CIFRADO);
    const phoneNumberId = await leerSetting(env.DB, negocioId, "meta_phone_number_id");
    if (!token || !phoneNumberId) return canalDemo;
    return crearCanalWhatsApp({ token, phoneNumberId, modo });
  }

  if (canalId === "messenger") {
    const token = await leerCredencial(env.DB, negocioId, "messenger_page_token", env.CLAVE_CIFRADO);
    const pageId = await leerSetting(env.DB, negocioId, "meta_page_id");
    if (!token || !pageId) return canalDemo;
    return crearCanalMessenger({ token, pageId, modo });
  }

  const token = await leerCredencial(env.DB, negocioId, "instagram_token", env.CLAVE_CIFRADO);
  const igId = await leerSetting(env.DB, negocioId, "meta_ig_id");
  if (!token || !igId) return canalDemo;
  return crearCanalInstagram({ token, igId, modo });
}

/**
 * La plantilla de WhatsApp del negocio, del setting `whatsapp_plantilla_aviso`
 * con formato `nombre:idioma` (por ejemplo `aviso_pedido:es`). Null si falta o
 * está mal formada — y entonces la ventana cerrada degrada a "no se manda",
 * que es honesto, en vez de a un envío que Meta va a rechazar.
 */
async function plantillaDe(
  db: D1Database,
  negocioId: string,
): Promise<{ nombre: string; idioma: string } | null> {
  const crudo = await leerSetting(db, negocioId, "whatsapp_plantilla_aviso");
  if (!crudo) return null;

  const [nombre, idioma] = crudo.split(":");
  if (!nombre?.trim() || !idioma?.trim()) return null;

  return { nombre: nombre.trim(), idioma: idioma.trim() };
}
