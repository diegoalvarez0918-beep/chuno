# D2 — WhatsApp, Messenger e Instagram: plan de implementación

> **Para quien ejecute esto:** los pasos usan casillas (`- [ ]`) para llevar la
> cuenta. Diego pidió **ejecución en línea, sin subagentes**.

**Meta:** convertir la puerta `/webhook/meta/:negocioId` que dejó D1 en tres
canales vivos, con bandeja de entrada durable, descarte de duplicados y la
ventana de 24 horas modelada como concepto del dominio.

**Arquitectura:** la ruta autentica (ya existe), interpreta, **escribe el lote en
`entrantes` antes de responder 200**, y difiere el drenaje. La durabilidad sale
del `INSERT`, no de que el Worker sobreviva. La llave primaria compuesta
`(negocio_id, canal, id_externo)` es lo que vuelve inofensivo el reintento de 36
horas de Meta. La ventana de 24 h se resuelve al construir el canal saliente, no
en la firma de `enviar`.

**Herramientas:** TypeScript sobre Cloudflare Workers (Hono, D1, Durable
Objects), vitest, `npm`. Sin SDK de Meta: `fetch` con timeout.

**Spec:** `docs/superpowers/specs/2026-08-27-d2-canales-meta-design.md`

## Restricciones globales

Aplican a **todas** las tareas. Salen de `CLAUDE.md` y del spec.

- **`src/core/` es sagrado:** no importa nada de Cloudflare, no hace red, no
  llama al LLM. La hora entra **por parámetro**, nunca `Date.now()` adentro.
- **`negocio_id` en toda consulta**, sin excepción.
- **Cero PII en logs.** Ni teléfonos, ni texto de mensajes, ni ids completos.
  Truncar a los últimos 4 caracteres para correlacionar.
- **`JSON.parse` sobre la misma cadena que se firmó.** Nunca `c.req.json()` en
  la ruta de Meta.
- **D1: 100 parámetros vinculados por consulta.** Es un tope duro.
- **Español para el dominio** (`pedido`, `bandeja`, `ventana`, `entrantes`),
  inglés para lo heredado de la plataforma (`fetch`, `handler`, `binding`).
- **Dinero en centavos enteros. Fechas comprometidas `YYYY-MM-DD` sin hora.**
- **Comentarios que explican el porqué**, no el qué.
- Al cerrar cada tarea: `npm test` verde, `npm run typecheck` limpio, y commit.
- **Nunca `git push` ni desplegar** sin que Diego lo pida.
- **Nunca canalizar por `tail` sin `set -o pipefail`** — enmascara el código de
  salida y un fallo se ve como éxito.

---

## Mapa de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `src/core/meta/lote.ts` | `trocear` — puro, respeta el tope de 100 parámetros |
| `src/core/meta/producto.ts` | `productoDeMeta` — despacha por el campo `object` |
| `src/core/meta/ventana.ts` | `ventanaAbierta` — puro, hora por parámetro |
| `src/canales/meta/comun.ts` | `autenticarMeta`, `pedirAlGraph` con timeout |
| `src/canales/meta/whatsapp.ts` | intérprete y envío de WhatsApp |
| `src/canales/meta/mensajeria.ts` | intérprete compartido de Messenger e Instagram |
| `src/canales/meta/messenger.ts` | envío de Messenger |
| `src/canales/meta/instagram.ts` | envío de Instagram |
| `src/db/repos/entrante.ts` | único camino a la tabla `entrantes` |
| `src/db/migraciones/` | `001`, `002`, `003` y su `LEEME.md` |
| `test/core/meta-lote.test.ts` | |
| `test/core/meta-producto.test.ts` | |
| `test/core/meta-ventana.test.ts` | |
| `test/canales/meta-whatsapp.test.ts` | |
| `test/canales/meta-mensajeria.test.ts` | |
| `docs/runbook-app-meta.md` | cómo crea Diego la app de Meta y el número de pruebas |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `src/db/schema.sql` | tabla `entrantes`; columnas `mensajes.id_externo` y `conversaciones.ultimo_cliente_en` |
| `src/db/repos/credencial.ts` | tres claves nuevas en `ClaveCredencial` |
| `src/db/repos/conversacion.ts` | `guardarMensaje` acepta `idExterno`; marca de actividad del cliente |
| `src/canales/salida.ts` | `canalSaliente` resuelve producto y modo de ventana |
| `src/index.ts` | `atenderTelegram` → `atender`; ruta POST de Meta completa; barrido en `scheduled()` |
| `cli/chuno.mjs` | subcomando para conectar los canales de Meta, validando contra el Graph |

---

### Tarea 1: Esquema y migraciones

Va primera porque todo lo demás escribe en estas tablas. Y paga la deuda que
D2 destapa: la D1 viva tiene `catalogo.imagen_clave` y el repo no sabe
reproducirla, porque su `ALTER` quedó en `.tmp/`, que está en `.gitignore`.

**Archivos:**
- Crear: `src/db/migraciones/001-imagen-clave.sql`, `002-id-externo.sql`,
  `003-ultimo-cliente-en.sql`, `LEEME.md`
- Modificar: `src/db/schema.sql`

**Interfaces:**
- Produce: la tabla `entrantes` y las columnas `mensajes.id_externo` y
  `conversaciones.ultimo_cliente_en`, de las que dependen las tareas 5 a 8.

- [ ] **Paso 1: agregar la tabla `entrantes` a `src/db/schema.sql`**

Al final del archivo, siguiendo el estilo idempotente del resto:

```sql
-- --------------------------------------------------------------- entrantes ---
-- La bandeja de entrada de los canales que llegan en lote (Meta).
--
-- Existe por una razón y solo una: Meta manda hasta 1000 actualizaciones por
-- POST y reintenta 36 horas ante fallo, así que hay que responder 200 YA. Si
-- respondiéramos 200 y procesáramos después, un Worker que muere a mitad
-- pierde el lote EN SILENCIO, porque Meta ya se fue tranquilo. Escribir aquí
-- antes de responder mueve la durabilidad del proceso a la base.
--
-- Y la llave primaria compuesta ES el índice de idempotencia: la segunda
-- entrega del mismo lote choca contra ella y el INSERT OR IGNORE la descarta.
-- Sin esto, el reintento de Meta no es una red sino una tormenta de duplicados.
CREATE TABLE IF NOT EXISTS entrantes (
  negocio_id    TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL,               -- whatsapp | messenger | instagram
  id_externo    TEXT NOT NULL,               -- wamid o mid
  -- El MensajeEntrante ya normalizado, como JSON. Se guarda interpretado y no
  -- crudo porque interpretar es puro y barato: hacerlo en la ruta deja la
  -- bandeja pequeña y el drenaje tonto.
  carga         TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  procesado_en  TEXT,                        -- NULL mientras esté pendiente
  PRIMARY KEY (negocio_id, canal, id_externo)
);

-- Lo que barre el cron: pendientes de un negocio.
CREATE INDEX IF NOT EXISTS idx_entrantes_pendientes
  ON entrantes (negocio_id, procesado_en);
```

- [ ] **Paso 2: agregar las dos columnas nuevas a `src/db/schema.sql`**

En `CREATE TABLE mensajes`, después de `texto`:

```sql
  -- Id del mensaje en su canal de origen. Lo que hace que reprocesar un lote
  -- no duplique: Meta reintenta 36 horas y el drenaje puede correr dos veces.
  id_externo      TEXT,
```

Y justo después del `CREATE INDEX idx_msg_purga`:

```sql
-- Único, pero parcial de hecho: SQLite admite varios NULL en un índice único,
-- y los mensajes del agente y del dueño no tienen id externo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_externo
  ON mensajes (negocio_id, id_externo);
```

En `CREATE TABLE conversaciones`, después de `pausado_hasta`:

```sql
  -- Última actividad del CLIENTE, para la ventana de 24 h de Meta. Se escribe
  -- con cualquier evento suyo, incluidos los que no sabemos procesar (una foto,
  -- un sticker): Meta reinicia su ventana con todos ellos, y un reloj nuestro
  -- más conservador que el suyo nos haría pagar una plantilla sin necesidad.
  ultimo_cliente_en TEXT,
```

- [ ] **Paso 3: crear `src/db/migraciones/LEEME.md`**

```markdown
# Migraciones de la D1 viva

`schema.sql` es idempotente y basta para una base nueva. Estos archivos existen
para las bases que **ya existen**, porque `ALTER TABLE` no es idempotente:
corrido dos veces, falla.

**Se corren una sola vez, en orden**, y cada uno trae al lado la consulta que
dice si ya se aplicó. Comprobar antes de correr:

```bash
npx wrangler d1 execute chuno --remote --json \
  --command "SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'"
```

Si devuelve una fila, esa migración ya está. Si devuelve vacío, se aplica:

```bash
npx wrangler d1 execute chuno --remote --file=src/db/migraciones/002-id-externo.sql
```

**Por qué existe esta carpeta:** la columna `catalogo.imagen_clave` se agregó a
producción con un archivo suelto en `.tmp/`, que está en `.gitignore`. La base
viva la tiene y el repo no sabía reproducirla. Un cambio aplicado a producción
que no vive en el repo es un cambio que nadie puede repetir ni auditar.
```

- [ ] **Paso 4: crear los tres archivos de migración**

`001-imagen-clave.sql` — rescatada de `.tmp/`, ya aplicada en producción:

```sql
-- Ya aplicada en producción antes de que existiera esta carpeta.
-- Comprobar:  SELECT name FROM pragma_table_info('catalogo') WHERE name='imagen_clave'
ALTER TABLE catalogo ADD COLUMN imagen_clave TEXT;
```

`002-id-externo.sql`:

```sql
-- Comprobar:  SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'
ALTER TABLE mensajes ADD COLUMN id_externo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_externo ON mensajes (negocio_id, id_externo);
```

`003-ultimo-cliente-en.sql`:

```sql
-- Comprobar:  SELECT name FROM pragma_table_info('conversaciones') WHERE name='ultimo_cliente_en'
ALTER TABLE conversaciones ADD COLUMN ultimo_cliente_en TEXT;
```

