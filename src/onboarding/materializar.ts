import { registrarWebhook } from "../canales/telegram";
import type { Configuracion } from "../core/onboarding/entrevista";
import { nuevoId } from "../db/id";
import { guardarFaq, guardarItemCatalogo } from "../db/repos/catalogo";
import { guardarCredencial } from "../db/repos/credencial";
import { escribirSetting } from "../db/repos/negocio";
import { auditar, guardarConocimiento } from "../db/repos/varios";
import type { Env } from "../env";

export interface ResultadoMaterializacion {
  readonly bot: "conectado" | "sin_bot" | "fallo_webhook";
  readonly detalle: string | null;
}

/**
 * Convierte la configuración de la entrevista en filas. El negocio ya existe
 * (nació al responder el nombre); aquí se llena: conocimiento, catálogo, FAQ,
 * tono y —si dio token— el bot con su webhook registrado en Telegram.
 */
export async function materializarConfiguracion(
  env: Env,
  origen: string,
  negocioId: string,
  config: Configuracion,
): Promise<ResultadoMaterializacion> {
  const db = env.DB;

  for (const k of config.conocimiento) {
    await guardarConocimiento(db, negocioId, k.titulo, k.contenido);
  }
  for (const item of config.catalogo) {
    await guardarItemCatalogo(db, {
      id: null,
      negocioId,
      nombre: item.nombre,
      descripcion: item.descripcion,
      precioCentavos: item.precioCentavos,
      diasEntrega: item.diasEntrega,
    });
  }
  for (const faq of config.faq) {
    await guardarFaq(db, { id: null, negocioId, pregunta: faq.pregunta, respuesta: faq.respuesta });
  }
  if (config.tono) await escribirSetting(db, negocioId, "tono", config.tono);

  let bot: ResultadoMaterializacion = { bot: "sin_bot", detalle: null };
  if (config.telegramToken) {
    const secreto = nuevoId("whsec");
    await guardarCredencial(db, negocioId, "telegram_token", config.telegramToken, env.CLAVE_CIFRADO);
    await guardarCredencial(db, negocioId, "telegram_webhook_secret", secreto, env.CLAVE_CIFRADO);

    const registro = await registrarWebhook(
      config.telegramToken,
      `${origen}/webhook/telegram/${negocioId}`,
      secreto,
    );
    bot = registro.ok
      ? { bot: "conectado", detalle: null }
      : { bot: "fallo_webhook", detalle: registro.error };
  }

  // Conteos, nunca contenidos: la auditoría dice qué pasó, no con qué llaves.
  await auditar(
    db,
    negocioId,
    "negocio_configurado",
    { catalogo: config.catalogo.length, faq: config.faq.length, bot: bot.bot },
    "admin",
  );

  return bot;
}
