import { describe, expect, it } from "vitest";
import { handshakeIncompleto, resolverHandshake } from "../../src/core/meta/entrada";

const params = (entradas: Record<string, string>) => new URLSearchParams(entradas);

const completo = {
  "hub.mode": "subscribe",
  "hub.challenge": "1158201444",
  "hub.verify_token": "token-del-negocio",
};

describe("resolverHandshake", () => {
  it("devuelve el challenge cuando modo y token coinciden", () => {
    const r = resolverHandshake(params(completo), "token-del-negocio");
    expect(r).toEqual({ ok: true, valor: "1158201444" });
  });

  it("rechaza cuando el verify token no coincide", () => {
    const r = resolverHandshake(params(completo), "otro-token");
    expect(r).toEqual({ ok: false, error: "token_no_coincide" });
  });

  it("rechaza un modo distinto de subscribe", () => {
    const r = resolverHandshake(
      params({ ...completo, "hub.mode": "unsubscribe" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: false, error: "modo_no_soportado" });
  });

  it("rechaza cuando falta un parámetro", () => {
    const r = resolverHandshake(
      params({ "hub.mode": "subscribe", "hub.challenge": "123" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: false, error: "parametros_incompletos" });
  });

  // Meta documenta el challenge como entero, pero devolverlo como número lo
  // normaliza: "0123" saldría 123 y Meta no reconocería su propio valor.
  it("devuelve el challenge tal cual, sin convertirlo a número", () => {
    const r = resolverHandshake(
      params({ ...completo, "hub.challenge": "0123" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: true, valor: "0123" });
  });
});

describe("handshakeIncompleto", () => {
  it("es falso cuando están los tres parámetros", () => {
    expect(handshakeIncompleto(params(completo))).toBe(false);
  });

  it("es verdadero cuando falta el token", () => {
    expect(
      handshakeIncompleto(params({ "hub.mode": "subscribe", "hub.challenge": "1" })),
    ).toBe(true);
  });
});
