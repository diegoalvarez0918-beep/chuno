import type { Resultado } from "../core/resultado";

/**
 * Adaptador de canal.
 *
 * Todo lo que entra se normaliza a `MensajeEntrante` y todo lo que sale pasa por
 * `enviar`. El agente no sabe si está hablando por Telegram, por WhatsApp o por
 * la demo — y por eso agregar un canal no lo toca.
 */

export interface MensajeEntrante {
  readonly canal: string;
  /** Id del chat dentro de ese canal. Es lo que identifica al cliente. */
  readonly canalChatId: string;
  readonly texto: string;
  readonly autorNombre: string | null;
}

export interface Canal {
  readonly id: string;
  /**
   * Traduce el cuerpo crudo del webhook a un mensaje normalizado.
   * Devuelve null cuando el evento no es un mensaje de texto que nos interese
   * (una foto, un "usuario se unió", un evento de edición).
   */
  interpretar(cuerpo: unknown): MensajeEntrante | null;
  enviar(canalChatId: string, texto: string): Promise<Resultado<void, string>>;
}
