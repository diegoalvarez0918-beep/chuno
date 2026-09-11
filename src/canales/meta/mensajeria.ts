import { recortarTexto } from "../../core/limites";
import type { MensajeEntrante } from "../tipos";
import { lista, type MarcaActividad } from "./comun";

/**
 * Messenger e Instagram comparten la forma EXACTA del payload — verificado
 * contra la documentación de Meta, no supuesto. Lo único que los distingue es
 * el campo `object` del sobre y a dónde se envía la respuesta, así que
 * comparten intérprete parametrizado por canal en vez de tener dos copias que
 * se desincronizan.
 */
interface Evento {
  sender?: { id?: string };
  /**
   * MILISEGUNDOS Unix aquí, a diferencia de WhatsApp, que manda segundos. Por
   * eso este archivo no usa `horaDeMeta`: confundirlas pondría la marca en 1970
   * o en el año 57000, y la ventana de 24 h quedaría mal sin avisar de nada.
   */
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

function* eventos(cuerpo: unknown): Generator<Evento> {
  for (const entrada of lista<{ messaging?: unknown }>((cuerpo as { entry?: unknown })?.entry)) {
    for (const evento of lista<Evento>(entrada?.messaging)) {
      if (evento) yield evento;
    }
  }
}

function horaDelEvento(evento: Evento): string | null {
  const ms = Number(evento?.timestamp);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/**
 * Un evento del cliente que cuenta para la ventana: ni eco nuestro, ni acuse
 * de entrega o de lectura.
 */
function esDelCliente(evento: Evento): boolean {
  // Sin `message` es una entrega, una lectura o un postback.
  return Boolean(evento?.message) && !evento.message?.is_echo;
}

export function interpretarMensajeria(cuerpo: unknown, canal: string): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];

  for (const evento of eventos(cuerpo)) {
    if (!esDelCliente(evento)) continue;

    const mensaje = evento.message;
    const texto = mensaje?.text?.trim();
    const chatId = evento?.sender?.id;
    if (!chatId || !mensaje?.mid || !texto) continue;

    salida.push({
      canal,
      canalChatId: chatId,
      texto: recortarTexto(texto),
      // El webhook no trae el nombre, solo un id opaco. Traerlo costaría una
      // llamada aparte al Graph; el agente pregunta el nombre como ya sabe.
      autorNombre: null,
      idExterno: mensaje.mid,
    });
  }

  return salida;
}

export function marcasMensajeria(cuerpo: unknown): MarcaActividad[] {
  const salida: MarcaActividad[] = [];

  for (const evento of eventos(cuerpo)) {
    // Sin filtrar por contenido: un adjunto sin texto también reinicia la
    // ventana de Meta, aunque no sepamos qué contestar. El eco sí se filtra,
    // porque ese mensaje es nuestro y no prueba nada del cliente.
    if (!esDelCliente(evento)) continue;

    const chatId = evento?.sender?.id;
    const enISO = horaDelEvento(evento);
    if (chatId && enISO) salida.push({ canalChatId: chatId, enISO });
  }

  return salida;
}
