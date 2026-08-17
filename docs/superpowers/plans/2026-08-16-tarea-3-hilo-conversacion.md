# Hilo de conversación con las decisiones al lado — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL REQUERIDA: usa `superpowers:executing-plans`
> para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar la cuenta.
>
> Spec: `docs/superpowers/specs/2026-08-16-hilo-conversacion-design.md`

**Objetivo:** que el dueño pueda leer la conversación completa mientras decide sobre lo que el asistente propuso, en vez de aprobar textos sueltos sin contexto.

**Arquitectura:** una ruta nueva `GET {base}/conversaciones/:id` que junta cuatro consultas ya existentes y las pinta en dos columnas. La única lógica nueva es un predicado puro en `src/core/` que decide qué propuesta cuelga de qué conversación, compartido por el contador del globo y por el filtro de la página para que no puedan discrepar.

**Stack:** TypeScript sobre Cloudflare Workers, Hono para el enrutado, D1 como base, vitest para los tests del núcleo. Panel renderizado en el servidor con plantillas de cadena — no hay framework de frontend ni build de cliente.

## Restricciones globales

Salen de `CLAUDE.md` y aplican a **todas** las tareas de este plan:

- **`src/core/` es puro.** Sin imports de Cloudflare, sin red, sin LLM, sin reloj propio. La hora entra como parámetro.
- **`negocio_id` en toda consulta**, sin excepción. Ninguna función de repo acepta no recibirlo.
- **Cero PII en logs.** Ni teléfonos, ni contenido de mensajes, ni ids completos de usuario.
- **Español para el dominio** (`pedido`, `propuesta`, `hilo`, `vigía`), inglés para lo técnico de la plataforma (`fetch`, `handler`, `binding`). Sigue lo que ya haya en el archivo.
- **Los comentarios explican *por qué*, no *qué*.** Si el comentario repite el código, sobra.
- **Un solo formato de fecha:** ISO-8601 con `T` y `Z`.
- **Nunca `| tail` sin `set -o pipefail`** — enmascara el código de salida.
- **Nada de `git push` ni `wrangler deploy`.** Diego los pide explícitamente. Este plan no despliega.
- **Puertas al cerrar cada tarea:** `npm test` verde y `npm run typecheck` limpio, sin `any` nuevos y sin `@ts-ignore`.

---

## Estructura de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `src/core/propuesta/tipos.ts` | **Modificar.** Agrega el predicado compartido y el filtro por conversación; reescribe el contador sobre el mismo extractor | 1 |
| `test/core/propuesta.test.ts` | **Modificar.** Tests del predicado, del filtro y del invariante contador↔filtro | 1 |
| `src/admin/vistas.ts` | **Modificar.** Exporta `tarjetaPropuesta` y le agrega el parámetro de vuelta | 2 |
| `src/admin/html.ts` | **Modificar.** CSS del hilo | 3 |
| `src/db/repos/conversacion.ts` | **Modificar.** Exporta `LIMITE_HILO` y lo usa como valor por defecto de `leerHilo` | 3 |
| `src/admin/vistas-conversaciones.ts` | **Modificar.** Agrega `vistaHilo`; la lista pasa a enlazar | 3, 5 |
| `src/index.ts` | **Modificar.** Ruta del hilo y destino de `/decidir` | 4, 5 |

No se crea ningún archivo. El hilo va en `vistas-conversaciones.ts` junto a la lista: son la misma funcionalidad y el par `vistas-conversacion.ts` / `vistas-conversaciones.ts` sería una trampa de lectura.

---

## Tarea 1: El predicado compartido en el núcleo

**Archivos:**
- Modificar: `src/core/propuesta/tipos.ts` (la función `contarPendientesPorConversacion` existente está sobre la línea 121)
- Test: `test/core/propuesta.test.ts`

**Interfaces:**
- Consume: `Propuesta`, `PayloadPropuesta` — ya definidos en el mismo archivo.
- Produce:
  - `esDeConversacion(propuesta: Propuesta, conversacionId: string): boolean`
  - `pendientesDeConversacion(propuestas: readonly Propuesta[], conversacionId: string): Propuesta[]`
  - `contarPendientesPorConversacion(propuestas: readonly Propuesta[]): Map<string, number>` — **ya existe, cambia por dentro y no por fuera.**

**Por qué esta tarea existe:** hoy la regla de "qué propuesta cuelga de qué conversación" vive dentro del contador. El hilo necesita la misma regla para listar. Escrita dos veces se desincroniza el día que alguien agregue un tipo de propuesta, y el globo diría 3 sobre una página que muestra 5. Es el mismo error que costó `claveAviso` el 2026-08-15.

