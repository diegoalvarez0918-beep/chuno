# El cerebro configurable — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **En este proyecto no se despachan subagentes** — orden explícita de Diego.

**Goal:** Que cada negocio pueda traer su propio proveedor de LLM y su propia llave, con el secreto del despliegue como valor por defecto.

**Architecture:** Una regla de precedencia pura en `src/core/llm/configuracion.ts` decide de dónde sale la configuración —todo del negocio o todo del entorno, nunca mezclada—. `src/llm/proveedor.ts` la alimenta leyendo `credenciales` y `settings`, y construye el proveedor que toque. Un adaptador nuevo compatible con la API de OpenAI cubre todo lo que no sea Gemini.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, vitest, Node (el CLI).

## Global Constraints

- **`src/core/` es puro:** sin Cloudflare, sin red, sin LLM, sin reloj. Los secretos entran como parámetro.
- **Regla 4:** la llave va cifrada en `credenciales`. Lo que no es secreto va en `settings`.
- **Sin SDK.** El adaptador se escribe contra la API REST, como `llm/gemini.ts`.
- **La precedencia es todo-o-nada.** Si falta algo de la configuración del negocio, se descarta **entera** y se usa la del entorno. Nunca se combinan.
- **Nunca `git push` ni desplegar sin que Diego lo pida.**
- Línea base al empezar: **212 tests verdes, typecheck limpio**, `main` en `33afab8`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/core/llm/configuracion.ts` | **Nuevo.** Los tipos y la regla de precedencia. Único sitio donde vive el todo-o-nada |
| `test/core/llm-configuracion.test.ts` | **Nuevo.** La regla, incluidos los estados incompletos |
| `src/llm/openai-compatible.ts` | **Nuevo.** Adaptador REST para cualquier endpoint compatible con OpenAI |
| `test/llm/openai-compatible.test.ts` | **Nuevo.** Solo lo puro: el armado de mensajes y la lectura del consumo |
| `src/llm/proveedor.ts` | **Nuevo.** Lee D1, aplica la regla y construye el proveedor |
| `src/llm/gemini.ts` | Cede su lista de modelos por defecto al núcleo |
| `src/db/repos/credencial.ts` | `ClaveCredencial` gana `llm_api_key` |
| `src/agente/agente.ts` | Resuelve la configuración una vez: la usa para el tope y para el proveedor |
| `src/index.ts` | El respaldo del onboarding usa el proveedor del negocio |
| `cli/chuno.mjs` | Pregunta proveedor y llave, y valida antes de guardar |

---

### Task 1: La regla de precedencia, pura

**Files:**
- Create: `src/core/llm/configuracion.ts`
- Modify: `src/llm/gemini.ts:22-30`
- Test: `test/core/llm-configuracion.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `type ProveedorId = "gemini" | "compatible"`, `interface ConfiguracionLLM`, `interface ConfiguracionParcial`, `MODELOS_GEMINI: readonly string[]`, `resolverConfiguracionLLM(delNegocio, deLaInstalacion): ConfiguracionLLM`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/core/llm-configuracion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MODELOS_GEMINI,
  resolverConfiguracionLLM,
  type ConfiguracionLLM,
  type ConfiguracionParcial,
} from "../../src/core/llm/configuracion";

const instalacion: ConfiguracionLLM = {
  proveedor: "gemini",
  apiKey: "llave-de-la-instalacion",
  baseUrl: null,
  modelos: ["gemini-3.6-flash"],
  topeDiario: 500,
};

const sinNada: ConfiguracionParcial = {
  apiKey: null,
  proveedor: null,
  baseUrl: null,
  modelos: [],
  topeDiario: null,
};

