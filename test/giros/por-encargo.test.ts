import { describe, expect, it } from "vitest";
import { giroPorEncargo } from "../../src/giros/por-encargo";
import type { ContextoNegocio } from "../../src/giros/tipos";

// `instrucciones` es puro: arma una cadena a partir del contexto, sin red ni
// reloj. Es lo único de este archivo que se puede probar, y basta.
const negocio: ContextoNegocio = {
  nombre: "Óptica de Prueba",
  hoy: "2026-08-18",
  zonaHoraria: "America/Bogota",
  conocimiento: [],
  catalogo: [],
  faq: [],
  tono: null,
  agendaUrl: null,
};

describe("instrucciones del giro por encargo", () => {
  /**
   * El 2026-08-16 se quitó de `prompt.ts` la contradicción que hacía que el bot
   * le dijera al cliente «le consulto al dueño», y se dejó viva la mitad que
   * vive aquí: estas instrucciones van ANTES en el prompt compuesto.
   *
   * La regla que protege este test no es de estilo. Para el cliente, quien
   * responde es el negocio: nombrarle al dueño le explica una mecánica interna
   * que no le importa y que el prompt prohíbe dos bloques más abajo.
   */
  it("no le nombra al dueño, porque el prompt le prohíbe mencionarlo al cliente", () => {
    expect(giroPorEncargo.instrucciones(negocio)).not.toMatch(/due[ñn]o/i);
  });

  it("sigue prohibiendo que prometa una fecha por su cuenta", () => {
    expect(giroPorEncargo.instrucciones(negocio)).toMatch(/NUNCA prometes una fecha/);
  });
});
