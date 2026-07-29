import { describe, expect, it } from "vitest";
import {
  ESTADOS_TERMINALES,
  esTerminal,
  transicionValida,
  transicionar,
  transicionesPosibles,
} from "../../src/core/pedido/estado";
import { ESTADOS_PEDIDO, type EstadoPedido, type Pedido } from "../../src/core/pedido/tipos";

const AYER = "2026-07-27T10:00:00.000Z";
const HOY = "2026-07-28T10:00:00.000Z";

function pedido(estado: EstadoPedido): Pedido {
  return {
    id: "ped_1",
    negocioId: "neg_1",
    conversacionId: "conv_1",
    clienteNombre: "Marta Ruiz",
    items: [{ descripcion: "Montura Ray-Ban + lentes antirreflejo", cantidad: 1 }],
    montoCentavos: 48_000_000,
    fechaComprometida: "2026-07-31",
    estado,
    notas: null,
    creadoEn: AYER,
    actualizadoEn: AYER,
  };
}

describe("máquina de estados del pedido", () => {
  it("recorre el camino feliz completo", () => {
    const camino: EstadoPedido[] = ["confirmado", "en_proceso", "listo", "entregado"];
    let actual = pedido("borrador");

    for (const siguiente of camino) {
      const r = transicionar(actual, siguiente, HOY);
      expect(r.ok, `debería poder pasar a ${siguiente}`).toBe(true);
      if (!r.ok) return;
      actual = r.valor;
    }

    expect(actual.estado).toBe("entregado");
  });

  it("permite cancelar desde cualquier estado no terminal", () => {
    for (const estado of ESTADOS_PEDIDO) {
      if (esTerminal(estado)) continue;
      expect(transicionValida(estado, "cancelado"), `desde ${estado}`).toBe(true);
    }
  });

  it("rechaza saltarse pasos", () => {
    const r = transicionar(pedido("borrador"), "entregado", HOY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("transición inválida");
  });

  it("rechaza retroceder", () => {
    const r = transicionar(pedido("listo"), "en_proceso", HOY);
    expect(r.ok).toBe(false);
  });

  it("no deja mover un pedido en estado terminal", () => {
    for (const terminal of ESTADOS_TERMINALES) {
      expect(transicionesPosibles(terminal)).toEqual([]);
      const r = transicionar(pedido(terminal), "confirmado", HOY);
      expect(r.ok, `desde ${terminal}`).toBe(false);
      if (!r.ok) expect(r.error).toContain("terminal");
    }
  });

  it("rechaza la transición a sí mismo", () => {
    const r = transicionar(pedido("confirmado"), "confirmado", HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya está");
  });

  it("no muta el pedido original y sella la fecha de actualización", () => {
    const original = pedido("borrador");
    const r = transicionar(original, "confirmado", HOY);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(original.estado).toBe("borrador");
    expect(original.actualizadoEn).toBe(AYER);
    expect(r.valor.estado).toBe("confirmado");
    expect(r.valor.actualizadoEn).toBe(HOY);
  });

  it("todo estado alcanzable termina en terminal — no hay callejones sin salida", () => {
    for (const estado of ESTADOS_PEDIDO) {
      if (esTerminal(estado)) continue;
      expect(transicionesPosibles(estado).length, `${estado} sin salidas`).toBeGreaterThan(0);
    }
  });
});
