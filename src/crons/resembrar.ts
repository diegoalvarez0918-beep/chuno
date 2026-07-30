/**
 * Resembrado de la demo pública.
 *
 * `seed.sql` afirma que la demo nunca envejece porque sus fechas son relativas.
 * Es cierto solo en el instante en que corre: si nadie lo vuelve a ejecutar, las
 * fechas se quedan quietas y el mundo avanza. El 2026-07-30 la demo abría con
 * "0 mensajes hoy", "0 clientes hoy" y todo vencido — la mezcla que el seed
 * diseñó a propósito se había derrumbado, y era la primera pantalla del jurado.
 *
 * **Esto no puede hacerse corriendo `seed.sql` desde el cron.** Ese archivo
 * borra también `mi-optica`, que es el negocio que recibe las conversaciones
 * reales de Telegram: un cron sobre él borraría pedidos y chats de verdad cada
 * media hora. Por eso aquí solo se toca `demo-optica`, y `seed.sql` se conserva
 * para la siembra manual completa.
 *
 * Efecto secundario buscado: la demo es estado global que cualquier visitante
 * puede mover —aprobar una decisión es parte de la experiencia—, y esto la
 * devuelve a su punto de partida para el siguiente. Deja de ser degradable.
 */

const NEGOCIO = "demo-optica";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Colombia es UTC-5 todo el año y no tiene horario de verano. */
const DESFASE_BOGOTA = 5 * HORA;

/**
 * Los tiempos se calculan aquí y entran como texto, en vez de dejárselos a
 * `datetime('now', …)` de SQLite. Dos razones, y las dos costaron un rato:
 *
 * 1. **El formato.** SQLite escribe `2026-07-30 17:00:00`, con espacio; la app
 *    escribe ISO-8601 con `T` y `Z`. Como las comparaciones de fecha en D1 son
 *    textuales, el espacio (0x20) ordena antes que la `T` (0x54): una fila
 *    sembrada NUNCA superaba el umbral de "hoy" del panel. Esa —y no el
 *    envejecimiento— era la razón real de "0 mensajes hoy" en la demo.
 * 2. **El anclaje.** Un mensaje sembrado como "hace 2 horas" cae en el día
 *    anterior si alguien abre la demo de madrugada. Los de hoy se anclan a la
 *    mañana de hoy en Bogotá, no a un desplazamiento desde ahora.
 */

/** Marca los momentos que tienen que caer dentro del día de hoy en Bogotá. */
const HOY = "hoy";

const UNIDADES: readonly { sufijo: string; ms: number }[] = [
  { sufijo: "minute", ms: MINUTO },
  { sufijo: "hour", ms: HORA },
  { sufijo: "day", ms: DIA },
];

function desplazamiento(texto: string): number {
  const partes = /^([+-]?\d+)\s+([a-z]+?)s?$/.exec(texto.trim());
  const unidad = partes ? UNIDADES.find((u) => u.sufijo === partes[2]) : undefined;
  if (!partes || !unidad) throw new Error(`desplazamiento inválido: ${texto}`);

  return Number(partes[1]) * unidad.ms;
}

/** `YYYY-MM-DD` del día en Bogotá, desplazado en días enteros. */
function fechaBogota(dias: number, ahora: number): string {
  return new Date(ahora - DESFASE_BOGOTA + dias * DIA).toISOString().slice(0, 10);
}

/**
 * Un momento que siempre cae dentro del día de hoy en Bogotá: las 9 de la
 * mañana, o ahora mismo si todavía no son. Es lo que hace que "mensajes hoy" y
 * "clientes hoy" nunca sean cero, se abra la demo a la hora que se abra.
 */
function instante(texto: string, ahora: number): string {
  if (texto === HOY) {
    const nueveAM = Date.parse(`${fechaBogota(0, ahora)}T14:00:00.000Z`);
    return new Date(Math.min(ahora, nueveAM)).toISOString();
  }

  return new Date(ahora + desplazamiento(texto)).toISOString();
}

/** Se borra en orden inverso a las dependencias; la cascada no cubre todo. */
const TABLAS = [
  "uso_llm",
  "leads",
  "contactos",
  "auditoria",
  "propuestas",
  "pedidos",
  "mensajes",
  "conversaciones",
  "catalogo",
  "faq",
  "conocimiento",
];

