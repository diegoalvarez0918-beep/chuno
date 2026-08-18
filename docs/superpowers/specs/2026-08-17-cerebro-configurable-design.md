# El cerebro configurable: que cada negocio traiga el suyo y pague el suyo

> Spec de diseño. Aprobado por Diego el 2026-08-17.
> Ver "Qué NO entra aquí" al final.

## El problema

CHUNO se vende autoalojado: cada negocio en su nube, con sus datos. Pero el
cerebro no sigue esa regla. `GEMINI_API_KEY` es un secreto global del Worker
(`env.ts:16`), y `crearProveedorGemini` se construye a mano en dos sitios
—`agente/agente.ts:165` e `index.ts:917`— con esa llave y esa lista de modelos.

En un despliegue por negocio eso da igual: el secreto global **es** el del
negocio. Pero el traspaso registra que un despliegue puede hospedar varios
clientes —el "lo puedes revender"— y ahí **todos comparten una llave y una
factura**. Quien sea dueño del Worker paga los tokens de los demás, que es lo
contrario del modelo acordado.

Hay dos agravantes medidos, no supuestos:

1. **`LLM_PROVEEDOR` es configuración muerta.** Está declarada en `env.ts:25` y
   puesta en `wrangler.jsonc`, y **nadie la lee**. La promesa de "cambiar de
   proveedor es cambiar una variable de entorno", escrita en `llm/tipos.ts`, hoy
   es falsa.
2. **Un cerebro único en capa gratuita se cae.** El 2026-08-17 Gemini se fue en
   timeout cuatro veces y el bot contestó su mensaje de emergencia. Se arregló el
   respaldo entre modelos, pero todos los modelos de respaldo son del mismo
   proveedor y la misma cuota.

## Lo que se midió antes de diseñar

Verificado contra la documentación, no de memoria:

| Hecho | Consecuencia |
|---|---|
| OpenRouter es **compatible con la API de OpenAI** (`https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer`), con diferencias menores | Un solo adaptador con la URL base por parámetro cubre OpenRouter, OpenAI, Groq, DeepSeek, Together y cualquier endpoint compatible |
| Su `response_format` con esquema estricto **no lo soportan todos los modelos** | `generarJSON` usa `json_object`, no esquema estricto. Pedirlo a un modelo que no puede devuelve 400, que nuestra política clasifica como culpa nuestra y no reintenta |
| La API de Claude exige **cuenta de Console y API key**, con límites de gasto propios | Una suscripción de consumidor NO da acceso a la API. Hay que decirlo en el material del producto, o el cliente se frustra en el paso uno |

