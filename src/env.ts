/** Enlaces y variables del Worker. Los secretos nunca están en el repo. */
export interface Env {
  readonly DB: D1Database;
  readonly AGENTE: DurableObjectNamespace;

  // Secretos (wrangler secret put)
  readonly GEMINI_API_KEY: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_WEBHOOK_SECRET: string;
  readonly PANEL_PASSWORD: string;
  /** Llave maestra AES-GCM (base64, 32 bytes) para credenciales por negocio en D1. */
  readonly CLAVE_CIFRADO: string;

  // Vars (wrangler.jsonc)
  readonly NOMBRE_BOT: string;
  readonly LLM_PROVEEDOR: string;
  /**
   * Modelos separados por coma, en orden de preferencia. Es una variable y no
   * una constante del código para poder cambiar de modelo sin desplegar: Google
   * jubila modelos sin aviso y la cuota gratuita se agota por modelo.
   */
  readonly MODELOS_LLM: string;
  readonly BUFFER_SEGUNDOS: string;
  readonly RETENCION_DIAS: string;
  /** Negocio sembrado que se muestra en /demo, abierto al público. */
  readonly NEGOCIO_DEMO: string;
  /** Negocio real que atiende el bot de Telegram y se ve en /panel. */
  readonly NEGOCIO_TELEGRAM: string;
}

/** Lee una var numérica con valor por defecto: las vars llegan como texto. */
export function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/** La lista de modelos configurada. Vacía significa "usa los del código". */
export function modelos(env: Env): string[] {
  return (env.MODELOS_LLM ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}