const CONOCIMIENTO = [
  ["kb1", "Horario", "Lunes a viernes de 9:00 a.m. a 7:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m. Domingos cerrado."],
  ["kb2", "Dirección", "Calle 53 # 27-40, barrio Galerías, Bogotá. Frente al parque."],
  ["kb3", "Tiempos de entrega", "Lentes monofocales: 3 días hábiles. Progresivos: 5 a 7 días hábiles. Lentes de contacto por encargo: 5 días hábiles. Reparaciones simples: mismo día."],
  ["kb4", "Examen de vista", "El examen de optometría cuesta $45.000 y se descuenta si compras las gafas el mismo día. Se atiende con cita."],
  ["kb5", "Formas de pago", "Efectivo, tarjeta débito y crédito, Nequi y Daviplata. Se puede diferir a 3 cuotas sin interés con tarjeta."],
  ["kb6", "Garantía", "Un año de garantía en montura por defectos de fábrica. Los lentes tienen 6 meses de garantía en tratamiento antirreflejo."],
] as const;

const CONVERSACIONES = [
  ["c-marta", "demo-1", "Marta Ruiz", "-9 days", "-1 days"],
  ["c-sandra", "demo-2", "Sandra Ospina", HOY, HOY],
  ["c-luisa", "demo-3", "Luisa Gómez", "-6 days", "-2 days"],
  ["c-carlos", "demo-4", "Carlos Peña", "-8 days", "-3 days"],
  ["c-andres", "demo-5", "Andrés Molina", "-5 days", "-4 days"],
  ["c-diana", "demo-6", "Diana Sáenz", "-3 days", "-3 days"],
  ["c-jorge", "demo-7", "Jorge Rivas", "-2 days", "-2 days"],
  ["c-paola", "demo-8", "Paola Trujillo", "-20 days", "-9 days"],
  ["c-fernando", "demo-9", "Fernando Castro", "-4 days", "-4 days"],
] as const;

const MENSAJES = [
  ["m1", "c-marta", "cliente", "Buenas, vengo por las gafas que encargué la semana pasada", "-9 days"],
  ["m2", "c-marta", "agente", "¡Hola Marta! Claro que sí. Tus lentes progresivos con antirreflejo quedan listos en 5 a 7 días hábiles.", "-9 days"],
  ["m3", "c-marta", "cliente", "Listo, ahí paso", "-9 days"],
  ["m4", "c-marta", "cliente", "Hola, ¿ya están listas mis gafas?", "-1 days"],
  ["m5", "c-sandra", "cliente", "Hola! quiero unas gafas para mi hija", HOY],
  ["m6", "c-sandra", "agente", "¡Hola Sandra! Con gusto. ¿Ya tienes la fórmula del optómetra?", HOY],
  ["m7", "c-sandra", "cliente", "Sí, la tengo. Son monofocales. ¿Me las tienen para el jueves?", HOY],
  ["m8", "c-sandra", "cliente", "Es que el viernes viajamos", HOY],
  ["m9", "c-luisa", "cliente", "Buenas tardes, quiero cambiar los lentes de mi montura", "-6 days"],
  ["m10", "c-luisa", "agente", "¡Hola Luisa! Perfecto. ¿Los quieres con antirreflejo?", "-6 days"],
  ["m11", "c-luisa", "cliente", "Sí porfa, con antirreflejo", "-6 days"],
] as const;

/**
 * Repartidos a propósito: vencido, vence hoy, a tiempo, sin fecha y entregado.
 * Un tablero donde todo está bien no demuestra nada.
 */
