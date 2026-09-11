-- Comprobar:  SELECT name FROM pragma_table_info('conversaciones') WHERE name='ultimo_cliente_en'
--
-- La marca que decide la ventana de 24 horas de Meta. Se queda en NULL para
-- Telegram, que no tiene ventana, y para toda conversación anterior a D2 — lo
-- que las deja "cerradas" hasta que el cliente vuelva a escribir, que es el
-- lado seguro del error.
ALTER TABLE conversaciones ADD COLUMN ultimo_cliente_en TEXT;
