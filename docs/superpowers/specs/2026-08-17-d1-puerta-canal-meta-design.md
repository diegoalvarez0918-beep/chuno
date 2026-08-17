# D1: la puerta de entrada, o cómo el contrato `Canal` aprende a recibir a Meta

> Spec de diseño. Aprobado por Diego el 2026-08-17.
> Subproyecto **1 de 4** de la Fase 4. Ver "Qué NO entra aquí" al final.

## El problema

El contrato `Canal` se escribió contra Telegram, y Telegram es el canal más
fácil que existe: un POST, un mensaje, un secreto en una cabecera. Por eso
`Canal` tiene exactamente tres métodos —`interpretar`, `enviar`, `enviarFoto`—
y la autenticación ni siquiera está en el contrato: vive como función suelta
`webhookAutentico` que las rutas llaman a mano (`index.ts:987` y `:1005`).

Meta pide tres cosas que Telegram nunca pidió, y ninguna cabe en ese contrato:

1. Un **handshake GET** antes de mandar nada, que hay que contestar con el
   challenge que trae.
2. Una **firma HMAC sobre los bytes crudos** del cuerpo. Nuestro camino de hoy
   parsea el JSON en la ruta y le pasa el objeto al canal; para verificar la
   firma hay que tener los bytes exactos, y reserializarlos no sirve.
3. **Lotes.** Un POST puede traer hasta 1000 actualizaciones. `interpretar`
   devuelve `MensajeEntrante | null`.

Ese tercer punto es el que muerde en silencio: con el contrato de hoy, un lote
de Meta entrega un mensaje y descarta el resto **sin dejar rastro**. Es la
tercera aparición en este proyecto de la misma familia de fallo —un total
contado sobre una página, un filtro aplicado sobre una página— y la peor de
las tres, porque lo que se pierde son mensajes de clientes.

## Lo que se midió en la documentación de Meta

Verificado contra los documentos, no supuesto:

| Hecho | Consecuencia para la puerta |
|---|---|
| GET con `hub.mode`, `hub.challenge` y `hub.verify_token`; hay que devolver el challenge | El handshake es una función pura: entran parámetros y un token esperado, sale un challenge o un rechazo |
| `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 del payload con el App Secret | La firma se calcula sobre bytes crudos, así que el cuerpo se lee una vez y se autentica antes de parsear |
| «se agregan y se envían en lote, **máximo 1000**… el batching no se puede garantizar, ajusta tu servidor para manejar cada webhook individualmente» | `interpretar` devuelve una lista, y la ruta responde 200 sin procesar en línea |
| Ante fallo se reintenta «durante las siguientes 36 horas», y eso «puede producir notificaciones duplicadas» | El contrato transporta el id del mensaje de origen para que D2 pueda descartar repetidos |

Fuentes: [Webhooks – Getting Started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
y [WhatsApp Cloud API – Set Up Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks).

## El contrato, abierto

En `src/canales/tipos.ts`:

```ts
export interface MensajeEntrante {
  readonly canal: string;
  readonly canalChatId: string;
  readonly texto: string;
  readonly autorNombre: string | null;
  /** Id del mensaje en su canal de origen. D1 solo lo transporta; D2 lo usa
   *  para descartar los reintentos de Meta, que duran hasta 36 horas. */
  readonly idExterno: string | null;
}

