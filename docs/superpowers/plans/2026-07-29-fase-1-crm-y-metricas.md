# Fase 1 — CRM autoalimentado y panel de métricas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada mensaje que entra alimente solo un CRM —contacto, interacción y estado en el embudo— y que el dueño abra el panel y vea en una pantalla cómo va su negocio hoy: mensajes, clientes únicos, leads, decisiones pendientes, salud del agente y gasto.

**Architecture:** Todo lo que sea regla —transiciones del embudo, cómo se juzga la salud, cómo se calcula el gasto— vive en `src/core/`, sin base de datos, sin red y sin reloj propio, y se prueba con vitest en milisegundos. El acceso a datos son repos tipados que siempre filtran por `negocio_id`. El agente, después de responder, escribe contacto e interacción; el proveedor de LLM reporta el consumo por una devolución de llamada opcional, así que contabilizar el gasto no cambia su interfaz.

**Tech Stack:** TypeScript estricto · Cloudflare Workers + Hono · D1 (SQLite) · Zod · vitest · npm (no pnpm en esta máquina)

## Global Constraints

- **Aislamiento multi-tenant:** ninguna función de `src/db/repos/` consulta sin `negocio_id`. Sin excepciones.
- **`src/core/` es puro:** no importa nada de `cloudflare:workers`, no usa `fetch`, no llama al LLM y no lee el reloj. La fecha entra como parámetro.
- **Validación al leer:** las filas de D1 se validan con Zod antes de usarse. `items_json` y `payload_json` son texto libre para SQLite.
- **Cero PII en logs y en auditoría:** ni teléfonos, ni contenido de mensajes, ni identificadores completos.
- **Dinero siempre entero en centavos.** Fechas comprometidas siempre `YYYY-MM-DD`.
- **Comandos:** `npm test`, `npm run typecheck`, `npx wrangler`. Nunca canalizar por `tail` sin `set -o pipefail`.
- **Idioma:** español para el dominio (`contacto`, `interaccion`, `embudo`, `gasto`), inglés para lo técnico de plataforma.
- **Puerta de fase:** `npm test` verde y `npm run typecheck` limpio antes de cada commit.

---

### Task 1: Núcleo del embudo de leads

**Files:**
- Create: `src/core/crm/tipos.ts`
- Create: `src/core/crm/embudo.ts`
- Test: `test/core/embudo.test.ts`

**Interfaces:**
- Consumes: `Resultado`, `ok`, `fallo` de `src/core/resultado.ts`
- Produces: `ESTADOS_LEAD`, `type EstadoLead`, `ContactoSchema`, `type Contacto`, `LeadSchema`, `type Lead`, `avanzarLead(lead, hacia, ahora) → Resultado<Lead, string>`, `transicionLeadValida(desde, hacia) → boolean`, `esCerrado(estado) → boolean`

- [ ] **Step 1: Write the failing test**

Create `test/core/embudo.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { avanzarLead, esCerrado, transicionLeadValida } from "../../src/core/crm/embudo";
import { ESTADOS_LEAD, type EstadoLead, type Lead } from "../../src/core/crm/tipos";

const ANTES = "2026-07-28T10:00:00.000Z";
const AHORA = "2026-07-29T10:00:00.000Z";

function lead(estado: EstadoLead): Lead {
  return {
    id: "lead_1",
    negocioId: "neg_1",
    contactoId: "cont_1",
    estado,
    interes: "Gafas con antirreflejo",
    valorEstimadoCentavos: 16000000,
    creadoEn: ANTES,
    actualizadoEn: ANTES,
  };
}

describe("embudo de leads", () => {
  it("recorre el camino completo hasta cliente", () => {
    let actual = lead("nuevo");
    for (const siguiente of ["contactado", "interesado", "cliente"] as EstadoLead[]) {
      const r = avanzarLead(actual, siguiente, AHORA);
      expect(r.ok, `debería poder pasar a ${siguiente}`).toBe(true);
      if (!r.ok) return;
      actual = r.valor;
    }
    expect(actual.estado).toBe("cliente");
  });

  it("permite darlo por perdido desde cualquier estado abierto", () => {
    for (const estado of ESTADOS_LEAD) {
      if (esCerrado(estado)) continue;
      expect(transicionLeadValida(estado, "perdido"), `desde ${estado}`).toBe(true);
    }
  });

  it("permite reactivar un lead perdido", () => {
    // Un cliente que no compró hace tres meses vuelve a escribir: es el mismo
    // contacto, no uno nuevo.
    const r = avanzarLead(lead("perdido"), "contactado", AHORA);
    expect(r.ok).toBe(true);
  });

  it("no deja retroceder de cliente", () => {
    const r = avanzarLead(lead("cliente"), "interesado", AHORA);
    expect(r.ok).toBe(false);
  });

  it("rechaza la transición a sí mismo", () => {
    const r = avanzarLead(lead("interesado"), "interesado", AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya está");
  });

  it("no muta el original y sella la fecha", () => {
    const original = lead("nuevo");
    const r = avanzarLead(original, "contactado", AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(original.estado).toBe("nuevo");
    expect(original.actualizadoEn).toBe(ANTES);
    expect(r.valor.actualizadoEn).toBe(AHORA);
  });

  it("cliente es el único estado cerrado que cuenta como ganado", () => {
    expect(esCerrado("cliente")).toBe(true);
    expect(esCerrado("perdido")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- embudo`
Expected: FAIL — no existen `src/core/crm/tipos.ts` ni `src/core/crm/embudo.ts`.

- [ ] **Step 3: Write the types**

Create `src/core/crm/tipos.ts`:

