import { describe, expect, it } from "vitest";
import { clasificarErrorMeta } from "../../cli/meta.mjs";

/**
 * A quién culpa el CLI cuando Meta rechaza un par token+id.
 *
 * Importa acertar porque el mensaje decide a dónde va a mirar quien conecta el
 * canal: decir "el token" cuando el equivocado era el id lo manda a generar un
 * token nuevo que tampoco va a funcionar.
 *
 * Los cuerpos son los que documenta Meta. Los dos de token están además
 * MEDIDOS contra el Graph real el 2026-09-13; los de id no se pueden producir
 * sin un token válido, y por eso se prueban aquí.
 */

const ID = "123456789012345";

describe("clasificarErrorMeta", () => {
  it("código 190 es el token: inválido o expirado", () => {
    const r = clasificarErrorMeta(401, {
      error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 },
    }, ID);

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ culpa: "token" });
  });

  // Medido: la misma petición SIN cabecera da 400, no 401. Por eso la lista va
  // por código y no por status.
  it("código 104 es el token aunque el status sea 400, no 401", () => {
    const r = clasificarErrorMeta(400, {
      error: { message: "An access token is required", type: "OAuthException", code: 104 },
    }, ID);

    expect(r).toMatchObject({ culpa: "token" });
  });

  it("código 803 es el id: el objeto no existe", () => {
    const r = clasificarErrorMeta(400, {
      error: { message: "Some of the aliases you requested do not exist", code: 803 },
    }, ID);

    expect(r).toMatchObject({ culpa: "id" });
  });

  // El caso corriente de un id malo con token bueno, y la razón de que el plan
  // original —que ramificaba por `status === 404`— no habría funcionado nunca:
  // el Graph responde 400, no 404.
  it("código 100 subcódigo 33 es el id, y llega con status 400", () => {
    const r = clasificarErrorMeta(400, {
      error: {
        message: "Unsupported get request. Object with ID '123' does not exist",
        code: 100,
        error_subcode: 33,
      },
    }, ID);

    expect(r).toMatchObject({ culpa: "id" });
    expect(r.ok === false && r.motivo).toContain("no lo alcanza");
  });

  it("un 100 sin subcódigo no se atribuye a ninguno de los dos", () => {
    const r = clasificarErrorMeta(400, {
      error: { message: "Invalid parameter", code: 100 },
    }, ID);

    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("culpa");
    expect(r.ok === false && r.motivo).toContain("No puedo decirte cuál de los dos falló");
  });

  // La forma de lista invertida: un código que Meta invente mañana cae en "no
  // sé" y no en una acusación falsa. Es el error que este proyecto ya tuvo que
  // corregir tres veces con los reintentos del LLM.
  it("un código desconocido cae en 'no sé', no en una acusación", () => {
    const r = clasificarErrorMeta(500, { error: { code: 99999 } }, ID);

    expect(r).not.toHaveProperty("culpa");
  });

  it("un cuerpo sin error tampoco revienta ni acusa", () => {
    const r = clasificarErrorMeta(503, {}, ID);

    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("culpa");
    expect(r.ok === false && r.motivo).toContain("sin código");
  });
});
