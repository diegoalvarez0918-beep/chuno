import { describe, expect, it } from "vitest";
import { TEXTO_MAXIMO } from "../../src/core/limites";
import { interpretarMensajeria, marcasMensajeria } from "../../src/canales/meta/mensajeria";

// Messenger e Instagram comparten la forma EXACTA del payload — verificado
// contra la documentación de Meta. Por eso comparten intérprete.

const MS = 1755000000000;

const eventoDe = (mensaje: Record<string, unknown>, ms = MS) => ({
  entry: [
    {
      messaging: [
        {
          sender: { id: "IGSID-999" },
          recipient: { id: "PAGE-1" },
          timestamp: ms,
          message: mensaje,
        },
      ],
    },
  ],
});

describe("interpretar de Messenger e Instagram", () => {
  it("normaliza un mensaje de texto y sella el canal que le pasan", () => {
    const cuerpo = eventoDe({ mid: "mid.ABC", text: "¿ya está mi pedido?" });

    expect(interpretarMensajeria(cuerpo, "messenger")).toEqual([
      {
        canal: "messenger",
        canalChatId: "IGSID-999",
        texto: "¿ya está mi pedido?",
        // El webhook no trae el nombre: solo un id opaco. Sacarlo cuesta una
        // llamada aparte al Graph, y D2 no la hace.
        autorNombre: null,
        idExterno: "mid.ABC",
      },
    ]);

    expect(interpretarMensajeria(cuerpo, "instagram")[0]?.canal).toBe("instagram");
  });

  // Meta devuelve por webhook lo que nosotros mismos enviamos. Sin este filtro
  // el agente se contesta a sí mismo en bucle y paga el modelo en cada vuelta.
  it("ignora el eco de nuestro propio mensaje", () => {
    const eco = eventoDe({ mid: "mid.ECO", text: "listo, te confirmo", is_echo: true });

    expect(interpretarMensajeria(eco, "instagram")).toEqual([]);
  });

  it("ignora entregas y lecturas, que no traen mensaje", () => {
    const entrega = {
      entry: [{ messaging: [{ sender: { id: "X" }, delivery: { mids: ["mid.A"] } }] }],
    };

    expect(interpretarMensajeria(entrega, "messenger")).toEqual([]);
  });

  it("ignora un adjunto sin texto", () => {
    const foto = eventoDe({ mid: "mid.FOTO", attachments: [{ type: "image" }] });

    expect(interpretarMensajeria(foto, "messenger")).toEqual([]);
  });

  it("saca todos los mensajes de un lote", () => {
    const lote = {
      entry: [
        { messaging: [{ sender: { id: "A" }, timestamp: MS, message: { mid: "m.1", text: "uno" } }] },
        {
          messaging: [
            { sender: { id: "B" }, timestamp: MS, message: { mid: "m.2", text: "dos" } },
            { sender: { id: "C" }, timestamp: MS, message: { mid: "m.3", text: "tres" } },
          ],
        },
      ],
    };

    expect(interpretarMensajeria(lote, "messenger").map((m) => m.idExterno)).toEqual([
      "m.1",
      "m.2",
      "m.3",
    ]);
  });

  it("recorta el texto en el borde", () => {
    const enorme = eventoDe({ mid: "mid.XL", text: "a".repeat(5000) });

    expect(interpretarMensajeria(enorme, "messenger")[0]?.texto).toHaveLength(TEXTO_MAXIMO);
  });

  it("no revienta con basura", () => {
    expect(interpretarMensajeria(null, "messenger")).toEqual([]);
    expect(interpretarMensajeria({ entry: 7 }, "messenger")).toEqual([]);
    expect(interpretarMensajeria({ entry: [{ messaging: "no" }] }, "messenger")).toEqual([]);
  });
});

describe("marcas de actividad de Messenger e Instagram", () => {
  it("marca también el adjunto que interpretar descarta", () => {
    const foto = eventoDe({ mid: "mid.FOTO", attachments: [{ type: "image" }] });

    expect(interpretarMensajeria(foto, "messenger")).toEqual([]);
    expect(marcasMensajeria(foto)).toEqual([
      { canalChatId: "IGSID-999", enISO: new Date(MS).toISOString() },
    ]);
  });

  // La hora aquí viene en MILISEGUNDOS, a diferencia de WhatsApp, que manda
  // segundos. Confundirlas pondría la marca en 1970 o en el año 57000, y en
  // los dos casos la ventana de 24 h quedaría mal calculada sin avisar.
  it("interpreta la hora como milisegundos, no como segundos", () => {
    const marcas = marcasMensajeria(eventoDe({ mid: "m.1", text: "hola" }, 1755000000000));

    expect(marcas[0]?.enISO.startsWith("2025-")).toBe(true);
  });

  it("no marca el eco: ese mensaje es nuestro", () => {
    const eco = eventoDe({ mid: "mid.ECO", text: "hola", is_echo: true });

    expect(marcasMensajeria(eco)).toEqual([]);
  });

  it("no marca una entrega, que no es actividad del cliente", () => {
    const entrega = {
      entry: [{ messaging: [{ sender: { id: "X" }, timestamp: MS, delivery: { mids: ["m.A"] } }] }],
    };

    expect(marcasMensajeria(entrega)).toEqual([]);
  });
});