- [ ] **Paso 5: aplicar el esquema a la D1 local y comprobarlo**

```bash
npx wrangler d1 execute chuno --local --file=src/db/schema.sql
```

```bash
npx wrangler d1 execute chuno --local --json --command "SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'"
```

Esperado: una fila con `id_externo`. Repetir para
`pragma_table_info('conversaciones')` con `ultimo_cliente_en`, y
`SELECT name FROM sqlite_master WHERE name='entrantes'`.

**Nada de `--remote` en esta tarea.** La D1 de producción se toca al cerrar D2,
con Diego mirando.

- [ ] **Paso 6: commit**

```bash
git add src/db/schema.sql src/db/migraciones && git commit -m "feat(d1): bandeja de entrantes, id externo y marca de ventana

La llave primaria compuesta de entrantes ES el índice de idempotencia: sin ella
el reintento de 36 horas de Meta no es una red sino una tormenta de duplicados.

Y de paso la carpeta de migraciones, que no es de D2 pero que D2 destapa: la
columna imagen_clave se aplicó a producción desde .tmp/, que está en gitignore,
así que la base viva tenía algo que el repo no sabía reproducir."
```

---

### Tarea 2: las dos piezas puras del lote

**Archivos:**
- Crear: `src/core/meta/lote.ts`, `src/core/meta/producto.ts`
- Test: `test/core/meta-lote.test.ts`, `test/core/meta-producto.test.ts`

**Interfaces:**
- Produce: `trocear<T>(filas: readonly T[], columnas: number): T[][]` y
  `productoDeMeta(cuerpo: unknown): ProductoMeta | null`, donde
  `type ProductoMeta = "whatsapp" | "messenger" | "instagram"`. Las usan las
  tareas 3, 4 y 6.

- [ ] **Paso 1: escribir los tests que fallan**

`test/core/meta-lote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PARAMETROS_MAXIMOS, trocear } from "../../src/core/meta/lote";

describe("trocear", () => {
  it("parte un lote de 1000 filas de 5 columnas en 50 trozos", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => i);
    expect(trocear(filas, 5)).toHaveLength(50);
  });

  // La propiedad de verdad, y la que detecta la mutación: si alguien sube
  // PARAMETROS_MAXIMOS o cambia el redondeo, algún trozo pasa el tope de D1 y
  // esto se pone rojo. Contar trozos sin comprobar esto no mide nada.
  it("ningún trozo excede el tope de parámetros de D1", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => i);
    for (const trozo of trocear(filas, 5)) {
      expect(trozo.length * 5).toBeLessThanOrEqual(PARAMETROS_MAXIMOS);
    }
  });

  it("no pierde ni duplica filas", () => {
    const filas = Array.from({ length: 47 }, (_, i) => i);
    expect(trocear(filas, 5).flat()).toEqual(filas);
  });

  it("un lote vacío no produce trozos", () => {
    expect(trocear([], 5)).toEqual([]);
  });

  it("se niega si una sola fila ya excede el tope", () => {
    expect(() => trocear([1], 101)).toThrow();
  });
});
```

`test/core/meta-producto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { productoDeMeta } from "../../src/core/meta/producto";

describe("productoDeMeta", () => {
  it("reconoce los tres objetos de Meta", () => {
    expect(productoDeMeta({ object: "whatsapp_business_account" })).toBe("whatsapp");
    expect(productoDeMeta({ object: "page" })).toBe("messenger");
    expect(productoDeMeta({ object: "instagram" })).toBe("instagram");
  });

  // Meta manda notificaciones de TODOS los campos a los que la app esté
  // suscrita. Uno que no nos interesa no es un error suyo: la ruta responde 200.
  it("devuelve null para un objeto ajeno", () => {
    expect(productoDeMeta({ object: "permissions" })).toBeNull();
  });

  it("devuelve null para basura, sin reventar", () => {
    expect(productoDeMeta(null)).toBeNull();
    expect(productoDeMeta("hola")).toBeNull();
    expect(productoDeMeta({})).toBeNull();
    expect(productoDeMeta({ object: 42 })).toBeNull();
  });
});
```

- [ ] **Paso 2: correr los tests y verlos fallar**

```bash
npx vitest run test/core/meta-lote.test.ts test/core/meta-producto.test.ts
```

Esperado: FAIL, no encuentra los módulos.

- [ ] **Paso 3: implementar**

`src/core/meta/lote.ts`:

```ts
/**
 * Partir un lote para que quepa en D1.
 *
 * D1 admite 100 parámetros vinculados por consulta, y Meta manda hasta 1000
 * actualizaciones por POST. Sin trocear, un lote grande no falla al escribirse:
 * falla al prepararse, que es peor, porque ocurre después de haber autenticado
 * y antes de haber guardado nada.
 */
export const PARAMETROS_MAXIMOS = 100;

export function trocear<T>(filas: readonly T[], columnas: number): T[][] {
  const porTrozo = Math.floor(PARAMETROS_MAXIMOS / columnas);
  if (porTrozo < 1) {
    throw new Error(`una fila de ${columnas} columnas ya excede el tope de D1`);
  }

  const trozos: T[][] = [];
  for (let i = 0; i < filas.length; i += porTrozo) {
    trozos.push(filas.slice(i, i + porTrozo));
  }
  return trozos;
}
```

`src/core/meta/producto.ts`:

```ts
/**
 * Qué producto de Meta mandó este webhook.
 *
 * La ruta es una sola porque la app de Meta es una sola: los tres productos
 * comparten Callback URL y App Secret, y se distinguen por el campo `object`.
 */
export type ProductoMeta = "whatsapp" | "messenger" | "instagram";

const POR_OBJETO: Readonly<Record<string, ProductoMeta>> = {
  whatsapp_business_account: "whatsapp",
  page: "messenger",
  instagram: "instagram",
};

export function productoDeMeta(cuerpo: unknown): ProductoMeta | null {
  const objeto = (cuerpo as { object?: unknown } | null)?.object;
  return typeof objeto === "string" ? (POR_OBJETO[objeto] ?? null) : null;
}
```

- [ ] **Paso 4: correr los tests y verlos pasar**

```bash
npx vitest run test/core/meta-lote.test.ts test/core/meta-producto.test.ts
```

- [ ] **Paso 5: comprobar la mutación**

Cambiar `PARAMETROS_MAXIMOS` a `105` y volver a correr. El test "ningún trozo
excede el tope" **tiene que ponerse rojo**. Si pasa, el test no mide nada y hay
que arreglarlo antes de seguir. Devolver el valor a `100`.

- [ ] **Paso 6: commit**

```bash
npm test && npm run typecheck && git add -A && git commit -m "feat(core): trocear lotes al tope de D1 y despachar por el objeto de Meta

El troceo se verifica por mutación: subir el tope a 105 tiene que poner el test
en rojo, o estaría contando trozos en vez de medir la propiedad."
```

---

### Tarea 3: el intérprete de WhatsApp

**Archivos:**
- Crear: `src/canales/meta/comun.ts`, `src/canales/meta/whatsapp.ts`
- Test: `test/canales/meta-whatsapp.test.ts`

**Interfaces:**
- Consume: `MensajeEntrante` de `src/canales/tipos.ts`, `recortarTexto` de
  `src/core/limites.ts`.
- Produce:
  - `interface MarcaActividad { readonly canalChatId: string; readonly enISO: string }` en `comun.ts`
  - `interpretarWhatsApp(cuerpo: unknown): MensajeEntrante[]`
  - `marcasWhatsApp(cuerpo: unknown): MarcaActividad[]`
  Las usa la tarea 6.

- [ ] **Paso 1: escribir el test que falla**

`test/canales/meta-whatsapp.test.ts`. Los payloads son los de la documentación
de Meta, recortados a lo que leemos:

```ts
import { describe, expect, it } from "vitest";
import { interpretarWhatsApp, marcasWhatsApp } from "../../src/canales/meta/whatsapp";

const mensajeDe = (id: string, texto: string) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ profile: { name: "Sheena Nelson" }, wa_id: "573001112233" }],
            messages: [
              {
                id,
                from: "573001112233",
                type: "text",
                timestamp: "1755000000",
                text: { body: texto },
              },
            ],
          },
        },
      ],
    },
  ],
});

describe("interpretar de WhatsApp", () => {
  it("normaliza un mensaje de texto con su nombre y su id externo", () => {
    expect(interpretarWhatsApp(mensajeDe("wamid.AAA", "quiero unas gafas"))).toEqual([
      {
        canal: "whatsapp",
        canalChatId: "573001112233",
        texto: "quiero unas gafas",
        autorNombre: "Sheena Nelson",
        idExterno: "wamid.AAA",
      },
    ]);
  });

  // La razón de que el contrato devuelva LISTA: Meta agrega, y con un solo
  // mensaje de retorno el lote entregaría uno y descartaría el resto en silencio.
  it("saca todos los mensajes de un lote repartido en varios entry", () => {
    const lote = {
      object: "whatsapp_business_account",
      entry: [
        mensajeDe("wamid.A", "uno").entry[0],
        mensajeDe("wamid.B", "dos").entry[0],
        mensajeDe("wamid.C", "tres").entry[0],
      ],
    };

    expect(interpretarWhatsApp(lote).map((m) => m.idExterno)).toEqual([
      "wamid.A",
      "wamid.B",
      "wamid.C",
    ]);
  });

  // Un webhook de `statuses` describe el estado de un mensaje NUESTRO. Tratarlo
  // como entrante haría que el agente se contestara a sí mismo.
  it("ignora un lote de estados de entrega", () => {
    const estados = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.AAA", status: "delivered", recipient_id: "573001112233" },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(interpretarWhatsApp(estados)).toEqual([]);
  });

  it("ignora lo que no es texto", () => {
    const imagen = mensajeDe("wamid.IMG", "");
    imagen.entry[0].changes[0].value.messages[0].type = "image";
    delete (imagen.entry[0].changes[0].value.messages[0] as { text?: unknown }).text;

    expect(interpretarWhatsApp(imagen)).toEqual([]);
  });

  it("deja el nombre en null si el payload no trae contactos", () => {
    const sinContacto = mensajeDe("wamid.SC", "hola");
    delete (sinContacto.entry[0].changes[0].value as { contacts?: unknown }).contacts;

    expect(interpretarWhatsApp(sinContacto)[0].autorNombre).toBeNull();
  });

  it("no revienta con basura", () => {
    expect(interpretarWhatsApp(null)).toEqual([]);
    expect(interpretarWhatsApp({ entry: "no soy una lista" })).toEqual([]);
  });
});

describe("marcas de actividad de WhatsApp", () => {
  it("marca un mensaje de texto", () => {
    expect(marcasWhatsApp(mensajeDe("wamid.AAA", "hola"))).toEqual([
      { canalChatId: "573001112233", enISO: new Date(1755000000 * 1000).toISOString() },
    ]);
  });

  // Este es el test que evita pagar una plantilla sin necesidad: Meta reinicia
  // su ventana de 24 h con CUALQUIER mensaje del cliente, incluidos los que
  // nosotros descartamos. Si nuestro reloj no los cuenta, se cierra antes que
  // el suyo y mandamos una plantilla de pago cuando podíamos escribir gratis.
  it("marca también lo que interpretar descarta", () => {
    const imagen = mensajeDe("wamid.IMG", "");
    imagen.entry[0].changes[0].value.messages[0].type = "image";

    expect(interpretarWhatsApp(imagen)).toEqual([]);
    expect(marcasWhatsApp(imagen)).toHaveLength(1);
  });

  it("no marca un lote de estados: ese mensaje es nuestro, no del cliente", () => {
    const estados = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.A", status: "read" }] } }] }],
    };

    expect(marcasWhatsApp(estados)).toEqual([]);
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar**

```bash
npx vitest run test/canales/meta-whatsapp.test.ts
```

Esperado: FAIL, no encuentra `src/canales/meta/whatsapp`.

- [ ] **Paso 3: implementar `src/canales/meta/comun.ts`**

```ts
/**
 * Lo que comparten los tres productos de Meta.
 *
 * La app de Meta es UNA sola —la del negocio—, así que los tres comparten
 * Callback URL, App Secret y firma. Lo único que cambia entre ellos es la forma
 * del payload y el endpoint de envío.
 */

