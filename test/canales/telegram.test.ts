import { describe, expect, it } from "vitest";
import { crearCanalTelegram } from "../../src/canales/telegram";

// Construir el canal no hace red: el token solo se usa al enviar, y aquí no se
// prueba el envío. Lo único puro de un adaptador es interpretar y autenticar.
const canal = crearCanalTelegram("token-que-no-se-usa");

describe("interpretar de Telegram", () => {
  it("devuelve el mensaje dentro de una lista, con su id externo", () => {
    const r = canal.interpretar({
      message: {
        message_id: 42,
        chat: { id: 999000111 },
        text: "quiero unas gafas para el lunes",
        from: { first_name: "Marta", last_name: "Ruiz", is_bot: false },
      },
    });

    expect(r).toEqual([
      {
        canal: "telegram",
        canalChatId: "999000111",
        texto: "quiero unas gafas para el lunes",
        autorNombre: "Marta Ruiz",
        idExterno: "42",
      },
    ]);
  });

  it("devuelve lista vacía cuando el update no trae texto", () => {
    expect(canal.interpretar({ message: { message_id: 1, chat: { id: 5 } } })).toEqual([]);
  });

  it("devuelve lista vacía cuando quien escribe es otro bot", () => {
    expect(
      canal.interpretar({
        message: { message_id: 1, chat: { id: 5 }, text: "hola", from: { is_bot: true } },
      }),
    ).toEqual([]);
  });

  it("deja idExterno en null si el update no trae message_id", () => {
    const r = canal.interpretar({ message: { chat: { id: 5 }, text: "hola" } });
    expect(r).toHaveLength(1);
    expect(r[0]?.idExterno).toBeNull();
  });
});

describe("autenticar de Telegram", () => {
  const peticion = (secreto: string | null) =>
    new Request("https://ejemplo/webhook", {
      method: "POST",
      headers: secreto ? { "x-telegram-bot-api-secret-token": secreto } : {},
    });

  // Si Telegram llegara a leer el cuerpo, este thunk lo delataría: autentica por
  // cabecera y nunca debe pagar la lectura del cuerpo de un POST anónimo.
  const cuerpoProhibido = async () => {
    throw new Error("no debe leer el cuerpo");
  };

  it("acepta cuando el secreto coincide, sin leer el cuerpo", async () => {
    expect(await canal.autenticar(peticion("s3cr3to"), cuerpoProhibido, "s3cr3to")).toBe(true);
  });

  it("rechaza cuando el secreto no coincide", async () => {
    expect(await canal.autenticar(peticion("otro"), cuerpoProhibido, "s3cr3to")).toBe(false);
  });

  it("rechaza cuando no viene la cabecera", async () => {
    expect(await canal.autenticar(peticion(null), cuerpoProhibido, "s3cr3to")).toBe(false);
  });
});
