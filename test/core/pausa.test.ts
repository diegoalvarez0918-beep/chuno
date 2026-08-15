import { describe, expect, it } from "vitest";
import {
  PAUSA_POR_DEFECTO_MINUTOS,
  hastaCuandoPausar,
  minutosRestantesDePausa,
} from "../../src/core/conversacion/pausa";

const AHORA = "2026-08-15T14:00:00.000Z";

describe("hastaCuandoPausar", () => {
  it("devuelve el instante en que el agente vuelve, en ISO con T y Z", () => {
    expect(hastaCuandoPausar(AHORA, 120)).toBe("2026-08-15T16:00:00.000Z");
  });

  /**
   * D1 compara fechas como texto y `datetime('now')` de SQLite produce un
   * espacio donde la app produce una T. Mezclar los dos formatos rompe las
   * comparaciones en silencio, y `estaPausada` es literalmente una comparación
   * de texto entre esta fecha y "ahora".
   */
  it("nunca produce el formato con espacio que rompe las comparaciones en D1", () => {
    expect(hastaCuandoPausar(AHORA)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("dos horas es el valor por defecto: una atención de mostrador, no un turno", () => {
    expect(PAUSA_POR_DEFECTO_MINUTOS).toBe(120);
    expect(hastaCuandoPausar(AHORA)).toBe(hastaCuandoPausar(AHORA, PAUSA_POR_DEFECTO_MINUTOS));
  });

  it("cruza la medianoche sin inventarse un día", () => {
    expect(hastaCuandoPausar("2026-08-15T23:30:00.000Z", 60)).toBe("2026-08-16T00:30:00.000Z");
  });

  /**
   * Reanudar es pausar hasta ahora mismo: no hace falta una segunda operación
   * en la base ni una columna nueva, y `estaPausada` usa `>` estricto.
   */
  it("con cero minutos devuelve el propio instante, que es como se reanuda", () => {
    expect(hastaCuandoPausar(AHORA, 0)).toBe(AHORA);
  });
});

describe("minutosRestantesDePausa", () => {
  it("dice cuánto falta para que el agente vuelva", () => {
    expect(minutosRestantesDePausa("2026-08-15T15:30:00.000Z", AHORA)).toBe(90);
  });

  it("redondea hacia arriba: quedan 0 minutos solo cuando ya volvió", () => {
    expect(minutosRestantesDePausa("2026-08-15T14:00:30.000Z", AHORA)).toBe(1);
  });

  it("una pausa vencida no deja minutos", () => {
    expect(minutosRestantesDePausa("2026-08-15T13:00:00.000Z", AHORA)).toBe(0);
  });

  it("sin pausa no hay nada que contar", () => {
    expect(minutosRestantesDePausa(null, AHORA)).toBe(0);
  });

  it("una fecha ilegible se trata como sin pausa, no como pausa eterna", () => {
    expect(minutosRestantesDePausa("mañana por la tarde", AHORA)).toBe(0);
  });
});