/**
 * Un evento del cliente, con su hora, sirva o no su contenido.
 *
 * Existe aparte de `interpretar` porque las dos preguntas son distintas:
 * `interpretar` responde "¿hay algo que contestar?" y esto responde "¿el cliente
 * dio señales de vida?". Meta reinicia su ventana de 24 h con lo segundo.
 */
export interface MarcaActividad {
  readonly canalChatId: string;
  readonly enISO: string;
}

/** Los `timestamp` de Meta son segundos Unix, y llegan como número o como texto. */
export function horaDeMeta(timestamp: unknown): string | null {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || segundos <= 0) return null;
  return new Date(segundos * 1000).toISOString();
}

/** `entry` y compañía llegan de fuera: nunca asumimos que sean listas. */
export function lista<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}
```

- [ ] **Paso 4: implementar `src/canales/meta/whatsapp.ts`**

```ts
import { recortarTexto } from "../../core/limites";
import type { MensajeEntrante } from "../tipos";
import { horaDeMeta, lista, type MarcaActividad } from "./comun";

/** Solo la parte del webhook de WhatsApp que leemos. */
interface Contacto {
  profile?: { name?: string };
  wa_id?: string;
}

interface MensajeWA {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string | number;
  text?: { body?: string };
}

interface Valor {
  contacts?: Contacto[];
  messages?: MensajeWA[];
  // Un lote de estados de NUESTROS mensajes. No trae `messages`, así que se
  // descarta solo; se declara para que quede escrito que existe.
  statuses?: unknown[];
}

function* valores(cuerpo: unknown): Generator<Valor> {
  for (const entrada of lista<{ changes?: unknown }>((cuerpo as { entry?: unknown })?.entry)) {
    for (const cambio of lista<{ value?: Valor }>(entrada?.changes)) {
      if (cambio?.value) yield cambio.value;
    }
  }
}

export function interpretarWhatsApp(cuerpo: unknown): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];

  for (const valor of valores(cuerpo)) {
    // El nombre viene en un array paralelo al de mensajes, indexado por wa_id.
    const nombres = new Map<string, string>();
    for (const contacto of lista<Contacto>(valor.contacts)) {
      const id = contacto?.wa_id;
      const nombre = contacto?.profile?.name;
      if (id && nombre) nombres.set(id, nombre);
    }

    for (const mensaje of lista<MensajeWA>(valor.messages)) {
      const texto = mensaje?.type === "text" ? mensaje?.text?.body?.trim() : undefined;
      const de = mensaje?.from;
      if (!mensaje?.id || !de || !texto) continue;

      salida.push({
        canal: "whatsapp",
        canalChatId: de,
        // Se recorta en el borde, igual que Telegram: lo que se guarda es lo
        // mismo que ve el modelo, y un mensaje enorme no infla ni el costo ni
        // el hilo para siempre.
        texto: recortarTexto(texto),
        autorNombre: nombres.get(de) ?? null,
        idExterno: mensaje.id,
      });
    }
  }

  return salida;
}

export function marcasWhatsApp(cuerpo: unknown): MarcaActividad[] {
  const salida: MarcaActividad[] = [];

  for (const valor of valores(cuerpo)) {
    for (const mensaje of lista<MensajeWA>(valor.messages)) {
      const de = mensaje?.from;
      const enISO = horaDeMeta(mensaje?.timestamp);
      // Sin filtrar por tipo a propósito: una foto o un audio también reinician
      // la ventana de Meta, aunque no sepamos qué contestar.
      if (de && enISO) salida.push({ canalChatId: de, enISO });
    }
  }

  return salida;
}
```

- [ ] **Paso 5: correr el test y verlo pasar**

```bash
npx vitest run test/canales/meta-whatsapp.test.ts
```

- [ ] **Paso 6: commit**

```bash
npm test && npm run typecheck && git add -A && git commit -m "feat(canales): intérprete de WhatsApp, con marcas de actividad aparte

Las marcas van separadas de interpretar porque responden preguntas distintas:
una es '¿hay algo que contestar?' y la otra '¿el cliente dio señales de vida?'.
Meta reinicia su ventana de 24 h con la segunda, incluidos los eventos que
nosotros descartamos — y un reloj más conservador que el suyo nos haría pagar
una plantilla pudiendo escribir gratis."
```

---

### Tarea 4: el intérprete compartido de Messenger e Instagram

Comparten la forma **exacta** del payload, verificada contra la documentación.
Lo único que difiere es el `object` y a dónde se envía. Un intérprete
parametrizado, no dos copias.

**Archivos:**
- Crear: `src/canales/meta/mensajeria.ts`
- Test: `test/canales/meta-mensajeria.test.ts`

**Interfaces:**
- Consume: `MarcaActividad`, `horaDeMeta`, `lista` de `./comun`.
- Produce: `interpretarMensajeria(cuerpo: unknown, canal: string): MensajeEntrante[]`
  y `marcasMensajeria(cuerpo: unknown): MarcaActividad[]`. Las usa la tarea 6.

- [ ] **Paso 1: escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { interpretarMensajeria, marcasMensajeria } from "../../src/canales/meta/mensajeria";

const eventoDe = (mensaje: Record<string, unknown>) => ({
  entry: [
    {
      messaging: [
        {
          sender: { id: "IGSID-999" },
          recipient: { id: "PAGE-1" },
          timestamp: 1755000000000,
          message: mensaje,
        },
      ],
    },
  ],
});

describe("interpretar de Messenger e Instagram", () => {
  it("normaliza un mensaje de texto y sella el canal que le pasan", () => {
    const cuerpo = eventoDe({ mid: "mid.ABC", text: "¿ya está mi pedido?" });

    expect(interpretarMensajeria(cuerpo, "messenger")).toEqual([
      {
        canal: "messenger",
        canalChatId: "IGSID-999",
        texto: "¿ya está mi pedido?",
        // El webhook no trae el nombre: solo un id opaco. Sacarlo cuesta una
        // llamada aparte al Graph, y D2 no la hace.
        autorNombre: null,
        idExterno: "mid.ABC",
      },
    ]);

    expect(interpretarMensajeria(cuerpo, "instagram")[0].canal).toBe("instagram");
  });

  // Meta devuelve por webhook lo que nosotros mismos enviamos. Sin este filtro
  // el agente se contesta a sí mismo en bucle y paga el modelo en cada vuelta.
  it("ignora el eco de nuestro propio mensaje", () => {
    const eco = eventoDe({ mid: "mid.ECO", text: "listo, te confirmo", is_echo: true });

    expect(interpretarMensajeria(eco, "instagram")).toEqual([]);
  });

  it("ignora entregas y lecturas, que no traen mensaje", () => {
    const entrega = {
      entry: [{ messaging: [{ sender: { id: "X" }, delivery: { mids: ["mid.A"] } }] }],
    };

    expect(interpretarMensajeria(entrega, "messenger")).toEqual([]);
  });

  it("ignora un adjunto sin texto", () => {
    const foto = eventoDe({ mid: "mid.FOTO", attachments: [{ type: "image" }] });

    expect(interpretarMensajeria(foto, "messenger")).toEqual([]);
  });

  it("no revienta con basura", () => {
    expect(interpretarMensajeria(null, "messenger")).toEqual([]);
    expect(interpretarMensajeria({ entry: 7 }, "messenger")).toEqual([]);
  });
});

describe("marcas de actividad de Messenger e Instagram", () => {
  it("marca también el adjunto que interpretar descarta", () => {
    const foto = eventoDe({ mid: "mid.FOTO", attachments: [{ type: "image" }] });

    expect(interpretarMensajeria(foto, "messenger")).toEqual([]);
    expect(marcasMensajeria(foto)).toEqual([
      { canalChatId: "IGSID-999", enISO: new Date(1755000000000).toISOString() },
    ]);
  });

  it("no marca el eco: ese mensaje es nuestro", () => {
    const eco = eventoDe({ mid: "mid.ECO", text: "hola", is_echo: true });

    expect(marcasMensajeria(eco)).toEqual([]);
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar**

```bash
npx vitest run test/canales/meta-mensajeria.test.ts
```

- [ ] **Paso 3: implementar `src/canales/meta/mensajeria.ts`**

Ojo con la hora: Messenger e Instagram mandan **milisegundos**, no segundos como
WhatsApp. Por eso este archivo no usa `horaDeMeta`.

```ts
import { recortarTexto } from "../../core/limites";
import type { MensajeEntrante } from "../tipos";
import { lista, type MarcaActividad } from "./comun";

