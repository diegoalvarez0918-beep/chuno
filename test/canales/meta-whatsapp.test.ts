import { describe, expect, it } from "vitest";
import { TEXTO_MAXIMO } from "../../src/core/limites";
import { interpretarWhatsApp, marcasWhatsApp } from "../../src/canales/meta/whatsapp";

// Payloads con la forma de la documentación de Meta, recortados a lo que leemos.

const CONTACTO = { profile: { name: "Sheena Nelson" }, wa_id: "573001112233" };

const texto = (id: string, body: string, timestamp = "1755000000") => ({
  id,
  from: "573001112233",
  type: "text",
  timestamp,
  text: { body },
});

const valor = (mensajes: unknown[], contactos: unknown[] = [CONTACTO]) => ({
  changes: [{ value: { contacts: contactos, messages: mensajes } }],
});

const sobre = (entradas: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: entradas,
});

describe("interpretar de WhatsApp", () => {
  it("normaliza un mensaje de texto con su nombre y su id externo", () => {
    expect(interpretarWhatsApp(sobre([valor([texto("wamid.AAA", "quiero unas gafas")])]))).toEqual([
      {
        canal: "whatsapp",
        canalChatId: "573001112233",
        texto: "quiero unas gafas",
        autorNombre: "Sheena Nelson",
        idExterno: "wamid.AAA",
      },
    ]);
  });

  // La razón de que el contrato devuelva LISTA: Meta agrega, y con un solo
  // mensaje de retorno el lote entregaría uno y descartaría el resto en silencio.
  it("saca todos los mensajes de un lote repartido en varios entry", () => {
    const lote = sobre([
      valor([texto("wamid.A", "uno")]),
      valor([texto("wamid.B", "dos"), texto("wamid.C", "tres")]),
    ]);

    expect(interpretarWhatsApp(lote).map((m) => m.idExterno)).toEqual([
      "wamid.A",
      "wamid.B",
      "wamid.C",
    ]);
  });

  // Un webhook de `statuses` describe el estado de un mensaje NUESTRO. Tratarlo
  // como entrante haría que el agente se contestara a sí mismo.
  it("ignora un lote de estados de entrega", () => {
    const estados = sobre([
      {
        changes: [
          {
            value: {
              statuses: [{ id: "wamid.AAA", status: "delivered", recipient_id: "573001112233" }],
            },
          },
        ],
      },
    ]);

    expect(interpretarWhatsApp(estados)).toEqual([]);
  });

  it("ignora lo que no es texto", () => {
    const imagen = { id: "wamid.IMG", from: "573001112233", type: "image", timestamp: "1755000000" };

    expect(interpretarWhatsApp(sobre([valor([imagen])]))).toEqual([]);
  });

  it("deja el nombre en null si el payload no trae contactos", () => {
    const sinContacto = sobre([valor([texto("wamid.SC", "hola")], [])]);

    expect(interpretarWhatsApp(sinContacto)).toEqual([
      {
        canal: "whatsapp",
        canalChatId: "573001112233",
        texto: "hola",
        autorNombre: null,
        idExterno: "wamid.SC",
      },
    ]);
  });

  it("recorta el texto en el borde, como Telegram", () => {
    const enorme = sobre([valor([texto("wamid.XL", "a".repeat(5000))])]);

    // Exactamente el tope, no "menor o igual": si recortara a 500 el test
    // pasaría igual y no estaríamos midiendo el recorte sino su existencia.
    expect(interpretarWhatsApp(enorme)[0]?.texto).toHaveLength(TEXTO_MAXIMO);
  });

  it("no revienta con basura", () => {
    expect(interpretarWhatsApp(null)).toEqual([]);
    expect(interpretarWhatsApp({ entry: "no soy una lista" })).toEqual([]);
    expect(interpretarWhatsApp({ entry: [{ changes: 7 }] })).toEqual([]);
  });
});

describe("marcas de actividad de WhatsApp", () => {
  it("marca un mensaje de texto con su hora", () => {
    expect(marcasWhatsApp(sobre([valor([texto("wamid.AAA", "hola")])]))).toEqual([
      { canalChatId: "573001112233", enISO: new Date(1755000000 * 1000).toISOString() },
    ]);
  });

  // Este es el test que evita pagar una plantilla sin necesidad: Meta reinicia
  // su ventana de 24 h con CUALQUIER mensaje del cliente, incluidos los que
  // nosotros descartamos. Si nuestro reloj no los cuenta, se cierra antes que
  // el suyo y mandamos una plantilla de pago pudiendo escribir gratis.
  it("marca también lo que interpretar descarta", () => {
    const imagen = { id: "wamid.IMG", from: "573001112233", type: "image", timestamp: "1755000000" };
    const cuerpo = sobre([valor([imagen])]);

    expect(interpretarWhatsApp(cuerpo)).toEqual([]);
    expect(marcasWhatsApp(cuerpo)).toHaveLength(1);
  });

  it("no marca un lote de estados: ese mensaje es nuestro, no del cliente", () => {
    const estados = sobre([
      { changes: [{ value: { statuses: [{ id: "wamid.A", status: "read" }] } }] },
    ]);

    expect(marcasWhatsApp(estados)).toEqual([]);
  });

  it("ignora un mensaje sin hora legible en vez de inventarla", () => {
    const sinHora = { id: "wamid.NH", from: "573001112233", type: "text", text: { body: "hola" } };

    expect(marcasWhatsApp(sobre([valor([sinHora])]))).toEqual([]);
  });
});
