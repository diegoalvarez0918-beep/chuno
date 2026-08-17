import { describe, expect, it } from "vitest";
import { msParaElSiguienteIntento, otroModeloPuedeAyudar } from "../../src/core/llm/reintento";

/**
 * La cadena es la que dejó `auditoria` de `mi-optica` el 2026-08-17 a las
 * 14:08:46 UTC, copiada tal cual. El bot se quedó mudo con dos modelos de
 * respaldo sanos sin intentar, porque el timeout no estaba en la lista.
 */
const TIMEOUT_REAL = "gemini/gemini-3.6-flash: fallo de timeout";

describe("otroModeloPuedeAyudar", () => {
  it("un timeout manda al siguiente modelo", () => {
    expect(otroModeloPuedeAyudar(TIMEOUT_REAL)).toBe(true);
  });

  it("un modelo jubilado manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-2.5-flash: HTTP 404")).toBe(true);
  });

  it("la cuota agotada manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 429")).toBe(true);
  });

  it("la saturación manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 503")).toBe(true);
  });

  // Los tres modelos viven en el mismo host: si la red falló, cambiar de modelo
  // no la arregla y solo gasta el tiempo que el cliente está esperando.
  it("un fallo de red NO manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: fallo de red")).toBe(false);
  });

  it("un error nuestro NO manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 400")).toBe(false);
  });
});

describe("msParaElSiguienteIntento", () => {
  it("el primer intento usa el tope por intento, no todo el presupuesto", () => {
    expect(msParaElSiguienteIntento(30_000)).toBe(20_000);
  });

  it("cuando queda menos que el tope, el intento se acorta", () => {
    expect(msParaElSiguienteIntento(8_000)).toBe(8_000);
  });

  // Un intento de un segundo no alcanza para que el modelo conteste: sale
  // timeout igual y encima retrasa el mensaje de respaldo al cliente.
  it("sin tiempo útil devuelve null en vez de un intento condenado", () => {
    expect(msParaElSiguienteIntento(1_000)).toBeNull();
  });
});
