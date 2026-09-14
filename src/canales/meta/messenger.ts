import { fallo, type Resultado } from "../../core/resultado";
import type { ModoEnvio } from "../../core/meta/ventana";
import type { Canal } from "../tipos";
import { autenticarMeta, GRAPH, postAlGraph } from "./comun";
import { interpretarMensajeria } from "./mensajeria";

export interface ConfigMessenger {
  readonly token: string;
  readonly pageId: string;
  /** Resuelto al construir el canal: quien envía no sabe de ventanas. */
  readonly modo: ModoEnvio;
}

export function crearCanalMessenger(cfg: ConfigMessenger): Canal {
  // Messenger pasa el token por query, no por cabecera. Verificado contra la
  // documentación; no unificarlo con Instagram "porque son de la misma familia".
  const url = `${GRAPH}/${cfg.pageId}/messages?access_token=${encodeURIComponent(cfg.token)}`;

  const sobre = (canalChatId: string, mensaje: unknown) =>
    cfg.modo.tipo === "etiqueta"
      ? {
          recipient: { id: canalChatId },
          messaging_type: "MESSAGE_TAG",
          // La etiqueta de agente humano da 7 días y está pensada para
          // respuestas escritas por una persona. En CHUNO una persona aprueba
          // cada mensaje, así que no se está forzando la regla: es su caso.
          tag: "HUMAN_AGENT",
          message: mensaje,
        }
      : { recipient: { id: canalChatId }, messaging_type: "RESPONSE", message: mensaje };

  const cerrada = (): Resultado<void, string> =>
    fallo("messenger: ventana de 24 h cerrada y sin etiqueta de agente humano");

  return {
    id: "messenger",
    interpretar: (cuerpo) => interpretarMensajeria(cuerpo, "messenger"),
    autenticar: autenticarMeta,

    async enviar(canalChatId, texto) {
      if (cfg.modo.tipo === "cerrada") return cerrada();
      // El token va en la query: no se repite en la cabecera.
      return postAlGraph(url, sobre(canalChatId, { text: texto }), null, "messenger");
    },

    async enviarFoto(canalChatId, urlFoto, pie) {
      if (cfg.modo.tipo === "cerrada") return cerrada();

      const foto = await postAlGraph(
        url,
        sobre(canalChatId, {
          attachment: { type: "image", payload: { url: urlFoto, is_reusable: true } },
        }),
        null,
        "messenger",
      );
      if (!foto.ok) return foto;

      // El adjunto no lleva pie: Messenger los manda como dos mensajes.
      return postAlGraph(url, sobre(canalChatId, { text: pie.slice(0, 1000) }), null, "messenger");
    },
  };
}
