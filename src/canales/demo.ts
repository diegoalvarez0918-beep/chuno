import { ok } from "../core/resultado";
import type { Canal, MensajeEntrante } from "./tipos";

/**
 * Canal de la demo pública.
 *
 * No manda nada a ningún lado: el "envío" se ve reflejado en el hilo de la
 * conversación dentro de la propia demo. Existe para que un visitante pueda
 * aprobar un aviso y ver el resultado sin que salga un mensaje real a nadie.
 */
export const canalDemo: Canal = {
  id: "demo",
  interpretar: (): MensajeEntrante | null => null,
  enviar: async () => ok(undefined),
};
