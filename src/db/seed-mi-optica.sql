-- Conocimiento del negocio real `mi-optica`, el que atiende @Chunnobot.
--
-- Existe porque el 2026-07-31, una hora antes del pitch, este contenido se
-- cargó a la D1 de producción con SQL suelto que no quedó en ninguna parte.
-- Un dato que solo vive en la base y no en el repo es un dato que se pierde
-- entero el día que haya que reconstruirla.
--
--     npx wrangler d1 execute chuno --remote --file=src/db/seed-mi-optica.sql
--
-- **No se parece a `seed.sql` y no hay que confundirlos.** Aquel BORRA los dos
-- negocios antes de sembrar, incluido este; esto es puramente aditivo, está
-- acotado a `mi-optica` y se puede correr las veces que sea (`INSERT OR IGNORE`
-- más `UPDATE` idempotentes). Nunca toca `imagen_clave`: las fotos las sube una
-- persona desde el panel y volver a sembrar no puede borrárselas.
--
-- Fechas en ISO-8601 con T y Z. D1 compara fechas como texto y el formato de
-- `datetime('now')` lleva espacio, que ordena antes que la T y rompe en
-- silencio las métricas y el ORDER BY.

UPDATE negocios SET nombre = 'Óptica del Parque' WHERE id = 'mi-optica';

-- Descripciones para lo que ya existía. `imagen_clave` NO se toca.
UPDATE catalogo SET descripcion = 'Con antirreflejo incluido', dias_entrega = 3,
  actualizado_en = '2026-07-31T22:10:00.000Z'
  WHERE negocio_id = 'mi-optica' AND id = 'cat-m2';
UPDATE catalogo SET descripcion = 'Se descuenta si compras las gafas el mismo día',
  actualizado_en = '2026-07-31T22:10:00.000Z'
  WHERE negocio_id = 'mi-optica' AND id = 'cat-m1';

-- Productos nuevos, todos sin foto a propósito. `fotoParaResponder` se niega a
-- mandar imagen cuando dos productos CON foto empatan en puntaje, así que cada
-- foto que se agrega estrecha el margen.
--
-- **Ojo, medido el 2026-08-15:** en producción ya hay DOS con foto, "Lentes
-- monofocales" y "Lentes de sol". Las dos empiezan por "Lentes", así que un
-- cliente que escriba "¿tienen lentes?" empata y NO recibe foto; solo la recibe
-- si nombra el producto ("lentes monofocales"). Funciona, pero el comentario
-- que decía "una sola foto por familia" ya no describe la base real.
INSERT OR IGNORE INTO catalogo (id, negocio_id, nombre, descripcion, precio_centavos, dias_entrega, imagen_clave, creado_en, actualizado_en) VALUES
 ('cat-m3','mi-optica','Lentes progresivos','Marco no incluido',42000000,7,NULL,'2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('cat-m4','mi-optica','Lentes de contacto por encargo',NULL,24000000,5,NULL,'2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('cat-m5','mi-optica','Reparación simple','Bisagras, plaquetas, ajustes',NULL,1,NULL,'2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z');

-- Conocimiento libre. Los bloques Horario y Tiempos de entrega ya existían y no
-- se tocan; estos cuatro están escritos para no contradecirlos.
--
-- OJO: la dirección es INVENTADA. Se puso para que el asistente pudiera
-- responder "¿dónde quedan?" en la demo del pitch. Cámbiala por la real antes
-- de ponerle este negocio a un cliente.
INSERT OR IGNORE INTO conocimiento (id, negocio_id, titulo, contenido, creado_en) VALUES
 ('kb-m3','mi-optica','Dirección','Carrera 15 # 93-60, Bogotá. A media cuadra del parque.','2026-07-31T22:10:00.000Z'),
 ('kb-m4','mi-optica','Formas de pago','Efectivo, tarjeta débito y crédito, Nequi y Daviplata. Con tarjeta se puede diferir a 3 cuotas sin interés.','2026-07-31T22:10:00.000Z'),
 ('kb-m5','mi-optica','Garantía','Un año de garantía en montura por defectos de fábrica y 6 meses en el tratamiento antirreflejo. No cubre golpes ni rayones por uso.','2026-07-31T22:10:00.000Z'),
 ('kb-m6','mi-optica','Examen de vista','El examen de optometría cuesta $45.000 y se descuenta si compras las gafas el mismo día. Se atiende con cita.','2026-07-31T22:10:00.000Z');

-- Preguntas frecuentes. El horario de faq-m10 coincide con el bloque Horario
-- que el negocio ya tenía: dos respuestas que se contradicen son peores que una
-- sola, porque el asistente puede citar cualquiera de las dos.
INSERT OR IGNORE INTO faq (id, negocio_id, pregunta, respuesta, creado_en, actualizado_en) VALUES
 ('faq-m1','mi-optica','¿Qué formas de pago aceptan?','Nequi, Daviplata, efectivo y tarjeta. Con tarjeta puedes diferir a 3 cuotas sin interés.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m2','mi-optica','¿Pueden facturar mi compra?','Sí. Cuando confirmemos el pago te llega la factura electrónica al correo. Si necesitas datos de empresa, dínoslos antes de facturar.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m3','mi-optica','¿Necesito cita para el examen?','Sí, el examen de optometría se atiende con cita. Escríbenos y te agendamos.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m4','mi-optica','¿Sirve la fórmula de otro optómetra?','Sí, siempre que tenga menos de un año. Mándanos la foto y la revisamos antes de montar los lentes.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m5','mi-optica','¿Cuánto se demoran los lentes?','Monofocales, 3 días hábiles. Progresivos, 5 a 7 días hábiles. Si el laboratorio se atrasa te avisamos antes de la fecha, no después.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m6','mi-optica','¿Cómo sé qué talla de montura me sirve?','Si ya tienes unas gafas cómodas, mira los números impresos en la varilla y mándanoslos. Si no, pásate por la tienda y te medimos.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m7','mi-optica','¿Hacen envíos?','Sí, a toda Colombia. En Bogotá llega en 1 a 2 días hábiles; al resto del país, entre 3 y 5. El envío va incluido en compras sobre $250.000.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m8','mi-optica','¿Puedo devolver o cambiar unas gafas?','Tienes 30 días para cambiar la montura si no te acomodó. Los lentes formulados no tienen devolución porque se tallan para tu fórmula, pero si la graduación quedó mal la corregimos sin costo.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m9','mi-optica','¿Tienen garantía?','Un año en montura por defectos de fábrica y 6 meses en el tratamiento antirreflejo. No cubre golpes ni rayones por uso.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z'),
 ('faq-m10','mi-optica','¿Dónde quedan y a qué horas abren?','Carrera 15 # 93-60, Bogotá. Lunes a viernes de 9 a.m. a 6 p.m. y sábados de 9 a.m. a 1 p.m.','2026-07-31T22:10:00.000Z','2026-07-31T22:10:00.000Z');
