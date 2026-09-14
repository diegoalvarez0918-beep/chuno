import { describe, expect, it } from "vitest";
import {
  PayloadPropuestaSchema,
  PropuestaSchema,
  TIPOS_CON_CONVERSACION,
  estaPendiente,
  resolver,
  TOPE_ESCALACIONES_POR_CONVERSACION,
  alcanzoTopeDeEscalaciones,
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

describe("alcanzoTopeDeEscalaciones", () => {
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

  function varias(cuantas: number, conversacionId = "conv_1"): Propuesta[] {
    return Array.from({ length: cuantas }, (_, i) =>
      escalacion(conversacionId, { id: `prop_${conversacionId}_${i}` }),
    );
  }

  it("sin nada pendiente, no bloquea", () => {
    expect(alcanzoTopeDeEscalaciones([], "conv_1")).toBe(false);
  });

  /**
   * El caso que rompió el producto el 2026-09-14, y la razón de que esto sea un
   * tope y no un booleano.
   *
   * La regla anterior era "si hay UNA pendiente, no escales más". Un cliente
   * preguntó por unos lentes y su pregunta no llegó nunca a la bandeja, porque
   * en esa conversación había una tarjeta sin contestar **de hacía un mes**. El
   * bot le prometió "ya te confirmo" y no avisó a nadie: el cliente quedó
   * esperando para siempre y el dueño nunca supo que existía.
   *
   * Una pregunta sin contestar no puede dejar mudo a ese cliente para siempre.
   */
  it("con una pendiente vieja, una pregunta NUEVA sigue llegando al dueño", () => {
    expect(alcanzoTopeDeEscalaciones(varias(1), "conv_1")).toBe(false);
  });

  it("con dos pendientes todavía deja pasar la tercera", () => {
    expect(alcanzoTopeDeEscalaciones(varias(2), "conv_1")).toBe(false);
  });

  /**
   * El freno que sigue siendo necesario: en agosto se midieron ONCE tarjetas de
   * una sola conversación, todas la misma pregunta, porque el modelo la
   * parafraseaba distinto cada vez y la clave de dedupe no deduplicaba nada.
   */
  it("en el tope, frena: el apilamiento de once tarjetas no puede volver", () => {
    expect(alcanzoTopeDeEscalaciones(varias(TOPE_ESCALACIONES_POR_CONVERSACION), "conv_1")).toBe(true);
  });

  it("el tope es de tres, y se declara aquí como literal a propósito", () => {
    // Importar la constante y compararla consigo misma no probaría nada: sería
    // la misma tautología que ya nos costó un test ciego el 2026-09-10.
    expect(TOPE_ESCALACIONES_POR_CONVERSACION).toBe(3);
  });

  it("no confunde conversaciones distintas", () => {
    expect(alcanzoTopeDeEscalaciones(varias(5), "conv_2")).toBe(false);
  });

  it("deja escalar de nuevo cuando el dueño ya contestó", () => {
    const contestadas = varias(5).map((p) => ({ ...p, estado: "aplicada" }) as Propuesta);
    expect(alcanzoTopeDeEscalaciones(contestadas, "conv_1")).toBe(false);
  });

  it("no confunde un aviso del vigía con una pregunta: aquel sí trae pedido", () => {
    const avisos = Array.from({ length: 5 }, (_, i) => propuesta({ id: `av_${i}` }));
    expect(alcanzoTopeDeEscalaciones(avisos, "conv_1")).toBe(false);
  });
});

describe("TIPOS_CON_CONVERSACION", () => {
  /**
   * El test que sostiene la decisión de diseño.
   *
   * La lista se consume desde dos consultas SQL, así que si alguien agrega un
   * payload con `conversacionId` y no lo mete aquí, sus propuestas
   * desaparecerían del hilo y del globo sin que nada fallara. Este test lo
   * amarra al esquema en vez de a la memoria de quien lo escriba.
   */
  it("coincide exactamente con los payloads que llevan conversacionId", () => {
    for (const opcion of PayloadPropuestaSchema.options) {
      const tipo: string = opcion.shape.tipo.value;
      const llevaCampo = "conversacionId" in opcion.shape;

      expect(
        (TIPOS_CON_CONVERSACION as readonly string[]).includes(tipo),
        `${tipo} ${llevaCampo ? "lleva" : "no lleva"} conversacionId`,
      ).toBe(llevaCampo);
    }
  });

  it("deja fuera los que cuelgan de un pedido", () => {
    const fuera: readonly string[] = TIPOS_CON_CONVERSACION;
    expect(fuera).not.toContain("cambiar_estado");
    expect(fuera).not.toContain("cambiar_fecha");
  });
});
