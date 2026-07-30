import { describe, expect, it } from "vitest";
import {
  esSaltar,
  parsearCatalogo,
  parsearDiasEntrega,
  parsearFaq,
  parsearPrecio,
  parsearTokenTelegram,
} from "../../src/core/onboarding/respuestas";

describe("parsearPrecio", () => {
  it("lee pesos colombianos con puntos de miles", () => {
    expect(parsearPrecio("$850.000")).toBe(85000000);
    expect(parsearPrecio("vale 95.000 pesos")).toBe(9500000);
  });

  it("lee números pelados de 4+ dígitos", () => {
    expect(parsearPrecio("85000")).toBe(8500000);
  });

  it("no confunde los días de entrega con un precio", () => {
    expect(parsearPrecio("entrega en 3 días")).toBeNull();
  });

  it("sin número no hay precio", () => {
    expect(parsearPrecio("precio por confirmar")).toBeNull();
  });
});

describe("parsearDiasEntrega", () => {
  it("lee 'N días' con y sin tilde", () => {
    expect(parsearDiasEntrega("3 días hábiles")).toBe(3);
    expect(parsearDiasEntrega("5 dias")).toBe(5);
  });

  it("'mismo día' es 1", () => {
    expect(parsearDiasEntrega("entrega mismo día")).toBe(1);
  });

  it("sin mención de días devuelve null", () => {
    expect(parsearDiasEntrega("$85.000")).toBeNull();
  });
});

describe("parsearCatalogo", () => {
  it("lee una lista pegada, un producto por línea", () => {
    const items = parsearCatalogo(
      [
        "Lentes monofocales - $180.000 - 3 días hábiles",
        "Lentes progresivos: $420.000 – 7 días",
        "Examen de vista $45.000",
        "Reparación simple",
      ].join("\n"),
    );

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ nombre: "Lentes monofocales", precioCentavos: 18000000, diasEntrega: 3 });
    expect(items[1]).toMatchObject({ nombre: "Lentes progresivos", precioCentavos: 42000000, diasEntrega: 7 });
    expect(items[2]).toMatchObject({ nombre: "Examen de vista", precioCentavos: 4500000 });
    expect(items[3]).toMatchObject({ nombre: "Reparación simple", precioCentavos: null });
  });

  it("los números dentro del nombre sobreviven", () => {
    const items = parsearCatalogo("Ramo de 12 rosas – $95.000 – entrega mismo día");
    expect(items[0]).toMatchObject({ nombre: "Ramo de 12 rosas", precioCentavos: 9500000, diasEntrega: 1 });
  });

  it("ignora líneas vacías y viñetas", () => {
    const items = parsearCatalogo("- Caja de girasoles - $120.000\n\n• Arreglo para eventos - $350.000");
    expect(items.map((i) => i.nombre)).toEqual(["Caja de girasoles", "Arreglo para eventos"]);
  });

  it("'saltar' devuelve lista vacía", () => {
    expect(parsearCatalogo("saltar")).toEqual([]);
    expect(esSaltar("Saltar")).toBe(true);
    expect(esSaltar("ninguna")).toBe(true);
    expect(esSaltar("Lentes")).toBe(false);
  });
});

describe("parsearFaq", () => {
  it("lee pares P:/R: en líneas seguidas", () => {
    const faqs = parsearFaq("P: ¿Hacen domicilios?\nR: Sí, en toda Bogotá por $8.000.");
    expect(faqs).toEqual([{ pregunta: "¿Hacen domicilios?", respuesta: "Sí, en toda Bogotá por $8.000." }]);
  });

  it("lee pregunta y respuesta en una sola línea", () => {
    const faqs = parsearFaq("¿Reciben Nequi? Sí, Nequi y Daviplata.");
    expect(faqs).toEqual([{ pregunta: "¿Reciben Nequi?", respuesta: "Sí, Nequi y Daviplata." }]);
  });

  it("una pregunta sola toma la línea siguiente como respuesta", () => {
    const faqs = parsearFaq("¿Tienen garantía?\nUn año en montura.");
    expect(faqs).toEqual([{ pregunta: "¿Tienen garantía?", respuesta: "Un año en montura." }]);
  });

  it("texto sin forma de pregunta devuelve vacío", () => {
    expect(parsearFaq("los clientes preguntan cosas")).toEqual([]);
  });
});

describe("parsearTokenTelegram", () => {
  it("acepta un token con forma de BotFather", () => {
    const r = parsearTokenTelegram("123456789:AAubcCDefGHijKLmnOPqrsTUvwxYZabcdefg");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe("123456789:AAubcCDefGHijKLmnOPqrsTUvwxYZabcdefg");
  });

  it("'saltar' es válido y significa sin bot por ahora", () => {
    const r = parsearTokenTelegram("saltar");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBeNull();
  });

  it("cualquier otra cosa es un error explicado", () => {
    const r = parsearTokenTelegram("mi bot se llama @MiBot");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("BotFather");
  });
});