- [ ] **Paso 1: Escribir los tests que fallan**

Agrega al final de `test/core/propuesta.test.ts`. Los payloads van **escritos completos** y no con `{...avisoOriginal, conversacionId}`: esparcir un valor tipado como la unión discriminada rompe el estrechamiento y `tsc` lo rechaza aunque los tests pasen.

```typescript
describe("esDeConversacion", () => {
  function aviso(id: string, conversacionId: string, estado = "propuesta"): Propuesta {
    return propuesta({
      id,
      estado: estado as Propuesta["estado"],
      payload: {
        tipo: "enviar_aviso",
        conversacionId,
        pedidoId: null,
        texto: "Hola Felipe, dame un momento y ya te confirmo lo de los lentes.",
      },
    });
  }

  function encargo(id: string, conversacionId: string): Propuesta {
    return propuesta({
      id,
      payload: {
        tipo: "crear_pedido",
        conversacionId,
        clienteNombre: "Felipe",
        items: [{ descripcion: "Lentes monofocales", cantidad: 1 }],
        montoCentavos: null,
        fechaComprometida: null,
        notas: null,
      },
    });
  }

  it("reconoce el aviso y el encargo de esa conversación", () => {
    expect(esDeConversacion(aviso("p1", "conv_1"), "conv_1")).toBe(true);
    expect(esDeConversacion(encargo("p2", "conv_1"), "conv_1")).toBe(true);
  });

  it("rechaza los de otra conversación", () => {
    expect(esDeConversacion(aviso("p1", "conv_2"), "conv_1")).toBe(false);
    expect(esDeConversacion(encargo("p2", "conv_2"), "conv_1")).toBe(false);
  });

  /**
   * `cambiar_estado` y `cambiar_fecha` llevan pedidoId y NO conversacionId.
   * Quedan fuera por comprobación explícita de tipo y no por accidente.
   */
  it("rechaza las propuestas que no cuelgan de una conversación", () => {
    const cambio = propuesta({
      id: "p3",
      payload: { tipo: "cambiar_estado", pedidoId: "ped_1", hacia: "listo" },
    });
    const fecha = propuesta({
      id: "p4",
      payload: { tipo: "cambiar_fecha", pedidoId: "ped_1", fechaComprometida: "2026-09-01" },
    });

    expect(esDeConversacion(cambio, "conv_1")).toBe(false);
    expect(esDeConversacion(fecha, "conv_1")).toBe(false);
  });
});

describe("pendientesDeConversacion", () => {
  function aviso(id: string, conversacionId: string, estado = "propuesta"): Propuesta {
    return propuesta({
      id,
      estado: estado as Propuesta["estado"],
      payload: {
        tipo: "enviar_aviso",
        conversacionId,
        pedidoId: null,
        texto: "Hola Felipe, dame un momento y ya te confirmo lo de los lentes.",
      },
    });
  }

  it("trae solo las de esa conversación y solo las pendientes", () => {
    const todas = [
      aviso("p1", "conv_1"),
      aviso("p2", "conv_1", "aplicada"),
      aviso("p3", "conv_1", "descartada"),
      aviso("p4", "conv_2"),
    ];

    expect(pendientesDeConversacion(todas, "conv_1").map((p) => p.id)).toEqual(["p1"]);
  });

  it("una conversación sin nada pendiente devuelve lista vacía", () => {
    expect(pendientesDeConversacion([], "conv_1")).toEqual([]);
  });

  /**
   * El test que sostiene la decisión de diseño. El globo de la lista sale del
   * contador y la página sale del filtro: si alguna vez dejaran de coincidir,
   * el dueño vería "3 esperan tu decisión" sobre una pantalla con 5 tarjetas y
   * no tendría forma de saber cuál miente.
   */
  it("el contador y el filtro coinciden sobre la misma entrada", () => {
    const todas = [
      aviso("p1", "conv_1"),
      aviso("p2", "conv_1"),
      aviso("p3", "conv_2"),
      aviso("p4", "conv_1", "aplicada"),
      propuesta({
        id: "p5",
        payload: { tipo: "cambiar_estado", pedidoId: "ped_1", hacia: "listo" },
      }),
    ];

    const cuenta = contarPendientesPorConversacion(todas);

    for (const conv of ["conv_1", "conv_2", "conv_inexistente"]) {
      expect(pendientesDeConversacion(todas, conv).length).toBe(cuenta.get(conv) ?? 0);
    }
  });
});
```