/**
 * Messenger e Instagram comparten la forma exacta del payload — verificado
 * contra la documentación de Meta, no supuesto. Lo único que los distingue es
 * el campo `object` del sobre y a dónde se envía la respuesta.
 */
interface Evento {
  sender?: { id?: string };
  /** Milisegundos Unix aquí, a diferencia de WhatsApp, que manda segundos. */
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

function* eventos(cuerpo: unknown): Generator<Evento> {
  for (const entrada of lista<{ messaging?: unknown }>((cuerpo as { entry?: unknown })?.entry)) {
    for (const evento of lista<Evento>(entrada?.messaging)) {
      if (evento) yield evento;
    }
  }
}

function horaDelEvento(evento: Evento): string | null {
  const ms = Number(evento?.timestamp);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

export function interpretarMensajeria(cuerpo: unknown, canal: string): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];

  for (const evento of eventos(cuerpo)) {
    const mensaje = evento?.message;
    // Sin `message` es una entrega, una lectura o un postback: nada que contestar.
    if (!mensaje || mensaje.is_echo) continue;

    const texto = mensaje.text?.trim();
    const chatId = evento?.sender?.id;
    if (!chatId || !mensaje.mid || !texto) continue;

    salida.push({
      canal,
      canalChatId: chatId,
      texto: recortarTexto(texto),
      autorNombre: null,
      idExterno: mensaje.mid,
    });
  }

  return salida;
}

export function marcasMensajeria(cuerpo: unknown): MarcaActividad[] {
  const salida: MarcaActividad[] = [];

  for (const evento of eventos(cuerpo)) {
    // El eco es nuestro mensaje, no del cliente: no reinicia ninguna ventana.
    if (!evento?.message || evento.message.is_echo) continue;

    const chatId = evento?.sender?.id;
    const enISO = horaDelEvento(evento);
    if (chatId && enISO) salida.push({ canalChatId: chatId, enISO });
  }

  return salida;
}
```

- [ ] **Paso 4: correr el test y verlo pasar**

```bash
npx vitest run test/canales/meta-mensajeria.test.ts
```

- [ ] **Paso 5: commit**

```bash
npm test && npm run typecheck && git add -A && git commit -m "feat(canales): intérprete compartido de Messenger e Instagram

Comparten la forma exacta del payload, así que comparten intérprete
parametrizado por canal. Y mandan la hora en milisegundos, no en segundos como
WhatsApp: por eso este archivo no usa horaDeMeta."
```

---

### Tarea 5: la bandeja, el id externo y `atender` compartido

**Archivos:**
- Crear: `src/db/repos/entrante.ts`
- Modificar: `src/db/repos/conversacion.ts`, `src/index.ts`

**Interfaces:**
- Consume: `trocear` (tarea 2), `MensajeEntrante`.
- Produce:
  - `encolar(db, negocioId, mensajes: readonly MensajeEntrante[]): Promise<void>`
  - `pendientesDe(db, negocioId, limite: number): Promise<MensajeEntrante[]>`
  - `marcarProcesado(db, negocioId, canal, idExterno): Promise<void>`
  - `negociosConPendientes(db, limite: number): Promise<string[]>`
  - `guardarMensaje(..., idExterno: string | null = null)` — quinto parámetro nuevo
  - `marcarActividadCliente(db, negocioId, canal, canalChatId, enISO): Promise<void>`
  - `atender(env, negocioId, mensajes, origen): Promise<void>` en `index.ts`
  Las usa la tarea 6.

- [ ] **Paso 1: crear `src/db/repos/entrante.ts`**

```ts
import { trocear } from "../../core/meta/lote";
import type { MensajeEntrante } from "../../canales/tipos";
import { ahoraISO } from "../id";

/**
 * La bandeja de entrada de los canales que llegan en lote.
 *
 * Único camino hacia la tabla `entrantes`. Todo pasa filtrado por negocio menos
 * `negociosConPendientes`, que es un barrido de cron y devuelve SOLO ids, nunca
 * contenido — el mismo trato que ya tienen el vigía y la purga.
 */

/**
 * Cinco y no seis: `procesado_en` va como literal NULL en el SQL, no como
 * parámetro vinculado. Contarlo reservaría un hueco de más en cada fila y el
 * troceo desperdiciaría un quinto del cupo de D1.
 */
const COLUMNAS = 5; // negocio_id, canal, id_externo, carga, creado_en

/**
 * Deja el lote en la bandeja. Idempotente por la llave primaria compuesta:
 * cuando Meta reintenta —y reintenta durante 36 horas— la segunda entrega
 * choca contra ella y se descarta sin ruido.
 */