```typescript
import { z } from "zod";

/**
 * El CRM se alimenta solo desde las conversaciones. Por eso el contacto no tiene
 * campos que alguien tenga que capturar a mano: todo lo que hay aquí se puede
 * deducir de un mensaje que llegó.
 */

export const ESTADOS_LEAD = ["nuevo", "contactado", "interesado", "cliente", "perdido"] as const;
export type EstadoLead = (typeof ESTADOS_LEAD)[number];

export const ContactoSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  nombre: z.string().trim().min(1).max(120),
  canal: z.string().min(1),
  /** Identificador del contacto dentro del canal. Es PII: nunca va a logs. */
  canalChatId: z.string().min(1),
  primeraInteraccion: z.string(),
  ultimaInteraccion: z.string(),
  totalMensajes: z.number().int().nonnegative(),
});

export type Contacto = z.infer<typeof ContactoSchema>;

export const LeadSchema = z.object({
  id: z.string().min(1),
  negocioId: z.string().min(1),
  contactoId: z.string().min(1),
  estado: z.enum(ESTADOS_LEAD),
  /** Qué quiere, en una línea. Lo deduce el agente de la conversación. */
  interes: z.string().trim().max(300).nullable(),
  valorEstimadoCentavos: z.number().int().nonnegative().nullable(),
  creadoEn: z.string(),
  actualizadoEn: z.string(),
});

export type Lead = z.infer<typeof LeadSchema>;
```

- [ ] **Step 4: Write the funnel state machine**

Create `src/core/crm/embudo.ts`:

```typescript
import { fallo, ok, type Resultado } from "../resultado";
import type { EstadoLead, Lead } from "./tipos";

/**
 * Embudo de leads.
 *
 * "perdido" no es terminal a propósito: un cliente que no compró hace tres meses
 * y vuelve a escribir es el mismo contacto reactivado, no uno nuevo. Tratarlo
 * como nuevo perdería su historial, que es justo lo que hace útil un CRM.
 */
const TRANSICIONES: Readonly<Record<EstadoLead, readonly EstadoLead[]>> = {
  nuevo: ["contactado", "perdido"],
  contactado: ["interesado", "cliente", "perdido"],
  interesado: ["cliente", "perdido"],
  cliente: [],
  perdido: ["contactado"],
};

/** Solo "cliente" cierra el embudo: de "perdido" se puede volver. */
export function esCerrado(estado: EstadoLead): boolean {
  return estado === "cliente";
}

export function transicionLeadValida(desde: EstadoLead, hacia: EstadoLead): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function avanzarLead(
  lead: Lead,
  hacia: EstadoLead,
  ahora: string,
): Resultado<Lead, string> {
  if (lead.estado === hacia) return fallo(`el lead ya está en "${hacia}"`);

  if (!transicionLeadValida(lead.estado, hacia)) {
    const posibles = TRANSICIONES[lead.estado];
    const detalle = posibles.length === 0
      ? `"${lead.estado}" ya cerró el embudo`
      : `desde "${lead.estado}" solo se puede pasar a: ${posibles.join(", ")}`;
    return fallo(`transición inválida a "${hacia}" — ${detalle}`);
  }

  return ok({ ...lead, estado: hacia, actualizadoEn: ahora });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- embudo`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/core/crm test/core/embudo.test.ts
git commit -m "feat(crm): embudo de leads en el núcleo

'perdido' no es terminal: un cliente que vuelve a escribir tres meses después
es el mismo contacto reactivado, no uno nuevo. Tratarlo como nuevo perdería su
historial, que es justo lo que hace útil un CRM."
```

---

### Task 2: Núcleo de salud y gasto

**Files:**
- Create: `src/core/metricas/salud.ts`
- Create: `src/core/metricas/gasto.ts`
- Test: `test/core/metricas.test.ts`

**Interfaces:**
- Consumes: nada del proyecto
- Produces: `type EstadoSalud = "bien" | "atencion" | "critico"`, `evaluarSalud({fallos, total}) → EstadoSalud`, `type UsoModelo = { modelo, tokensEntrada, tokensSalida }`, `TARIFAS`, `costoCentavos(uso) → number`, `costoTotalCentavos(usos) → number`, `esGratis(modelo) → boolean`

- [ ] **Step 1: Write the failing test**

Create `test/core/metricas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { evaluarSalud } from "../../src/core/metricas/salud";
import { costoCentavos, costoTotalCentavos, esGratis } from "../../src/core/metricas/gasto";

describe("salud del agente", () => {
  it("sin actividad no hay nada que juzgar", () => {
    // Un agente recién instalado no está enfermo: está sin estrenar.
    expect(evaluarSalud({ fallos: 0, total: 0 })).toBe("bien");
  });

  it("todo bien cuando casi nada falla", () => {
    expect(evaluarSalud({ fallos: 1, total: 100 })).toBe("bien");
  });

  it("pide atención a partir del 15% de fallos", () => {
    expect(evaluarSalud({ fallos: 15, total: 100 })).toBe("atencion");
  });

  it("es crítico a partir de la mitad", () => {
    expect(evaluarSalud({ fallos: 50, total: 100 })).toBe("critico");
  });

  it("no se deja engañar por muestras diminutas", () => {
    // Un solo fallo de un solo intento es 100%, pero no es evidencia de nada.
    expect(evaluarSalud({ fallos: 1, total: 1 })).toBe("bien");
    expect(evaluarSalud({ fallos: 3, total: 3 })).toBe("critico");
  });
});

