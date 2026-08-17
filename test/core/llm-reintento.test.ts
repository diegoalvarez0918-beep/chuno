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

  // Cambió de criterio el 2026-08-17 al invertir la lista: comparten host, así
  // que otro modelo no arregla la red, pero un corte transitorio sí se puede
  // recuperar en el segundo intento. Con el presupuesto acotado, intentar sale
  // más barato que la certeza de quedarse mudo.
  it("un fallo de red manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: fallo de red")).toBe(true);
  });

  it("una respuesta vacía manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: respuesta vacía")).toBe(true);
  });

  // El que importa de toda la lista: el error que todavía no hemos visto tiene
  // que caer del lado de degradar, no del lado del silencio. Las tres veces que
  // esto falló en producción, el error era uno que nadie había enumerado.
  it("un error desconocido manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: se cayó el planeta")).toBe(true);
  });

  it("una petición mal armada por nosotros NO manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 400: bad request")).toBe(false);
  });

  // La llave es la misma para todos los modelos de la lista: si no sirve para
  // uno, no sirve para ninguno.
  it("una llave inválida o sin permiso NO manda al siguiente", () => {
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 401")).toBe(false);
    expect(otroModeloPuedeAyudar("gemini/gemini-3.6-flash: HTTP 403")).toBe(false);
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