Agrega los dos nombres nuevos al `import` de la cabecera del archivo, que ya trae `contarPendientesPorConversacion`:

```typescript
import {
  PayloadPropuestaSchema,
  PropuestaSchema,
  contarPendientesPorConversacion,
  esDeConversacion,
  estaPendiente,
  pendientesDeConversacion,
  resolver,
  yaHayEscalacionPendiente,
  type PayloadPropuesta,
  type Propuesta,
} from "../../src/core/propuesta/tipos";
```

- [ ] **Paso 2: Correr los tests y ver que fallan**

```bash
npx vitest run test/core/propuesta.test.ts
```

Esperado: **FALLA**. `tsc` y vitest se quejan de que `esDeConversacion` y `pendientesDeConversacion` no existen en el módulo.

Si pasan, algo está mal: verifica que guardaste el archivo y que los nombres del `import` coinciden.

- [ ] **Paso 3: Implementar**

En `src/core/propuesta/tipos.ts`, **reemplaza** la función `contarPendientesPorConversacion` completa (con su bloque de comentario) por esto:

```typescript
/**
 * De qué conversación cuelga una propuesta, o `null` si no cuelga de ninguna.
 *
 * El único lugar del proyecto donde vive esa regla. `cambiar_estado` y
 * `cambiar_fecha` llevan `pedidoId` y no `conversacionId`: quedan fuera por
 * comprobación explícita de tipo, no por accidente. Agrupar a ciegas por una
 * propiedad que no existe en todas las variantes es como se cuela un
 * `undefined` de llave en un Map.
 */
function conversacionDe(propuesta: Propuesta): string | null {
  const p = propuesta.payload;
  return p.tipo === "enviar_aviso" || p.tipo === "crear_pedido" ? p.conversacionId : null;
}

/**
 * ¿Esta propuesta cuelga de esta conversación?
 *
 * Vive en el núcleo porque la usan dos consumidores: el contador que alimenta
 * el globo de la lista y el filtro que alimenta el hilo. Escrita dos veces se
 * desincronizan el día que alguien agregue un tipo de propuesta nuevo, y el
 * dueño vería un número que no cuadra con lo que tiene delante.
 */
export function esDeConversacion(propuesta: Propuesta, conversacionId: string): boolean {
  return conversacionDe(propuesta) === conversacionId;
}

/**
 * Las decisiones que esperan al dueño en una conversación, en el orden en que
 * llegaron.
 *
 * Solo las pendientes: una propuesta ya resuelta no espera nada, y mostrarla
 * entre las accionables le pediría al dueño decidir algo que ya decidió.
 */
export function pendientesDeConversacion(
  propuestas: readonly Propuesta[],
  conversacionId: string,
): Propuesta[] {
  return propuestas.filter((p) => p.estado === "propuesta" && esDeConversacion(p, conversacionId));
}

/**
 * Cuántas decisiones esperan al dueño en cada conversación.
 *
 * Lo usa la lista de conversaciones para poner el globo con el número. Sale del
 * mismo `conversacionDe` que el filtro del hilo, y por eso los dos no pueden
 * discrepar.
 */
export function contarPendientesPorConversacion(
  propuestas: readonly Propuesta[],
): Map<string, number> {
  const cuenta = new Map<string, number>();

  for (const p of propuestas) {
    if (p.estado !== "propuesta") continue;

    const id = conversacionDe(p);
    if (id === null) continue;

    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }

  return cuenta;
}
```

- [ ] **Paso 4: Correr los tests y ver que pasan**

```bash
set -o pipefail && npm test && npm run typecheck
```

Esperado: **todos los tests verdes** (los 177 que ya había más los 6 nuevos = 183) y typecheck limpio.

Los tests que ya existían de `contarPendientesPorConversacion` tienen que seguir pasando sin tocarlos: es la prueba de que el cambio no alteró el comportamiento por fuera.

- [ ] **Paso 5: Commit**

```bash
git add src/core/propuesta/tipos.ts test/core/propuesta.test.ts
git commit -m "feat(core): un solo predicado para el globo y para el hilo

La regla de qué propuesta cuelga de qué conversación vivía dentro del
contador. El hilo necesita la misma regla para listar, y escrita dos
veces se desincroniza el día que se agregue un tipo de propuesta: el
globo diría 3 sobre una página que muestra 5.

conversacionDe es ahora el único lugar donde vive, y un test comprueba
que el contador y el filtro coinciden sobre la misma entrada."
```

