import { describe, expect, it } from "vitest";
import { filtrarCatalogo, filtrarFaq, tokenizar } from "../../src/core/conocimiento/busqueda";
import { bloqueCatalogo, bloqueFaq, precioTexto } from "../../src/core/conocimiento/bloques";
import type { Faq, ItemCatalogo } from "../../src/core/conocimiento/tipos";

function item(nombre: string, precioCentavos: number | null, diasEntrega: number | null = null): ItemCatalogo {
  return {
    id: `cat_${nombre.slice(0, 4)}`,
    negocioId: "neg_1",
    nombre,
    descripcion: null,
    precioCentavos,
    diasEntrega,
  };
}

const CATALOGO: ItemCatalogo[] = [
  item("Lentes monofocales", 18000000, 3),
  item("Lentes progresivos", 42000000, 7),
  item("Examen de vista", 4500000),
  item("Reparación de bisagra", null),
];

const FAQS: Faq[] = [
  { id: "faq_1", negocioId: "neg_1", pregunta: "¿Hacen domicilios?", respuesta: "Sí, en toda Bogotá." },
  { id: "faq_2", negocioId: "neg_1", pregunta: "¿Reciben Nequi?", respuesta: "Sí, Nequi y Daviplata." },
];

describe("tokenizar", () => {
  it("quita acentos, vacías y palabras cortas", () => {
    expect(tokenizar("¿Cuánto cuesta el examen de visión?")).toEqual(["cuanto", "cuesta", "examen", "vision"]);
  });

  it("sin términos útiles devuelve vacío", () => {
    expect(tokenizar("hola, ¿qué más?")).toEqual([]);
  });
});

describe("filtrarCatalogo", () => {
  it("prioriza los ítems que coinciden con la consulta", () => {
    const r = filtrarCatalogo(CATALOGO, "¿cuánto vale el examen de vista?");
    expect(r[0]?.nombre).toBe("Examen de vista");
  });

  it("si nada coincide devuelve el catálogo acotado, no vacío", () => {
    // Los precios son la pregunta más frecuente: mejor darle al modelo el
    // catálogo completo (acotado) que dejarlo sin nada y tentarlo a inventar.
    const r = filtrarCatalogo(CATALOGO, "hola buenas tardes");
    expect(r.length).toBe(CATALOGO.length);
  });

  it("respeta el límite", () => {
    expect(filtrarCatalogo(CATALOGO, "hola", 2)).toHaveLength(2);
  });
});

describe("filtrarFaq", () => {
  it("encuentra la FAQ por términos de la pregunta", () => {
    const r = filtrarFaq(FAQS, "¿puedo pagar con nequi?");
    expect(r[0]?.pregunta).toBe("¿Reciben Nequi?");
  });
});

describe("bloques para el prompt", () => {
  it("formatea el precio en pesos colombianos", () => {
    expect(precioTexto(18000000)).toBe("$180.000");
    expect(precioTexto(null)).toBe("precio por confirmar");
  });

  it("arma el bloque del catálogo con precio y entrega", () => {
    const bloque = bloqueCatalogo([item("Lentes monofocales", 18000000, 3)]);
    expect(bloque).toContain("CATÁLOGO");
    expect(bloque).toContain("Lentes monofocales");
    expect(bloque).toContain("$180.000");
    expect(bloque).toContain("3 días");
  });

  it("catálogo vacío produce bloque vacío, no un encabezado suelto", () => {
    expect(bloqueCatalogo([])).toBe("");
  });

  it("arma el bloque de FAQ con pregunta y respuesta", () => {
    const bloque = bloqueFaq(FAQS);
    expect(bloque).toContain("¿Hacen domicilios?");
    expect(bloque).toContain("Sí, en toda Bogotá.");
  });

  it("FAQ vacía produce bloque vacío", () => {
    expect(bloqueFaq([])).toBe("");
  });
});
