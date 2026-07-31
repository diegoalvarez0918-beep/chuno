import { describe, expect, it } from "vitest";
import {
  TEXTO_MAXIMO,
  hayCuotaHoy,
  recortarTexto,
  registrarEnVentana,
  type Marca,
} from "../../src/core/limites";

const AHORA = 1_800_000_000_000;
const MINUTO = 60_000;

describe("recortarTexto", () => {
  it("deja pasar un mensaje normal tal cual", () => {
    expect(recortarTexto("  quiero unas gafas para el jueves  ")).toBe(
      "quiero unas gafas para el jueves",
    );
  });

  it("recorta en vez de rechazar", () => {
    // Un cliente real que pegó una fórmula médica larga merece respuesta.
    const enorme = "a".repeat(TEXTO_MAXIMO + 5000);
    expect(recortarTexto(enorme)).toHaveLength(TEXTO_MAXIMO);
  });

  it("respeta un tope distinto", () => {
    expect(recortarTexto("hola mundo", 4)).toBe("hola");
  });
});

describe("registrarEnVentana", () => {
  it("el primer mensaje abre la ventana y pasa", () => {
    const r = registrarEnVentana(null, AHORA);
    expect(r.permitido).toBe(true);
    expect(r.marca.cuenta).toBe(1);
    expect(r.marca.desde).toBe(AHORA);
  });

  it("cuenta dentro de la misma ventana sin mover su inicio", () => {
    const previa: Marca = { cuenta: 4, desde: AHORA };
    const r = registrarEnVentana(previa, AHORA + 10 * MINUTO);
    expect(r.marca.cuenta).toBe(5);
    expect(r.marca.desde).toBe(AHORA);
  });

  it("bloquea al pasarse del tope", () => {
    const previa: Marca = { cuenta: 3, desde: AHORA };
    expect(registrarEnVentana(previa, AHORA + MINUTO, 3).permitido).toBe(false);
  });

  it("deja pasar justo en el tope, no antes", () => {
    const previa: Marca = { cuenta: 2, desde: AHORA };
    expect(registrarEnVentana(previa, AHORA + MINUTO, 3).permitido).toBe(true);
  });

  it("reinicia cuando la ventana expiró, aunque venga bloqueado", () => {
    // Quien se pasó hace dos horas no queda castigado para siempre.
    const previa: Marca = { cuenta: 999, desde: AHORA };
    const r = registrarEnVentana(previa, AHORA + 61 * MINUTO, 30, 60);
    expect(r.permitido).toBe(true);
    expect(r.marca.cuenta).toBe(1);
    expect(r.marca.desde).toBe(AHORA + 61 * MINUTO);
  });
});

describe("hayCuotaHoy", () => {
  it("hay cuota mientras no se llegue al tope", () => {
    expect(hayCuotaHoy(0, 10)).toBe(true);
    expect(hayCuotaHoy(9, 10)).toBe(true);
  });

  it("se acaba al llegar al tope", () => {
    expect(hayCuotaHoy(10, 10)).toBe(false);
    expect(hayCuotaHoy(11, 10)).toBe(false);
  });
});
