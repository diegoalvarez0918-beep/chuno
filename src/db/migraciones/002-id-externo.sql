-- Comprobar:  SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'
--
-- El descarte de duplicados. Meta reintenta 36 horas y el drenaje puede correr
-- dos veces; sin esto, cada reintento sería un mensaje repetido al cliente y
-- una llamada al modelo pagada de nuevo.
ALTER TABLE mensajes ADD COLUMN id_externo TEXT;

-- Único pero permisivo: SQLite admite muchos NULL, así que los mensajes del
-- agente y del dueño —que no traen id externo— nunca chocan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_externo ON mensajes (negocio_id, id_externo);
