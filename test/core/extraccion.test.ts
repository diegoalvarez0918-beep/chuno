import { describe, expect, it } from "vitest";
import {
  ExtraccionPedidoSchema,
  UMBRAL_CONFIANZA,
  requiereAprobacion,
  type ExtraccionPedido,
} from "../../src/core/pedido/extraccion";

/** Una extracción limpia: alta confianza, sin ambigüedades, todo completo. */
function extraccionLimpia(sobre: Partial<ExtraccionPedido> = {}): ExtraccionPedido {
  return ExtraccionPedidoSchema.parse({
    hayPedido: true,
    clienteNombre: "Marta Ruiz",
    items: [{ descripcion: "Montura + lentes antirreflejo", cantidad: 1 }],
    montoCentavos: 48_000_000,
    fechaComprometida: "2026-07-31",
    notas: null,
    confianza: 0.95,
    ambiguedades: [],
    ...sobre,
  });
}

describe("la frontera de seguridad del esquema de extracción", () => {
  it("descarta silenciosamente los campos que el modelo no tiene permitido tocar", () => {
    // Aunque el modelo devuelva esto, no llega a la base de datos: los campos no
    // existen en el contrato. No depende de que el prompt se porte bien.
    const salidaHostil = {
      hayPedido: true,
      clienteNombre: "Marta Ruiz",
      items: [{ descripcion: "Montura", cantidad: 1 }],
      confianza: 0.9,
      fechaComprometida: "2026-07-31",
      // Inyectado:
      id: "ped_robado",
      negocioId: "otro-negocio",
      estado: "entregado",
      creadoEn: "2020-01-01",
    };

    const r = ExtraccionPedidoSchema.parse(salidaHostil);

    expect(r).not.toHaveProperty("id");
    expect(r).not.toHaveProperty("negocioId");
    expect(r).not.toHaveProperty("estado");
    expect(r).not.toHaveProperty("creadoEn");
  });

  it("rechaza fechas que no son YYYY-MM-DD", () => {
    for (const fecha of ["el jueves", "31/07/2026", "2026-7-31", ""]) {
      const r = ExtraccionPedidoSchema.safeParse({
        hayPedido: true,
        confianza: 0.9,
        fechaComprometida: fecha,
      });
      expect(r.success, `debería rechazar "${fecha}"`).toBe(false);
    }
  });

  it("rechaza montos absurdos y negativos", () => {
    for (const monto of [-1, 9_999_999_999]) {
      const r = ExtraccionPedidoSchema.safeParse({
        hayPedido: true,
        confianza: 0.9,
        montoCentavos: monto,
      });
      expect(r.success, `debería rechazar ${monto}`).toBe(false);
    }
  });

  it("exige que la confianza esté entre 0 y 1", () => {
    expect(ExtraccionPedidoSchema.safeParse({ hayPedido: true, confianza: 1.5 }).success).toBe(false);
    expect(ExtraccionPedidoSchema.safeParse({ hayPedido: true }).success).toBe(false);
  });

  it("acepta lo mínimo indispensable y rellena el resto", () => {
    const r = ExtraccionPedidoSchema.parse({ hayPedido: false, confianza: 0.4 });
    expect(r.items).toEqual([]);
    expect(r.ambiguedades).toEqual([]);
    expect(r.fechaComprometida).toBeNull();
  });
});

describe("requiereAprobacion — cuándo se interrumpe al dueño", () => {
  it("deja pasar una extracción impecable", () => {
    expect(requiereAprobacion(extraccionLimpia())).toBe(false);
  });

  it("no molesta al dueño cuando no hay pedido", () => {
    expect(requiereAprobacion(extraccionLimpia({ hayPedido: false, confianza: 0.1 }))).toBe(false);
  });

  it("pide aprobación cuando el modelo duda", () => {
    expect(requiereAprobacion(extraccionLimpia({ confianza: UMBRAL_CONFIANZA - 0.01 }))).toBe(true);
  });

  it("pide aprobación ante cualquier ambigüedad, por alta que sea la confianza", () => {
    const r = extraccionLimpia({
      confianza: 1,
      ambiguedades: ["dijo 'el jueves' pero no aclaró cuál"],
    });
    expect(requiereAprobacion(r)).toBe(true);
  });

  it("pide aprobación si falta la fecha comprometida", () => {
    // Sin fecha el vigía no tiene qué vigilar: el pedido nace inútil.
    expect(requiereAprobacion(extraccionLimpia({ fechaComprometida: null }))).toBe(true);
  });

  it("pide aprobación si falta el cliente o los items", () => {
    expect(requiereAprobacion(extraccionLimpia({ clienteNombre: null }))).toBe(true);
    expect(requiereAprobacion(extraccionLimpia({ items: [] }))).toBe(true);
  });

  it("respeta un umbral configurable por negocio", () => {
    const dudosa = extraccionLimpia({ confianza: 0.85 });
    expect(requiereAprobacion(dudosa, 0.8)).toBe(false);
    expect(requiereAprobacion(dudosa, 0.9)).toBe(true);
  });
});
