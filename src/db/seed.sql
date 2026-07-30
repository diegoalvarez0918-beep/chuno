-- Datos sembrados de la demo pública.
--
-- Las fechas son RELATIVAS a la ejecución (date('now','-5 hours') ≈ hoy en
-- Bogotá). Así la demo nunca envejece: quien la abra el viernes o dentro de un
-- mes ve pedidos vencidos y en riesgo de verdad, no fechas de 2026 congeladas.
--
-- Idempotente: se puede volver a correr para dejar la demo como nueva.

DELETE FROM uso_llm       WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM leads         WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM contactos     WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM auditoria     WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM propuestas    WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM pedidos       WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM mensajes      WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM conversaciones WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM catalogo      WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM faq           WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM credenciales  WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM entrevistas   WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM conocimiento  WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM settings      WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM negocios      WHERE id IN ('demo-optica', 'mi-optica');

-- ─────────────────────────────────────────────────────────────── negocios ───

INSERT INTO negocios (id, nombre, giro, zona_horaria, creado_en) VALUES
  ('demo-optica', 'Óptica Visión Clara (demo)', 'por-encargo', 'America/Bogota', datetime('now')),
  ('mi-optica',   'Mi negocio',                 'por-encargo', 'America/Bogota', datetime('now'));

-- ──────────────────────────────────────────────────────────── conocimiento ───
-- Lo que el asistente puede decir. Todo lo que no esté aquí, lo escala.

INSERT INTO conocimiento (id, negocio_id, titulo, contenido, creado_en) VALUES
  ('kb1', 'demo-optica', 'Horario',
   'Lunes a viernes de 9:00 a.m. a 7:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m. Domingos cerrado.',
   datetime('now')),
  ('kb2', 'demo-optica', 'Dirección',
   'Calle 53 # 27-40, barrio Galerías, Bogotá. Frente al parque.',
   datetime('now')),
  ('kb3', 'demo-optica', 'Tiempos de entrega',
   'Lentes monofocales: 3 días hábiles. Progresivos: 5 a 7 días hábiles. Lentes de contacto por encargo: 5 días hábiles. Reparaciones simples: mismo día.',
   datetime('now')),
  ('kb4', 'demo-optica', 'Examen de vista',
   'El examen de optometría cuesta $45.000 y se descuenta si compras las gafas el mismo día. Se atiende con cita.',
   datetime('now')),
  ('kb5', 'demo-optica', 'Formas de pago',
   'Efectivo, tarjeta débito y crédito, Nequi y Daviplata. Se puede diferir a 3 cuotas sin interés con tarjeta.',
   datetime('now')),
  ('kb6', 'demo-optica', 'Garantía',
   'Un año de garantía en montura por defectos de fábrica. Los lentes tienen 6 meses de garantía en tratamiento antirreflejo.',
   datetime('now')),
  ('kb7', 'mi-optica', 'Horario',
   'Lunes a viernes de 9:00 a.m. a 6:00 p.m. Sábados de 9:00 a.m. a 1:00 p.m.',
   datetime('now')),
  ('kb8', 'mi-optica', 'Tiempos de entrega',
   'Lentes monofocales: 3 días hábiles. Progresivos: 5 a 7 días hábiles.',
   datetime('now'));

-- ──────────────────────────────────────────────────────── conversaciones ───

INSERT INTO conversaciones
  (id, negocio_id, canal, canal_chat_id, cliente_nombre, pausado_hasta, creado_en, actualizado_en)
VALUES
  ('c-marta',  'demo-optica', 'demo', 'demo-1', 'Marta Ruiz',      NULL, datetime('now','-9 days'),  datetime('now','-1 days')),
  ('c-sandra', 'demo-optica', 'demo', 'demo-2', 'Sandra Ospina',   NULL, datetime('now','-2 hours'), datetime('now','-2 hours')),
  ('c-luisa',  'demo-optica', 'demo', 'demo-3', 'Luisa Gómez',     NULL, datetime('now','-6 days'),  datetime('now','-2 days')),
  ('c-carlos', 'demo-optica', 'demo', 'demo-4', 'Carlos Peña',     NULL, datetime('now','-8 days'),  datetime('now','-3 days')),
  ('c-andres', 'demo-optica', 'demo', 'demo-5', 'Andrés Molina',   NULL, datetime('now','-5 days'),  datetime('now','-4 days')),
  ('c-diana',  'demo-optica', 'demo', 'demo-6', 'Diana Sáenz',     NULL, datetime('now','-3 days'),  datetime('now','-3 days')),
  ('c-jorge',  'demo-optica', 'demo', 'demo-7', 'Jorge Rivas',     NULL, datetime('now','-2 days'),  datetime('now','-2 days')),
  ('c-paola',  'demo-optica', 'demo', 'demo-8', 'Paola Trujillo',  NULL, datetime('now','-20 days'), datetime('now','-9 days')),
  ('c-fernando','demo-optica','demo', 'demo-9', 'Fernando Castro', NULL, datetime('now','-4 days'),  datetime('now','-4 days'));

