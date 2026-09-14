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

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/**
 * Qué NO cuenta como actividad del cliente, enumerado en negativo a propósito.
 *
 * Enumerar lo que SÍ cuenta deja cada tipo de evento nuevo de Meta del lado del
 * silencio: el reloj se cierra antes que el suyo y pagamos una plantilla que no
 * hacía falta. Es la misma forma de lista que ya falló tres veces con los
 * errores reintentables del LLM, y se arregló invirtiéndola. Enumerando lo que
 * no cuenta, un evento desconocido cae del lado recuperable — intentamos texto
 * libre y, si Meta lo rechaza, la propuesta queda pendiente con su motivo.
 */
const ACUSES_NUESTROS = ["delivery", "read"] as const;

/**
 * ¿Este evento prueba que el cliente dio señales de vida?
 *
 * Un postback (botón tocado) y una reacción SÍ reinician la ventana de 24 h de
 * Meta y NO traen campo `message`, así que exigirlo dejaba el reloj corto.
 */
function esDelCliente(evento: Evento): boolean {
  // Acuses de recibo de NUESTROS envíos: no son actividad de nadie.
  if (ACUSES_NUESTROS.some((campo) => campo in evento)) return false;

  if ("message" in evento) {
    const mensaje: unknown = evento.message;
    // Un `message` que no es objeto es un payload malformado: ni se interpreta
    // ni tiene por qué mover el reloj de la ventana.
    if (!esObjeto(mensaje)) return false;
    // El eco es un mensaje NUESTRO que Meta nos devuelve, no del cliente.
    if (mensaje.is_echo === true) return false;
  }

  return true;
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