---

## Tarea 2: La tarjeta de decisión, reutilizable

**Archivos:**
- Modificar: `src/admin/vistas.ts:42-58` (la función `tarjetaPropuesta`)

**Interfaces:**
- Consume: nada de la tarea 1.
- Produce: `tarjetaPropuesta(propuesta: Propuesta, accionDecidir: string, volverAConversacion?: string): string` — **ahora exportada.**

**Por qué:** escribir una segunda tarjeta para el hilo costaría que editar el texto antes de aprobar funcione en una pantalla y no en la otra. Con una sola función no pueden divergir.

- [ ] **Paso 1: Exportar la función y agregar el parámetro**

En `src/admin/vistas.ts`, reemplaza la función `tarjetaPropuesta` completa:

```typescript
/**
 * Una decisión, con su formulario.
 *
 * La comparten la bandeja y el hilo. `volverAConversacion` viaja como el **id**
 * de la conversación y nunca como una URL: el servidor reconstruye el destino.
 * Si el destino viajara armado, quien mande el POST elegiría a dónde rebota el
 * navegador del dueño después de una acción autenticada.
 */
export function tarjetaPropuesta(
  propuesta: Propuesta,
  accionDecidir: string,
  volverAConversacion?: string,
): string {
  const urgente = propuesta.payload.tipo === "enviar_aviso";

  const vuelta = volverAConversacion
    ? `<input type="hidden" name="conversacion" value="${esc(volverAConversacion)}">`
    : "";

  return `<div class="tarjeta ${urgente ? "urgente" : ""}">
    <p class="motivo">${esc(propuesta.motivo)}</p>
    <form method="post" action="${accionDecidir}">
      <input type="hidden" name="id" value="${esc(propuesta.id)}">
      ${vuelta}
      ${cuerpoPropuesta(propuesta)}
      <div class="acciones">
        <button class="primario" name="decision" value="aprobar">${esc(
          etiquetaAprobar(propuesta),
        )}</button>
        <button name="decision" value="rechazar">Descartar</button>
      </div>
    </form>
  </div>`;
}
```

`vistaBandeja` no cambia: sigue llamando `tarjetaPropuesta(p, accionDecidir)` con dos argumentos, el tercero queda `undefined` y no se pinta nada.

- [ ] **Paso 2: Verificar que nada se rompió**

```bash
set -o pipefail && npm test && npm run typecheck
```

Esperado: 183 tests verdes, typecheck limpio. La bandeja no cambió de comportamiento.

- [ ] **Paso 3: Commit**

```bash
git add src/admin/vistas.ts
git commit -m "refactor(panel): tarjetaPropuesta se exporta, para que el hilo la reuse

Una sola tarjeta en las dos pantallas: editar el texto antes de aprobar
funciona igual en ambas y los arreglos no hay que hacerlos dos veces.

El id de la conversación viaja como id y no como URL a propósito — una
URL en el formulario sería un redirect abierto tras una acción
autenticada."
```

---

## Tarea 3: La vista del hilo

**Archivos:**
- Modificar: `src/db/repos/conversacion.ts:165-183` (`leerHilo`)
- Modificar: `src/admin/html.ts` (agregar CSS al final de la constante `CSS`, justo antes del backtick de cierre)
- Modificar: `src/admin/vistas-conversaciones.ts`

**Interfaces:**
- Consume: `tarjetaPropuesta` de la tarea 2.
- Produce:
  - `LIMITE_HILO: number` desde `src/db/repos/conversacion.ts`
  - `vistaHilo(opciones: { conversacion: Conversacion; mensajes: readonly MensajeHilo[]; pendientes: readonly Propuesta[]; accionDecidir: string; ahora: string }): string`

- [ ] **Paso 1: Exportar el límite del hilo**

En `src/db/repos/conversacion.ts`, justo **antes** de `export async function leerHilo`, agrega:

```typescript
/**
 * Cuántos mensajes trae el hilo.
 *
 * Lo exporta para que la pantalla pueda avisar cuando hay más. Una lista
 * cortada en silencio se lee como "esto es todo lo que tengo", y el dueño que
 * busca un mensaje viejo y no lo encuentra concluye que se perdió.
 */
export const LIMITE_HILO = 30;
```

Y cambia la firma de `leerHilo` para que use la constante:

```typescript
export async function leerHilo(
  db: D1Database,
  negocioId: string,
  conversacionId: string,
  limite = LIMITE_HILO,
): Promise<MensajeHilo[]> {
```

