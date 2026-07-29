import { describe, expect, it } from "vitest";
import { evaluarSalud } from "../../src/core/metricas/salud";
import { costoCentavos, costoTotalCentavos, esGratis } from "../../src/core/metricas/gasto";

describe("salud del agente", () => {
  it("sin actividad no hay nada que juzgar", () => {
    // Un agente recién instalado no está enfermo: está sin estrenar.
    expect(evaluarSalud({ fallos: 0, total: 0 })).toBe("bien");
  });

  it("todo bien cuando casi nada falla", () => {
    expect(evaluarSalud({ fallos: 1, total: 100 })).toBe("bien");
  });

  it("pide atención a partir del 15% de fallos", () => {
    expect(evaluarSalud({ fallos: 15, total: 100 })).toBe("atencion");
  });

  it("es crítico a partir de la mitad", () => {
    expect(evaluarSalud({ fallos: 50, total: 100 })).toBe("critico");
  });

  it("no se deja engañar por muestras diminutas", () => {
    // Un solo fallo de un solo intento es 100%, pero no es evidencia de nada.
    expect(evaluarSalud({ fallos: 1, total: 1 })).toBe("bien");
    expect(evaluarSalud({ fallos: 3, total: 3 })).toBe("critico");
  });
});

describe("gasto estimado", () => {
  it("los modelos de la capa gratuita no cuestan", () => {
    expect(esGratis("gemini-3.6-flash")).toBe(true);
    expect(
      costoCentavos({ modelo: "gemini-3.6-flash", tokensEntrada: 50000, tokensSalida: 20000 }),
    ).toBe(0);
  });

  it("cobra un modelo pago según sus tarifas", () => {
    // claude-sonnet-5: 300 centavos por millón de entrada, 1500 de salida.
    const costo = costoCentavos({
      modelo: "claude-sonnet-5",
      tokensEntrada: 1_000_000,
      tokensSalida: 1_000_000,
    });
    expect(costo).toBe(1800);
  });

  it("un modelo desconocido se cobra como cero y no rompe", () => {
    // Preferimos subestimar el gasto a mostrarle al dueño un número inventado.
    expect(
      costoCentavos({ modelo: "modelo-que-no-conocemos", tokensEntrada: 9999, tokensSalida: 9999 }),
    ).toBe(0);
  });

  it("suma varios usos redondeando al centavo", () => {
    const total = costoTotalCentavos([
      { modelo: "claude-sonnet-5", tokensEntrada: 500_000, tokensSalida: 0 },
      { modelo: "claude-sonnet-5", tokensEntrada: 500_000, tokensSalida: 0 },
      { modelo: "gemini-3.6-flash", tokensEntrada: 999_999, tokensSalida: 999_999 },
    ]);
    expect(total).toBe(300);
  });

  it("una lista vacía cuesta cero", () => {
    expect(costoTotalCentavos([])).toBe(0);
  });
});