describe("gasto estimado", () => {
  it("los modelos de la capa gratuita no cuestan", () => {
    expect(esGratis("gemini-3.6-flash")).toBe(true);
    expect(costoCentavos({ modelo: "gemini-3.6-flash", tokensEntrada: 50000, tokensSalida: 20000 })).toBe(0);
  });

  it("cobra un modelo pago según sus tarifas", () => {
    // claude-sonnet-5: 300 centavos por millón de entrada, 1500 de salida.
    const costo = costoCentavos({
      modelo: "claude-sonnet-5",
      tokensEntrada: 1_000_000,
      tokensSalida: 1_000_000,
    });
    expect(costo).toBe(1800);
  });

  it("un modelo desconocido se cobra como cero y no rompe", () => {
    // Preferimos subestimar el gasto a mostrarle al dueño un número inventado.
    expect(costoCentavos({ modelo: "modelo-que-no-conocemos", tokensEntrada: 9999, tokensSalida: 9999 })).toBe(0);
  });

  it("suma varios usos redondeando al centavo", () => {
    const total = costoTotalCentavos([
      { modelo: "claude-sonnet-5", tokensEntrada: 500_000, tokensSalida: 0 },
      { modelo: "claude-sonnet-5", tokensEntrada: 500_000, tokensSalida: 0 },
      { modelo: "gemini-3.6-flash", tokensEntrada: 999_999, tokensSalida: 999_999 },
    ]);
    expect(total).toBe(300);
  });

  it("una lista vacía cuesta cero", () => {
    expect(costoTotalCentavos([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- metricas`
Expected: FAIL — no existen `src/core/metricas/salud.ts` ni `gasto.ts`.

- [ ] **Step 3: Write salud**

Create `src/core/metricas/salud.ts`:

```typescript
export type EstadoSalud = "bien" | "atencion" | "critico";

/** Por debajo de esto, la proporción de fallos no es evidencia de nada. */
const MUESTRA_MINIMA = 3;
const UMBRAL_ATENCION = 0.15;
const UMBRAL_CRITICO = 0.5;

/**
 * Salud del agente a partir de sus fallos recientes.
 *
 * La muestra mínima importa: sin ella, el primer mensaje que falle pintaría el
 * panel de rojo con un 100% de fallos sobre un solo intento, y el dueño dejaría
 * de creerle al indicador el primer día.
 */
export function evaluarSalud(conteo: { fallos: number; total: number }): EstadoSalud {
  if (conteo.total < MUESTRA_MINIMA) return "bien";

  const proporcion = conteo.fallos / conteo.total;
  if (proporcion >= UMBRAL_CRITICO) return "critico";
  if (proporcion >= UMBRAL_ATENCION) return "atencion";
  return "bien";
}
```

- [ ] **Step 4: Write gasto**

Create `src/core/metricas/gasto.ts`:

```typescript
export interface UsoModelo {
  readonly modelo: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
}

/** Centavos de dólar por millón de tokens. Cero = capa gratuita. */
export const TARIFAS: Readonly<Record<string, { entrada: number; salida: number }>> = {
  "gemini-3.6-flash": { entrada: 0, salida: 0 },
  "gemini-3.1-flash-lite": { entrada: 0, salida: 0 },
  "gemini-flash-lite-latest": { entrada: 0, salida: 0 },
  "claude-sonnet-5": { entrada: 300, salida: 1500 },
  "claude-haiku-4-5-20251001": { entrada: 100, salida: 500 },
};

export function esGratis(modelo: string): boolean {
  const tarifa = TARIFAS[modelo];
  return tarifa !== undefined && tarifa.entrada === 0 && tarifa.salida === 0;
}

/**
 * Costo de una llamada, en centavos.
 *
 * Un modelo que no está en la tabla se cobra como cero: preferimos subestimar el
 * gasto a mostrarle al dueño un número inventado que luego no cuadre con su
 * factura.
 */
export function costoCentavos(uso: UsoModelo): number {
  const tarifa = TARIFAS[uso.modelo];
  if (!tarifa) return 0;

  return (uso.tokensEntrada * tarifa.entrada + uso.tokensSalida * tarifa.salida) / 1_000_000;
}

/** Se redondea una sola vez, al final: redondear cada llamada perdería el total. */
export function costoTotalCentavos(usos: readonly UsoModelo[]): number {
  return Math.round(usos.reduce((suma, uso) => suma + costoCentavos(uso), 0));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- metricas`
Expected: PASS, 10 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/core/metricas test/core/metricas.test.ts
git commit -m "feat(metricas): reglas puras de salud y gasto

La muestra mínima de la salud no es un detalle: sin ella el primer mensaje que
falle pinta el panel de rojo con 100% de fallos sobre un intento, y el dueño
deja de creerle al indicador el primer día.

Un modelo fuera de la tabla de tarifas se cobra como cero: preferimos
subestimar el gasto a mostrar un número que no cuadre con la factura."
```

---

### Task 3: Tablas y repos del CRM

**Files:**
- Modify: `src/db/schema.sql` (agregar al final)
- Create: `src/db/repos/crm.ts`
- Modify: `src/index.ts` (ninguna todavía — solo se verifica que compile)

**Interfaces:**
- Consumes: `ContactoSchema`, `LeadSchema`, `Contacto`, `Lead` de `src/core/crm/tipos.ts`; `nuevoId`, `ahoraISO` de `src/db/id.ts`
- Produces: `registrarContacto(db, negocioId, canal, canalChatId, nombre) → Promise<Contacto>`, `listarContactos(db, negocioId, limite?) → Promise<Contacto[]>`, `contarContactosActivos(db, negocioId, desdeISO) → Promise<number>`, `registrarLead(db, {negocioId, contactoId, interes, valorEstimadoCentavos}) → Promise<Lead | null>`, `listarLeads(db, negocioId) → Promise<Lead[]>`, `contarLeadsAbiertos(db, negocioId) → Promise<number>`

- [ ] **Step 1: Add the tables**

Append to `src/db/schema.sql`:

```sql
-- ────────────────────────────────────────────────────────────────────  CRM ───
-- Se alimenta solo desde las conversaciones: no hay pantalla de captura y no
-- debe haberla. Si un dato exige que alguien lo escriba a mano, no va aquí.

CREATE TABLE IF NOT EXISTS contactos (
  id                  TEXT PRIMARY KEY,
  negocio_id          TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre              TEXT NOT NULL,
  canal               TEXT NOT NULL,
  canal_chat_id       TEXT NOT NULL,
  primera_interaccion TEXT NOT NULL,
  ultima_interaccion  TEXT NOT NULL,
  total_mensajes      INTEGER NOT NULL DEFAULT 0
);

-- Una persona por canal y por negocio. El mismo índice que hace idempotente el
-- alta del contacto cuando llegan dos mensajes a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacto_canal
  ON contactos (negocio_id, canal, canal_chat_id);
CREATE INDEX IF NOT EXISTS idx_contacto_recientes
  ON contactos (negocio_id, ultima_interaccion);

CREATE TABLE IF NOT EXISTS leads (
  id                      TEXT PRIMARY KEY,
  negocio_id              TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  contacto_id             TEXT NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  estado                  TEXT NOT NULL DEFAULT 'nuevo'
                            CHECK (estado IN ('nuevo','contactado','interesado','cliente','perdido')),
  interes                 TEXT,
  valor_estimado_centavos INTEGER,
  creado_en               TEXT NOT NULL,
  actualizado_en          TEXT NOT NULL
);

-- Un lead abierto por contacto: si vuelve a escribir sobre lo mismo, es el
-- mismo lead, no uno nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_contacto ON leads (negocio_id, contacto_id);
CREATE INDEX IF NOT EXISTS idx_lead_estado ON leads (negocio_id, estado);

-- ─────────────────────────────────────────────────────────────  uso del LLM ───
-- Para poder responder "¿cuánto llevo gastado?" con un número y no con un
-- encogimiento de hombros.

CREATE TABLE IF NOT EXISTS uso_llm (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  modelo         TEXT NOT NULL,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida  INTEGER NOT NULL DEFAULT 0,
  exito          INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uso_negocio ON uso_llm (negocio_id, creado_en);
```

- [ ] **Step 2: Write the repo**

Create `src/db/repos/crm.ts`:

```typescript
import { ContactoSchema, LeadSchema, type Contacto, type Lead } from "../../core/crm/tipos";
import { ahoraISO, nuevoId } from "../id";

interface FilaContacto {
  id: string;
  negocio_id: string;
  nombre: string;
  canal: string;
  canal_chat_id: string;
  primera_interaccion: string;
  ultima_interaccion: string;
  total_mensajes: number;
}

const COLS_CONTACTO = `id, negocio_id, nombre, canal, canal_chat_id,
                       primera_interaccion, ultima_interaccion, total_mensajes`;

function aContacto(f: FilaContacto): Contacto {
  const r = ContactoSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    nombre: f.nombre,
    canal: f.canal,
    canalChatId: f.canal_chat_id,
    primeraInteraccion: f.primera_interaccion,
    ultimaInteraccion: f.ultima_interaccion,
    totalMensajes: f.total_mensajes,
  });
  if (!r.success) throw new Error(`contacto ${f.id}: fila inválida`);
  return r.data;
}

/**
 * Alta o actualización del contacto en un solo viaje.
 *
 * El INSERT OR IGNORE contra el índice único hace esto seguro ante dos mensajes
 * simultáneos: el segundo pierde contra el índice y el UPDATE posterior aplica
 * a la misma fila. Nunca quedan dos contactos para la misma persona.
 */
export async function registrarContacto(
  db: D1Database,
  negocioId: string,
  canal: string,
  canalChatId: string,
  nombre: string | null,
): Promise<Contacto> {
  const ahora = ahoraISO();
  const nombreFinal = nombre?.trim() || "Cliente";

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO contactos
           (id, negocio_id, nombre, canal, canal_chat_id,
            primera_interaccion, ultima_interaccion, total_mensajes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .bind(nuevoId("cont"), negocioId, nombreFinal, canal, canalChatId, ahora, ahora),
    db
      .prepare(
        `UPDATE contactos
            SET ultima_interaccion = ?,
                total_mensajes = total_mensajes + 1,
                -- Solo mejora el nombre: no lo degrada a "Cliente" si ya lo sabíamos.
                nombre = CASE WHEN nombre = 'Cliente' THEN ? ELSE nombre END
          WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?`,
      )
      .bind(ahora, nombreFinal, negocioId, canal, canalChatId),
  ]);

  const fila = await db
    .prepare(
      `SELECT ${COLS_CONTACTO} FROM contactos
        WHERE negocio_id = ? AND canal = ? AND canal_chat_id = ?`,
    )
    .bind(negocioId, canal, canalChatId)
    .first<FilaContacto>();

  if (!fila) throw new Error("no se pudo registrar el contacto");
  return aContacto(fila);
}

export async function listarContactos(
  db: D1Database,
  negocioId: string,
  limite = 100,
): Promise<Contacto[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLS_CONTACTO} FROM contactos WHERE negocio_id = ?
        ORDER BY ultima_interaccion DESC LIMIT ?`,
    )
    .bind(negocioId, limite)
    .all<FilaContacto>();

  return results.map(aContacto);
}

/** Clientes únicos que escribieron desde una fecha. */
export async function contarContactosActivos(
  db: D1Database,
  negocioId: string,
  desdeISO: string,
): Promise<number> {
  const fila = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM contactos WHERE negocio_id = ? AND ultima_interaccion >= ?",
    )
    .bind(negocioId, desdeISO)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}

interface FilaLead {
  id: string;
  negocio_id: string;
  contacto_id: string;
  estado: string;
  interes: string | null;
  valor_estimado_centavos: number | null;
  creado_en: string;
  actualizado_en: string;
}

const COLS_LEAD = `id, negocio_id, contacto_id, estado, interes,
                   valor_estimado_centavos, creado_en, actualizado_en`;

function aLead(f: FilaLead): Lead {
  const r = LeadSchema.safeParse({
    id: f.id,
    negocioId: f.negocio_id,
    contactoId: f.contacto_id,
    estado: f.estado,
    interes: f.interes,
    valorEstimadoCentavos: f.valor_estimado_centavos,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  });
  if (!r.success) throw new Error(`lead ${f.id}: fila inválida`);
  return r.data;
}

export interface NuevoLead {
  readonly negocioId: string;
  readonly contactoId: string;
  readonly interes: string | null;
  readonly valorEstimadoCentavos: number | null;
}

/**
 * Registra el interés de un contacto. Devuelve null si ya tenía un lead: el
 * mismo cliente escribiendo tres veces no son tres oportunidades de venta.
 */
export async function registrarLead(db: D1Database, nuevo: NuevoLead): Promise<Lead | null> {
  const ahora = ahoraISO();
  const lead = LeadSchema.parse({
    id: nuevoId("lead"),
    negocioId: nuevo.negocioId,
    contactoId: nuevo.contactoId,
    estado: "nuevo",
    interes: nuevo.interes,
    valorEstimadoCentavos: nuevo.valorEstimadoCentavos,
    creadoEn: ahora,
    actualizadoEn: ahora,
  });

  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO leads
         (id, negocio_id, contacto_id, estado, interes, valor_estimado_centavos,
          creado_en, actualizado_en)
       VALUES (?, ?, ?, 'nuevo', ?, ?, ?, ?)`,
    )
    .bind(
      lead.id,
      lead.negocioId,
      lead.contactoId,
      lead.interes,
      lead.valorEstimadoCentavos,
      lead.creadoEn,
      lead.actualizadoEn,
    )
    .run();

  return r.meta.changes > 0 ? lead : null;
}

export async function listarLeads(db: D1Database, negocioId: string): Promise<Lead[]> {
  const { results } = await db
    .prepare(`SELECT ${COLS_LEAD} FROM leads WHERE negocio_id = ? ORDER BY actualizado_en DESC`)
    .bind(negocioId)
    .all<FilaLead>();

  return results.map(aLead);
}

/** Los que todavía pueden convertirse: ni ganados ni descartados. */
export async function contarLeadsAbiertos(db: D1Database, negocioId: string): Promise<number> {
  const fila = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads
        WHERE negocio_id = ? AND estado NOT IN ('cliente','perdido')`,
    )
    .bind(negocioId)
    .first<{ n: number }>();

  return fila?.n ?? 0;
}
```

- [ ] **Step 3: Apply the schema and verify the tables exist**

```bash
set -o pipefail
npx wrangler d1 execute chuno --remote --file=src/db/schema.sql --yes
npx wrangler d1 execute chuno --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('contactos','leads','uso_llm')" --json
```
Expected: las tres tablas listadas.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
npm test
git add src/db/schema.sql src/db/repos/crm.ts
git commit -m "feat(crm): tablas y repos de contactos, leads y uso del modelo

Un lead abierto por contacto: el mismo cliente escribiendo tres veces no son
tres oportunidades de venta. El índice único es lo que lo garantiza, no la
disciplina de quien llama.

El UPDATE del nombre solo mejora, nunca degrada: un contacto que ya se llamaba
Marta no vuelve a llamarse 'Cliente' porque un canal no mandó el nombre."
```

---

### Task 4: El agente alimenta el CRM y contabiliza el consumo

**Files:**
- Modify: `src/llm/tipos.ts` (agregar `UsoLLM` y el callback `onUso`)
- Modify: `src/llm/gemini.ts` (leer `usageMetadata` y reportarlo)
- Create: `src/db/repos/uso.ts`
- Modify: `src/agente/agente.ts` (registrar contacto, lead y uso)

**Interfaces:**
- Consumes: `registrarContacto`, `registrarLead` de `src/db/repos/crm.ts`; `UsoModelo` de `src/core/metricas/gasto.ts`
- Produces: `type UsoLLM = { modelo: string; tokensEntrada: number; tokensSalida: number; exito: boolean }`, `crearProveedorGemini(apiKey, modelos, onUso?)`, `registrarUso(db, negocioId, usos) → Promise<void>`

- [ ] **Step 1: Extend the provider interface**

In `src/llm/tipos.ts`, add before `ProveedorLLM`:

```typescript
/** Lo que consumió una llamada. Se reporta aunque falle: un error también gasta. */
export interface UsoLLM {
  readonly modelo: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly exito: boolean;
}

/** El proveedor reporta consumo por aquí en vez de devolverlo, para no
 *  cambiar la forma de `generarTexto` y `generarJSON`. */
export type ReporteUso = (uso: UsoLLM) => void;
```

- [ ] **Step 2: Report usage from Gemini**

In `src/llm/gemini.ts`:

Add to the `RespuestaGemini` interface:

```typescript
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
```

Change the factory signature to accept the callback:

```typescript
export function crearProveedorGemini(
  apiKey: string,
  modelos: readonly string[] = MODELOS_POR_DEFECTO,
  onUso?: ReporteUso,
): ProveedorLLM {
```

Add the import at the top: `import type { ReporteUso, UsoLLM } from "./tipos";` (merge with the existing type import).

Inside `llamarModelo`, right after `const datos = (await respuesta.json()) as RespuestaGemini;`:

```typescript
      // Se reporta siempre, incluso si la llamada falló: una respuesta cortada
      // o rechazada también consumió cuota.
      onUso?.({
        modelo,
        tokensEntrada: datos.usageMetadata?.promptTokenCount ?? 0,
        tokensSalida: datos.usageMetadata?.candidatesTokenCount ?? 0,
        exito: respuesta.ok,
      });
```

- [ ] **Step 3: Write the usage repo**

Create `src/db/repos/uso.ts`:

```typescript
import type { UsoLLM } from "../../llm/tipos";
import { ahoraISO, nuevoId } from "../id";

/** Escribe el consumo en lote: una llamada al agente genera dos o tres usos. */
export async function registrarUso(
  db: D1Database,
  negocioId: string,
  usos: readonly UsoLLM[],
): Promise<void> {
  if (usos.length === 0) return;

  const ahora = ahoraISO();
  await db.batch(
    usos.map((u) =>
      db
        .prepare(
          `INSERT INTO uso_llm
             (id, negocio_id, modelo, tokens_entrada, tokens_salida, exito, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(nuevoId("uso"), negocioId, u.modelo, u.tokensEntrada, u.tokensSalida, u.exito ? 1 : 0, ahora),
    ),
  );
}
```

- [ ] **Step 4: Wire it into the agent**

In `src/agente/agente.ts`:

Add imports:

```typescript
import { registrarContacto, registrarLead } from "../db/repos/crm";
import { registrarUso } from "../db/repos/uso";
import type { UsoLLM } from "../llm/tipos";
```

Inside `procesar`, replace the line that creates the provider with:

```typescript
    // Se acumula en memoria y se escribe una vez al final: contabilizar el gasto
    // no puede costar un viaje a la base por cada llamada al modelo.
    const usos: UsoLLM[] = [];
    const llm = crearProveedorGemini(this.env.GEMINI_API_KEY, modelos(this.env), (u) =>
      usos.push(u),
    );
```

Right after `const hilo = await leerHilo(...)` and the `ultimoDelCliente` guard, add:

```typescript
    // El CRM se alimenta aquí: sin pantalla de captura y sin que nadie escriba
    // nada. Es la diferencia entre un CRM que se usa y uno que se abandona.
    const contacto = await registrarContacto(
      db,
      negocioId,
      conversacion.canal,
      conversacion.canalChatId,
      conversacion.clienteNombre,
    );
```

At the very end of `procesar`, after the `sin_accion` audit block, add:

```typescript
    if (extraccion.valor.hayPedido || extraccion.valor.necesitaHumano) {
      await registrarLead(db, {
        negocioId,
        contactoId: contacto.id,
        interes:
          extraccion.valor.items.map((i) => i.descripcion).join(", ") ||
          extraccion.valor.preguntaPendiente,
        valorEstimadoCentavos: extraccion.valor.montoCentavos,
      });
    }

    await registrarUso(db, negocioId, usos);
```

- [ ] **Step 5: Typecheck, test and deploy**

```bash
set -o pipefail
npm run typecheck
npm test
npx wrangler deploy
```
Expected: typecheck limpio, 60 tests verdes, despliegue correcto.

- [ ] **Step 6: Verify against production**

Escribirle al bot de Telegram y luego:

```bash
npx wrangler d1 execute chuno --remote --command \
  "SELECT (SELECT COUNT(*) FROM contactos WHERE negocio_id='mi-optica') contactos,
          (SELECT COUNT(*) FROM leads WHERE negocio_id='mi-optica') leads,
          (SELECT COUNT(*) FROM uso_llm WHERE negocio_id='mi-optica') usos" --json
```
Expected: `contactos >= 1`, `usos >= 2` (una llamada de respuesta y una de extracción).

- [ ] **Step 7: Commit**

```bash
git add src/llm src/db/repos/uso.ts src/agente/agente.ts
git commit -m "feat(crm): el agente alimenta contactos, leads y consumo

El CRM se llena desde la conversación, sin pantalla de captura. Un CRM que
exige que alguien escriba los datos es un CRM que se abandona a la semana.

El consumo se acumula en memoria y se escribe una vez al final: contabilizar el
gasto no puede costar un viaje a la base por cada llamada al modelo. Se reporta
también cuando la llamada falla, porque un error igual consume cuota."
```

---

### Task 5: Repo de métricas y pantalla de inicio del panel

**Files:**
- Create: `src/db/repos/metricas.ts`
- Create: `src/admin/vistas-metricas.ts`
- Modify: `src/admin/html.ts` (agregar el enlace "Inicio" a la navegación y el CSS de las tarjetas de métrica)
- Modify: `src/index.ts` (ruta `${base}/inicio` y redirección de `${base}`)

**Interfaces:**
- Consumes: `evaluarSalud` de `src/core/metricas/salud.ts`; `costoTotalCentavos` de `src/core/metricas/gasto.ts`; `contarContactosActivos`, `contarLeadsAbiertos` de `src/db/repos/crm.ts`; `contarPendientes` de `src/db/repos/propuesta.ts`
- Produces: `type Metricas`, `calcularMetricas(db, negocioId, zonaHoraria) → Promise<Metricas>`, `vistaMetricas(metricas) → string`

- [ ] **Step 1: Write the metrics repo**

Create `src/db/repos/metricas.ts`:

```typescript
import { costoTotalCentavos, type UsoModelo } from "../../core/metricas/gasto";
import { evaluarSalud, type EstadoSalud } from "../../core/metricas/salud";
import { contarContactosActivos, contarLeadsAbiertos } from "./crm";
import { contarPendientes } from "./propuesta";

export interface Metricas {
  readonly mensajesHoy: number;
  readonly clientesUnicosHoy: number;
  readonly leadsAbiertos: number;
  readonly decisionesPendientes: number;
  readonly salud: EstadoSalud;
  readonly gastoMesCentavos: number;
  readonly todoGratis: boolean;
}

/**
 * El "hoy" se calcula contra la medianoche del negocio, no contra UTC.
 * A las 8 p.m. en Bogotá ya cambió el día en UTC, y el panel mostraría cero
 * mensajes en plena tarde de trabajo.
 */
function inicioDelDia(zonaHoraria: string): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Bogotá es UTC-5 todo el año, sin horario de verano.
  return `${fecha}T05:00:00.000Z`;
}

export async function calcularMetricas(
  db: D1Database,
  negocioId: string,
  zonaHoraria: string,
): Promise<Metricas> {
  const desde = inicioDelDia(zonaHoraria);
  const haceUnMes = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [mensajes, clientes, leads, pendientes, fallos, usos] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM mensajes WHERE negocio_id = ? AND creado_en >= ?")
      .bind(negocioId, desde)
      .first<{ n: number }>(),
    contarContactosActivos(db, negocioId, desde),
    contarLeadsAbiertos(db, negocioId),
    contarPendientes(db, negocioId),
    db
      .prepare(
        `SELECT SUM(CASE WHEN exito = 0 THEN 1 ELSE 0 END) AS fallos, COUNT(*) AS total
           FROM uso_llm WHERE negocio_id = ? AND creado_en >= ?`,
      )
      .bind(negocioId, haceUnMes)
      .first<{ fallos: number | null; total: number }>(),
    db
      .prepare(
        `SELECT modelo, SUM(tokens_entrada) AS entrada, SUM(tokens_salida) AS salida
           FROM uso_llm WHERE negocio_id = ? AND creado_en >= ? GROUP BY modelo`,
      )
      .bind(negocioId, haceUnMes)
      .all<{ modelo: string; entrada: number; salida: number }>(),
  ]);

  const consumo: UsoModelo[] = usos.results.map((u) => ({
    modelo: u.modelo,
    tokensEntrada: u.entrada ?? 0,
    tokensSalida: u.salida ?? 0,
  }));

  const gasto = costoTotalCentavos(consumo);

  return {
    mensajesHoy: mensajes?.n ?? 0,
    clientesUnicosHoy: clientes,
    leadsAbiertos: leads,
    decisionesPendientes: pendientes,
    salud: evaluarSalud({ fallos: fallos?.fallos ?? 0, total: fallos?.total ?? 0 }),
    gastoMesCentavos: gasto,
    todoGratis: gasto === 0 && consumo.length > 0,
  };
}
```

- [ ] **Step 2: Add the metric-card CSS**

In `src/admin/html.ts`, append to the `CSS` template string, right before the closing backtick:

```css
.metricas { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-bottom:16px; }
.metrica { background:var(--tarjeta); border:1px solid var(--borde); border-radius:var(--radio); padding:16px; }
.metrica .cifra { font-size:30px; font-weight:700; letter-spacing:-1px; line-height:1.1; }
.metrica .rotulo { color:var(--suave); font-size:13px; margin-top:4px; }
.metrica.alerta .cifra { color:var(--alerta); }
.salud { display:inline-flex; align-items:center; gap:7px; font-size:15px; font-weight:600; }
.punto { width:9px; height:9px; border-radius:50%; display:inline-block; }
.punto.bien { background:var(--bien); }
.punto.atencion { background:var(--aviso); }
.punto.critico { background:var(--alerta); }
```

In the same file, change the `activo` parameter type of `pagina` from
`"bandeja" | "pedidos" | "registro"` to `"inicio" | "bandeja" | "pedidos" | "clientes" | "registro"`,
and replace the `<nav>` block with:

```typescript
<nav>
  ${enlace("/inicio", "Inicio", "inicio")}
  ${enlace("/bandeja", "Decisiones", "bandeja", opciones.pendientes)}
  ${enlace("/pedidos", "Pedidos", "pedidos")}
  ${enlace("/clientes", "Clientes", "clientes")}
  ${enlace("/registro", "Registro", "registro")}