export interface Canal {
  readonly id: string;
  interpretar(cuerpo: unknown): MensajeEntrante[];
  /** Autentica el webhook ANTES de procesar nada.
   *
   *  El cuerpo entra como FUNCIÓN y no como cadena: Telegram autentica con una
   *  cabecera y nunca lo necesita, así que un POST anónimo se rechaza sin que
   *  lleguemos a leerlo. Meta sí lo necesita —su firma se calcula sobre esos
   *  bytes exactos— pero solo lo lee después de comprobar que la cabecera
   *  tiene forma de firma. Así "rechaza lo barato primero" vive dentro de cada
   *  canal, que es donde está ese conocimiento, y no repartido por las rutas.
   *
   *  El secreto va por parámetro para que construir el canal solo para enviar
   *  no obligue a ir a buscar una credencial de entrada que no se va a usar. */
  autenticar(
    peticion: Request,
    leerCuerpo: () => Promise<string>,
    secreto: string,
  ): Promise<boolean>;
  enviar(canalChatId: string, texto: string): Promise<Resultado<void, string>>;
  enviarFoto(canalChatId: string, urlFoto: string, pie: string): Promise<Resultado<void, string>>;
}
```

**`autenticar` es obligatorio, y esa es la pieza que importa.** La regla 5 —el
webhook valida su secreto antes de procesar nada— pasa a sostenerla el
compilador: un canal nuevo no compila sin implementar su puerta. Es la misma
táctica de `core/pedido/extraccion.ts`, donde lo que no se debe poder expresar
sencillamente no existe en el contrato.

**El handshake NO entra al contrato.** Solo Meta lo tiene. Ponerlo ahí
obligaría a Telegram y a la demo a implementar un rechazo que nadie llamaría
jamás, y este repo ya tiene registrado a dónde lleva eso: núcleo probado con
cero llamadores es una función que el producto no tiene. Se generaliza lo que
es general; el handshake se queda como función del núcleo, invocada por la
única ruta que lo necesita.

## La parte pura: `src/core/meta/entrada.ts`

Sin red, sin Cloudflare, sin reloj. El precedente que lo autoriza está escrito
en `core/cifrado.ts`: WebCrypto es estándar en Workers, en Node y en vitest, no
toca red ni reloj, y por eso el round-trip se prueba en milisegundos.

```ts
type RechazoEntrada = "parametros_incompletos" | "modo_no_soportado" | "token_no_coincide";