const PEDIDOS: readonly [string, string, string, string, number | null, number | null, string, string | null, string, string][] = [
  ["p-marta", "c-marta", "Marta Ruiz", '[{"descripcion":"Lentes progresivos con antirreflejo","cantidad":1}]', 68000000, -4, "en_proceso", "El laboratorio se atrasó con los progresivos", "-9 days", "-4 days"],
  ["p-carlos", "c-carlos", "Carlos Peña", '[{"descripcion":"Lentes de contacto mensuales","cantidad":2}]', 24000000, -1, "confirmado", null, "-8 days", "-8 days"],
  ["p-luisa", "c-luisa", "Luisa Gómez", '[{"descripcion":"Cambio de lentes monofocales con antirreflejo","cantidad":1}]', 32000000, 0, "en_proceso", null, "-6 days", "-2 days"],
  ["p-andres", "c-andres", "Andrés Molina", '[{"descripcion":"Gafas de sol formuladas","cantidad":1}]', 51000000, 1, "confirmado", null, "-5 days", "-5 days"],
  ["p-diana", "c-diana", "Diana Sáenz", '[{"descripcion":"Montura acetato","cantidad":1},{"descripcion":"Lentes monofocales","cantidad":1}]', 45000000, 4, "en_proceso", null, "-3 days", "-3 days"],
  ["p-jorge", "c-jorge", "Jorge Rivas", '[{"descripcion":"Montura infantil flexible","cantidad":1}]', 19000000, 6, "confirmado", null, "-2 days", "-2 days"],
  ["p-paola", "c-paola", "Paola Trujillo", '[{"descripcion":"Lentes progresivos premium","cantidad":1}]', 89000000, -9, "entregado", null, "-20 days", "-9 days"],
  // El único sin fecha comprometida: el tablero tiene que mostrar ese caso.
  ["p-fernando", "c-fernando", "Fernando Castro", '[{"descripcion":"Reparación de bisagra de montura","cantidad":1}]', null, null, "confirmado", "Quedó de confirmar cuándo pasa", "-4 days", "-4 days"],
];

/**
 * Las claves de dedupe coinciden con las que generaría el vigía: por eso corre
 * después del resembrado y no las duplica.
 */
const PROPUESTAS: readonly [string, string, string, string, number | null, string | null, string][] = [
  [
    "pr-marta",
    "enviar_aviso",
    '{"tipo":"enviar_aviso","conversacionId":"c-marta","pedidoId":"p-marta","texto":"Hola Marta, te escribo por tu pedido de lentes progresivos con antirreflejo. Se nos corrió la fecha que te había prometido y quiero avisarte antes de que preguntes. Te confirmo hoy mismo una fecha nueva. Mil disculpas."}',
    "El pedido de Marta Ruiz venció hace 4 días y sigue sin estar listo. Además ella ya preguntó ayer.",
    null,
    "aviso:p-marta:vencida",
    "-40 minutes",
  ],
  [
    "pr-sandra",
    "crear_pedido",
    '{"tipo":"crear_pedido","conversacionId":"c-sandra","clienteNombre":"Sandra Ospina","items":[{"descripcion":"Gafas monofocales para niña","cantidad":1}],"montoCentavos":null,"fechaComprometida":null,"notas":"Viaja el viernes"}',
    "Sandra pidió unas gafas para el jueves, pero no quedó claro si alcanza: los monofocales toman 3 días hábiles y ella viaja el viernes. Confirma la fecha antes de comprometerte.",
    0.62,
    null,
    HOY,
  ],
  [
    "pr-luisa",
    "enviar_aviso",
    '{"tipo":"enviar_aviso","conversacionId":"c-luisa","pedidoId":"p-luisa","texto":"Hola Luisa, tu pedido de cambio de lentes monofocales con antirreflejo sigue en proceso y va para hoy. Te aviso apenas esté listo."}',
    "El pedido de Luisa Gómez vence hoy y todavía no está listo.",
    null,
    "aviso:p-luisa:en_riesgo",
    "-25 minutes",
  ],
];

const AUDITORIA = [
  ["a1", "pedido_creado", '{"pedidoId":"p-jorge","confianza":0.93,"automatico":true}', "agente", "-2 days"],
  ["a2", "propuesta_creada", '{"tipo":"crear_pedido","confianza":0.62,"razones":2}', "agente", HOY],
  ["a3", "vigia_avisos", '{"avisos":2,"revisados":7}', "cron", "-40 minutes"],
  ["a4", "aviso_enviado", '{"pedidoId":"p-paola"}', "admin", "-9 days"],
  ["a5", "propuesta_aprobada", '{"tipo":"enviar_aviso","exito":true}', "admin", "-9 days"],
] as const;

