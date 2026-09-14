import { describe, expect, it } from "vitest";
import { estadoVentana, resolverModo } from "../../src/core/meta/ventana";

const AHORA = "2026-08-27T15:00:00.000Z";

describe("estadoVentana", () => {
  it("está abierta si el cliente escribió hace menos de 24 horas", () => {
    expect(estadoVentana("2026-08-26T16:00:00.000Z", AHORA)).toBe("abierta");
  });

  it("está cerrada si escribió hace más de 24 horas", () => {
    expect(estadoVentana("2026-08-26T14:00:00.000Z", AHORA)).toBe("cerrada");
  });

  // Sin marca no hay permiso: es el caso de un negocio recién conectado, o de
  // una conversación cuyos mensajes ya purgamos a los 90 días.
  it("está cerrada si no hay marca", () => {
    expect(estadoVentana(null, AHORA)).toBe("cerrada");
  });

  it("una marca ilegible se trata como ausente, no revienta", () => {
    expect(estadoVentana("no es una fecha", AHORA)).toBe("cerrada");
  });
});

describe("resolverModo", () => {
  it("con la ventana abierta se escribe libre, aunque haya plantilla", () => {
    const modo = resolverModo("abierta", {
      plantilla: { nombre: "aviso_pedido", idioma: "es" },
      etiquetaAgenteHumano: true,
    });

    expect(modo).toEqual({ tipo: "libre" });
  });

  it("cerrada con plantilla configurada, manda plantilla", () => {
    expect(resolverModo("cerrada", { plantilla: { nombre: "aviso_pedido", idioma: "es" } })).toEqual(
      { tipo: "plantilla", nombre: "aviso_pedido", idioma: "es" },
    );
  });

  it("cerrada con permiso de agente humano, manda con etiqueta", () => {
    expect(resolverModo("cerrada", { etiquetaAgenteHumano: true })).toEqual({ tipo: "etiqueta" });
  });

  // El camino degradado, y la razón de que exista: decirle al dueño que el
  // aviso no sale por ahí es honesto; fingir que salió, no. La regla 11 no se
  // toca — nada salió sin que él aprobara, y tampoco se le miente.
  it("cerrada y sin nada configurado, no se manda", () => {
    expect(resolverModo("cerrada", {})).toEqual({ tipo: "cerrada" });
  });

  it("la plantilla gana a la etiqueta cuando están las dos", () => {
    const modo = resolverModo("cerrada", {
      plantilla: { nombre: "aviso_pedido", idioma: "es" },
      etiquetaAgenteHumano: true,
    });

    expect(modo).toEqual({ tipo: "plantilla", nombre: "aviso_pedido", idioma: "es" });
  });
});
