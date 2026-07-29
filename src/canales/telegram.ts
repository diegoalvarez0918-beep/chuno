import { fallo, ok, type Resultado } from "../core/resultado";
import type { Canal, MensajeEntrante } from "./tipos";

/**
 * Canal de Telegram.
 *
 * Se eligió como primer canal por una razón práctica: un bot de Telegram queda
 * vivo en minutos con un token de BotFather, mientras que WhatsApp exige una app
 * de Meta, verificación y un número de pruebas. El adaptador de WhatsApp implementa
 * esta misma interfaz y entra sin tocar el agente.
 */

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

/** Solo la parte del update de Telegram que nos interesa. */
interface UpdateTelegram {
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { first_name?: string; last_name?: string; is_bot?: boolean };
  };
}

export function crearCanalTelegram(botToken: string): Canal {
  return {
    id: "telegram",

    interpretar(cuerpo: unknown): MensajeEntrante | null {
      const update = cuerpo as UpdateTelegram;
      const mensaje = update?.message;

      const chatId = mensaje?.chat?.id;
      const texto = mensaje?.text?.trim();

      // Sin texto no hay nada que procesar: fotos, stickers y eventos de sistema
      // se ignoran en silencio. Ignorar no es fallar.
      if (typeof chatId !== "number" || !texto) return null;

      // Un bot hablándole a otro bot es un bucle esperando a pasar.
      if (mensaje?.from?.is_bot) return null;

      const nombre = [mensaje?.from?.first_name, mensaje?.from?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        canal: "telegram",
        canalChatId: String(chatId),
        texto,
        autorNombre: nombre || null,
      };
    },

    async enviar(canalChatId: string, texto: string): Promise<Resultado<void, string>> {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

      try {
        const respuesta = await fetch(`${API}/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: canalChatId, text: texto }),
          signal: control.signal,
        });

        if (!respuesta.ok) {
          // Sin cuerpo del error en el mensaje: puede traer datos del chat.
          return fallo(`telegram: HTTP ${respuesta.status}`);
        }

        return ok(undefined);
      } catch (e) {
        const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
        return fallo(`telegram: fallo de ${razon}`);
      } finally {
        clearTimeout(reloj);
      }
    },
  };
}

/**
 * Registra el webhook en Telegram.
 *
 * `secret_token` es la palabra clave que Telegram nos devolverá en la cabecera
 * `X-Telegram-Bot-Api-Secret-Token` de cada llamada. Sin ella, cualquiera que
 * descubra la URL del Worker podría inyectar mensajes falsos.
 */
export async function registrarWebhook(
  botToken: string,
  url: string,
  secreto: string,
): Promise<Resultado<string, string>> {
  try {
    const respuesta = await fetch(`${API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secreto,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    });

    const datos = (await respuesta.json()) as { ok?: boolean; description?: string };

    if (!respuesta.ok || !datos.ok) {
      return fallo(datos.description ?? `HTTP ${respuesta.status}`);
    }

    return ok(datos.description ?? "webhook registrado");
  } catch {
    return fallo("no se pudo contactar a Telegram");
  }
}

/** Compara el secreto que llegó en la cabecera contra el nuestro. */
export function webhookAutentico(peticion: Request, secreto: string): boolean {
  const recibido = peticion.headers.get("x-telegram-bot-api-secret-token");
  return typeof recibido === "string" && recibido === secreto;
}
