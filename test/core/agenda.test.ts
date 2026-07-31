import { describe, expect, it } from "vitest";
import { normalizarUrlAgenda } from "../../src/core/conocimiento/agenda";

describe("normalizarUrlAgenda", () => {
  it("acepta un link de Cal completo", () => {
    const r = normalizarUrlAgenda("https://cal.com/optica-vision/examen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe("https://cal.com/optica-vision/examen");
  });

  it("le pone https a lo que se pegó sin esquema", () => {
    // Es como la gente copia un link: sin el https delante.
    const r = normalizarUrlAgenda("cal.com/optica-vision");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe("https://cal.com/optica-vision");
  });

  it("acepta Calendly igual que Cal", () => {
    expect(normalizarUrlAgenda("calendly.com/mi-optica/30min").ok).toBe(true);
  });

  it("sube http a https en vez de aceptarlo", () => {
    // Este link se le manda a clientes finales por chat.
    const r = normalizarUrlAgenda("http://cal.com/mi-optica");
    expect(r.ok).toBe(false);
  });

  it("rechaza texto que no es un link", () => {
    expect(normalizarUrlAgenda("llámame al 300 123 4567").ok).toBe(false);
    expect(normalizarUrlAgenda("agenda").ok).toBe(false);
  });

  it("rechaza vacío con un mensaje que dice cómo quitarlo", () => {
    const r = normalizarUrlAgenda("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("vacío");
  });
});
