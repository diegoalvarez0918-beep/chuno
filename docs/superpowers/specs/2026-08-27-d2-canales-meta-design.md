# D2: WhatsApp, Messenger e Instagram sobre la puerta que dejó D1

> Spec de diseño. Aprobado por Diego el 2026-08-27.
> Ver "Qué NO entra aquí" al final.

## El problema

D1 dejó viva `/webhook/meta/:negocioId`: handshake GET, firma
`X-Hub-Signature-256` y credenciales cifradas por negocio. Está verificada
contra producción, pero **solo con negativas** — la ruta autentica y devuelve
`ok` sin leer un solo mensaje. Hoy CHUNO tiene exactamente un canal vivo,
Telegram, y el segmento al que se vende vive en WhatsApp.

D2 es lo que convierte esa puerta en tres canales.

## Decisiones que llegan cerradas y no se reabren

- **La app de Meta es del propio negocio** — su app, su Callback URL, su Worker.
  Nada de OAuth alojado por nosotros ni de relay central: rompería las reglas 7
  y 8. Ya se midió que Messenger e Instagram no admiten webhook por cliente, y
  esa asimetría es lo que fuerza la decisión.
- **El contrato `Canal` está abierto y D2 lo usa, no lo rediseña.** `interpretar`
  devuelve lista, `autenticar` es obligatoria y recibe una función para leer el
  cuerpo, y `MensajeEntrante` lleva `idExterno`.
- **Sin SDK.** Igual que en la capa de LLM: `fetch` contra el Graph, con timeout.

## Lo que se midió antes de diseñar

Verificado contra la documentación el 2026-08-27, no de memoria.

### La forma de los tres payloads

| Producto | `object` | Mensajes en | Id del mensaje | Qué se ignora |
|---|---|---|---|---|
| WhatsApp | `whatsapp_business_account` | `entry[].changes[].value.messages[]` | `id` (`wamid.…`) | el lote que trae `statuses` en vez de `messages` |
| Messenger | `page` | `entry[].messaging[]` | `message.mid` | `is_echo`, entregas y lecturas |
| Instagram | `instagram` | `entry[].messaging[]` | `message.mid` | `is_echo` |

**Messenger e Instagram comparten la forma exacta**, así que comparten
intérprete parametrizado por id de canal. Lo único que difiere es a dónde se
envía.

WhatsApp trae el nombre del cliente en `contacts[].profile.name`. **Messenger e
Instagram no mandan nombre**, solo un id opaco; sacarlo cuesta una llamada
aparte al Graph que D2 no hace.

### Los tres tienen ventana de 24 horas. Telegram no tiene ninguna

| Producto | Ventana | Fuera de la ventana |
|---|---|---|
| WhatsApp | 24 h desde el último mensaje del cliente, y se reinicia con cada uno | solo plantillas pre-aprobadas |
| Messenger | 24 h | etiqueta de mensaje; la de agente humano da 7 días |
| Instagram | 24 h | igual, vía etiqueta |

**Esto choca de frente con el diferenciador #1.** El vigía propone "el pedido de
Ana va tarde", y eso es proactivo por definición: si Ana escribió hace dos días,
el envío falla. Y la bandeja de aprobación mete latencia humana justo dentro de
la ventana — el dueño que aprueba a la mañana siguiente ya está fuera. En
Telegram esto no existe, así que hoy no hay una línea de código que lo contemple.

### Endpoints de envío

| Producto | Endpoint | Token |
|---|---|---|
| WhatsApp | `POST graph.facebook.com/v25.0/{phone_number_id}/messages` | `Authorization: Bearer` |
| Messenger | `POST graph.facebook.com/v25.0/{page_id}/messages` | query `access_token` |
| Instagram | `POST graph.instagram.com/v25.0/{ig_id}/messages` | `Authorization: Bearer` |

### Límites de plataforma que el diseño respeta

