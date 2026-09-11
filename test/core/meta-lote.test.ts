import { describe, expect, it } from "vitest";
import { trocear } from "../../src/core/meta/lote";

/**
 * El tope de D1, escrito como literal a propósito.
 *
 * Importar `PARAMETROS_MAXIMOS` haría el test tautológico: mutar la constante
 * movería los dos lados de la desigualdad y la comprobación se quedaría verde.
 * Comprobado — la primera versión de este test sobrevivió a subir la constante
 * a 105. Este número es de D1, no nuestro, y el test existe para afirmarlo.
 */
const TOPE_DE_D1 = 100;

describe("trocear", () => {
  it("parte un lote de 1000 filas de 5 columnas en 50 trozos", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => i);
    expect(trocear(filas, 5)).toHaveLength(50);
  });

  // La propiedad de verdad: si alguien sube la constante o cambia el redondeo,
  // algún trozo pasa el tope real de D1 y esto se pone rojo. Contar trozos sin
  // comprobar esto no mide nada.
  it("ningún trozo excede el tope de parámetros de D1", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => i);
    for (const columnas of [1, 3, 5, 7, 50]) {
      for (const trozo of trocear(filas, columnas)) {
        expect(trozo.length * columnas).toBeLessThanOrEqual(TOPE_DE_D1);
      }
    }
  });

  it("no pierde ni duplica filas", () => {
    const filas = Array.from({ length: 47 }, (_, i) => i);
    expect(trocear(filas, 5).flat()).toEqual(filas);
  });

  it("un lote vacío no produce trozos", () => {
    expect(trocear([], 5)).toEqual([]);
  });

  it("se niega si una sola fila ya excede el tope", () => {
    expect(() => trocear([1], 101)).toThrow();
  });
});