El cuerpo no se toca. El valor sigue siendo 30, así que el agente no cambia de comportamiento.

- [ ] **Paso 2: Agregar el CSS del hilo**

En `src/admin/html.ts`, al final de la constante `CSS`, después del bloque `@media (max-width: 560px)` de `.conversacion` y **antes** del backtick que cierra la plantilla:

```css
/* ─────────────────────────────────────────────────────────────── el hilo ── */
/* Dos columnas en escritorio. En pantalla angosta se apila y las decisiones
   SUBEN: el dueño en el mostrador necesita actuar, no leer. Quien quiera el
   contexto baja; quien ya sabe qué pasó, decide sin scroll. */
.hilo-armazon { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
.hilo-cabecera { margin: 0 0 14px; }
.hilo-cabecera .canal { font-size: 13px; color: var(--suave); }
.hilo { display: grid; gap: 10px; }
.mensaje {
  max-width: 78%; padding: 10px 14px; border-radius: var(--radio-s);
  background: var(--tarjeta); border: 1px solid var(--borde);
}
/* pre-wrap porque el asistente responde con saltos de línea y listas, y
   anywhere porque un cliente pega URLs que si no desbordan la columna. */
.mensaje p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.mensaje .quien { display: block; font-size: 12px; color: var(--suave); margin-bottom: 3px; }
.mensaje .cuando { display: block; font-size: 12px; color: var(--suave); margin-top: 4px; }
.mensaje.agente, .mensaje.dueno { margin-left: auto; background: var(--fondo-2); }
.hilo-decisiones { position: sticky; top: 16px; display: grid; gap: 12px; }
.hilo-decisiones .rotulo {
  font-size: 12.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--suave);
}
@media (max-width: 900px) {
  .hilo-armazon { grid-template-columns: 1fr; }
  .hilo-decisiones { position: static; order: -1; }
  .mensaje { max-width: 88%; }
}
```

**Ojo:** nada de backticks ni de `${` dentro de este CSS, ni siquiera en los comentarios. `CSS` es un template literal y un backtick suelto lo cierra — ya pasó una vez y `tsc` reportó una coma faltante en otro sitio.

- [ ] **Paso 3: Escribir la vista**

En `src/admin/vistas-conversaciones.ts`, agrega al final del archivo. Y amplía los imports de la cabecera:

```typescript
import { esc, fechaCorta } from "./html";
import { minutosRestantesDePausa } from "../core/conversacion/pausa";
import type { Propuesta } from "../core/propuesta/tipos";
import { tarjetaPropuesta } from "./vistas";
import {
  LIMITE_CONVERSACIONES,
  LIMITE_HILO,
  type Conversacion,
  type MensajeHilo,
} from "../db/repos/conversacion";
```