</nav>
```

- [ ] **Step 3: Write the metrics view**

Create `src/admin/vistas-metricas.ts`:

```typescript
import type { Metricas } from "../db/repos/metricas";
import { esc, pesos } from "./html";

const ROTULO_SALUD = {
  bien: "Todo bien",
  atencion: "Requiere atención",
  critico: "Con problemas",
} as const;

function tarjeta(cifra: string, rotulo: string, alerta = false): string {
  return `<div class="metrica ${alerta ? "alerta" : ""}">
    <div class="cifra">${esc(cifra)}</div>
    <div class="rotulo">${esc(rotulo)}</div>
  </div>`;
}

/** La pantalla que el dueño abre en la mañana: cómo va el negocio hoy. */
export function vistaMetricas(m: Metricas): string {
  const gasto = m.todoGratis ? "Gratis" : pesos(m.gastoMesCentavos);

  return `<div class="metricas">
    ${tarjeta(String(m.mensajesHoy), "Mensajes hoy")}
    ${tarjeta(String(m.clientesUnicosHoy), "Clientes hoy")}
    ${tarjeta(String(m.leadsAbiertos), "Leads abiertos")}
    ${tarjeta(String(m.decisionesPendientes), "Esperando tu decisión", m.decisionesPendientes > 0)}
  </div>
  <div class="metricas">
    <div class="metrica">
      <div class="salud"><span class="punto ${m.salud}"></span>${esc(ROTULO_SALUD[m.salud])}</div>
      <div class="rotulo">Salud del asistente</div>
    </div>
    ${tarjeta(gasto, "Gasto de los últimos 30 días")}
  </div>`;
}
```

- [ ] **Step 4: Add the route**

In `src/index.ts`, add the import:

```typescript
import { calcularMetricas } from "./db/repos/metricas";
import { vistaMetricas } from "./admin/vistas-metricas";
```

Inside `montarPanel`, change the redirect and add the route:

```typescript
  app.get(`${base}`, (c) => c.redirect(`${base}/inicio`));

  app.get(`${base}/inicio`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const metricas = await calcularMetricas(c.env.DB, negocioId, negocio.zonaHoraria);

    return c.html(
      pagina({
        titulo: "Inicio",
        negocio: negocio.nombre,
        activo: "inicio",
        pendientes: metricas.decisionesPendientes,
        contenido: vistaMetricas(metricas),
        base,
      }),
    );
  });