| Hecho | Consecuencia |
|---|---|
| **D1: 100 parámetros vinculados por consulta** | la fila de `entrantes` tiene 5 columnas → trozos de 20 filas; un lote de 1000 son 50 sentencias en un `batch()` |
| **D1 gratuito: 100.000 filas escritas/día, por cuenta** | ~5 filas por intercambio → techo de ~20.000 intercambios/día en todo el despliegue. **Las 5 filas son un supuesto** (conversación, mensaje del cliente, fila de bandeja, mensaje del agente, uso), no una medición |
| **Queues gratuito: 10.000 operaciones/día, por cuenta** | 3 operaciones por mensaje → ~3.300 mensajes/día en todo el despliegue |
| **Queues entrega *at least once*** | la tabla de idempotencia hace falta igual, se use Queues o no |
| Meta agrega hasta 1000 actualizaciones por POST y reintenta 36 h ante fallo | hay que responder 200 ya y diferir; y el reintento hay que volverlo inofensivo |

Fuentes:
[WhatsApp payload examples](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples) ·
[Messenger webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks) ·
[Instagram messaging webhooks](https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/) ·
[Messenger policy](https://developers.facebook.com/docs/messenger-platform/policy/policy-overview/) ·
[WhatsApp send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/) ·
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) ·
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) ·
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) ·
[Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

## Por qué la bandeja va en D1 y no en Queues

Se consideraron tres formas de diferir el lote.

**`waitUntil` a secas** se descarta por su modo de falla: si el Worker muere a
mitad, **Meta ya recibió el 200 y no reintenta**. Pérdida silenciosa, que es el
peor lado.

**Queues** es la herramienta hecha para esto, pero para este producto **baja** el
techo en vez de subirlo. No reemplaza las escrituras a D1 —el consumidor sigue
escribiendo mensaje, conversación y uso—, se le suma. Así que el despliegue pasa
de estar limitado por D1 (~20.000 intercambios/día) a estarlo por Queues (~3.300
mensajes/día), y sigue así en el plan de pago: 1 millón de operaciones al mes
contra 50 millones de filas. Como CHUNO se vende para **muchos negocios con poco
tráfico cada uno**, ese es exactamente el tope equivocado.

**La bandeja en D1** gana por un argumento que no depende del volumen: ni Meta ni
Queues prometen entrega única, así que la tabla de idempotencia es obligatoria
pase lo que pase. Una vez que existe, **ya es una bandeja durable**. Un mecanismo
en vez de dos.

Si algún día un cliente grande rompe el techo, Queues se enchufa delante sin
rediseñar el drenaje: la tabla de idempotencia no se entera.

**El límite real de la reventa no es este mecanismo**, es que todos los negocios
comparten una D1 y una cuenta de Cloudflare. Eso ya es así hoy y D2 no lo cambia.

## El flujo de entrada

```
POST /webhook/meta/:negocioId
 │
 │  ── ya existe, lo dejó D1 ─────────────────────────────
 ├─ 1. ¿la cabecera tiene forma de firma?      no → 401
 ├─ 2. leer meta_app_secret de credenciales    no → 401
 ├─ 3. firmaValida(cuerpoCrudo, ...)           no → 401
 │  ── autenticado ───────────────────────────────────────
 ├─ 4. JSON.parse(cuerpoCrudo)          ilegible → 200
 ├─ 5. productoDeMeta(cuerpo)  por "object"  ajeno → 200
 ├─ 6. canal.interpretar(cuerpo) → MensajeEntrante[]
 ├─ 7. INSERT OR IGNORE en `entrantes`, en trozos de 20 filas
 ├─ 8. return 200                    ◄── Meta se va tranquilo
 └─ 9. waitUntil(drenar(negocioId))  ── y el cron recoge lo que quede
```

```sql
CREATE TABLE IF NOT EXISTS entrantes (
  negocio_id    TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL,   -- whatsapp | messenger | instagram
  id_externo    TEXT NOT NULL,   -- wamid o mid: la llave de idempotencia
  carga         TEXT NOT NULL,   -- el MensajeEntrante ya normalizado, como JSON
  procesado_en  TEXT,            -- NULL mientras esté pendiente
  PRIMARY KEY (negocio_id, canal, id_externo)
);
CREATE INDEX IF NOT EXISTS idx_entrantes_pendientes
  ON entrantes (negocio_id, procesado_en);
```

Cinco columnas, y de ahí salen los trozos de 20 filas. La llave primaria
compuesta **es** el índice único que hace inofensivo el reintento de Meta: no
hace falta un índice aparte. Se guarda el `MensajeEntrante` ya normalizado y no
el payload crudo, porque interpretar es puro y barato y hacerlo en la ruta deja
la bandeja pequeña y el drenaje tonto.

**El paso 7 va antes del 8, y ahí está todo el diseño.** La durabilidad no sale
de que el Worker sobreviva: sale de que la fila esté escrita antes de prometerle
nada a Meta.

**El reintento de 36 horas deja de ser amenaza y pasa a ser red.** La segunda
entrega del mismo lote choca contra el índice único sobre
`(negocio_id, canal, id_externo)` y se ignora sola.

**`JSON.parse` sobre la misma cadena que se firmó**, nunca `c.req.json()`. Va
como comentario en el código porque es de las que se "limpian" sin querer.

**`object` desconocido responde 200, no 400.** Meta manda notificaciones de todos
los campos a los que la app esté suscrita, y una que no nos interesa no es un
error suyo. Ignorar no es fallar — misma regla que Telegram ya usa con fotos y
stickers.

**Quién recoge lo que el drenaje no terminó.** El `scheduled()` que hoy corre el
vigía cada 30 minutos gana un paso previo: barrer `entrantes` con
`procesado_en IS NULL` y drenarlas. No es un cron nuevo — es el que ya existe,
con una responsabilidad más. Peor caso de latencia para un mensaje cuyo drenaje
murió: 30 minutos, contra perderlo para siempre.

**El drenaje marca `procesado_en` solo después de que el Durable Object acuse
recibo.** Marcarlo antes dejaría, ante un fallo al despertar el objeto, un
mensaje guardado y **sin respuesta** — el modo de falla que el cliente sí nota.
Para que reintentar sea seguro, `mensajes` gana `id_externo` con índice único:
reprocesar no duplica. Esa columna cierra de paso el cabo que dejó D1
—`idExterno` viaja en el contrato y no lo lee nadie— y le da descarte de
duplicados a Telegram, que también reintenta.

**Telegram no pasa por `entrantes`.** Manda una actualización por POST, sin
lotes. Pagar una bandeja donde no hay lote sería ceremonia. Lo que sí se comparte
es lo de después: `atenderTelegram` se generaliza a `atender(negocioId, mensajes)`
y la usan los dos.

## Los tres productos dentro de un contrato `Canal`

```
src/canales/meta/
  comun.ts        productoDeMeta · autenticarMeta · fetch con timeout
  whatsapp.ts     forma propia
  messenger.ts    forma compartida
  instagram.ts    forma compartida
```

**El huevo y la gallina de `autenticar`.** La ruta tiene que autenticar antes de
saber qué producto es, pero `autenticar` vive en el contrato `Canal` y un canal
no se construye sin producto. La salida no es duplicar: `comun.ts` exporta **una
sola** `autenticarMeta`, la ruta la llama directo, y los tres canales la asignan
como su `autenticar`. Misma función, un cuerpo, con llamador real en producción
— nada de un método que solo ejercitan los tests.

**El filtro `is_echo` es el equivalente del "bot hablándole a otro bot"** que
Telegram ya resuelve: Meta devuelve por webhook lo que nosotros mismos enviamos.
Sin ese filtro, cada respuesta del agente entra como mensaje nuevo, el bot se
contesta a sí mismo en bucle y paga el modelo en cada vuelta.

**En WhatsApp el `canalChatId` es el teléfono del cliente.** Es dato personal. Va
a la base igual que hoy va el chat id de Telegram, pero **nunca a un log** — la
regla 6 se sostiene truncando a los últimos 4 al correlacionar.

## La ventana de 24 horas

**Dónde se decide: al construir el canal, no en la firma de `enviar`.** El
contrato está cerrado. `canalSaliente` ya es asíncrona y ya lee una credencial,
así que también lee la marca de la última actividad del cliente y la
configuración de plantilla, y devuelve un canal que **ya sabe** en qué modo está.
Quien envía no cambia una línea.

```
canalSaliente(env, negocioId, canalId)
   │
   ├─ ventana abierta ──────────► enviar libre
   ├─ cerrada + WhatsApp con plantilla configurada ──► enviar plantilla
   ├─ cerrada + Messenger/IG con permiso de agente humano ──► etiqueta, 7 días
   └─ cerrada y nada configurado ──► fallo("ventana_cerrada")
```

El último caso es el camino degradado, no el techo: la propuesta se queda en la
bandeja con el motivo escrito y el dueño ve *"la ventana de WhatsApp se cerró —
este aviso no sale por aquí"*. **La regla 11 no se toca**: nada salió sin que él
aprobara, y tampoco se le miente diciendo que salió.

**La etiqueta de agente humano encaja con CHUNO mejor que con casi cualquier otro
producto.** Meta la creó para respuestas escritas por una persona, y en CHUNO una
persona aprueba cada mensaje. No se está forzando la regla, se está en su caso de
uso.

**El detalle que evita pagar de más.** Meta reinicia la ventana con **cualquier**
mensaje del cliente —sticker, foto, audio— y nuestro `interpretar` devuelve lista
vacía para todos esos. Un cliente que manda una foto y luego calla dejaría
nuestro reloj cerrado y el de Meta abierto, y mandaríamos una plantilla de pago
sin necesidad. Se resuelve con una segunda función pura por producto,
`marcasDeActividad`, que extrae las marcas de **todo** evento entrante, se procese
o no su contenido. `conversaciones` gana `ultimo_cliente_en`, que se escribe desde
ahí.

**El reloj no es la autoridad, es la optimización.** La autoridad es Meta: si
rechaza un envío por fuera de ventana, se registra como tal aunque nuestro reloj
dijera lo contrario. Nuestro reloj sirve para no gastar una llamada condenada y
para avisarle al dueño antes.

## Credenciales y configuración

El reparto entre cifrado y plano lo decidió el cerebro configurable, y se copia
tal cual en vez de inventar un criterio nuevo.

| Dónde | Qué |
|---|---|
| `credenciales` (cifrada) | `whatsapp_token`, `messenger_page_token`, `instagram_token` |
| `settings` (plano) | `meta_phone_number_id`, `meta_page_id`, `meta_ig_id`, `whatsapp_plantilla_aviso`, `meta_agente_humano` |

`meta_app_secret` y `meta_verify_token` ya existen desde D1.

**Todo-o-nada, otra vez.** Un negocio que declara WhatsApp necesita token y
`phone_number_id` **juntos**; si falta uno, el canal se trata como no
configurado. Un token contra el id de otro es el peor estado posible y se lee
como "el token del cliente no sirve".

**Se cargan por `cli/chuno.mjs`**, con el precedente de `conectarTelegram`, y
**validando contra el Graph al guardar**: "pega el token" falla en silencio. Una
llamada de lectura con el token contra el id declarado prueba las dos cosas de
una; si no responde, el CLI se niega a guardar y dice cuál de los dos falló.

## La deuda de migraciones, que D2 paga

`schema.sql` es idempotente, así que `entrantes` entra ahí sin más. El problema
son las **dos columnas nuevas**, porque `ALTER TABLE` no es idempotente y la D1
viva ya existe.

Hoy eso se resolvió con un archivo en `.tmp/`, que está en `.gitignore` y que la
constitución declara "nada ahí es fuente de verdad". Resultado comprobado contra
la base viva: producción tiene `catalogo.imagen_clave` y **el repo no tiene cómo
volver a producirla**.

```
src/db/migraciones/
  001-imagen-clave.sql       ← la ya aplicada, rescatada de .tmp/
  002-id-externo.sql         ← D2
  003-ultimo-cliente-en.sql  ← D2
  LEEME.md                   ← se corren una vez; cómo comprobar si ya se aplicó
```

Cada archivo trae al lado su consulta de comprobación sobre `pragma_table_info`.
Y `schema.sql` gana también las columnas, para que un despliegue nuevo no
necesite correr ninguna migración. Reproducible desde el repo, sin inventar
maquinaria de migraciones que nadie pidió.

## Qué responde la ruta ante cada fallo

| Situación | Respuesta | Por qué |
|---|---|---|
| Sin firma, o mal formada | 401 | ya existe, D1 |
| Sin `meta_app_secret`, o firma inválida | 401 | indistinguibles desde afuera a propósito |
| JSON ilegible | 200 | reintentar no lo arregla |
| `object` ajeno, o lista vacía | 200 | ignorar no es fallar |
| **Falla el `INSERT` en `entrantes`** | **500** | **queremos que Meta reintente** |
| Falla el drenaje | — | ya respondimos 200; lo recoge el cron |
| Meta rechaza el envío por ventana | propuesta con motivo | no es excepción, es información para el dueño |

Ese 500 es una inversión deliberada de la regla que gobierna todo lo demás. En
todas partes devolvemos 200 para que el canal no entre en bucle; aquí, y solo
aquí, **queremos el reintento** — es el único punto donde perder el lote es
irrecuperable y donde el reintento de Meta es la red que necesitamos.

## Lo que se prueba con vitest

Lo puro, no una carpeta.

- **`productoDeMeta`** — los tres `object` conocidos, uno ajeno, y basura.
- **`interpretar` de WhatsApp** — texto normal · lote con varios mensajes
  repartidos en varios `entry` · payload de `statuses` que da vacío · tipo
  no-texto que da vacío · el `wamid` llegando como `idExterno` · el nombre desde
  `contacts[].profile.name`.
- **`interpretar` de Messenger/Instagram**, compartido — texto normal ·
  `is_echo: true` que da vacío · entregas y lecturas que dan vacío ·
  `autorNombre` nulo · el id de canal correcto según el producto.
- **`marcasDeActividad`** — devuelve marca para los eventos que `interpretar`
  descarta (foto, sticker), y **no** la devuelve para `is_echo` ni para
  `statuses`. Sin esta prueba el reloj de la ventana se desalinea del de Meta y
  nadie se entera.
- **`ventanaAbierta`** — justo dentro, justo fuera, y sin marca previa. La hora
  entra por parámetro, como manda `core`.
- **El troceo a 20 filas** — un lote de 1000 da 50 sentencias y ninguna pasa de
  100 parámetros. **Verificado por mutación**: subir el trozo a 21 tiene que
  ponerlo en rojo, o el test no mide nada.

## Cómo se cierra D2

1. `npm test` y `npm run typecheck`.
2. **Contra producción, solo negativas y sin escribir un dato**, con control de
   ruta inventada y exigiendo que dos lecturas seguidas coincidan — igual que se
   cerró D1.
3. **WhatsApp en vivo** con el número de pruebas, según el runbook: mensaje real
   de ida y vuelta, y después comprobar en D1 que la fila de `entrantes` quedó
   procesada y que `mensajes` trae el `id_externo`.
4. **La prueba que de verdad importa, con su par de controles.** Reenviar el
   **mismo** lote y ver que no aparece una segunda fila; luego cambiarle un
   carácter al `id_externo` y ver que sí aparecen dos. Sin el segundo control,
   "no se duplicó" podría significar que el segundo envío nunca llegó, y
   estaríamos midiendo ruido.

Messenger e Instagram se cierran con sintético: su trámite es más largo, y
entre ellos comparten intérprete y casi todo el resto del código, así que lo que
queda sin ejercer es el endpoint de envío, no el diseño.

## Qué NO entra aquí

- **El panel de Conexiones** — es D3.
- **Crear o aprobar las plantillas de WhatsApp** — el trámite es del negocio, en
  su propio Business Manager, y ningún código nuestro lo elimina.
- **Traer el nombre del cliente en Messenger e Instagram** — cuesta una llamada
  extra al Graph.
- **Procesar audio o imágenes que mande el cliente** — se ignoran, como hoy en
  Telegram.
- **Queues** — se enchufa delante el día que un cliente rompa el techo, sin
  rediseñar el drenaje.

## Riesgos anotados, no resueltos

- **El precio de las plantillas de WhatsApp para Colombia no está verificado.**
  Tienen costo por mensaje y lo paga el negocio; el número hay que mirarlo antes
  de que D3 lo prometa en una pantalla.
- **Instagram es donde menos certeza hay** sobre si la etiqueta de agente humano
  aplica igual que en Messenger: su documentación de envío no la nombra. El
  código trata el rechazo de Meta como "ventana cerrada" en vez de reventar, así
  que la incertidumbre no se vuelve un fallo feo.