-- Hilos. Cortos y realistas: así habla la gente por chat, en renglones sueltos.

INSERT INTO mensajes (id, negocio_id, conversacion_id, autor, texto, creado_en) VALUES
  ('m1','demo-optica','c-marta','cliente','Buenas, vengo por las gafas que encargué la semana pasada',datetime('now','-9 days')),
  ('m2','demo-optica','c-marta','agente','¡Hola Marta! Claro que sí. Tus lentes progresivos con antirreflejo quedan listos en 5 a 7 días hábiles.',datetime('now','-9 days')),
  ('m3','demo-optica','c-marta','cliente','Listo, ahí paso',datetime('now','-9 days')),
  ('m4','demo-optica','c-marta','cliente','Hola, ¿ya están listas mis gafas?',datetime('now','-1 days')),

  ('m5','demo-optica','c-sandra','cliente','Hola! quiero unas gafas para mi hija',datetime('now','-2 hours')),
  ('m6','demo-optica','c-sandra','agente','¡Hola Sandra! Con gusto. ¿Ya tienes la fórmula del optómetra?',datetime('now','-2 hours')),
  ('m7','demo-optica','c-sandra','cliente','Sí, la tengo. Son monofocales. ¿Me las tienen para el jueves?',datetime('now','-2 hours')),
  ('m8','demo-optica','c-sandra','cliente','Es que el viernes viajamos',datetime('now','-2 hours')),

  ('m9','demo-optica','c-luisa','cliente','Buenas tardes, quiero cambiar los lentes de mi montura',datetime('now','-6 days')),
  ('m10','demo-optica','c-luisa','agente','¡Hola Luisa! Perfecto. ¿Los quieres con antirreflejo?',datetime('now','-6 days')),
  ('m11','demo-optica','c-luisa','cliente','Sí porfa, con antirreflejo',datetime('now','-6 days'));

-- ──────────────────────────────────────────────────────────────── pedidos ───
-- Repartidos a propósito: vencidos, por vencer, a tiempo, sin fecha y entregado.
-- Un tablero donde todo está bien no demuestra nada.

INSERT INTO pedidos
  (id, negocio_id, conversacion_id, cliente_nombre, items_json, monto_centavos,
   fecha_comprometida, estado, notas, creado_en, actualizado_en)
VALUES
  ('p-marta','demo-optica','c-marta','Marta Ruiz',
   '[{"descripcion":"Lentes progresivos con antirreflejo","cantidad":1}]', 68000000,
   date('now','-5 hours','-4 days'), 'en_proceso', 'El laboratorio se atrasó con los progresivos',
   datetime('now','-9 days'), datetime('now','-4 days')),

  ('p-carlos','demo-optica','c-carlos','Carlos Peña',
   '[{"descripcion":"Lentes de contacto mensuales","cantidad":2}]', 24000000,
   date('now','-5 hours','-1 days'), 'confirmado', NULL,
   datetime('now','-8 days'), datetime('now','-8 days')),

  ('p-luisa','demo-optica','c-luisa','Luisa Gómez',
   '[{"descripcion":"Cambio de lentes monofocales con antirreflejo","cantidad":1}]', 32000000,
   date('now','-5 hours'), 'en_proceso', NULL,
   datetime('now','-6 days'), datetime('now','-2 days')),

  ('p-andres','demo-optica','c-andres','Andrés Molina',
   '[{"descripcion":"Gafas de sol formuladas","cantidad":1}]', 51000000,
   date('now','-5 hours','+1 days'), 'confirmado', NULL,
   datetime('now','-5 days'), datetime('now','-5 days')),

  ('p-diana','demo-optica','c-diana','Diana Sáenz',
   '[{"descripcion":"Montura acetato","cantidad":1},{"descripcion":"Lentes monofocales","cantidad":1}]', 45000000,
   date('now','-5 hours','+4 days'), 'en_proceso', NULL,
   datetime('now','-3 days'), datetime('now','-3 days')),

  ('p-jorge','demo-optica','c-jorge','Jorge Rivas',
   '[{"descripcion":"Montura infantil flexible","cantidad":1}]', 19000000,
   date('now','-5 hours','+6 days'), 'confirmado', NULL,
   datetime('now','-2 days'), datetime('now','-2 days')),

  ('p-fernando','demo-optica','c-fernando','Fernando Castro',
   '[{"descripcion":"Reparación de bisagra de montura","cantidad":1}]', NULL,
   NULL, 'confirmado', 'Quedó de confirmar cuándo pasa',
   datetime('now','-4 days'), datetime('now','-4 days')),

  ('p-paola','demo-optica','c-paola','Paola Trujillo',
   '[{"descripcion":"Lentes progresivos premium","cantidad":1}]', 89000000,
   date('now','-5 hours','-9 days'), 'entregado', NULL,
   datetime('now','-20 days'), datetime('now','-9 days'));