```typescript
const AUTOR: Record<string, string> = {
  cliente: "Cliente",
  agente: "Asistente",
  dueno: "Tú",
};

/**
 * El hilo de una conversación, con las decisiones pendientes al lado.
 *
 * Es la pantalla que cierra el "aprobar a ciegas": hasta ahora el dueño
 * decidía sobre un texto suelto, sin poder leer lo que el cliente escribió.
 *
 * Muestra exactamente las decisiones que cuenta el globo de la lista, porque
 * las dos salen de `esDeConversacion`. Un globo que dice 3 sobre una página
 * con 5 tarjetas es un bug a ojos del dueño, aunque las dos cifras tengan
 * explicación.
 */
export function vistaHilo(opciones: {
  conversacion: Conversacion;
  mensajes: readonly MensajeHilo[];
  pendientes: readonly Propuesta[];
  accionDecidir: string;
  ahora: string;
}): string {
  const { conversacion, mensajes, pendientes, accionDecidir, ahora } = opciones;

  const minutosPausa = minutosRestantesDePausa(conversacion.pausadoHasta, ahora);

  const pausa =
    minutosPausa > 0
      ? `<span class="marca-pausa">Lo estás atendiendo tú · el asistente vuelve en ${minutosPausa} min</span>`
      : "";

  /**
   * Sin `<h1>` a propósito: `pagina()` ya pinta uno con el `titulo`, y la ruta
   * le pasa ahí el nombre del cliente. Un segundo encabezado de nivel 1 en la
   * misma página rompe la estructura del documento y se ve como un error.
   */
  const cabecera = `<div class="hilo-cabecera">
    <span class="canal">${esc(CANALES[conversacion.canal] ?? conversacion.canal)}</span>
    ${pausa}
  </div>`;

  const burbujas =
    mensajes.length === 0
      ? `<div class="tarjeta vacio"><strong>Este hilo está vacío</strong>No hay mensajes guardados todavía.</div>`
      : mensajes
          .map(
            (m) => `<div class="mensaje ${esc(m.autor)}">
              <span class="quien">${esc(AUTOR[m.autor] ?? m.autor)}</span>
              <p>${esc(m.texto)}</p>
              <span class="cuando">${esc(fechaCorta(m.creadoEn))}</span>
            </div>`,
          )
          .join("");

  /**
   * Si el hilo viene lleno hasta el tope, hay más arriba y hay que decirlo.
   * El dueño que busca un mensaje viejo y no lo ve tiene que saber que está
   * mirando una ventana, no el historial completo.
   */
  const recorte =
    mensajes.length >= LIMITE_HILO
      ? `<p class="nota-lista">Se muestran los últimos ${LIMITE_HILO} mensajes. La conversación es más larga.</p>`
      : "";

  const decisiones =
    pendientes.length === 0
      ? `<p class="nota-lista">Nada que decidir en esta conversación.</p>`
      : pendientes.map((p) => tarjetaPropuesta(p, accionDecidir, conversacion.id)).join("");

  const rotulo =
    pendientes.length === 1 ? "1 espera tu decisión" : `${pendientes.length} esperan tu decisión`;

  return `${cabecera}
    <div class="hilo-armazon">
      <div>
        ${recorte}
        <div class="hilo">${burbujas}</div>
      </div>
      <aside class="hilo-decisiones">
        <span class="rotulo">${esc(rotulo)}</span>
        ${decisiones}
      </aside>
    </div>`;
}
```

`CANALES` ya está declarado arriba en este mismo archivo y se reutiliza tal cual.

**Todo el texto del hilo pasa por `esc()`** — lo escribió un desconocido por Telegram. Incluye `m.autor`, que aunque venga de una columna acotada se escapa igual porque se pinta dentro de un atributo `class`.

- [ ] **Paso 4: Verificar**

```bash
set -o pipefail && npm test && npm run typecheck
```

Esperado: 183 tests verdes, typecheck limpio. La vista todavía no la llama nadie — eso es la tarea 4.

- [ ] **Paso 5: Commit**

```bash
git add src/db/repos/conversacion.ts src/admin/html.ts src/admin/vistas-conversaciones.ts
git commit -m "feat(panel): la vista del hilo, con las decisiones al lado

Dos columnas en escritorio; apilado en móvil con las decisiones arriba,
porque el dueño en el mostrador necesita actuar antes que leer.

El hilo trae 30 mensajes y lo dice cuando hay más: una lista cortada en
silencio se lee como 'esto es todo lo que tengo'."
```

---

## Tarea 4: La ruta y la vuelta al hilo

**Archivos:**
- Modificar: `src/index.ts` — imports de la cabecera, ruta nueva después del bloque `${base}/conversaciones` (termina en la línea 491), y la ruta `${base}/decidir` (sobre la línea 584)

**Interfaces:**
- Consume: `vistaHilo` (tarea 3), `pendientesDeConversacion` (tarea 1).
- Produce: `GET {base}/conversaciones/:id`, y `POST {base}/decidir` con el campo opcional `conversacion`.

- [ ] **Paso 1: Ampliar los imports**

En `src/index.ts`, cambia las dos líneas de import correspondientes:

```typescript
import {
  guardarMensaje,
  leerHilo,
  listarConversaciones,
  obtenerConversacion,
  obtenerOCrearConversacion,
} from "./db/repos/conversacion";
import { contarPendientesPorConversacion, pendientesDeConversacion } from "./core/propuesta/tipos";
import { vistaConversaciones, vistaHilo } from "./admin/vistas-conversaciones";
```

- [ ] **Paso 2: Agregar la ruta del hilo**

Justo después del cierre del bloque `app.get(`${base}/conversaciones`, ...)` y antes de `app.get(`${base}/pedidos`, ...)`:

```typescript
  /**
   * El hilo de una conversación.
   *
   * `obtenerConversacion` ya filtra por `negocio_id`, así que un id de otro
   * negocio devuelve null y sale por el mismo 404 que un id inexistente: desde
   * afuera no se distingue "no existe" de "no es tuyo", que es como debe ser.
   */
  app.get(`${base}/conversaciones/:id`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const conversacionId = c.req.param("id");
    const conversacion = await obtenerConversacion(c.env.DB, d.negocioId, conversacionId);
    if (!conversacion) return c.text("Esa conversación no existe", 404);

    const [mensajes, propuestas, totalPendientes] = await Promise.all([
      leerHilo(c.env.DB, d.negocioId, conversacionId),
      listarPendientes(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: conversacion.clienteNombre?.trim() || "Conversación",
        negocio: d.negocio.nombre,
        activo: "conversaciones",
        pendientes: totalPendientes,
        contenido: vistaHilo({
          conversacion,
          mensajes,
          pendientes: pendientesDeConversacion(propuestas, conversacionId),
          accionDecidir: `${base}/decidir${d.consulta}`,
          ahora: ahoraISO(),
        }),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });
```

- [ ] **Paso 3: Hacer que `/decidir` sepa volver**

En la ruta `app.post(`${base}/decidir`, ...)`, reemplaza la línea del `return c.redirect(...)` final y su comentario por:

```typescript
    /**
     * Quien decide desde el hilo vuelve al hilo: está trabajando ahí.
     *
     * Viaja el **id** de la conversación y no la URL de destino. Con la URL,
     * quien mande el POST elegiría a dónde rebota el navegador del dueño
     * después de una acción autenticada; con el id, el peor caso es un 404.
     *
     * Redirección después del POST: recargar la página no repite la decisión.
     */
    const volverA = String(formulario.get("conversacion") ?? "");
    const destino = volverA
      ? `${base}/conversaciones/${encodeURIComponent(volverA)}${consultaDe(c, negocioId)}`
      : `${base}/bandeja${consultaDe(c, negocioId)}`;

    return c.redirect(destino, 303);
```

- [ ] **Paso 4: Verificar**

```bash
set -o pipefail && npm test && npm run typecheck
```

Esperado: 183 tests verdes, typecheck limpio.

- [ ] **Paso 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(panel): la ruta del hilo, y decidir vuelve a donde estabas

obtenerConversacion filtra por negocio_id, así que un id ajeno sale por
el mismo 404 que uno inexistente: desde afuera no se distingue.

