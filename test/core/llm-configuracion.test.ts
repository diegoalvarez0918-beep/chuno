import { describe, expect, it } from "vitest";
import {
  MODELOS_GEMINI,
  resolverConfiguracionLLM,
  type ConfiguracionLLM,
  type ConfiguracionParcial,
} from "../../src/core/llm/configuracion";

const instalacion: ConfiguracionLLM = {
  proveedor: "gemini",
  apiKey: "llave-de-la-instalacion",
  baseUrl: null,
  modelos: ["gemini-3.6-flash"],
  topeDiario: 500,
};

const sinNada: ConfiguracionParcial = {
  apiKey: null,
  proveedor: null,
  baseUrl: null,
  modelos: [],
  topeDiario: null,
};

describe("resolverConfiguracionLLM", () => {
  it("sin llave propia, todo sale del entorno", () => {
    expect(resolverConfiguracionLLM(sinNada, instalacion)).toEqual(instalacion);
  });

  // El caso que da nombre a la regla: nada del entorno se cuela.
  it("con llave propia, todo sale del negocio", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        modelos: ["anthropic/claude-haiku-4.5"],
        topeDiario: 50,
      },
      instalacion,
    );

    expect(r).toEqual({
      proveedor: "compatible",
      apiKey: "llave-del-negocio",
      baseUrl: "https://openrouter.ai/api/v1",
      modelos: ["anthropic/claude-haiku-4.5"],
      topeDiario: 50,
    });
  });

  it("con llave propia y sin tope, el tope es el del entorno", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio", topeDiario: null },
      instalacion,
    );
    expect(r.apiKey).toBe("llave-del-negocio");
    expect(r.topeDiario).toBe(500);
  });

  it("con llave propia y sin proveedor, se asume gemini con sus modelos", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio" },
      instalacion,
    );
    expect(r.proveedor).toBe("gemini");
    expect(r.modelos).toEqual(MODELOS_GEMINI);
  });

  // La trampa que el todo-o-nada existe para cerrar: sin baseUrl NO se toma la
  // del entorno, porque sería la llave de uno contra el endpoint del otro.
  it("compatible sin baseUrl se descarta ENTERO y cae al entorno", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: null,
        modelos: ["gpt-4o-mini"],
        topeDiario: 50,
      },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });

  it("compatible sin modelos se descarta ENTERO y cae al entorno", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        modelos: [],
        topeDiario: null,
      },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });

  it("un proveedor que no reconocemos se descarta ENTERO", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio", proveedor: "brujeria" },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });
});