-- ───────────────────────────────────────────────────── bandeja de decisiones ───
-- Tres decisiones que necesitan criterio humano. Es la pantalla que demuestra
-- el producto: el dueño no abre 400 mensajes, abre estas tres.

INSERT INTO propuestas
  (id, negocio_id, tipo, payload_json, motivo, confianza, estado, clave_dedupe, creado_en)
VALUES
  ('pr-marta','demo-optica','enviar_aviso',
   '{"tipo":"enviar_aviso","conversacionId":"c-marta","pedidoId":"p-marta","texto":"Hola Marta, te escribo por tu pedido de lentes progresivos con antirreflejo. Se nos corrió la fecha que te había prometido y quiero avisarte antes de que preguntes. Te confirmo hoy mismo una fecha nueva. Mil disculpas."}',
   'El pedido de Marta Ruiz venció hace 4 días y sigue sin estar listo. Además ella ya preguntó ayer.',
   NULL, 'propuesta', 'aviso:p-marta:vencida', datetime('now','-40 minutes')),

  ('pr-sandra','demo-optica','crear_pedido',
   '{"tipo":"crear_pedido","conversacionId":"c-sandra","clienteNombre":"Sandra Ospina","items":[{"descripcion":"Gafas monofocales para niña","cantidad":1}],"montoCentavos":null,"fechaComprometida":null,"notas":"Viaja el viernes"}',
   'Sandra pidió unas gafas para el jueves, pero no quedó claro si alcanza: los monofocales toman 3 días hábiles y ella viaja el viernes. Confirma la fecha antes de comprometerte.',
   0.62, 'propuesta', NULL, datetime('now','-2 hours')),

  ('pr-luisa','demo-optica','enviar_aviso',
   '{"tipo":"enviar_aviso","conversacionId":"c-luisa","pedidoId":"p-luisa","texto":"Hola Luisa, tu pedido de cambio de lentes monofocales con antirreflejo sigue en proceso y va para hoy. Te aviso apenas esté listo."}',
   'El pedido de Luisa Gómez vence hoy y todavía no está listo.',
   NULL, 'propuesta', 'aviso:p-luisa:en_riesgo', datetime('now','-25 minutes'));

-- ────────────────────────────────────────────────────────────── auditoría ───

INSERT INTO auditoria (id, negocio_id, accion, detalle_json, actor, creado_en) VALUES
  ('a1','demo-optica','pedido_creado','{"pedidoId":"p-jorge","confianza":0.93,"automatico":true}','agente',datetime('now','-2 days')),
  ('a2','demo-optica','propuesta_creada','{"tipo":"crear_pedido","confianza":0.62,"razones":2}','agente',datetime('now','-2 hours')),
  ('a3','demo-optica','vigia_avisos','{"avisos":2,"revisados":7}','cron',datetime('now','-40 minutes')),
  ('a4','demo-optica','aviso_enviado','{"pedidoId":"p-paola"}','admin',datetime('now','-9 days')),
  ('a5','demo-optica','propuesta_aprobada','{"tipo":"enviar_aviso","exito":true}','admin',datetime('now','-9 days'));

-- ──────────────────────────────────────────────────────────────────── CRM ───
-- Ningún dato de aquí lo escribió una persona: todos salieron de las
-- conversaciones de arriba. Ese es el punto de la pantalla de clientes.

INSERT INTO contactos
  (id, negocio_id, nombre, canal, canal_chat_id, primera_interaccion, ultima_interaccion, total_mensajes)
VALUES
  ('ct-marta','demo-optica','Marta Ruiz','demo','demo-1',datetime('now','-9 days'),datetime('now','-1 days'),4),
  ('ct-sandra','demo-optica','Sandra Ospina','demo','demo-2',datetime('now','-2 hours'),datetime('now','-2 hours'),3),
  ('ct-luisa','demo-optica','Luisa Gómez','demo','demo-3',datetime('now','-6 days'),datetime('now','-2 days'),2),
  ('ct-carlos','demo-optica','Carlos Peña','demo','demo-4',datetime('now','-8 days'),datetime('now','-3 days'),2),
  ('ct-andres','demo-optica','Andrés Molina','demo','demo-5',datetime('now','-5 days'),datetime('now','-4 days'),3),
  ('ct-diana','demo-optica','Diana Sáenz','demo','demo-6',datetime('now','-3 days'),datetime('now','-3 days'),2),
  ('ct-jorge','demo-optica','Jorge Rivas','demo','demo-7',datetime('now','-2 days'),datetime('now','-2 days'),2),
  ('ct-paola','demo-optica','Paola Trujillo','demo','demo-8',datetime('now','-20 days'),datetime('now','-9 days'),5),
  ('ct-fernando','demo-optica','Fernando Castro','demo','demo-9',datetime('now','-4 days'),datetime('now','-4 days'),2);