El destino tras decidir se reconstruye en el servidor a partir del id de
la conversación. Mandar la URL en el formulario sería un redirect
abierto después de una acción autenticada."
```

---

## Tarea 5: Enlazar la lista y verificar en local

**Archivos:**
- Modificar: `src/admin/vistas-conversaciones.ts` (`vistaConversaciones`)
- Modificar: `src/admin/html.ts` (la regla `.conversacion`)
- Modificar: `src/index.ts` (la llamada a `vistaConversaciones`)

**Interfaces:**
- Consume: la ruta de la tarea 4.
- Produce: `vistaConversaciones(conversaciones, pendientesPorConversacion, ahora, enlace)` — **cambia la firma**, gana un cuarto parámetro `enlace: (id: string) => string`.

**Por qué va al final:** la lista se dejó sin enlazar en la tarea 2 del proyecto a propósito, porque una lista que abre en 404 es peor que una que no abre. Ahora la ruta existe.

- [ ] **Paso 1: Que la lista enlace**

En `src/admin/vistas-conversaciones.ts`, cambia la firma de `vistaConversaciones` y el `<li>`:

```typescript
export function vistaConversaciones(
  conversaciones: readonly Conversacion[],
  pendientesPorConversacion: ReadonlyMap<string, number>,
  ahora: string,
  /** Cómo se arma el link al hilo. La vista no sabe de rutas ni de query. */
  enlace: (id: string) => string,
): string {
```

Y dentro del `.map`, reemplaza el `return` del `<li>` por:

```typescript
      return `<li class="conversacion${pendientes > 0 ? " con-pendientes" : ""}">
        <a class="conversacion-enlace" href="${esc(enlace(c.id))}">
          <div class="conversacion-quien">
            <strong>${esc(quien)}</strong>
            <span class="canal">${esc(CANALES[c.canal] ?? c.canal)}</span>
          </div>
          <div class="conversacion-marcas">${marcas}</div>
          <time class="conversacion-cuando">${esc(fechaCorta(c.actualizadoEn))}</time>
        </a>
      </li>`;
```

- [ ] **Paso 2: Mover el relleno del `<li>` al enlace**

En `src/admin/html.ts`, la regla `.conversacion` tiene hoy `display: flex; align-items: center; gap: 14px;` y `padding: 13px 16px;`. Esas cuatro propiedades pasan al enlace, para que toda la fila sea clicable y no solo el texto. Reemplaza la regla `.conversacion` y agrega la nueva:

```css
.conversacion {
  background: var(--tarjeta); border: 1px solid var(--borde);
  border-left: 3px solid transparent; border-radius: var(--radio-s);
  box-shadow: var(--sombra);
}
.conversacion-enlace {
  display: flex; align-items: center; gap: 14px;
  padding: 13px 16px; color: inherit; text-decoration: none;
}
.conversacion:hover { border-color: var(--suave); }
```

- [ ] **Paso 3: Pasar el armador de links desde la ruta**

En `src/index.ts`, dentro de `app.get(`${base}/conversaciones`, ...)`, cambia la llamada a la vista:

```typescript
        contenido: vistaConversaciones(
          conversaciones,
          contarPendientesPorConversacion(propuestas),
          ahoraISO(),
          (id) => `${base}/conversaciones/${encodeURIComponent(id)}${d.consulta}`,
        ),
```

- [ ] **Paso 4: Verificar con las puertas deterministas**

```bash
set -o pipefail && npm test && npm run typecheck
```

Esperado: 183 tests verdes, typecheck limpio.

- [ ] **Paso 5: Verificar contra el servidor local**

Levanta el Worker y ejercita las rutas. **No despliegues** — eso lo pide Diego.

```bash
npm run dev
```

En otra terminal, con `PASS` sacado de `.dev.vars`:

```bash
set -o pipefail
PASS=$(grep '^PANEL_PASSWORD=' .dev.vars | cut -d= -f2-)
B=http://localhost:8787
curl -s -o /dev/null -w 'lista %{http_code}\n' -u "admin:$PASS" $B/panel/conversaciones
curl -s -o /dev/null -w 'hilo inexistente %{http_code}\n' -u "admin:$PASS" $B/panel/conversaciones/no_existe
curl -s -u "admin:$PASS" $B/panel/conversaciones | grep -c 'conversacion-enlace'
curl -s -o /dev/null -w 'demo lista %{http_code}\n' $B/demo/conversaciones
```

Esperado: `lista 200`, `hilo inexistente 404`, un conteo **mayor que 0** de `conversacion-enlace` si la base local tiene conversaciones sembradas, y `demo lista 200` **sin credenciales** — la demo es pública.

Si la base local está vacía, el conteo da 0 y eso **no** es un fallo: corre `npm run seed:local` y repite.

Después abre un hilo de verdad, tomando un id de la lista:

```bash
ID=$(curl -s -u "admin:$PASS" $B/panel/conversaciones | grep -o 'conversaciones/conv_[a-z0-9]*' | head -1 | cut -d/ -f2)
curl -s -o /dev/null -w "hilo real %{http_code}\n" -u "admin:$PASS" "$B/panel/conversaciones/$ID"
curl -s -u "admin:$PASS" "$B/panel/conversaciones/$ID" | grep -c 'hilo-armazon'
```

Esperado: `hilo real 200` y un conteo de 1. Si `ID` sale vacío, la lista no tiene conversaciones y hay que sembrar antes.

**El grep necesita control.** Antes de concluir que el enlace no aparece, comprueba que el detector sirve corriéndolo contra algo que sabes que está:

```bash
curl -s -u "admin:$PASS" $B/panel/conversaciones | grep -c 'conversaciones'
```

Si ese da 0 también, el problema es la petición o la autenticación, no el enlace.

- [ ] **Paso 6: Commit**

```bash
git add src/admin/vistas-conversaciones.ts src/admin/html.ts src/index.ts
git commit -m "feat(panel): la lista enlaza al hilo

Se dejó sin enlazar a propósito hasta que existiera la ruta: una lista
que abre en 404 es peor que una que no abre. Ya existe.

El relleno pasa del li al enlace para que toda la fila sea clicable, no
solo el texto."
```

---

## Qué queda fuera de este plan

- **Pausar y reanudar** — tarea 4 del proyecto. El hilo ya muestra la pausa; falta quien la ponga.
- **Verificación contra producción y actualización de docs** — tarea 5. Incluye desplegar, que lo pide Diego, y esperar propagación antes de creerle a la primera lectura.
- **El subconteo por encima de 50 pendientes.** `listarPendientes` corta en 50 ordenando de más viejo a más nuevo, así que los globos por conversación subcuentan en silencio cuando hay más. Se arregla con `GROUP BY` en el repo, en la tarea 5. Hoy no muerde: `mi-optica` tiene 2 pendientes.