```

- [ ] **Step 5: Typecheck, test, deploy and verify**

```bash
set -o pipefail
npm run typecheck
npm test
npx wrangler deploy
curl -s -o /dev/null -w '%{http_code}\n' https://chuno.vozdigital-ai.workers.dev/demo/inicio
```
Expected: typecheck limpio, tests verdes, `200`.

- [ ] **Step 6: Commit**

```bash
git add src/db/repos/metricas.ts src/admin/vistas-metricas.ts src/admin/html.ts src/index.ts
git commit -m "feat(panel): pantalla de inicio con las seis métricas

El 'hoy' se calcula contra la medianoche del negocio y no contra UTC: a las
8 p.m. en Bogotá ya cambió el día en UTC y el panel mostraría cero mensajes en
plena tarde de trabajo."
```

---

### Task 6: Pantalla de clientes y siembra de la demo

**Files:**
- Create: `src/admin/vistas-clientes.ts`
- Modify: `src/index.ts` (ruta `${base}/clientes`)
- Modify: `src/db/seed.sql` (contactos y leads de la óptica de ejemplo)

**Interfaces:**
- Consumes: `listarContactos`, `listarLeads` de `src/db/repos/crm.ts`; `Contacto`, `Lead` de `src/core/crm/tipos.ts`
- Produces: `vistaClientes(contactos, leads) → string`

- [ ] **Step 1: Write the customers view**

Create `src/admin/vistas-clientes.ts`:

```typescript
import type { Contacto, EstadoLead, Lead } from "../core/crm/tipos";
import { esc, fechaCorta, pesos } from "./html";