INSERT INTO leads
  (id, negocio_id, contacto_id, estado, interes, valor_estimado_centavos, creado_en, actualizado_en)
VALUES
  ('ld-sandra','demo-optica','ct-sandra','nuevo','Gafas monofocales para niña',NULL,datetime('now','-2 hours'),datetime('now','-2 hours')),
  ('ld-fernando','demo-optica','ct-fernando','contactado','Reparación de bisagra',NULL,datetime('now','-4 days'),datetime('now','-4 days')),
  ('ld-andres','demo-optica','ct-andres','interesado','Gafas de sol formuladas',51000000,datetime('now','-5 days'),datetime('now','-5 days')),
  ('ld-marta','demo-optica','ct-marta','cliente','Lentes progresivos con antirreflejo',68000000,datetime('now','-9 days'),datetime('now','-9 days')),
  ('ld-luisa','demo-optica','ct-luisa','cliente','Cambio de lentes con antirreflejo',32000000,datetime('now','-6 days'),datetime('now','-6 days')),
  ('ld-paola','demo-optica','ct-paola','cliente','Lentes progresivos premium',89000000,datetime('now','-20 days'),datetime('now','-20 days'));

-- Consumo del modelo, para que el panel muestre salud y gasto reales.
INSERT INTO uso_llm (id, negocio_id, modelo, tokens_entrada, tokens_salida, exito, creado_en)
VALUES
  ('u1','demo-optica','gemini-3.6-flash',1840,220,1,datetime('now','-2 hours')),
  ('u2','demo-optica','gemini-3.6-flash',2100,480,1,datetime('now','-2 hours')),
  ('u3','demo-optica','gemini-3.6-flash',1650,190,1,datetime('now','-1 days')),
  ('u4','demo-optica','gemini-3.6-flash',1720,510,1,datetime('now','-1 days')),
  ('u5','demo-optica','gemini-3.6-flash',1580,0,0,datetime('now','-3 days')),
  ('u6','demo-optica','gemini-3.6-flash',1910,340,1,datetime('now','-3 days')),
  ('u7','demo-optica','gemini-3.6-flash',2240,610,1,datetime('now','-4 days')),
  ('u8','demo-optica','gemini-3.6-flash',1770,290,1,datetime('now','-5 days'));

-- ─────────────────────────────────────────────────  conocimiento con forma ───
-- Con el catálogo aquí, el asistente cita precios sin escalar. Lo que NO está
-- (p. ej. lentes de contacto tóricos) escala al dueño — esa es la Fase 2.

INSERT INTO catalogo (id, negocio_id, nombre, descripcion, precio_centavos, dias_entrega, creado_en, actualizado_en) VALUES
  ('cat-d1','demo-optica','Lentes monofocales','Con antirreflejo incluido',18000000,3,datetime('now'),datetime('now')),
  ('cat-d2','demo-optica','Lentes progresivos','Marco no incluido',42000000,7,datetime('now'),datetime('now')),
  ('cat-d3','demo-optica','Examen de optometría','Se descuenta si compras las gafas el mismo día',4500000,NULL,datetime('now'),datetime('now')),
  ('cat-d4','demo-optica','Reparación simple','Bisagras, plaquetas, ajustes',NULL,1,datetime('now'),datetime('now')),
  ('cat-d5','demo-optica','Lentes de contacto por encargo',NULL,24000000,5,datetime('now'),datetime('now')),
  ('cat-m1','mi-optica','Examen de vista',NULL,4500000,NULL,datetime('now'),datetime('now')),
  ('cat-m2','mi-optica','Lentes monofocales',NULL,18000000,3,datetime('now'),datetime('now'));

INSERT INTO faq (id, negocio_id, pregunta, respuesta, creado_en, actualizado_en) VALUES
  ('faq-d1','demo-optica','¿Puedo pagar con Nequi?','Sí: Nequi, Daviplata, efectivo y tarjeta. Con tarjeta se puede diferir a 3 cuotas sin interés.',datetime('now'),datetime('now')),
  ('faq-d2','demo-optica','¿Necesito cita para el examen?','Sí, el examen de optometría se atiende con cita. Escríbenos y te agendamos.',datetime('now'),datetime('now')),
  ('faq-d3','demo-optica','¿Tienen garantía?','Un año en montura por defectos de fábrica y 6 meses en el tratamiento antirreflejo.',datetime('now'),datetime('now'));
