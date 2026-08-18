# D1 — La puerta de entrada de Meta: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **En este proyecto no se despachan subagentes** — orden explícita de Diego.

**Goal:** Abrir el contrato `Canal` para que acepte la entrada de Meta —handshake GET y firma `X-Hub-Signature-256`— con la parte pura en `src/core/`, y dejar viva la ruta `/webhook/meta/:negocioId` que solo autentica.

**Architecture:** Dos funciones puras en `src/core/meta/entrada.ts` (una resuelve el handshake, otra verifica el HMAC con WebCrypto). El contrato `Canal` gana un `autenticar` obligatorio y su `interpretar` pasa a devolver una lista. La ruta de Meta llama al núcleo directamente; el adaptador `canales/meta.ts` nace entero en D2.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, WebCrypto, vitest.

## Global Constraints

- **`src/core/` es puro:** sin Cloudflare, sin red, sin LLM, sin reloj propio. WebCrypto sí está permitido — precedente escrito en `src/core/cifrado.ts`.
- **Regla 5:** el webhook valida su secreto antes de procesar nada.
- **Regla 6:** cero PII en logs, y ningún cuerpo de error del canal se propaga.
- **Regla 1:** `negocio_id` en toda consulta.
- **Idioma:** español para el dominio, inglés para lo técnico de la plataforma.
- **Nunca `git push` ni desplegar sin que Diego lo pida.**
- **Comentarios que explican el porqué**, no el qué.
- Verificación determinista: `npm test` y `npm run typecheck`. Línea base al empezar: **175 tests verdes, typecheck limpio**.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/core/meta/entrada.ts` | **Nuevo.** Handshake y firma, puros. Único sitio donde vive la forma de `sha256=<hex>` y la de los parámetros `hub.*` |
| `test/core/meta-entrada.test.ts` | **Nuevo.** Tests de las dos funciones, con vector de openssl |
| `src/canales/tipos.ts` | Contrato `Canal` y `MensajeEntrante` |
| `src/canales/telegram.ts` | Adaptador de Telegram: absorbe su autenticación, devuelve lista |
| `src/canales/demo.ts` | Adaptador de la demo |
| `test/canales/telegram.test.ts` | **Nuevo.** Solo `interpretar`, que es puro |
| `src/db/repos/credencial.ts` | Union `ClaveCredencial` |
| `src/index.ts` | Rutas de webhook y `atenderTelegram` |
| `CLAUDE.md`, `vitest.config.ts` | La regla de qué se prueba, que deja de ser "solo core" |

---

### Task 1: El handshake, puro

**Files:**
- Create: `src/core/meta/entrada.ts`
- Test: `test/core/meta-entrada.test.ts`

**Interfaces:**
- Consumes: `Resultado`, `ok`, `fallo` de `src/core/resultado.ts`
- Produces: `type RechazoEntrada`, `handshakeIncompleto(parametros): boolean`, `resolverHandshake(parametros, tokenEsperado): Resultado<string, RechazoEntrada>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/core/meta-entrada.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handshakeIncompleto, resolverHandshake } from "../../src/core/meta/entrada";

const params = (entradas: Record<string, string>) => new URLSearchParams(entradas);

const completo = {
  "hub.mode": "subscribe",
  "hub.challenge": "1158201444",
  "hub.verify_token": "token-del-negocio",
};

