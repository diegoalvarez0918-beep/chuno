import { describe, expect, it } from "vitest";
import { yaHayEncargoVivo } from "../../src/core/pedido/dedupe";

describe("yaHayEncargoVivo", () => {
  it("no hay encargo cuando la conversación no tiene pedidos ni propuestas", () => {
    expect(yaHayEncargoVivo([], false)).toBe(false);
  });

  it("una propuesta de pedido sin decidir ya cuenta como encargo", () => {
    // Es el hueco que deja mirar solo la tabla de pedidos: mientras el dueño no
    // aprueba, no hay fila, y la siguiente ráfaga propondría el mismo encargo.
    expect(yaHayEncargoVivo([], true)).toBe(true);
  });

  it("un pedido en curso bloquea el duplicado, en cualquiera de sus estados", () => {
    for (const estado of ["borrador", "confirmado", "en_proceso", "listo"] as const) {
      expect(yaHayEncargoVivo([estado], false)).toBe(true);
    }
  });

  it("un pedido entregado deja encargar otra vez", () => {
    // Un cliente que vuelve tres meses después escribe en la MISMA conversación.
    // Si "ya existe" bastara, no podría encargar nunca más.
    expect(yaHayEncargoVivo(["entregado"], false)).toBe(false);
  });

  it("un pedido cancelado tampoco bloquea", () => {
    expect(yaHayEncargoVivo(["cancelado"], false)).toBe(false);
  });

  it("con historial cerrado y uno vivo, manda el vivo", () => {
    expect(yaHayEncargoVivo(["entregado", "cancelado", "confirmado"], false)).toBe(true);
  });

  it("con todo el historial cerrado, no bloquea", () => {
    expect(yaHayEncargoVivo(["entregado", "cancelado", "entregado"], false)).toBe(false);
  });
});
