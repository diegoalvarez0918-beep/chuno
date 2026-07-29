import { describe, expect, it } from "vitest";
import { avanzarLead, esCerrado, transicionLeadValida } from "../../src/core/crm/embudo";
import { ESTADOS_LEAD, type EstadoLead, type Lead } from "../../src/core/crm/tipos";

const ANTES = "2026-07-28T10:00:00.000Z";
const AHORA = "2026-07-29T10:00:00.000Z";

function lead(estado: EstadoLead): Lead {
  return {
    id: "lead_1",
    negocioId: "neg_1",
    contactoId: "cont_1",
    estado,
    interes: "Gafas con antirreflejo",
    valorEstimadoCentavos: 16000000,
    creadoEn: ANTES,
    actualizadoEn: ANTES,
  };
}

describe("embudo de leads", () => {
  it("recorre el camino completo hasta cliente", () => {
    let actual = lead("nuevo");
    for (const siguiente of ["contactado", "interesado", "cliente"] as EstadoLead[]) {
      const r = avanzarLead(actual, siguiente, AHORA);
      expect(r.ok, `debería poder pasar a ${siguiente}`).toBe(true);
      if (!r.ok) return;
      actual = r.valor;
    }
    expect(actual.estado).toBe("cliente");
  });

  it("permite darlo por perdido desde cualquier estado abierto", () => {
    for (const estado of ESTADOS_LEAD) {
      if (esCerrado(estado) || estado === "perdido") continue;
      expect(transicionLeadValida(estado, "perdido"), `desde ${estado}`).toBe(true);
    }
  });

  it("permite reactivar un lead perdido", () => {
    // Un cliente que no compró hace tres meses vuelve a escribir: es el mismo
    // contacto, no uno nuevo.
    const r = avanzarLead(lead("perdido"), "contactado", AHORA);
    expect(r.ok).toBe(true);
  });

  it("no deja retroceder de cliente", () => {
    const r = avanzarLead(lead("cliente"), "interesado", AHORA);
    expect(r.ok).toBe(false);
  });

  it("rechaza la transición a sí mismo", () => {
    const r = avanzarLead(lead("interesado"), "interesado", AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya está");
  });

  it("no muta el original y sella la fecha", () => {
    const original = lead("nuevo");
    const r = avanzarLead(original, "contactado", AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(original.estado).toBe("nuevo");
    expect(original.actualizadoEn).toBe(ANTES);
    expect(r.valor.actualizadoEn).toBe(AHORA);
  });

  it("cliente es el único estado cerrado que cuenta como ganado", () => {
    expect(esCerrado("cliente")).toBe(true);
    expect(esCerrado("perdido")).toBe(false);
  });
});