describe("resolverHandshake", () => {
  it("devuelve el challenge cuando modo y token coinciden", () => {
    const r = resolverHandshake(params(completo), "token-del-negocio");
    expect(r).toEqual({ ok: true, valor: "1158201444" });
  });

  it("rechaza cuando el verify token no coincide", () => {
    const r = resolverHandshake(params(completo), "otro-token");
    expect(r).toEqual({ ok: false, error: "token_no_coincide" });
  });

  it("rechaza un modo distinto de subscribe", () => {
    const r = resolverHandshake(
      params({ ...completo, "hub.mode": "unsubscribe" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: false, error: "modo_no_soportado" });
  });

  it("rechaza cuando falta un parámetro", () => {
    const r = resolverHandshake(
      params({ "hub.mode": "subscribe", "hub.challenge": "123" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: false, error: "parametros_incompletos" });
  });

  // Meta documenta el challenge como entero, pero devolverlo como número lo
  // normaliza: "0123" saldría 123 y Meta no reconocería su propio valor.
  it("devuelve el challenge tal cual, sin convertirlo a número", () => {
    const r = resolverHandshake(
      params({ ...completo, "hub.challenge": "0123" }),
      "token-del-negocio",
    );
    expect(r).toEqual({ ok: true, valor: "0123" });
  });
});

describe("handshakeIncompleto", () => {
  it("es falso cuando están los tres parámetros", () => {
    expect(handshakeIncompleto(params(completo))).toBe(false);
  });

  it("es verdadero cuando falta el token", () => {
    expect(
      handshakeIncompleto(params({ "hub.mode": "subscribe", "hub.challenge": "1" })),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/core/meta-entrada.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/meta/entrada"`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/core/meta/entrada.ts`:

```ts
import { fallo, ok, type Resultado } from "../resultado";

/**
 * La puerta de entrada de los webhooks de Meta.
 *
 * Vive en `core` a pesar de sonar a infraestructura, por la misma razón que
 * `cifrado.ts`: es puro en el sentido que importa aquí. WebCrypto es estándar
 * en Workers, en Node y en vitest, no toca red ni reloj, y así la puerta se
 * prueba en milisegundos. Los secretos entran como parámetro — core no lee `env`.
 */

export type RechazoEntrada =
  | "parametros_incompletos"
  | "modo_no_soportado"
  | "token_no_coincide";

/**
 * ¿Le faltan a la petición los parámetros que Meta siempre manda?
 *
 * Existe aparte para que la ruta pueda descartar basura ANTES de ir a D1 a
 * buscar la credencial y descifrarla, sin duplicar la regla: `resolverHandshake`
 * la usa también. Una petición anónima no puede costarnos una consulta.
 */
export function handshakeIncompleto(parametros: URLSearchParams): boolean {
  return (
    !parametros.get("hub.mode") ||
    !parametros.get("hub.challenge") ||
    !parametros.get("hub.verify_token")
  );
}

/**
 * El verify token se compara con `===` y no en tiempo constante a propósito:
 * solo gobierna el alta de la suscripción, nunca la autenticidad de un mensaje.
 * Lo que protege los mensajes es el HMAC de `firmaValida`.
 */
export function resolverHandshake(
  parametros: URLSearchParams,
  tokenEsperado: string,
): Resultado<string, RechazoEntrada> {
  if (handshakeIncompleto(parametros)) return fallo("parametros_incompletos");
  if (parametros.get("hub.mode") !== "subscribe") return fallo("modo_no_soportado");
  if (parametros.get("hub.verify_token") !== tokenEsperado) return fallo("token_no_coincide");

  // Como texto y no como número: Meta lo documenta como entero, pero espera de
  // vuelta exactamente lo que mandó.
  return ok(parametros.get("hub.challenge") as string);
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/core/meta-entrada.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/meta/entrada.ts test/core/meta-entrada.test.ts
git commit -m "feat(core): resolver el handshake de verificación de Meta

El challenge se devuelve como texto y no como número porque Meta espera de
vuelta exactamente lo que mandó: convertirlo normalizaría un '0123' a 123.

handshakeIncompleto se exporta aparte para que la ruta descarte basura antes
de ir a D1 por la credencial, sin escribir la regla dos veces."
```

---

### Task 2: La firma HMAC, pura

**Files:**
- Modify: `src/core/meta/entrada.ts`
- Test: `test/core/meta-entrada.test.ts`

**Interfaces:**
- Produces: `firmaConFormaValida(cabecera: string | null): boolean`, `firmaValida(cuerpoCrudo: string, cabecera: string | null, appSecret: string): Promise<boolean>`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `test/core/meta-entrada.test.ts`:

```ts
import { firmaConFormaValida, firmaValida } from "../../src/core/meta/entrada";

/**
 * Vector generado FUERA de este código, con:
 *   printf '%s' '<cuerpo>' | openssl dgst -sha256 -hmac 'secreto-de-prueba' -r
 *
 * Si el valor esperado lo produjera nuestra propia función, el test compararía
 * la implementación consigo misma y no probaría absolutamente nada.
 */
const CUERPO = '{"object":"whatsapp_business_account","entry":[]}';
const SECRETO = "secreto-de-prueba";
const FIRMA = "sha256=7684209d20e98f747cbaa9c37e9dbcf89184b73c4b7be662da88d486fab52681";

describe("firmaValida", () => {
  it("acepta el vector calculado con openssl", async () => {
    expect(await firmaValida(CUERPO, FIRMA, SECRETO)).toBe(true);
  });

  it("rechaza con otro secreto", async () => {
    expect(await firmaValida(CUERPO, FIRMA, "secreto-equivocado")).toBe(false);
  });

  it("rechaza si el cuerpo cambió en un solo byte", async () => {
    expect(await firmaValida(CUERPO.replace("entry", "entrY"), FIRMA, SECRETO)).toBe(false);
  });

  it("rechaza sin cabecera", async () => {
    expect(await firmaValida(CUERPO, null, SECRETO)).toBe(false);
  });

  it("rechaza sin el prefijo sha256=", async () => {
    expect(await firmaValida(CUERPO, FIRMA.slice("sha256=".length), SECRETO)).toBe(false);
  });

  it("rechaza un hex de largo equivocado", async () => {
    expect(await firmaValida(CUERPO, "sha256=abc123", SECRETO)).toBe(false);
  });

  it("rechaza un hex con caracteres que no son hex", async () => {
    expect(await firmaValida(CUERPO, `sha256=${"z".repeat(64)}`, SECRETO)).toBe(false);
  });
});

describe("firmaConFormaValida", () => {
  it("acepta una cabecera bien formada sin verificar el HMAC", () => {
    expect(firmaConFormaValida(FIRMA)).toBe(true);
  });

  it("rechaza null, prefijo ausente y largo equivocado", () => {
    expect(firmaConFormaValida(null)).toBe(false);
    expect(firmaConFormaValida("abc")).toBe(false);
    expect(firmaConFormaValida("sha256=abc")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/core/meta-entrada.test.ts`
Expected: FAIL — `firmaValida is not a function` (o error de importación)

- [ ] **Step 3: Escribir la implementación mínima**

Agregar a `src/core/meta/entrada.ts`:

```ts
const PREFIJO_FIRMA = "sha256=";
const LARGO_HEX = 64; // SHA-256 son 32 bytes

/**
 * ¿Tiene la cabecera forma de firma, sin verificar todavía el HMAC?
 *
 * Es el filtro barato: descarta a quien ni siquiera intentó firmar, antes de
 * que la ruta vaya a D1 por el App Secret y lo descifre. Sin esto la puerta es
 * un amplificador — el atacante gasta un paquete y nosotros una consulta.
 */
export function firmaConFormaValida(cabecera: string | null): boolean {
  return hexDeLaCabecera(cabecera) !== null;
}

function hexDeLaCabecera(cabecera: string | null): string | null {
  if (!cabecera || !cabecera.startsWith(PREFIJO_FIRMA)) return null;

  const hex = cabecera.slice(PREFIJO_FIRMA.length);
  if (hex.length !== LARGO_HEX || !/^[0-9a-f]+$/i.test(hex)) return null;

  return hex;
}

/**
 * Verifica el HMAC-SHA256 del cuerpo con `crypto.subtle.verify` en vez de
 * comparar cadenas: la comparación de un HMAC pertenece dentro de WebCrypto,
 * no en un `===` nuestro.
 */
export async function firmaValida(
  cuerpoCrudo: string,
  cabecera: string | null,
  appSecret: string,
): Promise<boolean> {
  const hex = hexDeLaCabecera(cabecera);
  if (!hex) return false;

  const firma = new Uint8Array(hex.length / 2);
  for (let i = 0; i < firma.length; i++) {
    firma[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("HMAC", llave, firma, new TextEncoder().encode(cuerpoCrudo));
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/core/meta-entrada.test.ts`
Expected: PASS, 16 tests

- [ ] **Step 5: Comprobar por mutación que los tests miden algo**

Cambiar a mano `LARGO_HEX` de `64` a `65`, correr `npx vitest run test/core/meta-entrada.test.ts`, y **confirmar que caen en rojo** los tests de firma válida y de forma válida. Devolverlo a `64` y volver a verlos en verde.

Esto no es ceremonia: los tests de la Task 1 se escribieron en rojo, pero estos comparan contra una constante pegada a mano, y una constante mal copiada da un test que pasa por la razón equivocada.

- [ ] **Step 6: Commit**

```bash
git add src/core/meta/entrada.ts test/core/meta-entrada.test.ts
git commit -m "feat(core): verificar la firma X-Hub-Signature-256 de Meta

El vector de prueba se generó con openssl y no con esta función: un test que
compara la implementación consigo misma pasa siempre y no prueba nada.
Comprobado además por mutación, moviendo el largo del hex a 65.

La comparación va por crypto.subtle.verify y no por ===, y firmaConFormaValida
se exporta para descartar lo barato antes de que la ruta toque D1."
```

---

### Task 3: Abrir el contrato, y que Telegram y la demo lo cumplan

**Files:**
- Modify: `src/canales/tipos.ts`, `src/canales/telegram.ts`, `src/canales/demo.ts`, `src/index.ts:938-1013`, `CLAUDE.md:107`, `vitest.config.ts`
- Test: `test/canales/telegram.test.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores
- Produces: `Canal.autenticar(peticion, leerCuerpo, secreto)`, `Canal.interpretar(cuerpo): MensajeEntrante[]`, `MensajeEntrante.idExterno`, `atenderTelegram(c, negocioId, canal, cuerpoCrudo)`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/canales/telegram.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { crearCanalTelegram } from "../../src/canales/telegram";

// Construir el canal no hace red: el token solo se usa al enviar, y aquí no se
// prueba el envío. Lo único puro de un adaptador es interpretar.
const canal = crearCanalTelegram("token-que-no-se-usa");

describe("interpretar de Telegram", () => {
  it("devuelve el mensaje dentro de una lista, con su id externo", () => {
    const r = canal.interpretar({
      message: {
        message_id: 42,
        chat: { id: 999000111 },
        text: "quiero unas gafas para el lunes",
        from: { first_name: "Marta", last_name: "Ruiz", is_bot: false },
      },
    });

    expect(r).toEqual([
      {
        canal: "telegram",
        canalChatId: "999000111",
        texto: "quiero unas gafas para el lunes",
        autorNombre: "Marta Ruiz",
        idExterno: "42",
      },
    ]);
  });

  it("devuelve lista vacía cuando el update no trae texto", () => {
    expect(canal.interpretar({ message: { message_id: 1, chat: { id: 5 } } })).toEqual([]);
  });

  it("devuelve lista vacía cuando quien escribe es otro bot", () => {
    expect(
      canal.interpretar({
        message: { message_id: 1, chat: { id: 5 }, text: "hola", from: { is_bot: true } },
      }),
    ).toEqual([]);
  });

  it("deja idExterno en null si el update no trae message_id", () => {
    const r = canal.interpretar({ message: { chat: { id: 5 }, text: "hola" } });
    expect(r).toHaveLength(1);
    expect(r[0].idExterno).toBeNull();
  });
});

describe("autenticar de Telegram", () => {
  const peticion = (secreto: string | null) =>
    new Request("https://ejemplo/webhook", {
      method: "POST",
      headers: secreto ? { "x-telegram-bot-api-secret-token": secreto } : {},
    });

  // Si Telegram llegara a leer el cuerpo, este thunk lo delataría: Telegram
  // autentica por cabecera y nunca debe pagar la lectura de un cuerpo anónimo.
  const cuerpoProhibido = async () => {
    throw new Error("no debe leer el cuerpo");
  };

  it("acepta cuando el secreto coincide, sin leer el cuerpo", async () => {
    expect(await canal.autenticar(peticion("s3cr3to"), cuerpoProhibido, "s3cr3to")).toBe(true);
  });

  it("rechaza cuando el secreto no coincide", async () => {
    expect(await canal.autenticar(peticion("otro"), cuerpoProhibido, "s3cr3to")).toBe(false);
  });

  it("rechaza cuando no viene la cabecera", async () => {
    expect(await canal.autenticar(peticion(null), cuerpoProhibido, "s3cr3to")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/canales/telegram.test.ts`
Expected: FAIL — `interpretar` devuelve un objeto, no una lista, y `canal.autenticar is not a function`

- [ ] **Step 3: Abrir el contrato**

En `src/canales/tipos.ts`, reemplazar la interfaz por:

```ts
export interface MensajeEntrante {
  readonly canal: string;
  /** Id del chat dentro de ese canal. Es lo que identifica al cliente. */
  readonly canalChatId: string;
  readonly texto: string;
  readonly autorNombre: string | null;
  /**
   * Id del mensaje en su canal de origen. Hoy nadie lo lee: lo transporta para
   * que el descarte de duplicados de D2 no obligue a reabrir este contrato.
   * Meta reintenta durante 36 horas, y un duplicado no es una fila de más —
   * es un mensaje repetido al cliente y una llamada al modelo pagada dos veces.
   */
  readonly idExterno: string | null;
}

export interface Canal {
  readonly id: string;
  /**
   * Traduce el cuerpo del webhook a mensajes normalizados.
   *
   * Devuelve una LISTA porque Meta agrega actualizaciones en lotes de hasta
   * 1000 y su propia documentación dice que el batching no se puede garantizar.
   * Con un solo mensaje de retorno, un lote entrega uno y descarta el resto en
   * silencio. Telegram devuelve vacío o un elemento.
   */
  interpretar(cuerpo: unknown): MensajeEntrante[];
  /**
   * Autentica el webhook ANTES de procesar nada — regla 5, y aquí la sostiene
   * el compilador: un canal nuevo no compila sin implementarla.
   *
   * El cuerpo entra como FUNCIÓN, no como cadena. Telegram autentica con una
   * cabecera y nunca lo necesita, así que un POST anónimo se rechaza sin que
   * lleguemos a leerlo; Meta sí lo necesita, pero solo después de comprobar
   * que la cabecera tiene forma de firma. "Rechazar lo barato primero" queda
   * dentro de cada canal, que es donde vive ese conocimiento.
   */
  autenticar(
    peticion: Request,
    leerCuerpo: () => Promise<string>,
    secreto: string,
  ): Promise<boolean>;
  enviar(canalChatId: string, texto: string): Promise<Resultado<void, string>>;
  enviarFoto(
    canalChatId: string,
    urlFoto: string,
    pie: string,
  ): Promise<Resultado<void, string>>;
}
```

Conservar el comentario de cabecera del archivo y el de `enviarFoto` tal como están.

- [ ] **Step 4: Adaptar Telegram**

En `src/canales/telegram.ts`:

1. Agregar `message_id?: number;` a `UpdateTelegram["message"]`.
2. Reemplazar el cuerpo de `interpretar` para que devuelva lista:

```ts
    interpretar(cuerpo: unknown): MensajeEntrante[] {
      const update = cuerpo as UpdateTelegram;
      const mensaje = update?.message;

      const chatId = mensaje?.chat?.id;
      const texto = mensaje?.text?.trim();

      // Sin texto no hay nada que procesar: fotos, stickers y eventos de sistema
      // se ignoran en silencio. Ignorar no es fallar.
      if (typeof chatId !== "number" || !texto) return [];

      // Un bot hablándole a otro bot es un bucle esperando a pasar.
      if (mensaje?.from?.is_bot) return [];

      const nombre = [mensaje?.from?.first_name, mensaje?.from?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      return [
        {
          canal: "telegram",
          canalChatId: String(chatId),
          // Se recorta en el borde y no adentro: lo que se guarda en la base es
          // lo mismo que ve el modelo, y así un mensaje enorme no puede inflar
          // ni el costo de la llamada ni el tamaño del hilo para siempre.
          texto: recortarTexto(texto),
          autorNombre: nombre || null,
          idExterno: typeof mensaje?.message_id === "number" ? String(mensaje.message_id) : null,
        },
      ];
    },
```

3. Agregar el método `autenticar` justo después de `interpretar`:

```ts
    /**
     * `leerCuerpo` no se llama: Telegram firma con una cabecera, así que un
     * POST anónimo se rechaza sin que paguemos la lectura de su cuerpo.
     */
    async autenticar(peticion: Request, _leerCuerpo: () => Promise<string>, secreto: string) {
      const recibido = peticion.headers.get("x-telegram-bot-api-secret-token");
      return typeof recibido === "string" && recibido === secreto;
    },
```

4. **Borrar la función exportada `webhookAutentico`** del final del archivo. La reemplaza el método.

- [ ] **Step 5: Adaptar la demo**

Reemplazar el objeto de `src/canales/demo.ts`:

```ts
export const canalDemo: Canal = {
  id: "demo",
  interpretar: (): MensajeEntrante[] => [],
  // La demo no recibe webhooks de nadie. Devolver false y no true es la
  // respuesta segura si algún día alguien la enruta por error.
  autenticar: async () => false,
  enviar: async () => ok(undefined),
  enviarFoto: async () => ok(undefined),
};
```

- [ ] **Step 6: Correr los tests del canal y ver que pasan**

Run: `npx vitest run test/canales/telegram.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 7: Adaptar las rutas de Telegram**

En `src/index.ts`, reemplazar `atenderTelegram` (líneas 940-982) por:

```ts
/**
 * Lo que pasa cuando llega un mensaje, sea del bot global o de un bot por
 * negocio: normalizar, guardar y despertar al Durable Object. La autenticación
 * ya ocurrió — cada ruta autentica con SU secreto antes de llamar aquí, y por
 * eso recibe el canal ya construido y el cuerpo ya leído.
 */
async function atenderTelegram(
  c: Context<{ Bindings: Env }>,
  negocioId: string,
  canal: Canal,
  cuerpoCrudo: string,
): Promise<Response> {
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(cuerpoCrudo);
  } catch {
    // Autenticado pero ilegible: no hay nada que procesar y reintentar no lo
    // arregla. 200 para que el canal no entre en bucle.
    return c.text("ok");
  }

  // Siempre 200: un error nuestro no debe hacer que Telegram reintente en bucle.
  for (const entrante of canal.interpretar(cuerpo)) {
    const conversacion = await obtenerOCrearConversacion(
      c.env.DB,
      negocioId,
      entrante.canal,
      entrante.canalChatId,
      entrante.autorNombre,
    );

    // El mensaje se guarda de inmediato: si el agente falla después, el hilo del
    // cliente no se pierde.
    await guardarMensaje(c.env.DB, negocioId, conversacion.id, "cliente", entrante.texto);

    const agente = idDeConversacion(c.env.AGENTE, negocioId, conversacion.id);
    await agente.fetch("https://agente/mensaje", {
      method: "POST",
      body: JSON.stringify({
        negocioId,
        conversacionId: conversacion.id,
        canalChatId: entrante.canalChatId,
        // El objeto no puede deducir su propia URL pública, y la necesita para
        // armar el link de la foto que Telegram va a descargar.
        origen: new URL(c.req.url).origin,
      }),
    });
  }

  return c.text("ok");
}

/** El cuerpo se lee una sola vez y solo si hace falta, memoizado aquí y no
 *  delegado a la caché de Hono, para no depender de cómo la implemente. */
function lectorDeCuerpo(c: Context<{ Bindings: Env }>): () => Promise<string> {
  let cuerpo: string | null = null;
  return async () => (cuerpo ??= await c.req.text());
}

app.post("/webhook/telegram", async (c) => {
  const canal = crearCanalTelegram(c.env.TELEGRAM_BOT_TOKEN);
  const leerCuerpo = lectorDeCuerpo(c);

  // Primero la autenticidad, antes de leer o escribir nada. La URL del Worker es
  // pública; sin este chequeo cualquiera inyecta mensajes falsos.
  if (!(await canal.autenticar(c.req.raw, leerCuerpo, c.env.TELEGRAM_WEBHOOK_SECRET))) {
    return c.text("no autorizado", 401);
  }

  return atenderTelegram(c, c.env.NEGOCIO_TELEGRAM, canal, await leerCuerpo());
});

// Multi-bot: los negocios creados por el onboarding reciben aquí, cada uno con
// SU secreto. El negocioId de la URL no autentica nada — el secreto sí.
app.post("/webhook/telegram/:negocioId", async (c) => {
  const negocioId = c.req.param("negocioId");

  const secreto = await leerCredencial(
    c.env.DB,
    negocioId,
    "telegram_webhook_secret",
    c.env.CLAVE_CIFRADO,
  );
  if (!secreto) return c.text("no autorizado", 401);

  const token = await leerCredencial(c.env.DB, negocioId, "telegram_token", c.env.CLAVE_CIFRADO);
  if (!token) return c.text("ok");

  const canal = crearCanalTelegram(token);
  const leerCuerpo = lectorDeCuerpo(c);

  if (!(await canal.autenticar(c.req.raw, leerCuerpo, secreto))) {
    return c.text("no autorizado", 401);
  }

  return atenderTelegram(c, negocioId, canal, await leerCuerpo());
});
```

Ajustar los imports del archivo: quitar `webhookAutentico` del `import` de `./canales/telegram` y agregar `import type { Canal } from "./canales/tipos";`.

- [ ] **Step 8: Correr todo y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — **182 tests** (175 de base + 7 del canal), typecheck limpio

- [ ] **Step 9: Actualizar la regla de qué se prueba**

En `CLAUDE.md`, reemplazar la línea `test/core/      lo único que se prueba con vitest, y a propósito` por:

```
test/core/      el dominio puro
test/canales/   solo lo puro de los adaptadores (interpretar, autenticar)
```

Y en la sección de arquitectura, después del párrafo de `src/core/`, agregar:

```
**Lo que se prueba con vitest es lo puro, no una carpeta.** `src/core/` lo es
entero; de los adaptadores de canal lo son `interpretar` y `autenticar`, y por
eso tienen tests. Lo que hace red —`enviar`, `enviarFoto`— se verifica de punta
a punta contra el Worker, nunca con dobles.
```

En `vitest.config.ts`, reemplazar el comentario de cabecera por:

```ts
// Aquí se prueba lo puro: `src/core` entero, y de los adaptadores de canal solo
// lo que no toca red (`interpretar`, `autenticar`). Determinista por diseño —
// corre en milisegundos y nunca falla por causas externas. Lo que hace red se
// verifica end-to-end contra el Worker.
```

- [ ] **Step 10: Commit**

```bash
git add src/canales test/canales src/index.ts CLAUDE.md vitest.config.ts
git commit -m "feat(canales): el contrato acepta lotes y autentica su propia entrada

interpretar devuelve lista porque Meta agrega hasta 1000 actualizaciones por
POST y documenta que el batching no se puede garantizar: con un solo mensaje
de retorno, un lote entrega uno y descarta el resto en silencio.

autenticar entra al contrato como obligatorio, así que la regla 5 pasa a
sostenerla el compilador. Recibe una función para leer el cuerpo y no el
cuerpo: Telegram nunca la llama, y un POST anónimo se rechaza sin que
paguemos su lectura.

test/canales/ es nuevo y la constitución lo dice ahora: lo que se prueba es
lo puro, no una carpeta."
```

---

### Task 4: La ruta `/webhook/meta/:negocioId`

**Files:**
- Modify: `src/db/repos/credencial.ts:12`, `src/index.ts` (después de las rutas de Telegram)

**Interfaces:**
- Consumes: `resolverHandshake`, `handshakeIncompleto`, `firmaValida`, `firmaConFormaValida` de la Task 1 y 2; `leerCredencial` de `src/db/repos/credencial.ts`
- Produces: las rutas `GET` y `POST` de `/webhook/meta/:negocioId`

- [ ] **Step 1: Ampliar las claves de credencial**

En `src/db/repos/credencial.ts`, reemplazar la línea 12:

```ts
export type ClaveCredencial =
  | "telegram_token"
  | "telegram_webhook_secret"
  // Solo las dos que necesita la puerta. El token de envío y el phone_number_id
  // los pide D2, cuando haya código que los use.
  | "meta_app_secret"
  | "meta_verify_token";
```

- [ ] **Step 2: Escribir las rutas**

En `src/index.ts`, después de `/panel/conectar-telegram`, agregar:

```ts
// ──────────────────────────────────────────────────────────────────  Meta  ──

/**
 * La puerta de la familia Meta. La app es del PROPIO negocio —su app, su
 * Callback URL, su Worker— porque Messenger e Instagram no admiten un webhook
 * por cliente, y un relay central nuestro rompería las reglas 7 y 8.
 *
 * Aquí solo está la puerta: interpretar los mensajes es D2.
 */
app.get("/webhook/meta/:negocioId", async (c) => {
  const parametros = new URL(c.req.url).searchParams;

  // Lo barato primero: una petición sin los parámetros de Meta no puede
  // costarnos una consulta a D1 más un descifrado.
  if (handshakeIncompleto(parametros)) return c.text("petición inválida", 400);

  const token = await leerCredencial(
    c.env.DB,
    c.req.param("negocioId"),
    "meta_verify_token",
    c.env.CLAVE_CIFRADO,
  );
  // Sin credencial responde igual que con token equivocado: desde afuera no se
  // puede distinguir un negocio que no existe de uno mal configurado.
  if (!token) return c.text("prohibido", 403);

  const r = resolverHandshake(parametros, token);
  if (!r.ok) {
    return r.error === "token_no_coincide"
      ? c.text("prohibido", 403)
      : c.text("petición inválida", 400);
  }

  return c.text(r.valor);
});

app.post("/webhook/meta/:negocioId", async (c) => {
  const cabecera = c.req.header("x-hub-signature-256") ?? null;

  // Lo barato primero, otra vez: sin una cabecera con forma de firma no hay
  // consulta ni descifrado. Sin esto la puerta es un amplificador.
  if (!firmaConFormaValida(cabecera)) return c.text("no autorizado", 401);

  const appSecret = await leerCredencial(
    c.env.DB,
    c.req.param("negocioId"),
    "meta_app_secret",
    c.env.CLAVE_CIFRADO,
  );
  if (!appSecret) return c.text("no autorizado", 401);

  if (!(await firmaValida(await c.req.text(), cabecera, appSecret))) {
    return c.text("no autorizado", 401);
  }

  /**
   * Autenticado. D1 llega hasta aquí a propósito.
   *
   * Y queda escrito para D2: la respuesta se manda YA y el trabajo se difiere.
   * Meta agrega hasta 1000 actualizaciones por POST; procesarlas dentro de la
   * petición agota el presupuesto del Worker, Meta lo lee como fallo y
   * reintenta durante 36 horas. El resultado no es lentitud, es una tormenta
   * de duplicados que llega justo cuando hay tráfico.
   */
  return c.text("ok");
});
```

Agregar a los imports del archivo:

```ts
import {
  firmaConFormaValida,
  firmaValida,
  handshakeIncompleto,
  resolverHandshake,
} from "./core/meta/entrada";
```

- [ ] **Step 3: Correr todo y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — 182 tests, typecheck limpio

- [ ] **Step 4: Commit**

```bash
git add src/db/repos/credencial.ts src/index.ts
git commit -m "feat(meta): la puerta de /webhook/meta/:negocioId

Handshake GET y firma X-Hub-Signature-256, con las credenciales cifradas por
negocio. La app de Meta es del propio negocio: Messenger e Instagram no
admiten webhook por cliente, y un relay central nuestro rompería las reglas
7 y 8.

Un negocio sin credencial responde igual que un token equivocado, para no
filtrar qué negocios existen. No se audita ningún rechazo: el negocioId de la
URL no está autenticado, y escribir una fila por petición anónima le regala a
cualquiera una forma de inflar la base."
```

---

### Task 5: Verificación contra el servidor

**Files:** ninguno — es verificación.

- [ ] **Step 1: Ejercer el camino positivo en local**

```bash
npx wrangler dev
```

En otra terminal, sembrar un negocio de prueba en la D1 **local** y sus dos credenciales. El token y el app secret hay que guardarlos **cifrados**, así que se siembran por el mismo camino que los usa — anotar aquí el comando exacto que se haya usado, no improvisarlo dos veces.

Handshake correcto:

```bash
curl -s "http://localhost:8787/webhook/meta/negocio-de-prueba?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=<token>"
```

Esperado: `1158201444` y nada más.

POST firmado:

```bash
CUERPO='{"object":"whatsapp_business_account","entry":[]}'
FIRMA=$(printf '%s' "$CUERPO" | openssl dgst -sha256 -hmac '<app-secret>' -r | cut -d' ' -f1)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8787/webhook/meta/negocio-de-prueba \
  -H "content-type: application/json" -H "x-hub-signature-256: sha256=$FIRMA" -d "$CUERPO"
```

Esperado: `200`. Y como **control**, repetir cambiando un carácter del cuerpo sin recalcular la firma: tiene que dar `401`. Sin ese control, un 200 no distingue "la firma se verificó" de "la firma no se miró".

- [ ] **Step 2: Comprobar que Telegram sigue vivo en local**

Webhook sintético contra `wrangler dev`, con el secreto de `.dev.vars` y un chat inexistente. Esperado: `200`, y una fila nueva en `mensajes` de la D1 local. Es la regresión que más importa de la Task 3.

- [ ] **Step 3: Pedirle el despliegue a Diego**

**No desplegar.** Presentarle el estado —tests, typecheck y la verificación local— y pedirle que autorice `npm run deploy`.

- [ ] **Step 4: Verificar contra producción, solo negativas**

Después del despliegue, esperando propagación y exigiendo que **dos lecturas seguidas coincidan**:

```bash
B=https://chuno.vozdigital-ai.workers.dev
curl -s -o /dev/null -w 'handshake sin parametros:  %{http_code}\n' "$B/webhook/meta/mi-optica"
curl -s -o /dev/null -w 'handshake token malo:      %{http_code}\n' "$B/webhook/meta/mi-optica?hub.mode=subscribe&hub.challenge=123&hub.verify_token=equivocado"
curl -s -o /dev/null -w 'post sin firma:            %{http_code}\n' -X POST "$B/webhook/meta/mi-optica" -d '{}'
curl -s -o /dev/null -w 'post firma inventada:      %{http_code}\n' -X POST "$B/webhook/meta/mi-optica" -H "x-hub-signature-256: sha256=$(printf 'a%.0s' {1..64})" -d '{}'
curl -s -o /dev/null -w 'telegram sigue cerrado:    %{http_code}\n' -X POST "$B/webhook/telegram" -d '{}'
```

Esperado: `400`, `403`, `401`, `401`, `401`.

**Control obligatorio antes de creerle a esta tanda:** una ruta que no existe tiene que dar `404`, no `401`. Si todo diera el mismo código, no estaríamos midiendo la puerta.

```bash
curl -s -o /dev/null -w 'ruta inventada:            %{http_code}\n' "$B/webhook/meta-que-no-existe"
```

- [ ] **Step 5: Registrar el aprendizaje si lo hubo, y cerrar**

Si algo de esto costó tiempo o desmintió un supuesto, va a `APRENDIZAJES.md` con el formato del archivo. Si no pasó nada de eso, **no escribir nada**: una entrada de relleno vale menos que cero.

Actualizar `docs/ESTADO.md`: D1 cerrado, D2 desbloqueado.

---

## Self-review del plan

**Cobertura del spec:** el contrato abierto (Task 3), las dos funciones puras (Task 1 y 2), la ruta con su tabla de códigos (Task 4), `ClaveCredencial` (Task 4), los arrastres a Telegram y demo (Task 3), el vector de openssl y la comprobación por mutación (Task 2), la verificación negativa en producción y positiva en local (Task 5). La sección «Escala» del spec queda en tres sitios: el 200-y-diferir como comentario normativo en la ruta, el rechazo barato en `handshakeIncompleto` y `firmaConFormaValida`, y el `idExterno` en el contrato.

**Sin placeholders:** el único dato que el plan no fija es el comando de siembra local del Step 1 de la Task 5, y está marcado como "anotar el que se use" porque depende de cómo se decida sembrar credenciales cifradas en local — no es una decisión de diseño pendiente.

**Consistencia de tipos:** `interpretar` devuelve `MensajeEntrante[]` en tipos, telegram, demo y en el `for` de `atenderTelegram`. `autenticar(peticion, leerCuerpo, secreto)` tiene la misma firma en el contrato, en Telegram, en la demo y en las dos llamadas de las rutas. `firmaValida(cuerpoCrudo, cabecera, appSecret)` se define en la Task 2 y se llama con ese orden en la Task 4.
