import { fallo, type Resultado } from "../../core/resultado";
import type { ModoEnvio } from "../../core/meta/ventana";
import type { Canal } from "../tipos";
import { autenticarMeta, GRAPH_IG, postAlGraph } from "./comun";
import { interpretarMensajeria } from "./mensajeria";

export interface ConfigInstagram {
  readonly token: string;
  readonly igId: string;
  /** Resuelto al construir el canal: quien envía no sabe de ventanas. */
  readonly modo: ModoEnvio;
}

/**
 * El punto de menos certeza de todo D2: la documentación de envío de Instagram
 * no nombra la etiqueta de agente humano, y el modo de etiqueta puede acabar
 * rechazado por Meta. Por eso el rechazo se trata como fallo normal —la
 * propuesta queda pendiente con el motivo— y no revienta nada.
 */
export function crearCanalInstagram(cfg: ConfigInstagram): Canal {
  // Host distinto al de Messenger (graph.instagram.com) y token por cabecera,
  // no por query. Verificado contra la documentación: parecerse no es ser igual.
  const url = `${GRAPH_IG}/${cfg.igId}/messages`;

  const sobre = (canalChatId: string, mensaje: unknown) =>
    cfg.modo.tipo === "etiqueta"
      ? {
          recipient: { id: canalChatId },
          messaging_type: "MESSAGE_TAG",
          tag: "HUMAN_AGENT",
          message: mensaje,
        }
      : { recipient: { id: canalChatId }, message: mensaje };

  const cerrada = (): Resultado<void, string> =>
    fallo("instagram: ventana de 24 h cerrada y sin etiqueta de agente humano");

  return {
    id: "instagram",
    interpretar: (cuerpo) => interpretarMensajeria(cuerpo, "instagram"),
    autenticar: autenticarMeta,

    async enviar(canalChatId, texto) {
      if (cfg.modo.tipo === "cerrada") return cerrada();
      return postAlGraph(url, sobre(canalChatId, { text: texto }), cfg.token, "instagram");
    },

    async enviarFoto(canalChatId, urlFoto, pie) {
      if (cfg.modo.tipo === "cerrada") return cerrada();

      const foto = await postAlGraph(
        url,
        sobre(canalChatId, {
          // Objeto y no lista: es la forma del ejemplo oficial para UNA imagen.
          attachments: { type: "image", payload: { url: urlFoto } },
        }),
        cfg.token,
        "instagram",
      );
      if (!foto.ok) return foto;

      return postAlGraph(url, sobre(canalChatId, { text: pie.slice(0, 1000) }), cfg.token, "instagram");
    },
  };
}
