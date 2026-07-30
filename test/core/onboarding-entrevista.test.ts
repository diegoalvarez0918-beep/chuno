import { describe, expect, it } from "vitest";
import {
  aplicarRespuesta,
  armarConfiguracion,
  esFinal,
  estadoInicial,
  interpretar,
  preguntaDe,
} from "../../src/core/onboarding/entrevista";
import { validarCatalogoLLM, validarFaqLLM } from "../../src/core/onboarding/esquemas-llm";
import type { EstadoEntrevista } from "../../src/core/onboarding/tipos";

const RESPUESTAS = [
  "Floristería La Orquídea",
  "Armamos arreglos florales por encargo: ramos, cajas y decoración para eventos.",
  "Lunes a sábado de 8:00 a.m. a 6:00 p.m., Chapinero, Bogotá.",
  "Ramo de 12 rosas - $95.000 - entrega mismo día\nCaja de girasoles - $120.000 - 1 día",
  "P: ¿Hacen domicilios?\nR: Sí, en toda Bogotá por $8.000.",
  "cálido y alegre, tuteando",
  "saltar",
];

function entrevistaCompleta(): EstadoEntrevista {
  let estado = estadoInicial();
  for (const texto of RESPUESTAS) {
    const r = interpretar(estado.paso, texto);
    expect(r.ok, `interpretar falló en "${estado.paso}"`).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const avance = aplicarRespuesta(estado, r.valor);
    expect(avance.ok, `aplicar falló en "${estado.paso}"`).toBe(true);
    if (!avance.ok) throw new Error(avance.error);
    estado = avance.valor;
  }
  return estado;
}

describe("la entrevista completa", () => {
  it("siete respuestas llevan de la primera pregunta a 'listo'", () => {
    const estado = entrevistaCompleta();
    expect(estado.paso).toBe("listo");
    expect(esFinal(estado)).toBe(true);
  });

  it("de la entrevista sale una configuración completa", () => {
    const config = armarConfiguracion(entrevistaCompleta().datos);
    expect(config.ok).toBe(true);
    if (!config.ok) return;

    expect(config.valor.nombre).toBe("Floristería La Orquídea");
    expect(config.valor.giro).toBe("por-encargo");
    expect(config.valor.catalogo).toHaveLength(2);
    expect(config.valor.faq).toHaveLength(1);
    expect(config.valor.tono).toBe("cálido y alegre, tuteando");
    expect(config.valor.telegramToken).toBeNull();
    expect(config.valor.conocimiento.map((k) => k.titulo)).toEqual(["Qué hacemos", "Horario y ubicación"]);
  });
});

describe("la máquina de estados", () => {
  it("rechaza una respuesta de un paso que no es el actual", () => {
    const r = aplicarRespuesta(estadoInicial(), { paso: "tono", tono: "formal" });
    expect(r.ok).toBe(false);
  });

  it("no muta el estado original", () => {
    const inicial = estadoInicial();
    const r = aplicarRespuesta(inicial, { paso: "nombre", nombre: "Óptica X" });
    expect(r.ok).toBe(true);
    expect(inicial.paso).toBe("nombre");
    expect(inicial.datos.nombre).toBeUndefined();
  });

  it("un nombre demasiado corto se rechaza con explicación", () => {
    const r = interpretar("nombre", "x");
    expect(r.ok).toBe(false);
  });

  it("un catálogo ilegible se rechaza para que el LLM lo intente", () => {
    const r = interpretar("catalogo", "vendemos de todo un poco");
    expect(r.ok).toBe(false);
  });

  it("cada paso tiene una pregunta en español", () => {
    expect(preguntaDe("nombre", {})).toContain("negocio");
    expect(preguntaDe("catalogo", {})).toContain("precios");
    expect(preguntaDe("telegram", {})).toContain("BotFather");
  });

  it("la entrevista terminada no acepta más respuestas", () => {
    const r = interpretar("listo", "otra cosa");
    expect(r.ok).toBe(false);
  });
});

describe("armarConfiguracion", () => {
  it("sin las respuestas obligatorias, falla", () => {
    const r = armarConfiguracion({ nombre: "Óptica X" });
    expect(r.ok).toBe(false);
  });
});

describe("validadores de la salida del LLM", () => {
  it("acepta un catálogo con la forma correcta", () => {
    const r = validarCatalogoLLM({ items: [{ nombre: "Ramo", precioCentavos: 9500000, descripcion: null, diasEntrega: 1 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor[0]?.nombre).toBe("Ramo");
  });

  it("rechaza items sin nombre o con tipos torcidos", () => {
    expect(validarCatalogoLLM({ items: [{ precioCentavos: 100 }] }).ok).toBe(false);
    expect(validarCatalogoLLM({ items: [{ nombre: "X", precioCentavos: "caro" }] }).ok).toBe(false);
    expect(validarCatalogoLLM("no es un objeto").ok).toBe(false);
  });

  it("acepta y rechaza FAQs igual de estricto", () => {
    expect(validarFaqLLM({ items: [{ pregunta: "¿A?", respuesta: "B" }] }).ok).toBe(true);
    expect(validarFaqLLM({ items: [{ pregunta: "¿A?" }] }).ok).toBe(false);
  });
});
