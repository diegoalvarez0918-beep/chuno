import { recortarTexto } from "../../core/limites";
import type { MensajeEntrante } from "../tipos";
import { horaDeMeta, lista, type MarcaActividad } from "./comun";

/** Solo la parte del webhook de WhatsApp que leemos. */
interface Contacto {
  profile?: { name?: string };
  wa_id?: string;
}

interface MensajeWA {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string | number;
  text?: { body?: string };
}

interface Valor {
  contacts?: unknown;
  messages?: unknown;
  /**
   * Un lote de estados de NUESTROS mensajes (enviado, entregado, leído). No
   * trae `messages`, así que se descarta solo; se declara para que quede
   * escrito que existe y nadie lo confunda con un entrante.
   */
  statuses?: unknown;
}

function* valores(cuerpo: unknown): Generator<Valor> {
  for (const entrada of lista<{ changes?: unknown }>((cuerpo as { entry?: unknown })?.entry)) {
    for (const cambio of lista<{ value?: Valor }>(entrada?.changes)) {
      if (cambio?.value) yield cambio.value;
    }
  }
}

export function interpretarWhatsApp(cuerpo: unknown): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];

  for (const valor of valores(cuerpo)) {
    // El nombre viene en un array paralelo al de mensajes, indexado por wa_id.
    const nombres = new Map<string, string>();
    for (const contacto of lista<Contacto>(valor.contacts)) {
      const id = contacto?.wa_id;
      const nombre = contacto?.profile?.name;
      if (id && nombre) nombres.set(id, nombre);
    }

    for (const mensaje of lista<MensajeWA>(valor.messages)) {
      const texto = mensaje?.type === "text" ? mensaje?.text?.body?.trim() : undefined;
      const de = mensaje?.from;
      if (!mensaje?.id || !de || !texto) continue;

      salida.push({
        canal: "whatsapp",
        canalChatId: de,
        // Se recorta en el borde, igual que Telegram: lo que se guarda es lo
        // mismo que ve el modelo, y un mensaje enorme no infla ni el costo de
        // la llamada ni el tamaño del hilo para siempre.
        texto: recortarTexto(texto),
        autorNombre: nombres.get(de) ?? null,
        idExterno: mensaje.id,
      });
    }
  }

  return salida;
}

export function marcasWhatsApp(cuerpo: unknown): MarcaActividad[] {
  const salida: MarcaActividad[] = [];

  for (const valor of valores(cuerpo)) {
    for (const mensaje of lista<MensajeWA>(valor.messages)) {
      const de = mensaje?.from;
      const enISO = horaDeMeta(mensaje?.timestamp);
      // Sin filtrar por tipo a propósito: una foto o un audio también reinician
      // la ventana de Meta, aunque no sepamos qué contestar.
      if (de && enISO) salida.push({ canalChatId: de, enISO });
    }
  }

  return salida;
}
