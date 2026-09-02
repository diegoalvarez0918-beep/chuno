-- Comprobar:  SELECT name FROM pragma_table_info('catalogo') WHERE name='imagen_clave'
--
-- Ya aplicada en producción antes de que existiera esta carpeta. Se rescata de
-- .tmp/ para que el historial de la base viva sea reproducible desde el repo.
ALTER TABLE catalogo ADD COLUMN imagen_clave TEXT;