const CONTACTOS = [
  ["ct-marta", "Marta Ruiz", "demo-1", "-9 days", "-1 days", 4],
  ["ct-sandra", "Sandra Ospina", "demo-2", HOY, HOY, 3],
  ["ct-luisa", "Luisa Gómez", "demo-3", "-6 days", "-2 days", 2],
  ["ct-carlos", "Carlos Peña", "demo-4", "-8 days", "-3 days", 2],
  ["ct-andres", "Andrés Molina", "demo-5", "-5 days", "-4 days", 3],
  ["ct-diana", "Diana Sáenz", "demo-6", "-3 days", "-3 days", 2],
  ["ct-jorge", "Jorge Rivas", "demo-7", "-2 days", "-2 days", 2],
  ["ct-paola", "Paola Trujillo", "demo-8", "-20 days", "-9 days", 5],
  ["ct-fernando", "Fernando Castro", "demo-9", "-4 days", "-4 days", 2],
] as const;

const LEADS: readonly [string, string, string, string, number | null, string][] = [
  ["ld-sandra", "ct-sandra", "nuevo", "Gafas monofocales para niña", null, HOY],
  ["ld-fernando", "ct-fernando", "contactado", "Reparación de bisagra", null, "-4 days"],
  ["ld-andres", "ct-andres", "interesado", "Gafas de sol formuladas", 51000000, "-5 days"],
  ["ld-marta", "ct-marta", "cliente", "Lentes progresivos con antirreflejo", 68000000, "-9 days"],
  ["ld-luisa", "ct-luisa", "cliente", "Cambio de lentes con antirreflejo", 32000000, "-6 days"],
  ["ld-paola", "ct-paola", "cliente", "Lentes progresivos premium", 89000000, "-20 days"],
];

/** Con esto el panel muestra salud y gasto reales en vez de un guion. */
const USOS = [
  ["u1", 1840, 220, 1, HOY],
  ["u2", 2100, 480, 1, HOY],
  ["u3", 1650, 190, 1, "-1 days"],
  ["u4", 1720, 510, 1, "-1 days"],
  ["u5", 1580, 0, 0, "-3 days"],
  ["u6", 1910, 340, 1, "-3 days"],
  ["u7", 2240, 610, 1, "-4 days"],
  ["u8", 1770, 290, 1, "-5 days"],
] as const;

const CATALOGO: readonly [string, string, string | null, number | null, number | null][] = [
  ["cat-d1", "Lentes monofocales", "Con antirreflejo incluido", 18000000, 3],
  ["cat-d2", "Lentes progresivos", "Marco no incluido", 42000000, 7],
  ["cat-d3", "Examen de optometría", "Se descuenta si compras las gafas el mismo día", 4500000, null],
  ["cat-d4", "Reparación simple", "Bisagras, plaquetas, ajustes", null, 1],
  ["cat-d5", "Lentes de contacto por encargo", null, 24000000, 5],
];

const FAQS = [
  ["faq-d1", "¿Puedo pagar con Nequi?", "Sí: Nequi, Daviplata, efectivo y tarjeta. Con tarjeta se puede diferir a 3 cuotas sin interés."],
  ["faq-d2", "¿Necesito cita para el examen?", "Sí, el examen de optometría se atiende con cita. Escríbenos y te agendamos."],
  ["faq-d3", "¿Tienen garantía?", "Un año en montura por defectos de fábrica y 6 meses en el tratamiento antirreflejo."],
] as const;

export interface ResumenResiembra {
  readonly sentencias: number;
}

