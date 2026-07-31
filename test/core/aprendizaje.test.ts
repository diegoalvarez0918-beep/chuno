import { describe, expect, it } from "vitest";
import { comoFaq, yaEstaEnFaq } from "../../src/core/conocimiento/aprendizaje";
import type { Faq } from "../../src/core/conocimiento/tipos";

function faq(pregunta: string): Faq {
  return { id: "faq_1", negocioId: "neg_1", pregunta, respuesta: "cualquiera" };
}

describe("comoFaq", () => {
  it("guarda una pareja que le sirve al siguiente cliente", () => {
    const r = comoFaq("¿Hacen domicilios?", "Sí, en toda Bogotá por $8.000.");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.pregunta).toBe("¿Hacen domicilios?");
      expect(r.valor.respuesta).toBe("Sí, en toda Bogotá por $8.000.");
    }
  });

  it("le quita el saludo del borrador, que es de un cliente y no del negocio", () => {
    // El borrador de la bandeja arranca así. Guardarlo haría que el asistente
    // salude a todo el mundo llamándolo Marta.
    const r = comoFaq(
      "¿Hacen domicilios?",
      "Hola Marta, sobre lo que me preguntaste: sí, cubrimos toda Bogotá por $8.000.",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.respuesta).toBe("sí, cubrimos toda Bogotá por $8.000.");
  });

  it("conserva la frase entera si quitarle el saludo la deja en nada", () => {
    // Quitando "Hola Ana," quedan 11 caracteres: menos de lo que hace falta.
    // Vale más guardar de más que mutilar la única respuesta que hay.
    const r = comoFaq("¿Tienen parqueadero?", "Hola Ana, sí tenemos.");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.respuesta).toContain("Hola Ana");
  });

  it("rechaza un acuse de recibo, que no le sirve a nadie más", () => {
    const r = comoFaq("¿Ya está listo mi pedido?", "Sí, ya");
    expect(r.ok).toBe(false);
  });

  it("rechaza una pregunta demasiado corta", () => {
    const r = comoFaq("y eso?", "Trabajamos de lunes a sábado de 8 a 6.");
    expect(r.ok).toBe(false);
  });
});

describe("yaEstaEnFaq", () => {
  it("reconoce la misma pregunta escrita distinto", () => {
    const existentes = [faq("¿Hacen domicilios?")];
    expect(yaEstaEnFaq(existentes, "hacen domicilios")).not.toBeNull();
    expect(yaEstaEnFaq(existentes, "Hacen Domicilios?")).not.toBeNull();
  });

  it("ignora tildes", () => {
    expect(yaEstaEnFaq([faq("¿Cuánto cuesta el envío?")], "cuanto cuesta el envio")).not.toBeNull();
  });

  it("no confunde dos preguntas distintas", () => {
    expect(yaEstaEnFaq([faq("¿Hacen domicilios?")], "¿Aceptan tarjeta?")).toBeNull();
  });

  it("con la lista vacía no encuentra nada", () => {
    expect(yaEstaEnFaq([], "¿Hacen domicilios?")).toBeNull();
  });
});
