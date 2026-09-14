import { describe, expect, it } from "vitest";
import { ecosDelDueno, interpretarWhatsApp } from "../../src/canales/meta/whatsapp";

/**
 * Los mensajes que el dueño escribe desde su propio celular.
 *
 * En modo Coexistencia el número sigue funcionando en la app de WhatsApp
 * Business, y Meta nos avisa de lo que el dueño manda desde ahí con el campo
 * `smb_message_echoes`. Sin escucharlo pasan dos cosas malas: el panel muestra
 * un hilo con huecos —falta justo lo que contestó el dueño— y, peor, el agente
 * no se entera de que ya hubo respuesta humana y contesta encima. El cliente
 * recibe dos respuestas a lo mismo.
 *
 * OJO con la asimetría, que es la trampa de este payload: en un mensaje normal
 * `from` es el CLIENTE; en un eco `from` es el NEGOCIO y el cliente está en
 * `to`. Leerlo igual que un entrante crearía una conversación cuyo "cliente"
 * es el propio número del negocio.
 */

const ECO = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_1",
      changes: [
        {
          field: "smb_message_echoes",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550783881", phone_number_id: "1065403" },
            message_echoes: [
              {
                from: "15550783881",
                to: "573001112233",
                id: "wamid.ECO1",
                timestamp: "1739321024",
                type: "text",
                text: { body: "Claro que sí, se la tengo lista el jueves." },
              },
            ],
          },
        },
      ],
    },
  ],
};

const ENTRANTE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            contacts: [{ wa_id: "573001112233", profile: { name: "Ana" } }],
            messages: [
              {
                from: "573001112233",
                id: "wamid.ENT1",
                timestamp: "1739321000",
                type: "text",
                text: { body: "¿Me la pueden tener el jueves?" },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("ecosDelDueno", () => {
  it("lee lo que el dueño escribió desde su celular", () => {
    const ecos = ecosDelDueno(ECO);

    expect(ecos).toHaveLength(1);
    expect(ecos[0]?.texto).toBe("Claro que sí, se la tengo lista el jueves.");
  });

  /** La trampa del payload: el chat es `to`, no `from`. */
  it("el chat es el CLIENTE, no el número del negocio", () => {
    expect(ecosDelDueno(ECO)[0]?.canalChatId).toBe("573001112233");
  });

  it("trae el id del mensaje para no guardarlo dos veces si Meta reintenta", () => {
    expect(ecosDelDueno(ECO)[0]?.idExterno).toBe("wamid.ECO1");
  });

  it("un lote de entrantes normales no tiene ecos", () => {
    expect(ecosDelDueno(ENTRANTE)).toEqual([]);
  });

  it("basura no revienta", () => {
    expect(ecosDelDueno(null)).toEqual([]);
    expect(ecosDelDueno({ entry: "no soy lista" })).toEqual([]);
    expect(ecosDelDueno({ entry: [{ changes: [{ field: "smb_message_echoes" }] }] })).toEqual([]);
  });

  // Un eco sin texto (una foto que el dueño mandó) no tiene nada que guardar
  // en el hilo, pero SÍ prueba que el dueño está atendiendo. Quien llama lo
  // usa para pausar igual.
  it("un eco sin texto se descarta del hilo", () => {
    const foto = structuredClone(ECO);
    // @ts-expect-error probamos un payload deliberadamente incompleto
    foto.entry[0].changes[0].value.message_echoes[0] = {
      from: "15550783881",
      to: "573001112233",
      id: "wamid.FOTO",
      timestamp: "1739321024",
      type: "image",
    };

    expect(ecosDelDueno(foto)).toEqual([]);
  });
});

describe("el intérprete de entrantes y el de ecos no se pisan", () => {
  /**
   * Lo que de verdad protege al cliente de recibir dos respuestas: si
   * `interpretarWhatsApp` leyera los ecos, el agente trataría el mensaje del
   * DUEÑO como si fuera del cliente y le contestaría a su propio negocio.
   */
  it("interpretarWhatsApp IGNORA los ecos del dueño", () => {
    expect(interpretarWhatsApp(ECO)).toEqual([]);
  });

  it("y sigue leyendo los entrantes normales", () => {
    const mensajes = interpretarWhatsApp(ENTRANTE);

    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]?.canalChatId).toBe("573001112233");
  });
});