describe("resolverConfiguracionLLM", () => {
  it("sin llave propia, todo sale del entorno", () => {
    expect(resolverConfiguracionLLM(sinNada, instalacion)).toEqual(instalacion);
  });

  // El caso que da nombre a la regla: nada del entorno se cuela.
  it("con llave propia, todo sale del negocio", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        modelos: ["anthropic/claude-haiku-4.5"],
        topeDiario: 50,
      },
      instalacion,
    );

    expect(r).toEqual({
      proveedor: "compatible",
      apiKey: "llave-del-negocio",
      baseUrl: "https://openrouter.ai/api/v1",
      modelos: ["anthropic/claude-haiku-4.5"],
      topeDiario: 50,
    });
  });

  it("con llave propia y sin tope, el tope es el del entorno", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio", topeDiario: null },
      instalacion,
    );
    expect(r.apiKey).toBe("llave-del-negocio");
    expect(r.topeDiario).toBe(500);
  });

  it("con llave propia y sin proveedor, se asume gemini con sus modelos", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio" },
      instalacion,
    );
    expect(r.proveedor).toBe("gemini");
    expect(r.modelos).toEqual(MODELOS_GEMINI);
  });

  // La trampa que el todo-o-nada existe para cerrar: sin baseUrl NO se toma la
  // del entorno, porque sería la llave de uno contra el endpoint del otro.
  it("compatible sin baseUrl se descarta ENTERO y cae al entorno", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: null,
        modelos: ["gpt-4o-mini"],
        topeDiario: 50,
      },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });

  it("compatible sin modelos se descarta ENTERO y cae al entorno", () => {
    const r = resolverConfiguracionLLM(
      {
        apiKey: "llave-del-negocio",
        proveedor: "compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        modelos: [],
        topeDiario: null,
      },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });

  it("un proveedor que no reconocemos se descarta ENTERO", () => {
    const r = resolverConfiguracionLLM(
      { ...sinNada, apiKey: "llave-del-negocio", proveedor: "brujeria" },
      instalacion,
    );
    expect(r).toEqual(instalacion);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/core/llm-configuracion.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/core/llm/configuracion"`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/core/llm/configuracion.ts`:

```ts
import { TOPE_DIARIO } from "../limites";

/**
 * De dónde sale la configuración del cerebro de un negocio.
 *
 * La regla es TODO-O-NADA y esa es la decisión importante de este archivo: si
 * el negocio tiene llave propia, toda su configuración sale de sus ajustes; si
 * no, toda sale del entorno. Mezclar campo por campo suena más flexible y
 * produce el peor estado posible — la llave de uno contra el endpoint del
 * otro—, que además se lee como "la llave del cliente no sirve".
 */

export type ProveedorId = "gemini" | "compatible";

/** Verificados contra la capa gratuita: responden y devuelven JSON limpio. */
export const MODELOS_GEMINI = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
] as const;

export interface ConfiguracionLLM {
  readonly proveedor: ProveedorId;
  readonly apiKey: string;
  /** Solo para `compatible`. Gemini trae la suya en el adaptador. */
  readonly baseUrl: string | null;
  readonly modelos: readonly string[];
  readonly topeDiario: number;
}

/**
 * Lo que se leyó de los ajustes del negocio. Cualquier campo puede faltar: son
 * filas sueltas de `settings` y una credencial, no un objeto atómico.
 */
export interface ConfiguracionParcial {
  readonly apiKey: string | null;
  readonly proveedor: string | null;
  readonly baseUrl: string | null;
  readonly modelos: readonly string[];
  readonly topeDiario: number | null;
}

export function resolverConfiguracionLLM(
  delNegocio: ConfiguracionParcial,
  deLaInstalacion: ConfiguracionLLM,
): ConfiguracionLLM {
  // Sin llave no hay con qué llamar, digan lo que digan los demás ajustes.
  if (!delNegocio.apiKey) return deLaInstalacion;

  // Sin proveedor declarado se asume Gemini: es el único que no necesita URL,
  // y es el caso del negocio que solo quiere pagar su propia cuota gratuita.
  const proveedor = delNegocio.proveedor ?? "gemini";

  if (proveedor === "gemini") {
    return {
      proveedor: "gemini",
      apiKey: delNegocio.apiKey,
      baseUrl: null,
      modelos: delNegocio.modelos.length > 0 ? delNegocio.modelos : MODELOS_GEMINI,
      topeDiario: delNegocio.topeDiario ?? deLaInstalacion.topeDiario,
    };
  }

  // Un endpoint compatible sin URL o sin modelos no se puede completar: no hay
  // valor por defecto honesto que inventarle, y tomar el del entorno sería la
  // mezcla que esta regla existe para prohibir. Se descarta entero.
  if (proveedor === "compatible" && delNegocio.baseUrl && delNegocio.modelos.length > 0) {
    return {
      proveedor: "compatible",
      apiKey: delNegocio.apiKey,
      baseUrl: delNegocio.baseUrl,
      modelos: delNegocio.modelos,
      topeDiario: delNegocio.topeDiario ?? deLaInstalacion.topeDiario,
    };
  }

  return deLaInstalacion;
}

/** El tope del código, para quien arme la configuración de la instalación. */
export const TOPE_DIARIO_POR_DEFECTO = TOPE_DIARIO;
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/core/llm-configuracion.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Que `gemini.ts` deje de tener su propia copia de la lista**

En `src/llm/gemini.ts`, borrar el bloque:

```ts
/** Verificados contra la capa gratuita: responden y devuelven JSON limpio. */
export const MODELOS_POR_DEFECTO = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];
```

y en su lugar, junto a los demás imports:

```ts
import { MODELOS_GEMINI } from "../core/llm/configuracion";

/**
 * La lista vive en el núcleo porque la necesitan dos: este adaptador y la regla
 * de precedencia, que la usa como valor por defecto del negocio que solo trae
 * llave. Escrita dos veces se desincroniza el día que se jubile un modelo.
 */
export const MODELOS_POR_DEFECTO: readonly string[] = MODELOS_GEMINI;
```

- [ ] **Step 6: Correr todo y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — **219 tests** (212 de base + 7), typecheck limpio

- [ ] **Step 7: Commit**

```bash
git add src/core/llm/configuracion.ts test/core/llm-configuracion.test.ts src/llm/gemini.ts
git commit -m "feat(core): la regla de precedencia del cerebro, todo-o-nada

Si el negocio tiene llave propia, TODA su configuración sale de sus
ajustes; si no, toda sale del entorno. Nunca se mezclan: la llave de uno
contra el endpoint del otro es el peor estado posible, y se lee como que
la llave del cliente no sirve.

Un compatible sin URL o sin modelos no se completa con el entorno — se
descarta entero. La lista de modelos de Gemini sube al núcleo porque
ahora la necesitan el adaptador y la regla."
```

---

### Task 2: El adaptador compatible con OpenAI

**Files:**
- Create: `src/llm/openai-compatible.ts`
- Test: `test/llm/openai-compatible.test.ts`
- Modify: `CLAUDE.md:107-108`, `vitest.config.ts:3-6`

**Interfaces:**
- Consumes: `otroModeloPuedeAyudar`, `msParaElSiguienteIntento`, `PRESUPUESTO_TOTAL_MS` de `src/core/llm/reintento.ts`; `ProveedorLLM`, `MensajeLLM`, `UsoLLM`, `ReporteUso` de `src/llm/tipos.ts`
- Produces: `crearProveedorCompatible(opciones): ProveedorLLM`, y para los tests `aMensajesOpenAI(sistema, mensajes)` y `usoDeRespuesta(datos, modelo)`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/llm/openai-compatible.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aMensajesOpenAI, usoDeRespuesta } from "../../src/llm/openai-compatible";

describe("aMensajesOpenAI", () => {
  // Gemini lleva el prompt de sistema en `systemInstruction`; aquí va como un
  // mensaje más, y tiene que ir PRIMERO o el modelo lo lee como si lo hubiera
  // dicho el cliente a media conversación.
  it("pone el sistema de primero y traduce los roles", () => {
    expect(
      aMensajesOpenAI("eres un asistente", [
        { rol: "usuario", texto: "hola" },
        { rol: "modelo", texto: "buenas" },
      ]),
    ).toEqual([
      { role: "system", content: "eres un asistente" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
    ]);
  });

  it("con hilo vacío deja solo el sistema", () => {
    expect(aMensajesOpenAI("instrucciones", [])).toEqual([
      { role: "system", content: "instrucciones" },
    ]);
  });
});

describe("usoDeRespuesta", () => {
  it("lee el consumo del bloque usage", () => {
    expect(
      usoDeRespuesta({ usage: { prompt_tokens: 828, completion_tokens: 72 } }, "gpt-4o-mini", true),
    ).toEqual({ modelo: "gpt-4o-mini", tokensEntrada: 828, tokensSalida: 72, exito: true });
  });

  // Un proveedor compatible puede no mandar `usage`. Que falte no puede tumbar
  // la llamada ni inventar cifras: cero es honesto, `undefined` rompe la suma.
  it("sin bloque usage devuelve ceros, no undefined", () => {
    expect(usoDeRespuesta({}, "modelo-x", false)).toEqual({
      modelo: "modelo-x",
      tokensEntrada: 0,
      tokensSalida: 0,
      exito: false,
    });
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/llm/openai-compatible.test.ts`
Expected: FAIL — `Failed to resolve import ".../src/llm/openai-compatible"`

- [ ] **Step 3: Escribir el adaptador**

Crear `src/llm/openai-compatible.ts`:

```ts
import {
  msParaElSiguienteIntento,
  otroModeloPuedeAyudar,
  PRESUPUESTO_TOTAL_MS,
} from "../core/llm/reintento";
import { fallo, ok, type Resultado } from "../core/resultado";
import type {
  MensajeLLM,
  OpcionesJSON,
  OpcionesTexto,
  ProveedorLLM,
  ReporteUso,
  UsoLLM,
} from "./tipos";

/**
 * Proveedor para cualquier endpoint que hable el dialecto de OpenAI.
 *
 * Uno solo cubre OpenRouter —y a través de él Claude, GPT, Llama o DeepSeek—,
 * OpenAI directo, Groq, Together y hasta un servidor propio: lo único que
 * cambia es la URL base. Sin SDK, por la misma razón que `gemini.ts`: una
 * dependencia menos que pueda romperse en el runtime de Workers.
 */

interface RespuestaCompatible {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * El prompt de sistema va como un mensaje y de PRIMERO. Es la diferencia con
 * Gemini que más fácil se pasa por alto: puesto en otro sitio, el modelo lo lee
 * como si lo hubiera dicho el cliente a media conversación.
 */
export function aMensajesOpenAI(sistema: string, mensajes: readonly MensajeLLM[]) {
  return [
    { role: "system", content: sistema },
    ...mensajes.map((m) => ({
      role: m.rol === "usuario" ? "user" : "assistant",
      content: m.texto,
    })),
  ];
}

/** Cero y no `undefined` cuando el proveedor no manda `usage`: la suma del gasto no puede romperse porque falte un bloque opcional. */
export function usoDeRespuesta(
  datos: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  modelo: string,
  exito: boolean,
): UsoLLM {
  return {
    modelo,
    tokensEntrada: datos.usage?.prompt_tokens ?? 0,
    tokensSalida: datos.usage?.completion_tokens ?? 0,
    exito,
  };
}

export function crearProveedorCompatible(opciones: {
  apiKey: string;
  baseUrl: string;
  modelos: readonly string[];
  onUso?: ReporteUso;
}): ProveedorLLM {
  const { apiKey, baseUrl, modelos, onUso } = opciones;
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function llamar(cuerpoBase: Record<string, unknown>): Promise<Resultado<string, string>> {
    let ultimoError = "sin modelos configurados";
    const limite = Date.now() + PRESUPUESTO_TOTAL_MS;

    for (const modelo of modelos) {
      const msDisponibles = msParaElSiguienteIntento(limite - Date.now());
      if (msDisponibles === null) {
        ultimoError = `${ultimoError} (presupuesto agotado, quedaban modelos por probar)`;
        break;
      }

      const intento = await llamarModelo(modelo, cuerpoBase, msDisponibles);
      if (intento.ok) return intento;

      ultimoError = intento.error;
      if (!otroModeloPuedeAyudar(intento.error)) break;
    }

    return fallo(ultimoError);
  }

  async function llamarModelo(
    modelo: string,
    cuerpoBase: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Resultado<string, string>> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);

    try {
      const respuesta = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...cuerpoBase, model: modelo }),
        signal: control.signal,
      });

      const datos = (await respuesta.json()) as RespuestaCompatible;

      // Se reporta siempre: una respuesta rechazada también consumió cuota.
      onUso?.(usoDeRespuesta(datos, modelo, respuesta.ok));

      if (!respuesta.ok) {
        const detalle = datos.error?.message?.slice(0, 120) ?? "";
        return fallo(`compatible/${modelo}: HTTP ${respuesta.status}${detalle ? `: ${detalle}` : ""}`);
      }

      const eleccion = datos.choices?.[0];
      if (!eleccion) return fallo(`compatible/${modelo}: respuesta sin choices`);

      // Cortada por límite de tokens: media frase al cliente o un JSON
      // truncado. Preferimos fallar y que otro modelo lo intente.
      if (eleccion.finish_reason && eleccion.finish_reason !== "stop") {
        return fallo(`compatible/${modelo}: HTTP 429 generación detenida por ${eleccion.finish_reason}`);
      }

      const texto = eleccion.message?.content?.trim();
      if (!texto) return fallo(`compatible/${modelo}: respuesta vacía`);

      return ok(texto);
    } catch (e) {
      const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
      return fallo(`compatible/${modelo}: fallo de ${razon}`);
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    nombre: `compatible:${modelos[0] ?? "sin-modelo"}`,

    async generarTexto(opcionesTexto: OpcionesTexto) {
      return llamar({
        messages: aMensajesOpenAI(opcionesTexto.sistema, opcionesTexto.mensajes),
        temperature: opcionesTexto.temperatura ?? 0.4,
        max_tokens: opcionesTexto.maxTokens ?? 1200,
      });
    },

    async generarJSON<T>(opcionesJSON: OpcionesJSON<T>): Promise<Resultado<T, string>> {
      const crudo = await llamar({
        messages: aMensajesOpenAI(opcionesJSON.sistema, opcionesJSON.mensajes),
        temperature: 0,
        max_tokens: opcionesJSON.maxTokens ?? 3000,
        // `json_object` y no esquema estricto: OpenRouter documenta que el
        // estricto no lo soportan todos los modelos, y pedírselo a uno que no
        // puede devuelve 400 — que nuestra política clasifica como culpa
        // nuestra y no reintenta. La frontera real es `validar`, que es Zod.
        response_format: { type: "json_object" },
      });

      if (!crudo.ok) return crudo;

      let parseado: unknown;
      try {
        parseado = JSON.parse(crudo.valor);
      } catch {
        return fallo("compatible: la respuesta no era JSON válido");
      }

      return opcionesJSON.validar(parseado);
    },
  };
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/llm/openai-compatible.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Que la constitución diga dónde se prueba**

En `CLAUDE.md`, reemplazar las dos líneas del árbol:

```
test/core/      el dominio puro
test/canales/   solo lo puro de los adaptadores: interpretar y autenticar
```

por:

```
test/core/      el dominio puro
test/canales/   solo lo puro de los adaptadores: interpretar y autenticar
test/llm/       solo lo puro de los proveedores: armado de mensajes y consumo
```

Y en `vitest.config.ts`, el comentario de cabecera:

```ts
// Aquí se prueba lo puro: `src/core` entero, y de los adaptadores —canales y
// proveedores de LLM— solo lo que no toca red. Determinista por diseño: corre
// en milisegundos y nunca falla por causas externas. Lo que hace red se
// verifica end-to-end contra el Worker.
```

- [ ] **Step 6: Correr todo y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — **223 tests**, typecheck limpio

- [ ] **Step 7: Commit**

```bash
git add src/llm/openai-compatible.ts test/llm CLAUDE.md vitest.config.ts
git commit -m "feat(llm): adaptador para cualquier endpoint compatible con OpenAI

Uno solo cubre OpenRouter —y por él Claude, GPT, Llama o DeepSeek—, OpenAI
directo, Groq y hasta un servidor propio: lo único que cambia es la URL.
Sin SDK, por la misma razón que gemini.ts.

generarJSON usa json_object y no esquema estricto: OpenRouter documenta que
el estricto no lo soportan todos los modelos, y pedírselo a uno que no
puede devuelve 400, que nuestra política no reintenta. La frontera de
seguridad no se toca — sigue siendo Zod en validar.

Reutiliza core/llm/reintento.ts tal cual: la política de respaldo y el
presupuesto no tenían nada de Gemini adentro."
```

---

### Task 3: El resolvedor, y que lo usen el agente y el onboarding

**Files:**
- Create: `src/llm/proveedor.ts`
- Modify: `src/db/repos/credencial.ts:12-18`, `src/agente/agente.ts:136` y `:164-167`, `src/index.ts:917`

**Interfaces:**
- Consumes: `resolverConfiguracionLLM`, `ConfiguracionLLM`, `MODELOS_GEMINI` (Task 1); `crearProveedorCompatible` (Task 2); `leerCredencial`, `leerSetting`
- Produces: `configuracionLLMDe(env, negocioId): Promise<ConfiguracionLLM>`, `crearProveedor(config, onUso?): ProveedorLLM`

- [ ] **Step 1: Ampliar las claves de credencial**

En `src/db/repos/credencial.ts`, añadir a la unión:

```ts
export type ClaveCredencial =
  | "telegram_token"
  | "telegram_webhook_secret"
  | "meta_app_secret"
  | "meta_verify_token"
  // La llave del cerebro del negocio. Va cifrada como cualquier otra: es el
  // secreto con el que se le factura a alguien.
  | "llm_api_key";
```

- [ ] **Step 2: Escribir el resolvedor**

Crear `src/llm/proveedor.ts`:

```ts
import {
  resolverConfiguracionLLM,
  type ConfiguracionLLM,
  MODELOS_GEMINI,
} from "../core/llm/configuracion";
import { TOPE_DIARIO } from "../core/limites";
import { leerCredencial } from "../db/repos/credencial";
import { leerSetting } from "../db/repos/negocio";
import { modelos as modelosDelEntorno, numero, type Env } from "../env";
import { crearProveedorGemini } from "./gemini";
import { crearProveedorCompatible } from "./openai-compatible";
import type { ProveedorLLM, ReporteUso } from "./tipos";

/**
 * El cerebro de un negocio.
 *
 * Mismo patrón que `canalSaliente` con el token de Telegram: lo del negocio si
 * existe, si no lo de la instalación. La diferencia de fondo es de facturación
 * — con la llave global, un despliegue que hospede a varios clientes les cobra
 * los tokens a todos en la misma cuenta.
 */

/** Ajustes que NO son secretos, así que viven en `settings` y no cifrados. */
const AJUSTE_PROVEEDOR = "llm_proveedor";
const AJUSTE_BASE_URL = "llm_base_url";
const AJUSTE_MODELOS = "llm_modelos";
const AJUSTE_TOPE = "llm_tope_diario";

function comoLista(valor: string | null): string[] {
  return (valor ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export async function configuracionLLMDe(
  env: Env,
  negocioId: string,
): Promise<ConfiguracionLLM> {
  const [apiKey, proveedor, baseUrl, listaModelos, tope] = await Promise.all([
    leerCredencial(env.DB, negocioId, "llm_api_key", env.CLAVE_CIFRADO),
    leerSetting(env.DB, negocioId, AJUSTE_PROVEEDOR),
    leerSetting(env.DB, negocioId, AJUSTE_BASE_URL),
    leerSetting(env.DB, negocioId, AJUSTE_MODELOS),
    leerSetting(env.DB, negocioId, AJUSTE_TOPE),
  ]);

  const delEntorno: ConfiguracionLLM = {
    proveedor: env.LLM_PROVEEDOR === "compatible" ? "compatible" : "gemini",
    apiKey: env.GEMINI_API_KEY,
    baseUrl: null,
    modelos: modelosDelEntorno(env).length > 0 ? modelosDelEntorno(env) : MODELOS_GEMINI,
    topeDiario: numero(env.TOPE_LLM_DIARIO, TOPE_DIARIO),
  };

  return resolverConfiguracionLLM(
    {
      apiKey,
      proveedor,
      baseUrl,
      modelos: comoLista(listaModelos),
      topeDiario: tope === null ? null : numero(tope, TOPE_DIARIO),
    },
    delEntorno,
  );
}

export function crearProveedor(
  configuracion: ConfiguracionLLM,
  onUso?: ReporteUso,
): ProveedorLLM {
  if (configuracion.proveedor === "compatible" && configuracion.baseUrl) {
    return crearProveedorCompatible({
      apiKey: configuracion.apiKey,
      baseUrl: configuracion.baseUrl,
      modelos: configuracion.modelos,
      onUso,
    });
  }

  return crearProveedorGemini(configuracion.apiKey, configuracion.modelos, onUso);
}
```

- [ ] **Step 3: Que el agente resuelva una sola vez y use lo mismo para el tope**

En `src/agente/agente.ts`, **antes** de la comprobación de cuota diaria (hoy en la línea 136), insertar:

```ts
    // Una sola resolución para las dos cosas que dependen de ella: el techo de
    // gasto y con qué modelo se piensa. Si el negocio trae su llave, trae su
    // techo — el tope dejó de ser nuestro cuando dejó de ser nuestra la factura.
    const configLLM = await configuracionLLMDe(this.env, negocioId);
```

Reemplazar la línea del tope:

```ts
    if (!hayCuotaHoy(usadasHoy, numero(this.env.TOPE_LLM_DIARIO, TOPE_DIARIO))) {
```

por:

```ts
    if (!hayCuotaHoy(usadasHoy, configLLM.topeDiario)) {
```

Y reemplazar la construcción del proveedor:

```ts
    const llm = crearProveedorGemini(this.env.GEMINI_API_KEY, modelos(this.env), (u) =>
      usos.push(u),
    );
```

por:

```ts
    const llm = crearProveedor(configLLM, (u) => usos.push(u));
```

Ajustar los imports: quitar `crearProveedorGemini` y añadir
`import { configuracionLLMDe, crearProveedor } from "../llm/proveedor";`.
Dejar `numero`, `TOPE_DIARIO` y `modelos` solo si siguen teniendo otro uso en el archivo — si el typecheck avisa de un import sin usar, se quita.

- [ ] **Step 4: Que el onboarding use el mismo cerebro**

En `src/index.ts`, reemplazar la línea 917:

```ts
    const llm = crearProveedorGemini(c.env.GEMINI_API_KEY, modelos(c.env));
```

por:

```ts
    const llm = crearProveedor(await configuracionLLMDe(c.env, negocioId));
```

Ajustar los imports igual que en el agente.

- [ ] **Step 5: Correr todo y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — 223 tests, typecheck limpio. El typecheck es la red aquí: si algún import quedó suelto o `negocioId` no estaba en alcance, sale ahora.

- [ ] **Step 6: Comprobar que no quedó ningún llamador viejo**

Run: `grep -rn "crearProveedorGemini" src | grep -v "llm/gemini.ts" | grep -v "llm/proveedor.ts"`
Expected: sin resultados. Si aparece alguno, es un camino que se quedó con la llave global.

- [ ] **Step 7: Commit**

```bash
git add src/llm/proveedor.ts src/db/repos/credencial.ts src/agente/agente.ts src/index.ts
git commit -m "feat(llm): el cerebro sale del negocio, con el del despliegue de respaldo

Mismo patrón que canalSaliente con el token de Telegram. La diferencia de
fondo es de facturación: con la llave global, un despliegue que hospede a
varios clientes les cobra los tokens a todos en la misma cuenta.

El agente resuelve la configuración UNA vez y la usa para las dos cosas que
dependen de ella: el techo de gasto diario y con qué modelo piensa. El tope
dejó de ser nuestro cuando dejó de ser nuestra la factura.

Y LLM_PROVEEDOR deja de ser configuración muerta: llevaba desde el primer
día declarada en env.ts y puesta en wrangler.jsonc sin que nadie la leyera."
```

---

### Task 4: El instalador pregunta y valida

**Files:**
- Modify: `cli/chuno.mjs`, función `cargarSecretos` (hoy alrededor de la línea 278)

**Interfaces:**
- Consumes: los helpers que ya existen en el archivo — `preguntar(texto, {oculto})`, `correr(cmd, args, {entrada})`, `morir(mensaje)`, `ok(mensaje)`, `log`, `c.suave`
- Produces: nada que consuman otras tareas

- [ ] **Step 1: Preguntar el proveedor antes de la llave**

En `cargarSecretos`, reemplazar el bloque que pide la llave de Gemini:

```js
  const gemini = await preguntar("      Llave de Gemini (aistudio.google.com/apikey): ", { oculto: true });
  if (!gemini) morir("Sin llave de Gemini el asistente no puede pensar.");
```

por:

```js
  log(c.suave("      El cerebro es tuyo: tú eliges el proveedor y pagas solo lo que piensa."));
  log(c.suave("      1) Gemini — tiene capa gratuita, es la opción para arrancar."));
  log(c.suave("      2) Otro compatible con OpenAI — OpenRouter, OpenAI, Groq, el que uses.\n"));

  const eleccion = await preguntar("      ¿Cuál? (1 o 2): ");
  const proveedor = eleccion.trim() === "2" ? "compatible" : "gemini";

  let baseUrl = "";
  let listaModelos = "";

  if (proveedor === "compatible") {
    baseUrl = await preguntar("      URL base (ej. https://openrouter.ai/api/v1): ");
    if (!baseUrl) morir("Sin URL base no sé a dónde mandarle las preguntas.");

    listaModelos = await preguntar("      Modelos, separados por coma, del preferido al último: ");
    if (!listaModelos) morir("Sin modelos no hay nada que intentar. Van varios porque el primero puede estar caído.");
  }

  const pista = proveedor === "gemini"
    ? "Llave de Gemini (aistudio.google.com/apikey): "
    : "Llave del proveedor: ";

  const llaveLLM = await preguntar(`      ${pista}`, { oculto: true });
  if (!llaveLLM) morir("Sin llave el asistente no puede pensar.");
```

- [ ] **Step 2: Validar la llave con una llamada real antes de guardarla**

Inmediatamente después, añadir:

```js
  // Se valida ANTES de guardar, igual que el webhook de Telegram. Una llave
  // mala tiene que doler aquí, que es cuando hay alguien mirando la pantalla;
  // si se descubre en producción, el que se entera es un cliente sin respuesta.
  const validacion = await validarLlaveLLM(proveedor, llaveLLM, baseUrl, listaModelos);
  if (!validacion.ok) morir(`La llave no funcionó: ${validacion.error}`);
  ok("Llave verificada contra el proveedor");
```

Y añadir la función, junto a las demás del archivo:

```js
/**
 * Una llamada mínima para comprobar que la llave sirve. No pide texto útil: solo
 * que el proveedor conteste algo que no sea un error de autenticación.
 */
async function validarLlaveLLM(proveedor, llave, baseUrl, listaModelos) {
  try {
    if (proveedor === "gemini") {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models",
        { headers: { "x-goog-api-key": llave } },
      );
      return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
    }

    const modelo = listaModelos.split(",")[0].trim();
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${llave}` },
      body: JSON.stringify({ model: modelo, messages: [{ role: "user", content: "ok" }], max_tokens: 1 }),
    });
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
  } catch {
    return { ok: false, error: "no pude contactar al proveedor" };
  }
}
```

- [ ] **Step 3: Guardar la llave con el nombre que lee el Worker**

En la lista de secretos, reemplazar la primera entrada:

```js
    ["GEMINI_API_KEY", gemini],
```

por:

```js
    ["GEMINI_API_KEY", llaveLLM],
```

El nombre del secreto no cambia aunque el proveedor sí: `configuracionLLMDe` lo lee como la llave de la instalación, sea del proveedor que sea. Renombrarlo obligaría a migrar las instalaciones que ya existen, y no compra nada.

- [ ] **Step 4: Escribir el proveedor y los modelos en `wrangler.jsonc`**

Después del bucle que guarda los secretos, añadir:

```js
  // Proveedor, URL y modelos NO son secretos: van como vars del Worker, que se
  // leen sin descifrar nada y se ven en el dashboard cuando haya que revisarlas.
  const vars = { LLM_PROVEEDOR: proveedor };
  if (proveedor === "compatible") {
    vars.LLM_BASE_URL = baseUrl;
    vars.MODELOS_LLM = listaModelos;
  }
  escribirVars(vars);
```

Si el archivo no tiene ya un helper que edite `wrangler.jsonc`, usar el mismo mecanismo con el que `chuno init` reescribe hoy el nombre del worker y el id de la base — está en la función que modifica `wrangler.jsonc` y se reutiliza tal cual.

- [ ] **Step 5: Probar el instalador sin crear nada**

Run: `node cli/chuno.mjs revisar`
Expected: el subcomando de solo lectura corre sin error. **No correr `chuno init` en este repo:** reescribe `wrangler.jsonc` y repunta la instalación viva a una base vacía — está registrado como gotcha.

- [ ] **Step 6: Commit**

```bash
git add cli/chuno.mjs
git commit -m "feat(cli): el instalador pregunta el cerebro y valida la llave

Antes solo pedía la de Gemini. Ahora ofrece Gemini o cualquier endpoint
compatible con OpenAI, y hace una llamada real antes de guardar nada —
igual que ya se hace con el webhook de Telegram.

Una llave mala tiene que doler en la instalación, que es cuando hay alguien
mirando la pantalla. Si se descubre en producción, el que se entera es un
cliente que no recibió respuesta."
```

---

### Task 5: Verificación

**Files:** ninguno.

- [ ] **Step 1: La puerta determinista**

Run: `npm test && npm run typecheck`
Expected: 223 tests verdes, typecheck limpio.

- [ ] **Step 2: Que el camino por defecto no cambió**

Con `wrangler dev`, mandar el webhook sintético de Telegram con el secreto de `.dev.vars` y un chat inexistente. Esperado: `200`, y en `uso_llm` de la base **local** una fila nueva con un modelo de Gemini.

Es el control que importa de toda la tarea: **ningún negocio tiene llave propia todavía**, así que el comportamiento tiene que ser byte por byte el de antes. Si esto cambia, la regla de precedencia está devolviendo lo que no es.

- [ ] **Step 3: Que un negocio con llave propia use la suya**

Sembrar en la D1 **local**, para un negocio de prueba, `llm_api_key` cifrada y los ajustes `llm_proveedor=compatible`, `llm_base_url`, `llm_modelos`. Mandarle un mensaje por webhook sintético y comprobar en `uso_llm` que el modelo registrado es **el del negocio**, no uno de Gemini.

Y el control negativo, que es el que prueba el todo-o-nada: **borrar el ajuste `llm_base_url`** y repetir. Tiene que volver a aparecer un modelo de Gemini — la configuración incompleta se descarta entera.

Borrar el negocio de prueba al terminar; la cascada limpia credenciales y ajustes.

- [ ] **Step 4: Pedirle el despliegue a Diego**

**No desplegar.** Presentarle tests, typecheck y las dos verificaciones locales, y pedirle que autorice.

- [ ] **Step 5: Cerrar**

Actualizar `docs/ESTADO.md`. Registrar en `APRENDIZAJES.md` **solo si algo desmintió un supuesto** — si no pasó nada de eso, no escribir nada.

---

## Self-review del plan

**Cobertura del spec:** la regla todo-o-nada y sus casos incompletos (Task 1), el adaptador con `json_object` y la reutilización de `reintento.ts` (Task 2), el reparto entre `credenciales` y `settings` más el resolvedor y sus dos llamadores (Task 3), el tope diario que cambia de dueño (Task 3, Step 3), el instalador que valida (Task 4). La corrección de la mención muerta a `anthropic` en `CLAUDE.md` **no tiene tarea propia**: se hace en la Task 2, Step 5, que ya edita ese bloque del árbol de archivos.

**Sin placeholders:** el único punto que remite a algo existente en vez de mostrarlo es el helper que reescribe `wrangler.jsonc` en la Task 4, Step 4, porque ya está en el archivo y duplicarlo aquí invitaría a escribir un segundo.

**Consistencia de tipos:** `ConfiguracionLLM` se define en la Task 1 y se consume con los mismos campos en la Task 3. `crearProveedorCompatible` recibe en la Task 3 el objeto exacto que declara en la Task 2. `MODELOS_GEMINI` se exporta en la Task 1 y se usa en la Task 1 (gemini.ts) y en la Task 3.
