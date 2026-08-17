import { describe, expect, it } from "vitest";
import {
  PayloadPropuestaSchema,
  PropuestaSchema,
  contarPendientesPorConversacion,
  estaPendiente,
  resolver,
  yaHayEscalacionPendiente,
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

describe("yaHayEscalacionPendiente", () => {
  /** Una escalación: aviso SIN pedido detrás, nacido de una pregunta. */
  function escalacion(conversacionId: string, sobre: Partial<Propuesta> = {}): Propuesta {
    return propuesta({
      id: `prop_${conversacionId}`,
      payload: {
        tipo: "enviar_aviso",
        conversacionId,
        pedidoId: null,
        texto: "Hola Felipe, sobre lo que me preguntaste: ",
        pregunta: "¿Tienen gafas de sol Ray-Ban?",
      },
      ...sobre,
    });
  }

  it("detecta la pregunta que el dueño todavía no ha contestado", () => {
    expect(yaHayEscalacionPendiente([escalacion("conv_1")], "conv_1")).toBe(true);
  });

  /**
   * El corazón del bug: el modelo parafrasea la pregunta en cada pasada, así que
   * la clave de dedupe cambiaba y no deduplicaba nada. En producción se midieron
   * ONCE tarjetas de la misma conversación y la misma pregunta.
   */
  it("no depende de cómo el modelo redactó la pregunta", () => {
    const otraRedaccion = escalacion("conv_1", {
      id: "prop_otro",
      payload: {
        tipo: "enviar_aviso",
        conversacionId: "conv_1",
        pedidoId: null,
        texto: "Hola Felipe, sobre lo que me preguntaste: ",
        pregunta: "El cliente consulta por disponibilidad y precios de gafas de sol.",
      },
    });

    expect(yaHayEscalacionPendiente([otraRedaccion], "conv_1")).toBe(true);
  });

  it("no confunde conversaciones distintas", () => {
    expect(yaHayEscalacionPendiente([escalacion("conv_1")], "conv_2")).toBe(false);
  });

  it("deja escalar de nuevo cuando el dueño ya contestó", () => {
    const contestada = escalacion("conv_1", { estado: "aplicada", resueltoPor: "admin" });
    expect(yaHayEscalacionPendiente([contestada], "conv_1")).toBe(false);
  });

  it("no confunde un aviso del vigía con una pregunta: aquel sí trae pedido", () => {
    expect(yaHayEscalacionPendiente([propuesta()], "conv_1")).toBe(false);
  });

  it("sin nada pendiente, no bloquea", () => {
    expect(yaHayEscalacionPendiente([], "conv_1")).toBe(false);
  });
});

describe("contarPendientesPorConversacion", () => {
  function enConversacion(id: string, conversacionId: string, estado = "propuesta"): Propuesta {
    return propuesta({
      id,
      estado: estado as Propuesta["estado"],
      // Escrito completo y no como `{...avisoOriginal, conversacionId}`: esparcir
      // un valor tipado como la unión rompe el estrechamiento del discriminante
      // y `tsc` lo rechaza aunque los tests pasen.
      payload: {
        tipo: "enviar_aviso",
        conversacionId,
        pedidoId: "ped_1",
        texto: "Hola Marta, tus gafas se demoran dos días más. ¿Te sirve el sábado?",
      },
    });
  }

  it("agrupa las decisiones pendientes por conversación", () => {
    const cuenta = contarPendientesPorConversacion([
      enConversacion("p1", "conv_1"),
      enConversacion("p2", "conv_1"),
      enConversacion("p3", "conv_2"),
    ]);

    expect(cuenta.get("conv_1")).toBe(2);
    expect(cuenta.get("conv_2")).toBe(1);
  });

  /**
   * El globo de la lista dice "esperan tu decisión". Una propuesta ya resuelta
   * no espera nada, y contarla mandaría al dueño a una conversación donde no
   * hay nada que hacer.
   */
  it("no cuenta las que ya se resolvieron", () => {
    const cuenta = contarPendientesPorConversacion([
      enConversacion("p1", "conv_1"),
      enConversacion("p2", "conv_1", "aplicada"),
      enConversacion("p3", "conv_1", "descartada"),
    ]);

    expect(cuenta.get("conv_1")).toBe(1);
  });

  /**
   * `cambiar_estado` y `cambiar_fecha` llevan pedidoId y NO conversacionId.
   * Agrupar a ciegas por una propiedad que no existe en todas las variantes es
   * como se cuela un `undefined` de llave en un Map.
   */
  it("ignora las propuestas que no cuelgan de una conversación", () => {
    const cuenta = contarPendientesPorConversacion([
      enConversacion("p1", "conv_1"),
      propuesta({ id: "p2", payload: { tipo: "cambiar_estado", pedidoId: "ped_1", hacia: "listo" } }),
    ]);

    expect(cuenta.size).toBe(1);
    expect(cuenta.has("conv_1")).toBe(true);
  });

  it("una conversación sin nada pendiente no aparece en el mapa", () => {
    expect(contarPendientesPorConversacion([]).size).toBe(0);
    expect(contarPendientesPorConversacion([]).get("conv_1")).toBeUndefined();
  });
});
