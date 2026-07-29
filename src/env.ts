/** Enlaces y variables del Worker. Los secretos nunca están en el repo. */
export interface Env {
  readonly DB: D1Database;
  readonly AGENTE: DurableObjectNamespace;

  // Secretos (wrangler secret put)
  readonly GEMINI_API_KEY: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_WEBHOOK_SECRET: string;
  readonly PANEL_PASSWORD: string;

  // Vars (wrangler.jsonc)
  readonly NOMBRE_BOT: string;
  readonly LLM_PROVEEDOR: string;
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