export async function resembrarDemo(
  db: D1Database,
  ahora: number = Date.now(),
): Promise<ResumenResiembra> {
  const s = (sql: string, ...valores: unknown[]) => db.prepare(sql).bind(...valores);
  const t = (texto: string) => instante(texto, ahora);

  const sentencias: D1PreparedStatement[] = [
    ...TABLAS.map((tabla) => s(`DELETE FROM ${tabla} WHERE negocio_id = ?`, NEGOCIO)),

    s(
      `INSERT OR REPLACE INTO negocios (id, nombre, giro, zona_horaria, creado_en)
       VALUES (?, 'Óptica Visión Clara (demo)', 'por-encargo', 'America/Bogota', ?)`,
      NEGOCIO,
      t("-30 days"),
    ),

    ...CONOCIMIENTO.map(([id, titulo, contenido]) =>
      s(
        `INSERT INTO conocimiento (id, negocio_id, titulo, contenido, creado_en)
         VALUES (?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        titulo,
        contenido,
        t("-30 days"),
      ),
    ),

    ...CONVERSACIONES.map(([id, chat, nombre, creado, actualizado]) =>
      s(
        `INSERT INTO conversaciones
           (id, negocio_id, canal, canal_chat_id, cliente_nombre, pausado_hasta, creado_en, actualizado_en)
         VALUES (?, ?, 'demo', ?, ?, NULL, ?, ?)`,
        id,
        NEGOCIO,
        chat,
        nombre,
        t(creado),
        t(actualizado),
      ),
    ),

    ...MENSAJES.map(([id, conv, autor, texto, cuando]) =>
      s(
        `INSERT INTO mensajes (id, negocio_id, conversacion_id, autor, texto, creado_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        conv,
        autor,
        texto,
        t(cuando),
      ),
    ),

    ...PEDIDOS.map(([id, conv, quien, items, monto, dias, estado, notas, creado, actualizado]) =>
      s(
        `INSERT INTO pedidos
           (id, negocio_id, conversacion_id, cliente_nombre, items_json, monto_centavos,
            fecha_comprometida, estado, notas, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        conv,
        quien,
        items,
        monto,
        dias === null ? null : fechaBogota(dias, ahora),
        estado,
        notas,
        t(creado),
        t(actualizado),
      ),
    ),

    ...PROPUESTAS.map(([id, tipo, payload, motivo, confianza, dedupe, cuando]) =>
      s(
        `INSERT INTO propuestas
           (id, negocio_id, tipo, payload_json, motivo, confianza, estado, clave_dedupe, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, 'propuesta', ?, ?)`,
        id,
        NEGOCIO,
        tipo,
        payload,
        motivo,
        confianza,
        dedupe,
        t(cuando),
      ),
    ),

    ...AUDITORIA.map(([id, accion, detalle, actor, cuando]) =>
      s(
        `INSERT INTO auditoria (id, negocio_id, accion, detalle_json, actor, creado_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        accion,
        detalle,
        actor,
        t(cuando),
      ),
    ),

    ...CONTACTOS.map(([id, nombre, chat, primera, ultima, total]) =>
      s(
        `INSERT INTO contactos
           (id, negocio_id, nombre, canal, canal_chat_id, primera_interaccion, ultima_interaccion, total_mensajes)
         VALUES (?, ?, ?, 'demo', ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        nombre,
        chat,
        t(primera),
        t(ultima),
        total,
      ),
    ),

    ...LEADS.map(([id, contacto, estado, interes, valor, cuando]) =>
      s(
        `INSERT INTO leads
           (id, negocio_id, contacto_id, estado, interes, valor_estimado_centavos, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        contacto,
        estado,
        interes,
        valor,
        t(cuando),
        t(cuando),
      ),
    ),

    ...USOS.map(([id, entrada, salida, exito, cuando]) =>
      s(
        `INSERT INTO uso_llm (id, negocio_id, modelo, tokens_entrada, tokens_salida, exito, creado_en)
         VALUES (?, ?, 'gemini-3.6-flash', ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        entrada,
        salida,
        exito,
        t(cuando),
      ),
    ),

    ...CATALOGO.map(([id, nombre, descripcion, precio, dias]) =>
      s(
        `INSERT INTO catalogo
           (id, negocio_id, nombre, descripcion, precio_centavos, dias_entrega, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        nombre,
        descripcion,
        precio,
        dias,
        t("-30 days"),
        t("-30 days"),
      ),
    ),

    ...FAQS.map(([id, pregunta, respuesta]) =>
      s(
        `INSERT INTO faq (id, negocio_id, pregunta, respuesta, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        NEGOCIO,
        pregunta,
        respuesta,
        t("-30 days"),
        t("-30 days"),
      ),
    ),
  ];

  await db.batch(sentencias);

  return { sentencias: sentencias.length };
}
