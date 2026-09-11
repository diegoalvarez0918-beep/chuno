# Migraciones de la D1 viva

`schema.sql` es idempotente y basta para una base **nueva**. Estos archivos
existen para las bases que **ya existen**, porque `ALTER TABLE` no lo es:
corrido dos veces, falla.

## Por qué existe esta carpeta

La columna `catalogo.imagen_clave` se agregó a producción con un archivo suelto
en `.tmp/`, que está en `.gitignore`. La base viva la tiene y el repo **no sabía
reproducirla**. Un cambio aplicado a producción que no vive en el repo es un
cambio que nadie puede repetir ni auditar.

## El orden importa, y equivocarse rompe

**Las migraciones van PRIMERO. `schema.sql` va después.**

Comprobado con controles el 2026-08-27, no supuesto: sobre una base con la forma
de la viva, `CREATE UNIQUE INDEX ... ON mensajes (negocio_id, id_externo)` falla
con `no such column: id_externo`, mientras que el mismo índice sobre una columna
que sí existe pasa. Y `wrangler d1 execute --file` **no es transaccional**: una
sentencia que falla a mitad deja aplicadas las anteriores.

## Cómo se corren

Cada archivo dice en su primera línea la consulta que responde si ya se aplicó.
Comprobar antes:

```bash
npx wrangler d1 execute chuno --remote --json \
  --command "SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'"
```

Una fila devuelta significa que ya está. Vacío, que falta:

```bash
npx wrangler d1 execute chuno --remote --file=src/db/migraciones/002-id-externo.sql
```

Y solo cuando no falte ninguna, el esquema entero:

```bash
npx wrangler d1 execute chuno --remote --file=src/db/schema.sql
```

## Comprobación final

```bash
npx wrangler d1 execute chuno --remote --json --command "SELECT (SELECT count(*) FROM pragma_table_info('mensajes') WHERE name='id_externo') AS id_externo, (SELECT count(*) FROM pragma_table_info('conversaciones') WHERE name='ultimo_cliente_en') AS ultimo_cliente, (SELECT count(*) FROM sqlite_master WHERE name='entrantes') AS bandeja"
```

Esperado: `1`, `1`, `1`.