Fuentes: [OpenRouter API](https://openrouter.ai/docs/api-reference/overview) y
[Claude API overview](https://platform.claude.com/docs/en/api/overview).

## La precedencia es todo-o-nada

Es la decisión que da forma a todo lo demás.

**Si el negocio tiene su propia llave, TODA su configuración sale de sus
ajustes. Si no la tiene, TODA sale del entorno.** Nunca se mezclan.

Mezclar campo por campo suena más flexible y produce el peor estado posible: la
llave del negocio contra la URL base de la instalación, es decir peticiones al
proveedor equivocado con la credencial equivocada — un fallo que además se lee
como "la llave del cliente no sirve". La llave decide; lo demás la acompaña.

Esa regla es pura y vive en `src/core/llm/configuracion.ts`, con sus tests.

```ts
type ConfiguracionLLM = {
  readonly proveedor: "gemini" | "compatible";
  readonly apiKey: string;
  readonly baseUrl: string | null;   // solo para "compatible"
  readonly modelos: readonly string[];
  readonly topeDiario: number;
};

/** Lo que se leyó de los ajustes del negocio. Cualquier campo puede faltar:
 *  son filas sueltas de `settings` y una credencial, no un objeto atómico. */
type ConfiguracionParcial = {
  readonly apiKey: string | null;
  readonly proveedor: string | null;
  readonly baseUrl: string | null;
  readonly modelos: readonly string[];
  readonly topeDiario: number | null;
};

resolverConfiguracionLLM(
  delNegocio: ConfiguracionParcial,
  deLaInstalacion: ConfiguracionLLM,
): ConfiguracionLLM
```

### Qué cuenta como "tiene lo suyo"

Sin esto, el todo-o-nada se queda a medias:

- **Sin `apiKey`**, todo sale del entorno. Da igual lo que digan los demás
  ajustes del negocio: sin llave no hay con qué llamar.
- **Con `apiKey` y proveedor `compatible` pero sin `baseUrl`**, la configuración
  del negocio está **incompleta y se descarta entera** — se cae al entorno. No se
  inventa una URL ni se toma la de la instalación: eso sería justamente la mezcla
  que este diseño existe para prohibir.
- **Con `apiKey` y sin `proveedor`**, se asume `gemini`, que es el único que no
  necesita URL. Es el caso del negocio que solo quiere pagar su propia cuota
  gratuita.
- **Una lista de modelos vacía** cae a la del proveedor elegido, nunca a un array
  vacío: `crearProveedorGemini` ya hace eso con `MODELOS_POR_DEFECTO`, y el
  adaptador nuevo necesita su equivalente.

Descartar entero en vez de completar con el entorno tiene un costo real y
aceptado: un negocio mal configurado sigue funcionando **con la llave de la
instalación**, y el dueño puede no notarlo. Por eso el instalador valida antes de
guardar, y por eso la pantalla del panel —cuando exista— tendrá que mostrar qué
configuración está en uso.

## Dónde vive cada cosa

| Qué | Dónde | Por qué |
|---|---|---|
| La llave | `credenciales`, cifrada | Regla 4. `ClaveCredencial` gana `llm_api_key` |
| Proveedor, URL base, modelos, tope diario | `settings`, que ya existe | No son secretos, y meterlos en `credenciales` obligaría a descifrar para leer configuración |

## El resolvedor

`src/llm/proveedor.ts`, nuevo:

```ts
proveedorDe(env: Env, negocioId: string, onUso?: ReporteUso): Promise<ProveedorLLM>
```

Es el patrón de `canalSaliente` (`canales/salida.ts`), que ya resuelve lo mismo
para el token de Telegram: lo del negocio si existe, si no lo de la instalación.
Los dos llamadores actuales de `crearProveedorGemini` pasan a llamar esto, y los
dos ya tienen el `negocioId` a mano.

Aquí es donde `LLM_PROVEEDOR` deja de ser configuración muerta.

## El adaptador compatible con OpenAI

`src/llm/openai-compatible.ts`. Implementa `ProveedorLLM` sin tocar el agente,
que es exactamente para lo que se escribió esa interfaz.

Tres diferencias con Gemini que hay que respetar:

- El prompt de sistema va como un mensaje `role: "system"`, no como
  `systemInstruction`.
- `generarJSON` usa `response_format: {type: "json_object"}`. **La frontera de
  seguridad no se debilita:** `opciones.validar` ya pasa la respuesta por Zod, que
  es donde estaba de verdad — el esquema del proveedor solo mejoraba la calidad.
- El uso se reporta desde `usage.prompt_tokens` y `usage.completion_tokens`, no
  desde `usageMetadata`.

**Reutiliza `core/llm/reintento.ts` tal cual.** La política —qué error merece
otro modelo y el presupuesto total de 30 s— no tiene nada de Gemini adentro, y
se escribió el mismo día por un incidente que vuelve a ser el argumento de este
spec.

## El instalador valida antes de guardar

`cli/chuno.mjs` pregunta proveedor, llave y, cuando es compatible, URL base y
lista de modelos. Y **hace una llamada real** antes de guardar nada, igual que
`conectarTelegram`.

Sin eso, "pega el token" falla en silencio y el dueño se entera cuando un
cliente no recibe respuesta. Una credencial mala tiene que doler en la
instalación, que es cuando hay alguien mirando.

## El tope diario cambia de dueño

`TOPE_LLM_DIARIO` es hoy una constante global leída en `agente.ts:136`. Pasa a
`settings`, bajo la misma regla todo-o-nada: si el negocio trae su llave, trae
su techo.

No es un detalle de configuración. Con el cliente pagando sus propios tokens, ese
número es **su** techo de factura, y dejárselo fijado por nosotros contradice el
modelo entero.

## Tests

En `test/core/llm-configuracion.test.ts`, sobre la parte pura:

- Sin llave propia, todo sale del entorno.
- Con llave propia, todo sale de los ajustes del negocio — incluido el tope.
- Con llave propia y ajustes incompletos, se usan los valores por defecto **del
  proveedor elegido**, nunca los del entorno: es la trampa que el todo-o-nada
  existe para cerrar, y el test la nombra.
- Una lista de modelos vacía cae a la del proveedor, no a un array vacío que
  dejaría al agente sin nada que intentar.

El adaptador nuevo no se prueba con dobles: hace red. Se verifica de punta a
punta contra el Worker, como manda la constitución.

## Qué hace Forja, y en qué nos separamos a propósito

Verificado el 2026-08-17 contra su [repositorio](https://github.com/santmun/forja)
y su [documentación](https://forjabots.com/en/docs/), porque "hazlo como X" en
este proyecto se lee a X antes de aceptarlo — la vez anterior que se pidió eso,
el modelo mental resultó equivocado.

| | Forja | CHUNO |
|---|---|---|
| Proveedores | Anthropic, OpenAI y xAI | Gemini + cualquier endpoint compatible con OpenAI |
| Configuración | `wrangler secret put ANTHROPIC_API_KEY` | Igual, más precedencia por negocio |
| Abstracción | Vercel AI SDK | Interfaz propia, sin SDK |
| Despliegue | Single-tenant | Multi-tenant |

**Coincidimos en lo que importa:** la llave la pone el dueño desde la terminal,
como secreto del despliegue, y paga lo suyo. *"Tú eliges y pagas solo lo que
piensa"* describe también este spec.

**Nos separamos en dos sitios, y los dos son decisiones ya tomadas:**

1. **Sin SDK.** `llm/gemini.ts` lo dice desde el primer día: "una dependencia
   menos que pueda romperse en el runtime de Workers". Adoptar el SDK de Forja
   sería reabrir eso para ahorrar un archivo.
2. **Con precedencia por negocio.** Forja no la tiene porque no la necesita: un
   despliegue, un negocio, un secreto. En un despliegue por negocio CHUNO se
   comporta idéntico a Forja y nadie nota la diferencia; la pieza extra solo
   despierta cuando un mismo Worker hospeda a varios clientes con facturas
   separadas, que es justamente lo que Forja no puede atender.

Y un efecto lateral que conviene no perder: **un adaptador compatible con OpenAI
cubre más proveedores que los tres de Forja** —esos tres vía OpenRouter, más
Groq, DeepSeek o un servidor propio— y sin dependencias.

## Qué NO entra aquí

- **La pantalla del panel** donde el dueño edite esto sin terminal. Es un
  subproyecto propio, hermano del panel de Conexiones (D3).
- **Un adaptador nativo de Anthropic.** Claude se alcanza por OpenRouter desde el
  primer día; el directo solo ahorra el margen del intermediario y se escribe
  cuando alguien lo pida.
- **Elegir modelo por tarea** (uno barato para extraer, uno bueno para
  responder). Se puede, y no hay medición que lo justifique todavía.

## Cabo suelto que se arregla de paso

`CLAUDE.md` dice que `src/llm/` tiene "interfaz de proveedor + gemini +
anthropic". **`anthropic.ts` no existe.** Se corrige en el mismo cambio.