export async function encolar(
  db: D1Database,
  negocioId: string,
  mensajes: readonly MensajeEntrante[],
): Promise<void> {
  if (mensajes.length === 0) return;

  const ahora = ahoraISO();
  // Sin id externo no hay llave de idempotencia, y encolarlo permitiría que un
  // reintento lo duplicara. Se descarta aquí y no antes para que `interpretar`
  // no tenga que conocer la política de la bandeja.
  const conId = mensajes.filter((m) => m.idExterno);

  const sentencias = trocear(conId, COLUMNAS).map((trozo) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO entrantes
           (negocio_id, canal, id_externo, carga, creado_en, procesado_en)
         VALUES ${trozo.map(() => "(?, ?, ?, ?, ?, NULL)").join(", ")}`,
      )
      .bind(
        ...trozo.flatMap((m) => [negocioId, m.canal, m.idExterno, JSON.stringify(m), ahora]),
      ),
  );

  if (sentencias.length > 0) await db.batch(sentencias);
}
```

```ts
export async function pendientesDe(
  db: D1Database,
  negocioId: string,
  limite: number,
): Promise<MensajeEntrante[]> {
  const { results } = await db
    .prepare(
      `SELECT carga FROM entrantes
       WHERE negocio_id = ? AND procesado_en IS NULL
       ORDER BY creado_en LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<{ carga: string }>();

  return (results ?? []).flatMap((f) => {
    try {
      return [JSON.parse(f.carga) as MensajeEntrante];
    } catch {
      // Una carga ilegible no puede bloquear la bandeja entera. Se salta; la
      // fila queda pendiente y se ve en la consulta de diagnóstico.
      return [];
    }
  });
}

export async function marcarProcesado(
  db: D1Database,
  negocioId: string,
  canal: string,
  idExterno: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE entrantes SET procesado_en = ?
       WHERE negocio_id = ? AND canal = ? AND id_externo = ?`,
    )
    .bind(ahoraISO(), negocioId, canal, idExterno)
    .run();
}

/**
 * Qué negocios tienen algo sin drenar. Barrido de cron: cruza negocios a
 * propósito, como el vigía y la purga, y por eso devuelve solo ids.
 */
export async function negociosConPendientes(
  db: D1Database,
  limite: number,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT negocio_id FROM entrantes
       WHERE procesado_en IS NULL LIMIT ?`,
    )
    .bind(limite)
    .all<{ negocio_id: string }>();

  return (results ?? []).map((f) => f.negocio_id);
}
```

- [ ] **Paso 2: `guardarMensaje` acepta el id externo**

En `src/db/repos/conversacion.ts`, cambiar la firma y el `INSERT`:

```ts
export async function guardarMensaje(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  autor: AutorMensaje,
  texto: string,
  /**
   * Id del mensaje en su canal. Con él, reprocesar un lote no duplica — y el
   * drenaje SÍ puede correr dos veces, porque solo marca la fila como procesada
   * después de que el objeto acuse recibo. Null para lo que escribimos nosotros.
   */
  idExterno: string | null = null,
): Promise<void> {
  const ahora = ahoraISO();

  await db.batch([
    db
      .prepare(
        // OR IGNORE por el índice único (negocio_id, id_externo). No afecta a
        // los mensajes del agente ni del dueño: SQLite admite muchos NULL en un
        // índice único, así que los suyos nunca chocan entre sí.
        `INSERT OR IGNORE INTO mensajes
           (id, negocio_id, conversacion_id, autor, texto, id_externo, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(nuevoId("msg"), negocioId, conversacionId, autor, texto, idExterno, ahora),
    db
      .prepare("UPDATE conversaciones SET actualizado_en = ? WHERE negocio_id = ? AND id = ?")
      .bind(ahora, negocioId, conversacionId),
  ]);
}
```

- [ ] **Paso 3: agregar `marcarActividadCliente` a `conversacion.ts`**

```ts
/**
 * La hora del último evento del cliente, para la ventana de 24 h de Meta.
 *
 * Solo actualiza, nunca crea: si el primer contacto de alguien es un sticker,
 * no hay conversación todavía y tampoco hay ventana que proteger.
 *
 * Y solo hacia adelante. Un lote de Meta puede llegar desordenado, y un reloj
 * que retrocede cerraría una ventana que está abierta.
 */
export async function marcarActividadCliente(
  db: D1Database,
  negocioId: string,
  canal: string,
  canalChatId: string,
  enISO: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE conversaciones SET ultimo_cliente_en = ?
       WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?
         AND (ultimo_cliente_en IS NULL OR ultimo_cliente_en < ?)`,
    )
    .bind(enISO, negocioId, canal, canalChatId, enISO)
    .run();
}
```

- [ ] **Paso 4: generalizar `atenderTelegram` a `atender` en `src/index.ts`**

Reemplazar la función actual. Deja de recibir el cuerpo crudo y el canal, y pasa
a recibir los mensajes ya interpretados — que es lo que necesitan los dos
llamadores.

```ts
/**
 * Guarda cada mensaje entrante y despierta a su Durable Object.
 *
 * La comparten Telegram y los tres canales de Meta. El mensaje se guarda de
 * inmediato: si el agente falla después, el hilo del cliente no se pierde.
 */
async function atender(
  env: Env,
  negocioId: string,
  mensajes: readonly MensajeEntrante[],
  origen: string,
): Promise<void> {
  for (const entrante of mensajes) {
    const conversacion = await obtenerOCrearConversacion(
      env.DB,
      negocioId,
      entrante.canal,
      entrante.canalChatId,
      entrante.autorNombre,
    );

    await guardarMensaje(
      env.DB,
      negocioId,
      conversacion.id,
      "cliente",
      entrante.texto,
      entrante.idExterno,
    );

    const agente = idDeConversacion(env.AGENTE, negocioId, conversacion.id);
    await agente.fetch("https://agente/mensaje", {
      method: "POST",
      body: JSON.stringify({
        negocioId,
        conversacionId: conversacion.id,
        canalChatId: entrante.canalChatId,
        // El objeto no puede deducir su propia URL pública, y la necesita para
        // armar el link de la foto que el canal va a descargar.
        origen,
      }),
    });
  }
}
```

Y en las dos rutas de Telegram, reemplazar la llamada:

```ts
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(await leerCuerpo());
  } catch {
    // Autenticado pero ilegible: no hay nada que procesar y reintentar no lo
    // arregla. 200 para que el canal no entre en bucle.
    return c.text("ok");
  }

  await atender(c.env, negocioId, canal.interpretar(cuerpo), new URL(c.req.url).origin);
  return c.text("ok");
```

- [ ] **Paso 5: comprobar que nada se rompió**

```bash
npm test && npm run typecheck
```

Esperado: los 223 tests verdes. Ninguno cubre `atender` —hace red y toca D1—,
así que lo que se está comprobando aquí es que el refactor no rompió lo puro.

- [ ] **Paso 6: commit**

```bash
git add -A && git commit -m "feat(db): bandeja de entrantes, id externo en mensajes y atender compartido

El id externo cierra el cabo que dejó D1: viajaba en el contrato y no lo leía
nadie. Con él, el drenaje puede correr dos veces sin duplicar, que es lo que
permite marcar la fila como procesada DESPUÉS de que el objeto acuse recibo —
al revés, un fallo al despertarlo dejaría el mensaje guardado y sin respuesta."
```

---

### Tarea 6: la ruta de Meta, el drenaje y el barrido del cron

Aquí se junta todo lo anterior. Es la tarea que hace que D2 reciba mensajes.

**Archivos:**
- Modificar: `src/canales/meta/comun.ts`, `src/index.ts`

**Interfaces:**
- Consume: todo lo de las tareas 2 a 5.
- Produce: `autenticarMeta(peticion, leerCuerpo, appSecret): Promise<boolean>` en
  `comun.ts`, que la tarea 8 asigna como `autenticar` de los tres canales.

- [ ] **Paso 1: agregar `autenticarMeta` a `src/canales/meta/comun.ts`**

```ts
import { firmaConFormaValida, firmaValida } from "../../core/meta/entrada";

/**
 * La autenticación de los tres productos, en un solo cuerpo.
 *
 * La llama la ruta directamente —tiene que autenticar ANTES de saber qué
 * producto es, y un canal no se construye sin producto— y los tres canales la
 * asignan como su `autenticar`. Misma función, un llamador real: nada de un
 * método que solo ejercitan los tests.
 *
 * El cuerpo entra como función porque leerlo cuesta: primero se comprueba que
 * la cabecera tenga forma de firma, y solo entonces se lee.
 */
export async function autenticarMeta(
  peticion: Request,
  leerCuerpo: () => Promise<string>,
  appSecret: string,
): Promise<boolean> {
  const cabecera = peticion.headers.get("x-hub-signature-256");
  if (!firmaConFormaValida(cabecera)) return false;

  return firmaValida(await leerCuerpo(), cabecera, appSecret);
}
```

- [ ] **Paso 2: reescribir `app.post("/webhook/meta/:negocioId")` en `src/index.ts`**

```ts
/** Cuántos pendientes drena una pasada. Acota el trabajo de una invocación. */
const DRENAJE_MAXIMO = 200;

app.post("/webhook/meta/:negocioId", async (c) => {
  const negocioId = c.req.param("negocioId");
  const leerCuerpo = lectorDeCuerpo(c);

  // Lo barato primero: sin una cabecera con forma de firma no hay consulta ni
  // descifrado. Sin esto la puerta es un amplificador — el atacante gasta un
  // paquete y nosotros una consulta.
  if (!firmaConFormaValida(c.req.header("x-hub-signature-256") ?? null)) {
    return c.text("no autorizado", 401);
  }

  const appSecret = await leerCredencial(
    c.env.DB,
    negocioId,
    "meta_app_secret",
    c.env.CLAVE_CIFRADO,
  );
  // Sin credencial responde igual que con firma mala: desde afuera no se puede
  // distinguir un negocio que no existe de uno mal configurado.
  if (!appSecret) return c.text("no autorizado", 401);

  if (!(await autenticarMeta(c.req.raw, leerCuerpo, appSecret))) {
    return c.text("no autorizado", 401);
  }

  // ── autenticado ────────────────────────────────────────────────────────
  let cuerpo: unknown;
  try {
    // Sobre la MISMA cadena que se firmó, nunca c.req.json(): la firma se
    // calcula sobre esos bytes exactos y volver a leer no garantiza lo mismo.
    cuerpo = JSON.parse(await leerCuerpo());
  } catch {
    return c.text("ok");
  }

  const producto = productoDeMeta(cuerpo);
  // Meta manda notificaciones de todos los campos a los que la app esté
  // suscrita. Una que no nos interesa no es un error suyo: ignorar no es fallar.
  if (!producto) return c.text("ok");

  const mensajes =
    producto === "whatsapp"
      ? interpretarWhatsApp(cuerpo)
      : interpretarMensajeria(cuerpo, producto);

  const marcas = producto === "whatsapp" ? marcasWhatsApp(cuerpo) : marcasMensajeria(cuerpo);

  try {
    // El orden es el diseño entero: la fila queda escrita ANTES de prometerle
    // nada a Meta. Si esto falla devolvemos 500 y Meta reintenta 36 horas, que
    // aquí es exactamente la red que queremos. Es el único punto del flujo
    // donde el 200 automático sería el error.
    await encolar(c.env.DB, negocioId, mensajes);
  } catch (e) {
    console.error("meta: no se pudo encolar", {
      negocio: negocioId.slice(-4),
      error: e instanceof Error ? e.message : "desconocido",
    });
    return c.text("no se pudo recibir", 500);
  }

  const origen = new URL(c.req.url).origin;
  c.executionCtx.waitUntil(
    (async () => {
      // Las marcas van primero: la ventana de 24 h tiene que estar al día antes
      // de que el agente intente contestar.
      for (const marca of marcas) {
        await marcarActividadCliente(c.env.DB, negocioId, producto, marca.canalChatId, marca.enISO);
      }
      await drenar(c.env, negocioId, origen);
    })(),
  );

  return c.text("ok");
});
```

- [ ] **Paso 3: escribir `drenar` en `src/index.ts`**

```ts
/**
 * Vacía la bandeja de un negocio.
 *
 * `marcarProcesado` va DESPUÉS de que `atender` termine, no antes: si se
 * marcara primero, un fallo al despertar el Durable Object dejaría el mensaje
 * guardado y sin respuesta, que es el modo de falla que el cliente sí nota.
 * Reintentar es seguro porque `mensajes` tiene índice único por id externo.
 */
async function drenar(env: Env, negocioId: string, origen: string): Promise<number> {
  const pendientes = await pendientesDe(env.DB, negocioId, DRENAJE_MAXIMO);

  let drenados = 0;
  for (const mensaje of pendientes) {
    try {
      await atender(env, negocioId, [mensaje], origen);
      if (mensaje.idExterno) {
        await marcarProcesado(env.DB, negocioId, mensaje.canal, mensaje.idExterno);
      }
      drenados++;
    } catch (e) {
      // Uno que falla no puede llevarse el resto del lote. Queda pendiente y lo
      // recoge el cron; nunca el texto del mensaje en el log.
      console.error("meta: fallo drenando uno", {
        negocio: negocioId.slice(-4),
        canal: mensaje.canal,
        error: e instanceof Error ? e.message : "desconocido",
      });
    }
  }

  return drenados;
}
```

- [ ] **Paso 4: agregar el barrido al `scheduled()` de `src/index.ts`**

Dentro del `ctx.waitUntil`, **antes** del resembrado de la demo:

```ts
        // Recoge lo que un drenaje interrumpido dejó a medias. No es un cron
        // nuevo: es el del vigía con una responsabilidad más. Peor caso de
        // latencia para un mensaje huérfano, 30 minutos — contra perderlo.
        try {
          // Un scheduled() no tiene petición, así que no puede deducir su URL
          // pública. Sale de una var, no de un valor inventado: una foto drenada
          // por el cron llevaría un link roto y nadie lo notaría hasta que un
          // cliente lo abriera.
          const origen = env.URL_PUBLICA;
          for (const negocioId of await negociosConPendientes(env.DB, 50)) {
            const drenados = await drenar(env, negocioId, origen);
            if (drenados > 0) console.log("bandeja drenada", { negocio: negocioId.slice(-4), drenados });
          }
        } catch (e) {
          console.error("barrido de bandeja falló", e instanceof Error ? e.message : "desconocido");
        }
```

**`URL_PUBLICA` es nueva y hay que declararla en tres sitios**, o esto no
compila:

En `wrangler.jsonc`, dentro de `vars`:

```jsonc
    // El Worker no puede deducir su propia URL desde un cron: no hay petición.
    // La necesita para armar los links de las fotos del catálogo.
    "URL_PUBLICA": "https://chuno.<subdominio>.workers.dev"
```

En `src/env.ts`, dentro de `interface Env`:

```ts
  /** URL pública del Worker. La usa el cron, que no tiene petición de dónde deducirla. */
  readonly URL_PUBLICA: string;
```

Y en `.dev.vars` para el desarrollo local, con `http://localhost:8787`.

- [ ] **Paso 5: comprobar**

```bash
npm test && npm run typecheck
```

- [ ] **Paso 6: commit**

```bash
git add -A && git commit -m "feat(meta): recibir los tres canales, con bandeja durable y drenaje diferido

El INSERT va antes del 200 y ahí está todo el diseño: la durabilidad sale de
que la fila esté escrita, no de que el Worker sobreviva. Y el 500 cuando falla
encolar es una inversión deliberada de la regla que gobierna el resto — en
todas partes devolvemos 200 para que el canal no entre en bucle, y aquí, solo
aquí, queremos el reintento de Meta."
```

---

### Tarea 7: la ventana de 24 horas, como concepto del dominio

**Archivos:**
- Crear: `src/core/meta/ventana.ts`
- Modificar: `src/db/repos/conversacion.ts` (exponer `ultimoClienteEn`)
- Test: `test/core/meta-ventana.test.ts`

**Interfaces:**
- Produce:
  - `type EstadoVentana = "abierta" | "cerrada"`
  - `type ModoEnvio = { tipo: "libre" } | { tipo: "plantilla"; nombre: string; idioma: string } | { tipo: "etiqueta" } | { tipo: "cerrada" }`
  - `estadoVentana(ultimoClienteEn: string | null, ahora: string): EstadoVentana`
  - `resolverModo(estado: EstadoVentana, opciones: { plantilla?: { nombre: string; idioma: string } | null; etiquetaAgenteHumano?: boolean }): ModoEnvio`
  - `Conversacion` gana `readonly ultimoClienteEn: string | null`
  Los usa la tarea 8.

- [ ] **Paso 1: escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { estadoVentana, resolverModo } from "../../src/core/meta/ventana";

const AHORA = "2026-08-27T15:00:00.000Z";

describe("estadoVentana", () => {
  it("está abierta si el cliente escribió hace menos de 24 horas", () => {
    expect(estadoVentana("2026-08-26T16:00:00.000Z", AHORA)).toBe("abierta");
  });

  it("está cerrada si escribió hace más de 24 horas", () => {
    expect(estadoVentana("2026-08-26T14:00:00.000Z", AHORA)).toBe("cerrada");
  });

  // Sin marca no hay permiso: es el caso de un negocio recién conectado, o de
  // una conversación cuyos mensajes ya purgamos a los 90 días.
  it("está cerrada si no hay marca", () => {
    expect(estadoVentana(null, AHORA)).toBe("cerrada");
  });

  it("una marca ilegible se trata como ausente, no revienta", () => {
    expect(estadoVentana("no es una fecha", AHORA)).toBe("cerrada");
  });
});

describe("resolverModo", () => {
  it("con la ventana abierta se escribe libre, aunque haya plantilla", () => {
    const modo = resolverModo("abierta", {
      plantilla: { nombre: "aviso_pedido", idioma: "es" },
      etiquetaAgenteHumano: true,
    });

    expect(modo).toEqual({ tipo: "libre" });
  });

  it("cerrada con plantilla configurada, manda plantilla", () => {
    expect(resolverModo("cerrada", { plantilla: { nombre: "aviso_pedido", idioma: "es" } })).toEqual(
      { tipo: "plantilla", nombre: "aviso_pedido", idioma: "es" },
    );
  });

  it("cerrada con permiso de agente humano, manda con etiqueta", () => {
    expect(resolverModo("cerrada", { etiquetaAgenteHumano: true })).toEqual({ tipo: "etiqueta" });
  });

  // El camino degradado, y la razón de que exista: decirle al dueño que el
  // aviso no sale por ahí es honesto; fingir que salió, no. La regla 11 no se
  // toca — nada salió sin que él aprobara, y tampoco se le miente.
  it("cerrada y sin nada configurado, no se manda", () => {
    expect(resolverModo("cerrada", {})).toEqual({ tipo: "cerrada" });
  });

  it("la plantilla gana a la etiqueta cuando están las dos", () => {
    const modo = resolverModo("cerrada", {
      plantilla: { nombre: "aviso_pedido", idioma: "es" },
      etiquetaAgenteHumano: true,
    });

    expect(modo).toEqual({ tipo: "plantilla", nombre: "aviso_pedido", idioma: "es" });
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar**

```bash
npx vitest run test/core/meta-ventana.test.ts
```

- [ ] **Paso 3: implementar `src/core/meta/ventana.ts`**

```ts
/**
 * La ventana de mensajería de Meta.
 *
 * Los tres productos dan 24 horas desde el último mensaje del cliente para
 * escribirle libremente; fuera de eso WhatsApp exige plantilla pre-aprobada y
 * Messenger e Instagram exigen etiqueta. Telegram no tiene nada de esto, y por
 * eso hasta D2 no existía una línea de código que lo contemplara.
 *
 * Vive en `core` y la hora entra por parámetro: sin red, sin reloj, sin `env`.
 */

export const VENTANA_HORAS = 24;

export type EstadoVentana = "abierta" | "cerrada";

export type ModoEnvio =
  | { readonly tipo: "libre" }
  | { readonly tipo: "plantilla"; readonly nombre: string; readonly idioma: string }
  | { readonly tipo: "etiqueta" }
  | { readonly tipo: "cerrada" };

export function estadoVentana(ultimoClienteEn: string | null, ahora: string): EstadoVentana {
  if (!ultimoClienteEn) return "cerrada";

  const desde = Date.parse(ultimoClienteEn);
  const hasta = Date.parse(ahora);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return "cerrada";

  return hasta - desde < VENTANA_HORAS * 3_600_000 ? "abierta" : "cerrada";
}

export interface OpcionesFueraDeVentana {
  readonly plantilla?: { readonly nombre: string; readonly idioma: string } | null;
  readonly etiquetaAgenteHumano?: boolean;
}

/**
 * La plantilla gana a la etiqueta porque es la que Meta aprueba de antemano:
 * la etiqueta se evalúa al enviar y puede rechazarse, y un rechazo cuesta un
 * aviso que el dueño creía enviado.
 */
export function resolverModo(
  estado: EstadoVentana,
  opciones: OpcionesFueraDeVentana,
): ModoEnvio {
  if (estado === "abierta") return { tipo: "libre" };

  const plantilla = opciones.plantilla;
  if (plantilla?.nombre) {
    return { tipo: "plantilla", nombre: plantilla.nombre, idioma: plantilla.idioma };
  }

  return opciones.etiquetaAgenteHumano ? { tipo: "etiqueta" } : { tipo: "cerrada" };
}
```

- [ ] **Paso 4: exponer `ultimoClienteEn` en `Conversacion`**

En `src/db/repos/conversacion.ts`: agregar `ultimo_cliente_en` a la constante
`COLUMNAS`, el campo a la interfaz `FilaConv`, y a `aConversacion`:

```ts
    ultimoClienteEn: f.ultimo_cliente_en ?? null,
```

Y a la interfaz `Conversacion`:

```ts
  /** Último evento del cliente. Es lo que decide la ventana de 24 h de Meta. */
  readonly ultimoClienteEn: string | null;
```

- [ ] **Paso 5: correr los tests y verlos pasar**

```bash
npm test && npm run typecheck
```

- [ ] **Paso 6: commit**

```bash
git add -A && git commit -m "feat(core): la ventana de 24 horas de Meta, con su modo degradado

Tres salidas y no dos: libre, plantilla o etiqueta, y 'no se puede'. La tercera
es la que sostiene la regla 11 — decirle al dueño que el aviso no sale por ahí
es honesto; fingir que salió, no."
```

---

### Tarea 8: enviar por los tres productos

**Archivos:**
- Crear: `src/canales/meta/whatsapp-envio.ts` (o ampliar `whatsapp.ts`),
  `src/canales/meta/messenger.ts`, `src/canales/meta/instagram.ts`
- Modificar: `src/canales/salida.ts`, `src/agente/agente.ts:152`,
  `src/admin/aplicar.ts:147`

**Interfaces:**
- Consume: `ModoEnvio` (tarea 7), `autenticarMeta` (tarea 6), `Canal` de
  `src/canales/tipos.ts`.
- Produce:
  - `crearCanalWhatsApp(cfg: { token: string; phoneNumberId: string; modo: ModoEnvio }): Canal`
  - `crearCanalMessenger(cfg: { token: string; pageId: string; modo: ModoEnvio }): Canal`
  - `crearCanalInstagram(cfg: { token: string; igId: string; modo: ModoEnvio }): Canal`
  - `canalSaliente(env, negocioId, conversacion, ahora?): Promise<Canal>` — **firma nueva**

- [ ] **Paso 1: agregar el envío a `src/canales/meta/comun.ts`**

```ts
import { fallo, ok, type Resultado } from "../../core/resultado";

const TIMEOUT_MS = 10_000;

/**
 * Un POST al Graph con timeout, sin SDK.
 *
 * El cuerpo del error NO entra en el mensaje: puede traer el teléfono o el
 * texto del mensaje, y eso es PII. Solo el código.
 */
export async function postAlGraph(
  url: string,
  cuerpo: unknown,
  token: string | null,
  etiqueta: string,
): Promise<Resultado<void, string>> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });

    if (!respuesta.ok) return fallo(`${etiqueta}: HTTP ${respuesta.status}${await codigo(respuesta)}`);
    return ok(undefined);
  } catch (e) {
    const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
    return fallo(`${etiqueta}: fallo de ${razon}`);
  } finally {
    clearTimeout(reloj);
  }
}

export const GRAPH = "https://graph.facebook.com/v25.0";
export const GRAPH_IG = "https://graph.instagram.com/v25.0";

/**
 * El código del error de Meta, y SOLO el código.
 *
 * Nuestro reloj de la ventana es una optimización; la autoridad es Meta. Cuando
 * rechaza un envío hay que poder saber por qué, y el motivo tiene que llegar a
 * la bandeja del dueño. Pero `error.message` puede traer el teléfono o el texto
 * del mensaje, así que de ahí solo salen los números.
 *
 * No se mapea ningún código a "ventana cerrada" todavía, a propósito: no hemos
 * visto uno real. Inventarse el número sería exactamente el detector sin
 * control que ya nos costó un diagnóstico falso. Cuando aparezca el primer
 * rechazo de verdad, ahí se mapea — con la medición delante.
 */
async function codigo(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as {
      error?: { code?: unknown; error_subcode?: unknown };
    };
    const c = Number(cuerpo?.error?.code);
    const sub = Number(cuerpo?.error?.error_subcode);
    if (!Number.isFinite(c)) return "";
    return Number.isFinite(sub) ? ` (código ${c}/${sub})` : ` (código ${c})`;
  } catch {
    return "";
  }
}
```

- [ ] **Paso 2: implementar el canal de WhatsApp**

Agregar al final de `src/canales/meta/whatsapp.ts`:

```ts
import { autenticarMeta, GRAPH, postAlGraph } from "./comun";
import type { ModoEnvio } from "../../core/meta/ventana";
import type { Canal } from "../tipos";
import { fallo, type Resultado } from "../../core/resultado";

export interface ConfigWhatsApp {
  readonly token: string;
  readonly phoneNumberId: string;
  /** Resuelto al construir el canal: quien envía no sabe de ventanas. */
  readonly modo: ModoEnvio;
}

export function crearCanalWhatsApp(cfg: ConfigWhatsApp): Canal {
  const url = `${GRAPH}/${cfg.phoneNumberId}/messages`;

  const cuerpoDeTexto = (a: string, texto: string): Resultado<unknown, string> => {
    if (cfg.modo.tipo === "cerrada") {
      // No es una excepción: es información para el dueño. La bandeja la
      // muestra y él decide escribirle por su cuenta.
      return fallo("whatsapp: ventana de 24 h cerrada y sin plantilla configurada");
    }

    if (cfg.modo.tipo === "plantilla") {
      return {
        ok: true,
        valor: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a,
          type: "template",
          template: {
            name: cfg.modo.nombre,
            language: { code: cfg.modo.idioma },
            components: [{ type: "body", parameters: [{ type: "text", text: texto }] }],
          },
        },
      };
    }

    return {
      ok: true,
      valor: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: a,
        type: "text",
        text: { preview_url: false, body: texto },
      },
    };
  };

  return {
    id: "whatsapp",
    interpretar: interpretarWhatsApp,
    autenticar: autenticarMeta,

    async enviar(canalChatId, texto) {
      const cuerpo = cuerpoDeTexto(canalChatId, texto);
      if (!cuerpo.ok) return fallo(cuerpo.error);
      return postAlGraph(url, cuerpo.valor, cfg.token, "whatsapp");
    },

    async enviarFoto(canalChatId, urlFoto, pie) {
      // Una foto no cabe en una plantilla aprobada de texto, y fuera de ventana
      // no hay forma libre de mandarla. Se dice, no se intenta y falla feo.
      if (cfg.modo.tipo !== "libre") {
        return fallo("whatsapp: fuera de la ventana de 24 h no se pueden mandar fotos");
      }

      return postAlGraph(
        url,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: canalChatId,
          type: "image",
          image: { link: urlFoto, caption: pie.slice(0, 1000) },
        },
        cfg.token,
        "whatsapp",
      );
    },
  };
}
```

- [ ] **Paso 3: implementar Messenger e Instagram**

`src/canales/meta/messenger.ts`. Ojo con dos diferencias verificadas: Messenger
manda el token **por query**, Instagram por cabecera; y la URL base es distinta.

```ts
import { autenticarMeta, GRAPH, postAlGraph } from "./comun";
import { interpretarMensajeria } from "./mensajeria";
import type { ModoEnvio } from "../../core/meta/ventana";
import type { Canal } from "../tipos";
import { fallo } from "../../core/resultado";

export interface ConfigMessenger {
  readonly token: string;
  readonly pageId: string;
  readonly modo: ModoEnvio;
}

export function crearCanalMessenger(cfg: ConfigMessenger): Canal {
  // Messenger pasa el token por query, no por cabecera. Verificado contra la
  // documentación; no unificarlo con Instagram "porque son de la misma familia".
  const url = `${GRAPH}/${cfg.pageId}/messages?access_token=${encodeURIComponent(cfg.token)}`;

  const sobre = (canalChatId: string, mensaje: unknown) =>
    cfg.modo.tipo === "etiqueta"
      ? {
          recipient: { id: canalChatId },
          messaging_type: "MESSAGE_TAG",
          // La etiqueta de agente humano da 7 días y está pensada para
          // respuestas escritas por una persona. En CHUNO una persona aprueba
          // cada mensaje, así que no se está forzando la regla: es su caso.
          tag: "HUMAN_AGENT",
          message: mensaje,
        }
      : { recipient: { id: canalChatId }, messaging_type: "RESPONSE", message: mensaje };

  return {
    id: "messenger",
    interpretar: (cuerpo) => interpretarMensajeria(cuerpo, "messenger"),
    autenticar: autenticarMeta,

    async enviar(canalChatId, texto) {
      if (cfg.modo.tipo === "cerrada") {
        return fallo("messenger: ventana de 24 h cerrada y sin etiqueta de agente humano");
      }
      // El token va en la query: no se repite en la cabecera.
      return postAlGraph(url, sobre(canalChatId, { text: texto }), null, "messenger");
    },

    async enviarFoto(canalChatId, urlFoto, pie) {
      if (cfg.modo.tipo === "cerrada") {
        return fallo("messenger: ventana de 24 h cerrada y sin etiqueta de agente humano");
      }

      const foto = postAlGraph(
        url,
        sobre(canalChatId, {
          attachment: { type: "image", payload: { url: urlFoto, is_reusable: true } },
        }),
        null,
        "messenger",
      );

      const r = await foto;
      if (!r.ok) return r;

      // El adjunto no lleva pie: Messenger los manda como dos mensajes.
      return postAlGraph(url, sobre(canalChatId, { text: pie.slice(0, 1000) }), null, "messenger");
    },
  };
}
```

`src/canales/meta/instagram.ts`:

```ts
import { autenticarMeta, GRAPH_IG, postAlGraph } from "./comun";
import { interpretarMensajeria } from "./mensajeria";
import type { ModoEnvio } from "../../core/meta/ventana";
import type { Canal } from "../tipos";
import { fallo } from "../../core/resultado";

export interface ConfigInstagram {
  readonly token: string;
  readonly igId: string;
  readonly modo: ModoEnvio;
}

export function crearCanalInstagram(cfg: ConfigInstagram): Canal {
  // Host distinto al de Messenger (graph.instagram.com) y token por cabecera,
  // no por query. Verificado contra la documentación: parecerse no es ser igual.
  const url = `${GRAPH_IG}/${cfg.igId}/messages`;

  const sobre = (canalChatId: string, mensaje: unknown) =>
    cfg.modo.tipo === "etiqueta"
      ? {
          recipient: { id: canalChatId },
          messaging_type: "MESSAGE_TAG",
          tag: "HUMAN_AGENT",
          message: mensaje,
        }
      : { recipient: { id: canalChatId }, message: mensaje };

  return {
    id: "instagram",
    interpretar: (cuerpo) => interpretarMensajeria(cuerpo, "instagram"),
    autenticar: autenticarMeta,

    async enviar(canalChatId, texto) {
      if (cfg.modo.tipo === "cerrada") {
        return fallo("instagram: ventana de 24 h cerrada y sin etiqueta de agente humano");
      }
      return postAlGraph(url, sobre(canalChatId, { text: texto }), cfg.token, "instagram");
    },

    async enviarFoto(canalChatId, urlFoto, pie) {
      if (cfg.modo.tipo === "cerrada") {
        return fallo("instagram: ventana de 24 h cerrada y sin etiqueta de agente humano");
      }

      const foto = await postAlGraph(
        url,
        sobre(canalChatId, {
          attachments: { type: "image", payload: { url: urlFoto } },
        }),
        cfg.token,
        "instagram",
      );
      if (!foto.ok) return foto;

      return postAlGraph(url, sobre(canalChatId, { text: pie.slice(0, 1000) }), cfg.token, "instagram");
    },
  };
}
```

**Instagram es el punto de menos certeza de todo D2:** su documentación de envío
no nombra la etiqueta de agente humano, y el `modo` de etiqueta puede acabar
rechazado por Meta. Por eso el rechazo se trata como fallo normal —la propuesta
queda pendiente con el motivo— y no revienta nada.

- [ ] **Paso 4: reescribir `src/canales/salida.ts`**

```ts
/**
 * El canal de salida de una conversación.
 *
 * Recibe la conversación entera y no solo su canal, porque la ventana de 24 h
 * de Meta se decide AQUÍ: el canal se construye ya sabiendo en qué modo está.
 * Así la firma de `enviar` no cambia y quien envía —el agente, o el dueño
 * aprobando— no sabe nada de ventanas ni de plantillas.
 */
export async function canalSaliente(
  env: Env,
  negocioId: string,
  conversacion: Conversacion,
  ahora: string = ahoraISO(),
): Promise<Canal> {
  const canalId = conversacion.canal;

  if (canalId === "telegram") {
    const propio = await leerCredencial(env.DB, negocioId, "telegram_token", env.CLAVE_CIFRADO);
    return crearCanalTelegram(propio ?? env.TELEGRAM_BOT_TOKEN);
  }

  if (canalId !== "whatsapp" && canalId !== "messenger" && canalId !== "instagram") {
    return canalDemo;
  }

  const modo = resolverModo(estadoVentana(conversacion.ultimoClienteEn, ahora), {
    plantilla: await plantillaDe(env.DB, negocioId, canalId),
    etiquetaAgenteHumano: (await leerSetting(env.DB, negocioId, "meta_agente_humano")) === "si",
  });

  // Todo-o-nada, la misma regla del cerebro configurable: token e id van
  // juntos. Uno sin el otro es el peor estado posible — se lee como "el token
  // del cliente no sirve" cuando lo que falta es el id.
  if (canalId === "whatsapp") {
    const token = await leerCredencial(env.DB, negocioId, "whatsapp_token", env.CLAVE_CIFRADO);
    const phoneNumberId = await leerSetting(env.DB, negocioId, "meta_phone_number_id");
    if (!token || !phoneNumberId) return canalDemo;
    return crearCanalWhatsApp({ token, phoneNumberId, modo });
  }

  if (canalId === "messenger") {
    const token = await leerCredencial(env.DB, negocioId, "messenger_page_token", env.CLAVE_CIFRADO);
    const pageId = await leerSetting(env.DB, negocioId, "meta_page_id");
    if (!token || !pageId) return canalDemo;
    return crearCanalMessenger({ token, pageId, modo });
  }

  const token = await leerCredencial(env.DB, negocioId, "instagram_token", env.CLAVE_CIFRADO);
  const igId = await leerSetting(env.DB, negocioId, "meta_ig_id");
  if (!token || !igId) return canalDemo;
  return crearCanalInstagram({ token, igId, modo });
}
```

**Por qué `canalDemo` cuando falta media configuración y no una excepción:** el
canal de la demo "envía" sin salir a ningún lado, así que un negocio a medio
conectar no tumba al agente ni le manda basura a nadie — y el mensaje queda
guardado, que es lo que permite diagnosticarlo después. Es el mismo respaldo que
ya usa el canal para todo lo que no sea Telegram.

`plantillaDe` lee el setting `whatsapp_plantilla_aviso`, con formato
`nombre:idioma` (por ejemplo `aviso_pedido:es`), y devuelve `null` si falta o
está mal formado. Solo aplica a WhatsApp: `null` para los otros dos.

- [ ] **Paso 5: actualizar los dos llamadores**

`src/agente/agente.ts:152` y `src/admin/aplicar.ts:147` pasan hoy
`conversacion.canal`. Los dos tienen la conversación entera a mano, así que el
cambio es quitar el `.canal`:

```ts
const canal = await canalSaliente(this.env, negocioId, conversacion);
```

En `aplicar.ts`, cuando `enviar` falle con un error que empiece por el nombre del
canal y contenga `ventana`, la propuesta **no** se marca como aplicada: se deja
pendiente con el motivo, para que el dueño lo vea y decida.

- [ ] **Paso 6: comprobar y commitear**

```bash
npm test && npm run typecheck
```

```bash
git add -A && git commit -m "feat(canales): envío por WhatsApp, Messenger e Instagram

La ventana se resuelve al CONSTRUIR el canal, no en la firma de enviar: el
contrato Canal está cerrado y quien envía no tiene por qué saber de ventanas.
Messenger manda el token por query e Instagram por cabecera, y son hosts
distintos: verificado contra la documentación, no unificado por parecerse."
```

---

### Tarea 9: credenciales, ajustes y el CLI que valida

**Archivos:**
- Modificar: `src/db/repos/credencial.ts`, `cli/chuno.mjs`

**Interfaces:**
- Produce: tres claves nuevas en `ClaveCredencial` y el subcomando
  `chuno conectar-meta`.

- [ ] **Paso 1: ampliar `ClaveCredencial`**

```ts
export type ClaveCredencial =
  | "telegram_token"
  | "telegram_webhook_secret"
  | "meta_app_secret"
  | "meta_verify_token"
  // Los tres tokens de envío de la familia Meta. Van cifrados como cualquier
  // otro: quien los tenga escribe como el negocio.
  | "whatsapp_token"
  | "messenger_page_token"
  | "instagram_token"
  | "llm_api_key";
```

Los ids —`meta_phone_number_id`, `meta_page_id`, `meta_ig_id`— van a `settings`
en claro, junto con `whatsapp_plantilla_aviso` y `meta_agente_humano`. No son
secretos, y cifrarlos solo haría más difícil diagnosticar. Es el mismo reparto
que separa `llm_api_key` de `llm_proveedor`.

- [ ] **Paso 2: agregar `conectar-meta` a `cli/chuno.mjs`**

Sigue el precedente de `conectarTelegram` (`cli/chuno.mjs:419`). Firma:

```bash
chuno conectar-meta <negocioId> --producto whatsapp|messenger|instagram --token <token> --id <phoneNumberId|pageId|igId>
```

Opcionales, solo para WhatsApp y Messenger/Instagram respectivamente:
`--plantilla <nombre>:<idioma>` y `--agente-humano`.

**Valida contra el Graph antes de guardar:**

```js
/**
 * Valida el par token+id contra el Graph antes de guardarlo.
 *
 * "Pega el token" falla en silencio: un token malo no da error hasta que un
 * cliente escribe y nadie contesta. Una lectura barata prueba las dos cosas de
 * una, porque el id va en la URL y el token en la cabecera: si responde 200, el
 * par sirve.
 */
async function validarMeta(producto, token, id) {
  const base = producto === "instagram"
    ? "https://graph.instagram.com/v25.0"
    : "https://graph.facebook.com/v25.0";

  const respuesta = await fetch(`${base}/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (respuesta.ok) return { ok: true };

  // Distinguir los dos casos, que llevan a arreglos opuestos: un 404 es el id
  // equivocado y un 401 es el token. Decirlo mal manda a Diego a revisar la
  // mitad que estaba bien.
  const motivo = respuesta.status === 404
    ? `el id ${id} no existe o el token no lo alcanza`
    : `el token fue rechazado (HTTP ${respuesta.status})`;

  return { ok: false, motivo };
}
```

Si valida, guarda el token con `guardarCredencial` y el id con el repo de
`settings`. Si no, **no guarda nada** e imprime cuál de los dos falló.

- [ ] **Paso 3: comprobar y commitear**

```bash
npm test && npm run typecheck
```

```bash
git add -A && git commit -m "feat(cli): conectar los canales de Meta validando contra el Graph

Guardar sin validar falla en silencio: un token malo no da error hasta que un
cliente escribe y nadie contesta. Y distingue el 404 del 401 porque llevan a
arreglos opuestos — decirlo mal manda a revisar la mitad que estaba bien."
```

---

### Tarea 10: el runbook y el cierre verificado

**Archivos:**
- Crear: `docs/runbook-app-meta.md`
- Modificar: `docs/ESTADO.md`, `CLAUDE.md`, `APRENDIZAJES.md` si hubo aprendizaje

- [ ] **Paso 1: escribir `docs/runbook-app-meta.md`**

Los pasos que da **Diego**, no el código: crear la app en el panel de
desarrolladores de Meta, agregarle el producto WhatsApp, tomar el número de
pruebas que Meta regala, copiar el App Secret, inventar el verify token, apuntar
la Callback URL a `https://<worker>/webhook/meta/<negocioId>`, suscribirse al
campo `messages`, y correr `chuno conectar-meta`. Con las pantallas nombradas
como se llaman hoy.

- [ ] **Paso 2: aplicar el esquema a la D1 de producción**

**Pedirle permiso a Diego antes.** Primero comprobar qué falta:

```bash
npx wrangler d1 execute chuno --remote --json --command "SELECT name FROM pragma_table_info('mensajes') WHERE name='id_externo'"
```

Vacío significa que la migración `002` no está aplicada. Aplicar solo las que
falten, y `schema.sql` entero para la tabla `entrantes`, que es idempotente.

- [ ] **Paso 3: desplegar — solo si Diego lo pide**

```bash
npx wrangler deploy
```

- [ ] **Paso 4: verificar contra producción, solo negativas**

Esperar propagación y **exigir que dos rondas seguidas coincidan**: un
`wrangler deploy` que ya terminó sigue sirviendo la versión vieja un rato, y una
tanda mezclada se lee como un bug que no existe.

```bash
set -o pipefail
BASE=https://chuno.<subdominio>.workers.dev
for ronda in 1 2; do
  echo "── ronda $ronda ──"
  echo "meta GET sin params:  $(curl -s -o /dev/null -w '%{http_code}' "$BASE/webhook/meta/mi-optica")"
  echo "meta POST sin firma:  $(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/webhook/meta/mi-optica" -d '{}')"
  echo "meta POST firma mala: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/webhook/meta/mi-optica" -H 'x-hub-signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000' -d '{}')"
  echo "CONTROL ruta falsa:   $(curl -s -o /dev/null -w '%{http_code}' "$BASE/webhook/meta-inventado/x")"
  sleep 20
done
```

Esperado: `400`, `401`, `401`, y el control `404`. **El control es lo que hace
que la medición valga**: si una ruta inventada diera lo mismo que las nuestras,
no estaríamos midiendo la puerta.

- [ ] **Paso 5: la prueba en vivo por WhatsApp, con su par de controles**

Escribirle al número de pruebas desde el teléfono y esperar la respuesta. Luego,
lo que de verdad se está probando:

```bash
npx wrangler d1 execute chuno --remote --json --command "SELECT canal, procesado_en IS NOT NULL AS procesado, substr(id_externo, -6) AS cola FROM entrantes WHERE negocio_id='mi-optica' ORDER BY creado_en DESC LIMIT 5"
```

Después, **reenviar el mismo lote firmado** y comprobar que **no** aparece una
fila nueva. Y el control positivo, sin el cual "no se duplicó" podría significar
que el segundo envío nunca llegó: cambiarle **un carácter** al `id_externo` y
comprobar que **sí** aparecen dos. Sin ese par no se está midiendo la
idempotencia, se está midiendo ruido.

- [ ] **Paso 6: actualizar la documentación**

- `docs/ESTADO.md`: traspaso nuevo con qué quedó desplegado, cómo se verificó, y
  qué quedó sin ejercer (los envíos de Messenger e Instagram).
- `CLAUDE.md`: el mapa de `src/` menciona `src/canales/whatsapp.ts`, que no
  existe — corregirlo a `src/canales/meta/`. Y actualizar la tabla de fases.
- `APRENDIZAJES.md`: solo si hubo un aprendizaje reutilizable. **Y ojo con la
  regla de higiene del propio archivo: va por 47 entradas y dice consolidar
  pasando de 25.** Consolidar es una tarea aparte, no de D2.

- [ ] **Paso 7: commit**

```bash
git add -A && git commit -m "docs: cerrar D2 con el runbook de Meta y la verificación en vivo"
```
