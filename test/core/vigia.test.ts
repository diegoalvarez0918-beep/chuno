import { describe, expect, it } from "vitest";
import {
  diasEntre,
  esAccionable,
  evaluarPromesa,
  prioridad,
} from "../../src/core/vigia/reglas";
import type { EstadoPedido } from "../../src/core/pedido/tipos";

const HOY = "2026-07-28";

function enProceso(fechaComprometida: string | null, estado: EstadoPedido = "en_proceso") {
  return { estado, fechaComprometida };
}

describe("diasEntre", () => {
  it("cuenta días calendario en ambos sentidos", () => {
    expect(diasEntre("2026-07-28", "2026-07-31")).toBe(3);
    expect(diasEntre("2026-07-28", "2026-07-28")).toBe(0);
    expect(diasEntre("2026-07-28", "2026-07-25")).toBe(-3);
  });

  it("cruza fin de mes y fin de año sin despeinarse", () => {
    expect(diasEntre("2026-07-31", "2026-08-01")).toBe(1);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("evaluarPromesa", () => {
  it("marca vencida cuando la fecha ya pasó", () => {
    const r = evaluarPromesa(enProceso("2026-07-25"), HOY);
    expect(r.riesgo).toBe("vencida");
    expect(r.diasRestantes).toBe(-3);
  });

  it("marca en riesgo hoy y mañana", () => {
    expect(evaluarPromesa(enProceso("2026-07-28"), HOY).riesgo).toBe("en_riesgo");
    expect(evaluarPromesa(enProceso("2026-07-29"), HOY).riesgo).toBe("en_riesgo");
  });

  it("deja tranquilo lo que todavía tiene aire", () => {
    const r = evaluarPromesa(enProceso("2026-07-31"), HOY);
    expect(r.riesgo).toBe("ok");
    expect(r.diasRestantes).toBe(3);
  });

  it("señala los pedidos sin fecha comprometida", () => {
    // Un pedido sin fecha es invisible para el vigía, y por eso hay que sacarlo
    // a la superficie: es el agujero por donde se cae la operación.
    expect(evaluarPromesa(enProceso(null), HOY).riesgo).toBe("sin_fecha");
  });

  it("considera cumplida la promesa cuando el pedido está listo, aunque la fecha pasara", () => {
    // Lo prometido fue tenerlo listo. Que el cliente no haya pasado a recogerlo
    // no es un incumplimiento del negocio.
    expect(evaluarPromesa(enProceso("2026-07-20", "listo"), HOY).riesgo).toBe("ok");
  });

  it("ignora los estados terminales", () => {
    expect(evaluarPromesa(enProceso("2026-07-20", "entregado"), HOY).riesgo).toBe("ok");
    expect(evaluarPromesa(enProceso("2026-07-20", "cancelado"), HOY).riesgo).toBe("ok");
  });

  it("respeta un umbral configurable", () => {
    // Un taller que quiera avisar con tres días de anticipación solo cambia esto.
    expect(evaluarPromesa(enProceso("2026-07-31"), HOY, 3).riesgo).toBe("en_riesgo");
  });
});

describe("priorización de la bandeja", () => {
  it("solo lo que necesita acción es accionable", () => {
    expect(esAccionable("vencida")).toBe(true);
    expect(esAccionable("en_riesgo")).toBe(true);
    expect(esAccionable("sin_fecha")).toBe(true);
    expect(esAccionable("ok")).toBe(false);
  });

  it("ordena lo vencido primero", () => {
    const orden = (["ok", "sin_fecha", "vencida", "en_riesgo"] as const)
      .slice()
      .sort((a, b) => prioridad(a) - prioridad(b));

    expect(orden).toEqual(["vencida", "en_riesgo", "sin_fecha", "ok"]);
  });
});