resolverHandshake(parametros: URLSearchParams, tokenEsperado: string): Resultado<string, RechazoEntrada>
firmaValida(cuerpoCrudo: string, cabecera: string | null, appSecret: string): Promise<boolean>
```

`resolverHandshake` exige `hub.mode === "subscribe"`, compara `hub.verify_token`
contra el esperado y devuelve `hub.challenge` **tal cual llegó**, como texto: es
un entero para Meta, pero convertirlo a número y de vuelta solo agrega una
forma de romperlo.

`firmaValida` parte el `sha256=<hex>`, exige 64 caracteres hexadecimales y
verifica con **`crypto.subtle.verify`** en vez de comparar cadenas a mano. La
comparación de un HMAC pertenece dentro de la implementación de WebCrypto, no
en un `===` nuestro.

## La ruta mínima: `/webhook/meta/:negocioId`

```
GET   handshake de verificación
POST  valida la firma, responde 200 y descarta el cuerpo
```

| Caso | Respuesta |
|---|---|
| GET sin los parámetros `hub.*` | 400 |
| GET con token equivocado, **o negocio sin credencial** | 403 — el mismo código para los dos, para no filtrar qué negocios existen |
| GET válido | 200, el challenge en texto plano |
| POST sin cabecera de firma, con firma malformada, con firma inválida o negocio sin credencial | 401 |
| POST con firma válida | 200, y nada más — interpretar es D2 |

El cuerpo se lee con `c.req.text()` y **en D1 no se parsea nunca**: la puerta
solo necesita los bytes. Cuando D2 le agregue la interpretación, parseará esa
misma cadena con `JSON.parse` en vez de llamar a `c.req.json()` — así no
dependemos de cómo cachea Hono el cuerpo entre `text()` y `json()`, y el objeto
que se interpreta es exactamente el que se firmó.

El mapeo de los tres motivos de rechazo del handshake a su código:
`parametros_incompletos` y `modo_no_soportado` → **400**, porque la petición
está mal formada; `token_no_coincide` → **403**, igual que un negocio sin
credencial, para que las dos situaciones sean indistinguibles desde afuera.

**D1 no audita los rechazos, a propósito.** El `negocioId` de la URL no está
autenticado, y escribir una fila de auditoría por cada petición anónima es
regalarle a cualquiera una forma de inflar la base. Lo que se audita empieza en
D2, cuando ya hay un mensaje atribuible a un negocio verificado.

**D1 no crea `canales/meta.ts`.** Un adaptador hoy tendría que traer
`interpretar`, `enviar` y `enviarFoto` como muñones, y un muñón que devuelve
"ok" es exactamente la clase de cosa que se despliega y no funciona. La ruta
llama a las dos funciones del núcleo directamente; en D2 nace el adaptador
entero y absorbe estas dos llamadas.

## Escala: lo que la puerta decide hoy y se paga después

Esto deja de ser una demo, así que la puerta se diseña para el día que haya
volumen, no para el día de la prueba.

**Responder 200 rápido y diferir el trabajo.** Con hasta 1000 actualizaciones
por POST, procesar el lote dentro de la petición agota el presupuesto del
Worker; Meta lo lee como fallo y reintenta durante 36 horas. El resultado no es
lentitud: es una tormenta de duplicados que llega justo cuando hay tráfico.
D1 ya responde 200 sin procesar, y **queda escrito como restricción para D2**:
autenticar, contestar, y hacer el trabajo fuera de la respuesta.

**Rechazar lo barato antes de tocar la base.** Un POST anónimo no puede
costarnos una consulta a D1 más un descifrado AES. La ruta comprueba primero
que exista la cabecera y que tenga forma de `sha256=` con 64 hex; solo entonces
va por la credencial. Sin eso, la puerta es un amplificador: el atacante gasta
un paquete y nosotros una consulta.

**Idempotencia por `idExterno`.** Con reintentos de 36 horas y volumen real, un
duplicado no es una fila de más: es un mensaje repetido al cliente y una llamada
al modelo pagada dos veces.

**Lo que NO se hace, y por qué:** nada de caché de credenciales en memoria. Se
justificaría con una medición del costo por webhook, y esa medición no existe
todavía. Queda como pregunta abierta, no como deuda.

## Lo que arrastra el cambio

- `db/repos/credencial.ts`: `ClaveCredencial` gana `meta_app_secret` y
  `meta_verify_token`. Solo esas dos; el token de envío y el `phone_number_id`
  los pide D2, cuando haya quien los use.
- `canales/telegram.ts`: `webhookAutentico` deja de ser función exportada suelta
  y pasa a ser el método `autenticar`. `interpretar` devuelve `[]` o un
  elemento, con `idExterno` tomado de `message_id`.
- `canales/demo.ts`: `interpretar` devuelve `[]`; `autenticar` devuelve `false`,
  porque la demo no recibe webhooks de nadie.
- `index.ts`: `atenderTelegram` itera la lista en vez de tratar un mensaje, y
  las dos rutas de Telegram pasan a llamar `canal.autenticar(...)`.

## Tests y verificación

Tests nuevos en `test/core/meta-entrada.test.ts`, **en rojo primero**.

Handshake: token correcto, token equivocado, `hub.mode` distinto de
`subscribe`, parámetro ausente, y el challenge devuelto tal cual sin
convertirlo a número.

Firma: válida, secreto distinto, cuerpo alterado en un byte, cabecera ausente,
cabecera sin el prefijo `sha256=`, hex de longitud impar, hex con caracteres
que no son hex.

**El vector válido se genera con `openssl dgst -sha256 -hmac` y se pega como
constante en el test.** Si el valor esperado lo produjera nuestra propia
función, el test compararía la implementación consigo misma y no probaría nada.
Al cerrar, se rompe `firmaValida` a propósito para ver caer los tests en rojo:
el sustituto barato de la fase roja cuando hay dudas de que un test mida algo.

Verificación tras desplegar, contra producción y **sin escribir un solo dato**:
handshake con token equivocado → 403, handshake sin parámetros → 400, POST sin
firma → 401, POST con firma inventada → 401. Dos lecturas seguidas que
coincidan, por la propagación de Cloudflare. El camino positivo —challenge
devuelto, firma buena aceptada— se ejerce en `wrangler dev` con credenciales de
`.dev.vars` y una firma calculada con `openssl`.

## Qué NO entra aquí

Todo esto es D2 en adelante, y nombrarlo evita que se cuele:

- **`canales/meta.ts` entero:** `interpretar` sobre el payload real,
  `enviar` y `enviarFoto` contra la Graph API.
- **El descarte de duplicados** por `idExterno`. D1 transporta el campo; nadie
  lo lee todavía.
- **Distinguir los tres productos** (WhatsApp, Messenger, Instagram) por el
  campo `object` del payload. La ruta es una sola porque la app de Meta es una
  sola, la del propio negocio; separarlos es trabajo de interpretación.
- **El panel de Conexiones** y la validación de la credencial contra la API al
  guardarla. Eso es D3.

## Preguntas abiertas

- **Caché de credenciales por webhook.** Hoy cada POST autenticado cuesta una
  lectura a D1 más un descifrado. Antes de optimizarlo hay que medir cuánto es
  eso con tráfico real.
- **Qué hacer con un lote que trae mensajes de más de un negocio.** No debería
  pasar —la app es del negocio— pero conviene decidir en D2 si se rechaza o se
  ignora la parte ajena, en vez de descubrirlo con datos.
