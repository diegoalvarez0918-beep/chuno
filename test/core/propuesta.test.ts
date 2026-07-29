import { describe, expect, it } from "vitest";
import {
  PayloadPropuestaSchema,
  PropuestaSchema,
  estaPendiente,
  resolver,
  type PayloadPropuesta,
  type Propuesta,
} from "../../src/core/propuesta/tipos";

const CREADO = "2026-07-28T09:00:00.000Z";
const AHORA = "2026-07-28T14:30:00.000Z";

const avisoOriginal: PayloadPropuesta = {
  tipo: "enviar_aviso",
  conversacionId: "conv_1",
  pedidoId: "ped_1",
  texto: "Hola Marta, tus gafas se demoran dos días más. ¿Te sirve el sábado?",
};

function propuesta(sobre: Partial<Propuesta> = {}): Propuesta {
  return PropuestaSchema.parse({
    id: "prop_1",
    negocioId: "neg_1",
    estado: "propuesta",
    payload: avisoOriginal,
    motivo: "El pedido de Marta está vencido y todavía no hay lentes del laboratorio.",
    confianza: 0.72,
    creadoEn: CREADO,
    resueltoEn: null,
    resueltoPor: null,
    ...sobre,
  });
}

describe("bandeja de decisiones", () => {
  it("aprobar sella quién y cuándo", () => {
    const r = resolver(propuesta(), { decision: "aplicada", porQuien: "admin" }, AHORA);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.valor.estado).toBe("aplicada");
    expect(r.valor.resueltoPor).toBe("admin");
    expect(r.valor.resueltoEn).toBe(AHORA);
  });

  it("rechazar también queda registrado", () => {
    const r = resolver(propuesta(), { decision: "descartada", porQuien: "admin" }, AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.estado).toBe("descartada");
    expect(r.valor.resueltoEn).toBe(AHORA);
  });

  it("el dueño puede editar el texto antes de aprobar", () => {
    const editado: PayloadPropuesta = {
      ...avisoOriginal,
      texto: "Marta, mil disculpas: el laboratorio se atrasó. Te las tengo el sábado sin falta.",
    };

    const r = resolver(
      propuesta(),
      { decision: "aplicada", porQuien: "admin", payloadEditado: editado },
      AHORA,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.payload).toEqual(editado);
  });

  it("una edición no puede cambiar el tipo de acción", () => {
    // Editar el texto de un aviso es una cosa. Convertirlo en un cambio de estado
    // a espaldas de lo que el dueño creyó estar aprobando es otra.
    const r = resolver(
      propuesta(),
      {
        decision: "aplicada",
        porQuien: "admin",
        payloadEditado: { tipo: "cambiar_estado", pedidoId: "ped_1", hacia: "entregado" },
      },
      AHORA,
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("cambia el tipo");
  });

  it("no se resuelve dos veces", () => {
    // Dos pestañas abiertas no pueden mandarle dos mensajes al mismo cliente.
    const yaAprobada = propuesta({ estado: "aplicada", resueltoEn: AHORA, resueltoPor: "admin" });
    const r = resolver(yaAprobada, { decision: "aplicada", porQuien: "admin" }, AHORA);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("ya fue aplicada");
  });

  it("estaPendiente distingue lo que el dueño todavía tiene que mirar", () => {
    expect(estaPendiente(propuesta())).toBe(true);
    expect(estaPendiente(propuesta({ estado: "descartada" }))).toBe(false);
  });
});

describe("payloads de propuesta", () => {
  it("acepta los cuatro tipos de acción", () => {
    const validos: PayloadPropuesta[] = [
      {
        tipo: "crear_pedido",
        conversacionId: "conv_1",
        clienteNombre: "Marta Ruiz",
        items: [{ descripcion: "Montura", cantidad: 1 }],
        montoCentavos: null,
        fechaComprometida: "2026-07-31",
        notas: null,
      },
      { tipo: "cambiar_estado", pedidoId: "ped_1", hacia: "listo" },
      { tipo: "cambiar_fecha", pedidoId: "ped_1", fechaComprometida: "2026-08-02" },
      avisoOriginal,
    ];

    for (const payload of validos) {
      expect(PayloadPropuestaSchema.safeParse(payload).success, payload.tipo).toBe(true);
    }
  });

  it("rechaza un tipo de acción desconocido", () => {
    const r = PayloadPropuestaSchema.safeParse({ tipo: "borrar_todo", pedidoId: "ped_1" });
    expect(r.success).toBe(false);
  });

  it("no deja mandar un aviso vacío al cliente", () => {
    const r = PayloadPropuestaSchema.safeParse({ ...avisoOriginal, texto: "   " });
    expect(r.success).toBe(false);
  });
});
