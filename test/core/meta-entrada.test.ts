import { describe, expect, it } from "vitest";
import {
  firmaConFormaValida,
  firmaValida,
  handshakeIncompleto,
  resolverHandshake,
} from "../../src/core/meta/entrada";

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

/**
 * Vector generado FUERA de este código, con:
 *   printf '%s' '<cuerpo>' | openssl dgst -sha256 -hmac 'secreto-de-prueba' -r
 *
 * Si el valor esperado lo produjera nuestra propia función, el test compararía
 * la implementación consigo misma y no probaría absolutamente nada.
 */
const CUERPO = '{"object":"whatsapp_business_account","entry":[]}';
const SECRETO = "secreto-de-prueba";
const FIRMA = "sha256=7684209d20e98f747cbaa9c37e9dbcf89184b73c4b7be662da88d486fab52681";

describe("firmaValida", () => {
  it("acepta el vector calculado con openssl", async () => {
    expect(await firmaValida(CUERPO, FIRMA, SECRETO)).toBe(true);
  });

  it("rechaza con otro secreto", async () => {
    expect(await firmaValida(CUERPO, FIRMA, "secreto-equivocado")).toBe(false);
  });

  it("rechaza si el cuerpo cambió en un solo byte", async () => {
    expect(await firmaValida(CUERPO.replace("entry", "entrY"), FIRMA, SECRETO)).toBe(false);
  });

  it("rechaza sin cabecera", async () => {
    expect(await firmaValida(CUERPO, null, SECRETO)).toBe(false);
  });

  it("rechaza sin el prefijo sha256=", async () => {
    expect(await firmaValida(CUERPO, FIRMA.slice("sha256=".length), SECRETO)).toBe(false);
  });

  it("rechaza un hex de largo equivocado", async () => {
    expect(await firmaValida(CUERPO, "sha256=abc123", SECRETO)).toBe(false);
  });

  it("rechaza un hex con caracteres que no son hex", async () => {
    expect(await firmaValida(CUERPO, `sha256=${"z".repeat(64)}`, SECRETO)).toBe(false);
  });
});

describe("firmaConFormaValida", () => {
  it("acepta una cabecera bien formada sin verificar el HMAC", () => {
    expect(firmaConFormaValida(FIRMA)).toBe(true);
  });

  it("rechaza null, prefijo ausente y largo equivocado", () => {
    expect(firmaConFormaValida(null)).toBe(false);
    expect(firmaConFormaValida("abc")).toBe(false);
    expect(firmaConFormaValida("sha256=abc")).toBe(false);
  });
});