const ROTULO_LEAD: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  cliente: "Cliente",
  perdido: "Perdido",
};

/**
 * El CRM que nadie llena a mano.
 *
 * Cada fila salió de una conversación real: nadie abrió un formulario para
 * crearla. Ese es el punto de la pantalla.
 */
export function vistaClientes(
  contactos: readonly Contacto[],
  leads: readonly Lead[],
): string {
  if (contactos.length === 0) {
    return `<div class="tarjeta vacio">
      <strong>Todavía no hay clientes</strong>
      Se van creando solos con cada conversación que entra.
    </div>`;
  }

  const porContacto = new Map(leads.map((l) => [l.contactoId, l]));

  const filas = contactos
    .map((c) => {
      const lead = porContacto.get(c.id);
      return `<tr>
        <td><strong>${esc(c.nombre)}</strong><br>
            <span style="color:var(--suave)">${esc(c.canal)}</span></td>
        <td>${esc(lead?.interes ?? "—")}</td>
        <td>${lead ? `<span class="chip ok">${esc(ROTULO_LEAD[lead.estado])}</span>` : "—"}</td>
        <td>${esc(pesos(lead?.valorEstimadoCentavos ?? null))}</td>
        <td>${esc(String(c.totalMensajes))}</td>
        <td>${esc(fechaCorta(c.ultimaInteraccion))}</td>
      </tr>`;
    })
    .join("");

  return `<div class="tarjeta"><table>
    <thead><tr>
      <th>Cliente</th><th>Interés</th><th>Estado</th>
      <th>Valor</th><th>Msjs</th><th>Último contacto</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}
```

- [ ] **Step 2: Add the route**

In `src/index.ts`, add the imports:

```typescript
import { listarContactos, listarLeads } from "./db/repos/crm";
import { vistaClientes } from "./admin/vistas-clientes";
```

Inside `montarPanel`, add:

```typescript
  app.get(`${base}/clientes`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const [contactos, leads, pendientes] = await Promise.all([
      listarContactos(c.env.DB, negocioId),
      listarLeads(c.env.DB, negocioId),
      contarPendientes(c.env.DB, negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Clientes",
        negocio: negocio.nombre,
        activo: "clientes",
        pendientes,
        contenido: vistaClientes(contactos, leads),
        base,
      }),
    );
  });
```

- [ ] **Step 3: Seed the demo CRM**

In `src/db/seed.sql`, add to the `DELETE` block at the top:

```sql
DELETE FROM uso_llm    WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM leads      WHERE negocio_id IN ('demo-optica', 'mi-optica');
DELETE FROM contactos  WHERE negocio_id IN ('demo-optica', 'mi-optica');
```

Append at the end of the file:

```sql
-- ──────────────────────────────────────────────────────────────────── CRM ───
-- Ningún dato de aquí lo escribió una persona: todos salieron de las
-- conversaciones de arriba.

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
  ('u5','demo-optica','gemini-3.6-flash',1580,0,0,datetime('now','-3 days'));
```

- [ ] **Step 4: Apply, deploy and verify**

```bash
set -o pipefail
npm run typecheck
npm test
npx wrangler d1 execute chuno --remote --file=src/db/seed.sql --yes
npx wrangler deploy
for R in /demo/inicio /demo/clientes; do
  printf "%-16s → %s\n" "$R" "$(curl -s -o /dev/null -w '%{http_code}' "https://chuno.vozdigital-ai.workers.dev$R")"
done
curl -s https://chuno.vozdigital-ai.workers.dev/demo/inicio | grep -o 'class="cifra">[^<]*'
```
Expected: ambas rutas `200`; las cifras muestran clientes y leads distintos de cero.

- [ ] **Step 5: Commit and close the phase**

```bash
git add src/admin/vistas-clientes.ts src/index.ts src/db/seed.sql
git commit -m "feat(panel): pantalla de clientes y siembra del CRM en la demo

Ningún dato del CRM sembrado lo escribió una persona: todos salen de las
conversaciones. Es el punto de la pantalla y es lo que se muestra en el pitch."
```

---

## Puerta de la Fase 1

No se avanza a la Fase 2 sin esto:

- [ ] `npm test` verde — 60 tests: 43 previos + 7 del embudo + 10 de métricas
- [ ] `npm run typecheck` limpio
- [ ] Un mensaje nuevo por Telegram crea contacto, incrementa `total_mensajes` y registra consumo
- [ ] `/panel/inicio` y `/demo/inicio` muestran las seis métricas con datos reales
- [ ] `/demo/clientes` lista los nueve contactos sembrados con su estado en el embudo
- [ ] Ningún dato del CRM exigió captura manual en ninguna pantalla
