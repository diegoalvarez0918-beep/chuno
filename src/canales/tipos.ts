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
  /**
   * Id del mensaje en su canal de origen. Hoy nadie lo lee: lo transporta para
   * que el descarte de duplicados de D2 no obligue a reabrir este contrato.
   * Meta reintenta durante 36 horas, y un duplicado no es una fila de más —
   * es un mensaje repetido al cliente y una llamada al modelo pagada dos veces.
   */
  readonly idExterno: string | null;
}

export interface Canal {
  readonly id: string;
  /**
   * Traduce el cuerpo del webhook a mensajes normalizados.
   *
   * Devuelve una LISTA porque Meta agrega actualizaciones en lotes de hasta
   * 1000 y su propia documentación dice que el batching no se puede garantizar.
   * Con un solo mensaje de retorno, un lote entrega uno y descarta el resto en
   * silencio. Telegram devuelve vacío o un elemento.
   *
   * Vacío también cuando el evento no nos interesa: una foto, un "usuario se
   * unió", una edición.
   */
  interpretar(cuerpo: unknown): MensajeEntrante[];
  /**
   * Autentica el webhook ANTES de procesar nada — regla 5, y aquí la sostiene
   * el compilador: un canal nuevo no compila sin implementarla.
   *
   * El cuerpo entra como FUNCIÓN, no como cadena. Telegram autentica con una
   * cabecera y nunca lo necesita, así que un POST anónimo se rechaza sin que
   * lleguemos a leerlo; Meta sí lo necesita —su firma se calcula sobre esos
   * bytes exactos— pero solo lo lee después de comprobar que la cabecera tiene
   * forma de firma. "Rechazar lo barato primero" queda dentro de cada canal,
   * que es donde vive ese conocimiento, y no repartido por las rutas.
   *
   * El secreto va por parámetro para que construir el canal solo para enviar no
   * obligue a ir a buscar una credencial de entrada que no se va a usar.
   */
  autenticar(
    peticion: Request,
    leerCuerpo: () => Promise<string>,
    secreto: string,
  ): Promise<boolean>;
  enviar(canalChatId: string, texto: string): Promise<Resultado<void, string>>;
  /**
   * Manda una foto de producto por su URL pública.
   *
   * Recibe una URL y no bytes a propósito: quien la descarga son los servidores
   * de Telegram o de WhatsApp, no el Worker. Subir el archivo obligaría a
   * leerlo de KV y reenviarlo en cada mensaje, pagando el tráfico dos veces por
   * algo que la CDN ya sirve cacheado.
   */
  enviarFoto(
    canalChatId: string,
    urlFoto: string,
    pie: string,
  ): Promise<Resultado<void, string>>;
}
