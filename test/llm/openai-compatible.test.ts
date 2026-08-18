import { describe, expect, it } from "vitest";
import { aMensajesOpenAI, usoDeRespuesta } from "../../src/llm/openai-compatible";

describe("aMensajesOpenAI", () => {
  // Gemini lleva el prompt de sistema en `systemInstruction`; aquí va como un
  // mensaje más, y tiene que ir PRIMERO o el modelo lo lee como si lo hubiera
  // dicho el cliente a media conversación.
  it("pone el sistema de primero y traduce los roles", () => {
    expect(
      aMensajesOpenAI("eres un asistente", [
        { rol: "usuario", texto: "hola" },
        { rol: "modelo", texto: "buenas" },
      ]),
    ).toEqual([
      { role: "system", content: "eres un asistente" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
    ]);
  });

  it("con hilo vacío deja solo el sistema", () => {
    expect(aMensajesOpenAI("instrucciones", [])).toEqual([
      { role: "system", content: "instrucciones" },
    ]);
  });
});

describe("usoDeRespuesta", () => {
  it("lee el consumo del bloque usage", () => {
    expect(
      usoDeRespuesta({ usage: { prompt_tokens: 828, completion_tokens: 72 } }, "gpt-4o-mini", true),
    ).toEqual({ modelo: "gpt-4o-mini", tokensEntrada: 828, tokensSalida: 72, exito: true });
  });

  // Un proveedor compatible puede no mandar `usage`. Que falte no puede tumbar
  // la llamada ni inventar cifras: cero es honesto, `undefined` rompe la suma.
  it("sin bloque usage devuelve ceros, no undefined", () => {
    expect(usoDeRespuesta({}, "modelo-x", false)).toEqual({
      modelo: "modelo-x",
      tokensEntrada: 0,
      tokensSalida: 0,
      exito: false,
    });
  });
});
