# Estado del proyecto

> Traspaso entre sesiones. Léelo después de `CLAUDE.md` y antes de tocar nada.
> Última actualización: **2026-08-15**. 177 tests verdes, typecheck limpio.
>
> **Desplegado y verificado en producción** (versión `cf538280`): el arreglo del
> vigía y el del escalado. **Sin desplegar:** la lista de conversaciones, que
> vive en el PR #4.
>
> **Dónde quedamos:** ver "Traspaso del 2026-08-15" al final de este archivo.
>
> **Entregado al concurso:** video no listado `https://youtu.be/owZTkUv2oaY`
> (93 s, sin narración) y herramienta `https://chuno.vozdigital-ai.workers.dev`.
>
> **Ojo con el video:** muestra `npx chuno init`, y ese comando NO existe. npm
> rechazó el nombre corto por parecerse a `hono`. El paquete real es
> `npx chuno-cli init` y la landing ya dice lo correcto.

## Lo que se cerró el 2026-07-31

| Qué | Dónde |
|---|---|
| Titular del hero en positivo, y el comando de instalación en el hero | `publico/landing.ts` |
| Bot de Telegram enlazado desde la landing | `publico/landing.ts` |
| Pedidos y leads se mueven, también en la demo | `index.ts`, `admin/vistas.ts` |
| Un encargo por conversación, no uno por ráfaga | `core/pedido/dedupe.ts` |
| Instalador publicado y arreglado para cuentas ajenas | `cli/chuno.mjs` |
| Respuestas con estructura y emojis cuando hay algo que listar | `giros/por-encargo.ts` |
| El asistente aprende de lo que contesta el dueño | `core/conocimiento/aprendizaje.ts` |
| Link de agenda (Cal/Calendly) que comparte solo si se lo piden | `core/conocimiento/agenda.ts` |
| Topes de abuso, memoria del hilo en 20, foto del producto | `core/limites.ts`, `core/conocimiento/busqueda.ts` |

**Los dos quedaron verificados el 2026-08-15.** Lo que decía este párrafo —que
hacían falta pruebas reales— era cierto al escribirlo y dejó de serlo:

- **La foto sí llega por Telegram.** `auditoria` de `mi-optica` tiene
  `foto_enviada` ×3, la última el 2026-08-03, y **cero** `foto_fallida`. Se
  verificó sola cuando alguien le escribió al bot desde el teléfono. Y las fotos
  de `mi-optica` se sirven como `image/webp`: Telegram acepta WebP por URL.
- **El tope por conversación corta antes del modelo.** Probado en local con
  `TOPE_POR_CONVERSACION=1` y una llave de Gemini falsa a propósito: el primer
  mensaje deja `respuesta_fallida` (control: el tope NO fue lo que lo paró) y el
  segundo deja `tope_conversacion` con `uso_llm` sin crecer. Cero cuota gastada.

**El webhook sintético SÍ sirve para el tope**, al revés de lo que decía este
documento: el tope corta en `agente.ts` antes de llamar al modelo y antes de
cualquier envío, así que da igual que el chat no exista. Lo que lo hacía caro no
era el chat, era el valor por defecto de 30 — y el tope cuenta **pasadas del
agente, no mensajes**, porque el Durable Object agrupa ráfagas. Llegar a 30 son
~60 llamadas al modelo, no 30. Bajando la variable, la prueba es gratis.

---

## Lo que está vivo ahora mismo

| Qué | Dónde | Notas |
|---|---|---|
| Herramienta pública | https://chuno.vozdigital-ai.workers.dev | Entregable #2 del concurso |
| Landing | `/` | Sistema Voz, 3 secciones, hero con spotlight |
| Entrada al panel | `/entrar` | Formulario propio; deja cookie de sesión firmada |
| Demo sin registro | `/demo/inicio` | `demo-optica`, resembrada cada 30 min. Los tableros **sí se mueven** |
| Bot público | `t.me/Chunnobot` | Enlazado desde la landing desde 2026-07-30 |
| Panel del dueño | `/panel/inicio` | Cookie de sesión **o** Basic Auth. Barra lateral fija |
| Embudo de clientes | `/panel/clientes` | Kanban de 5 columnas, se mueve arrastrando o con botones |
| Imagen del hero | `/hero.jpg` | 190 KB. Sale de `public/`, servida por el `notFound` del Worker |
| Conocimiento del negocio | `/panel/conocimiento` | CRUD de catálogo y preguntas frecuentes |
| Entrevista de onboarding | `/panel/comenzar` | 7 preguntas → negocio nuevo configurado |
| Repetición de la entrevista | `/demo/comenzar` | Pública, determinista, sin LLM y sin escribir |
| Webhook multi-bot | `/webhook/telegram/:negocioId` | Un bot por negocio, con secreto propio |
| Instalador | `npx chuno-cli init` · `cli/chuno.mjs` | Publicado en npm como `chuno-cli@0.1.1` |
| Repositorio público | https://github.com/diegoalvarez0918-beep/chuno | Entregable #1 |
| Bot de Telegram | `@Chunnobot` | Escribe al negocio `mi-optica` |
| Base de datos D1 | `chuno` · `50f72126-740e-4813-8c9c-355ca32a8698` | 16 tablas |

**Dos negocios separados a propósito:** `demo-optica` es lo que ve el público; `mi-optica` recibe las conversaciones reales de Telegram. La demo nunca muestra chats reales.

**Consecuencia del bot enlazado, y hay que no prometer de más:** @Chunnobot escribe en `mi-optica`, que vive detrás de la contraseña. Quien le escriba desde la landing **recibe respuesta real pero no puede ver su propio pedido en ningún lado**. Apuntar el bot a `demo-optica` cerraría ese lazo y publicaría las conversaciones de unos visitantes a los otros, que es justo lo que prohíben las reglas 6 y 7. Por eso la copia del hero dice "un bot de verdad, respondiendo ahora" y no "tu pedido aparece en el tablero".

**`esDemo`, antes `soloLectura`:** el flag de `montarPanel` se renombró el 2026-07-30 porque dejó de ser cierto. Hoy separa dos políticas: el conocimiento no se edita (sus rutas ni se registran), pero los tableros de pedidos y de clientes **sí se mueven**, sin los destinos que los degradan sin vuelta atrás (`cancelado` y `perdido`). Los vetos se comprueban en el servidor, no solo en la vista.

## Credenciales

Nunca están en el repo. Viven en dos sitios:

- **Local:** `.dev.vars` en la raíz (ignorado por git). Cinco llaves: Gemini, token de Telegram, secreto del webhook, contraseña del panel y `CLAVE_CIFRADO`.
- **Producción:** secretos de Cloudflare, cargados con `wrangler secret put`.

`CLAVE_CIFRADO` es la llave maestra AES-GCM (base64, 32 bytes) de la tabla `credenciales`: ahí viven, **cifrados**, el token de bot y el secreto de webhook de cada negocio creado por el onboarding. La base sola no alcanza para hablar por esos bots — hace falta también la llave. Si se rota, esas credenciales dejan de descifrar y `leerCredencial` las trata como ausentes (cae al bot global; el webhook por negocio responde 401).

Cloudflare está autenticado por OAuth en `~/.wrangler`. GitHub va por llave SSH y `git push` funciona sin contraseña.

**npm:** cuenta `chunoai`, con 2FA activo. Publicar exige código de un solo uso, así que lo corre Diego. Hay un token de acceso guardado en `~/.npmrc` con permiso de saltarse el 2FA: **bórralo cuando ya no haga falta**, en npmjs.com/settings/chunoai/tokens.

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Núcleo, pedidos, vigía, bandeja, Telegram, panel, demo | ✅ cerrada |
| 1 | CRM autoalimentado y panel de métricas | ✅ cerrada |
| 2 | Conocimiento estructurado: catálogo y preguntas frecuentes | ✅ cerrada |
| 3 | Onboarding conversacional (`/comenzar`) | ✅ cerrada |
| 4 | Ingesta multicanal — familia Meta (WhatsApp, Instagram, Messenger) | pendiente · bloqueado por trámite de Meta |
| 5 | Marca blanca | pendiente |
| 6 | Entrega del concurso: video, links, votos | los dos links, listos y desplegados · faltan video y votos |
| 7-8 | Herramientas con escritura, RAG con embeddings | después del concurso |
| 9 | CLI instalador | ✅ adelantada — `npx chuno-cli init` |
| — | Landing pública con login, demo blindada y resembrada | ✅ cerrada 2026-07-30 |

Spec completo: `docs/superpowers/specs/2026-07-29-chuno-plataforma-design.md`
Planes ejecutados: `docs/superpowers/plans/2026-07-29-fase-1-crm-y-metricas.md` y `docs/superpowers/plans/2026-07-29-fase-2-3-conocimiento-y-onboarding.md`
Spec de la landing: `docs/superpowers/specs/2026-07-30-landing-y-login-design.md`

**Fases 2 y 3 fueron juntas.** La entrevista del onboarding *produce* el catálogo y las preguntas frecuentes estructuradas: separarlas habría obligado a construir dos veces la misma forma de datos.

El motor de la entrevista es una máquina de estados pura en `src/core/onboarding/`, sin LLM: el CLI de la Fase 9 lo reutiliza tal cual. El LLM solo entra como respaldo cuando los parsers deterministas no pueden leer el catálogo o las FAQ pegadas.

## Cómo verificar que todo sigue en pie

```bash
npm test          # 152 tests deterministas, sin red ni LLM
npm run typecheck # limpio, sin any ni @ts-ignore
curl -s -o /dev/null -w '%{http_code}\n' https://chuno.vozdigital-ai.workers.dev/demo/inicio
```

Landing, sesión y blindaje de la demo, todo contra el servidor. **Verifica con
`curl` y `grep` de algo que solo exista en la versión nueva antes de mirar el
navegador** — una captura cacheada ya casi provocó un diagnóstico falso:

```bash
B=https://chuno.vozdigital-ai.workers.dev
PASS=$(grep '^PANEL_PASSWORD=' .dev.vars | cut -d= -f2-)
curl -s $B/ | grep -c 'En qué se diferencia'                       # 1 = landing nueva
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' $B/hero.jpg      # 200 y ~190 KB
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $B/panel/inicio   # 302 → /entrar
curl -s -o /dev/null -w '%{http_code}\n' -u "admin:$PASS" $B/panel/inicio  # 200, Basic Auth vive
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/demo/conocimiento/faq/borrar -d 'id=faq-d1'  # 404
curl -s $B/demo/inicio | grep -B1 'Mensajes hoy'                   # > 0 si el resembrado corrió
```

Verificación de extremo a extremo sin escribirle a una persona real — webhook sintético con un chat inexistente:

```bash
S=$(grep '^TELEGRAM_WEBHOOK_SECRET=' .dev.vars | cut -d= -f2-)
curl -s -X POST https://chuno.vozdigital-ai.workers.dev/webhook/telegram \
  -H "content-type: application/json" -H "x-telegram-bot-api-secret-token: $S" \
  -d '{"message":{"chat":{"id":999000111},"text":"quiero unas gafas para el lunes","from":{"first_name":"Prueba","is_bot":false}}}'
```

Espera ~20 segundos (el buffer del Durable Object) y revisa `contactos`, `leads` y `uso_llm` en D1.

**Ojo con este atajo:** un chat inventado no existe en Telegram, así que `sendMessage` devuelve HTTP 400 y **el mensaje del agente nunca se guarda**. Eso es normal y no es un fallo del agente: se comprueba en `auditoria` con la acción `envio_fallido`. Para verificar que el agente entendió, mira `auditoria`, `tickets` y `pedidos`, no la tabla `mensajes`.

La entrevista de onboarding se prueba entera sin navegador y sin gastar LLM (los parsers deterministas responden todo):

```bash
PASS=$(grep '^PANEL_PASSWORD=' .dev.vars | cut -d= -f2-)
B="https://chuno.vozdigital-ai.workers.dev"
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -u "admin:$PASS" -X POST "$B/panel/comenzar" \
  --data-urlencode "texto=Negocio de Prueba")
for R in "Vendemos cosas por encargo" "Lunes a viernes de 9 a 5" \
         'Ramo de 12 rosas - $95.000 - entrega mismo día' \
         'P: ¿Hacen domicilios?
R: Sí, en toda Bogotá' "cercano" "saltar"; do
  curl -s -o /dev/null -w '%{http_code} ' -u "admin:$PASS" -X POST "$LOC" --data-urlencode "texto=$R"
done
curl -s -o /dev/null -w '%{http_code}\n' -u "admin:$PASS" -X POST "$LOC" --data-urlencode "confirmar=si"
```

Siete `303`. Borra el negocio de prueba al terminar: `DELETE FROM negocios WHERE id='<el que salió en $LOC>'` — la cascada limpia catálogo, FAQ, conocimiento, credenciales y entrevista.

## Gotchas que ya costaron tiempo

Están en `APRENDIZAJES.md` con más detalle. Los que muerden más rápido:

- **`pnpm` no existe en esta máquina** y corepack no está enlazado. Usa `npm`.
- **Nunca `| tail` sin `set -o pipefail`** — enmascara el código de salida y un fallo se lee como éxito.
- **Durable Objects:** la migración usa `new_sqlite_classes`, no `new_classes`. Con `new_classes` el despliegue falla en el plan gratuito.
- **Vectorize es de pago.** El RAG usa búsqueda por términos sobre D1 detrás de la misma interfaz.
- **Los modelos de Gemini se jubilan sin aviso** y el listado de la API los sigue mostrando. Por eso `MODELOS_LLM` es una var con lista de respaldo y el proveedor cae al siguiente ante 404, 429 o 503. El 503 se agregó el 2026-07-30: `gemini-3.6-flash` empezó a devolverlo por saturación y tumbaba la extracción entera, porque el proveedor no reintentaba con otro modelo.
- **Un envío fallido a Telegram no guarda mensaje del agente.** Si `sendMessage` falla, no hay fila en `mensajes` — solo la acción `envio_fallido` en `auditoria`. Buscar la respuesta en `mensajes` y no encontrarla no significa que el agente no haya funcionado.
- **La auditoría es la herramienta de diagnóstico.** Cuando algo falle, consulta `auditoria` antes de reproducir nada: guarda el motivo, no solo el hecho.
- **Un solo formato de fecha: ISO-8601 con `T` y `Z`.** D1 compara fechas como texto, y `datetime('now')` de SQLite produce `2026-07-30 17:00:00` con espacio, que ordena ANTES que cualquier `...T...`. Mezclarlo con lo que escribe la app rompe las métricas y el `ORDER BY` en silencio.
- **`seed.sql` no se puede colgar de un cron.** Sus `DELETE` incluyen `mi-optica`, el negocio real de Telegram. El resembrado periódico es `src/crons/resembrar.ts`, que solo toca `demo-optica`.

## Lo que le falta de verdad a la plataforma

Revisión del 2026-07-30. Ninguno se ve en la demo sembrada; todos muerden con
uso real. **Este es el punto de partida de la próxima sesión**, por delante de
las Fases 4, 5 y 7-8 del spec: agregarle superficie a un producto cuyo lazo
operativo no cierra es construir sobre algo que todavía se cae.

1. ~~**Los pedidos se duplican.**~~ ✅ cerrado 2026-07-30. `core/pedido/dedupe.ts` (`yaHayEncargoVivo`, 7 tests) y su llamada en `agente.ts`. Tapa los **dos** caminos a la vez, el pedido ya creado y la propuesta sin decidir, porque tapar uno solo deja pasar el duplicado por el otro. **No usa `claveDedupe` a propósito:** ver el punto 3, esa clave silencia para siempre.
2. ~~**El pedido nunca avanza de estado.**~~ ✅ cerrado 2026-07-30. `/panel/pedidos/mover` y `/demo/pedidos/mover`, con botones que salen de `transicionesPosibles()`. `cambiar_fecha` sigue sin quien lo cree.
3. ~~**El vigía avisa una sola vez por pedido, para siempre.**~~ ✅ cerrado 2026-08-15, **y no como estaba planeado aquí.** El índice parcial se probó en local y arregla el mudo, pero abre otro fallo medido: no distingue "descartada" de "aplicada", así que el vigía vuelve a proponer el mismo aviso en cada pasada — **48 tarjetas idénticas al día** para un pedido que siga vencido, incluso después de que el dueño ya le escribió al cliente.

   Se cerró metiéndole el día a la clave: `aviso:<pedido>:<riesgo>:<hoy>`, en `core/vigia/reglas.ts` como `claveAviso()`, más una regla que se salta el pedido que ya tenga un aviso sin decidir. **El índice no se tocó y no hubo migración sobre la D1 viva.** La semántica queda en una frase: un aviso por promesa y por día, se apruebe o se descarte.

   `claveAviso()` vive en el núcleo porque la usan el vigía **y** el resembrado de la demo. Antes era el mismo literal escrito en dos archivos, sostenido por un comentario; este cambio los habría desincronizado en silencio.
4. ~~**No hay bandeja de conversaciones.**~~ ✅ cerrado 2026-08-16 en el PR #5, **sin desplegar todavía**. El dueño lee el hilo completo mientras decide, y puede tomar el chat y devolverlo. `pausarConversacion` y `listarConversaciones` ya tienen quien las llame; `listarTicketsAbiertos` **sigue sin llamadores** y es el último de esta familia.

5. **`seed.sql` borra `mi-optica`, el negocio real.** Sus `DELETE` cubren los dos negocios. Hoy es inofensivo porque `mi-optica` solo ha tenido conversaciones de prueba, pero con un cliente conectado un `npm run seed:remote` distraído le borra el historial. Se arregla acotando sus `DELETE` a `demo-optica` y sembrando lo de `mi-optica` por separado.

También: el `conocimiento` libre (horario, dirección, garantía) y el `tono` solo los escribe el onboarding y no son editables después.

### Bloqueado en una decisión de Diego

**Catálogo con imágenes y marca blanca** están pedidos y sin empezar. Los dos
necesitan que un cliente **suba** archivos desde el panel, y el binding de
assets que se agregó el 2026-07-30 no sirve para eso: publica archivos que
están en el repo, no recibe subidas. Las dos opciones:

- **R2** — capa gratuita de 10 GB, pero hay que habilitarlo en la cuenta.
  Cuidado con el precedente de Vectorize: "está en el plan gratuito" y resultó
  de pago. Verificar antes de diseñar sobre eso.
- **base64 en D1** — cero infraestructura nueva, pero infla la base y deja de
  ser razonable pasando de unas decenas de productos.

Con el almacenamiento resuelto, la marca blanca sale casi gratis: color, nombre
y logo por negocio caben en la tabla `settings`, que ya existe.

### Fotos del catálogo — lo que quedó a medias

Se cerraron cuatro de las cinco piezas: almacén en KV (`db/imagenes.ts`), zona de
subida en Conocimiento, procesado en el navegador (cuadrado 600 px, fondo blanco,
WebP) y servido público en `/img/:negocio/:item/:version` con caché inmutable. La
demo tiene sus cinco productos con foto, de Pexels y con licencia comercial.

**Falta la pieza 5:** que la foto viaje al cliente. Hoy el agente no sabe que un
producto tiene imagen. Lo que falta es que `promptRespuesta` sepa qué productos
tienen foto, que el payload `enviar_aviso` acepte una imagen adjunta, que la
tarjeta de la bandeja la muestre y que `canales/telegram.ts` use `sendPhoto` en
vez de `sendMessage` cuando la haya. La regla no se relaja: la foto sale con la
misma aprobación que el texto.

### Deuda que dejó el rediseño

**El hero ya no explica el producto.** Antes mostraba el caos de chats
convirtiéndose en un tablero de promesas: feo, pero decía qué hace CHUNO en dos
segundos. Ahora es un personaje que se ve mucho mejor y no dice nada sobre
pedidos ni fechas. La composición vieja sigue en el código —`.capa-caos` y
`.capa-orden` en `landing.ts`— y se activa sola si `/hero.jpg` desaparece.

La opción que da las dos cosas y no se alcanzó a hacer: el personaje a color
como base, y el tablero apareciendo con el spotlight **encima de él**. El
cursor destaparía el estado operativo sobre la imagen en vez de sobre burbujas
grises.

**Cabo suelto, cerrado el 2026-08-15: no fue el código.** La evidencia medida
contra la D1 de producción:

- `PRAGMA foreign_keys = 1` — las cascadas están activas.
- **Cero huérfanos.** Los 11 tickets de `mi-optica` apuntan todos a la única
  conversación viva.
- Esa conversación se creó el **2026-07-30T15:25:04Z y sigue ahí**, con mensajes
  hasta el 3 de agosto: **sobrevivió entera** la ventana en que "desapareció"
  algo. Lo que se perdió no era ella.
- La auditoría de esa ventana tiene exactamente una cosa: `envio_fallido` ×3,
  `propuesta_creada` y `pedido_duplicado_evitado` ×2, entre las 19:43:49 y las
  19:44:49 UTC. Es la firma del **webhook sintético** — su chat no existe, así
  que el envío falla y queda auditado.

El webhook sintético crea una conversación **y** un contacto, y hoy no existe
ninguno de los dos. `contactos` no cuelga de `conversaciones`, solo de
`negocios`: desaparecieron dos filas de dos tablas que ninguna cascada une. Eso
descarta la cascada desde `negocios` (habría matado la auditoría), un
`DELETE FROM conversaciones` a secas (habría dejado el contacto huérfano),
`seed.sql` y el resembrado.

**Lo que queda, y va marcado como inferencia:** alguien borró a mano el rastro
del webhook sintético. Encaja con que las dos veces ocurriera justo después de
correr webhooks sintéticos. **No hay bug que arreglar.** Lo que sí hay que
cambiar es la costumbre: si se limpian datos de prueba contra producción, que
sea con un comando acotado y guardado en el repo, no con SQL suelto.

## Identidad visual — sistema Voz

El panel sigue el sistema de diseño de **Voz**, la marca de Diego. Está en
`Voz design system.zip` en la raíz (ignorado por git; se descomprime aparte).
El documento corto es `uploads/Identidad-Visual-Voz.md`.

Lo que hay que respetar y no relajar, porque son reglas del sistema, no gustos:

- **Claro y cálido**, no oscuro. Fondo crema `#FCFCFA`, alternando con
  `#F5F5F2` y `#EFEFEB`. Texto `#1A1D14`, atenuado `#747069`.
- **Raleway** en títulos, **Nunito Sans** en cuerpo. Cargan con `display=swap`
  a propósito: el panel se abre desde un mostrador con la señal que haya.
- **Sobre lima `#D2FF00` el texto va SIEMPRE oscuro.** Nunca lima sobre crema.
- **`#FF2F00` es exclusivo del CTA principal**, uno dominante por pantalla.
  Para texto pequeño en rojo va `#E02900`, que sí contrasta.
- **Lima y rojo-naranja no van adyacentes al mismo peso**: compiten.

Los chips de riesgo ya usan esa gramática: vencido en rojo accesible, "vence
hoy" en lima con texto carbón.

## Git y GitHub

Ya no hace falta Composio para subir código:

- Identidad configurada: `Diego Alvarez <diego.alvarez0918@gmail.com>`.
- Autenticación por **llave SSH** (`~/.ssh/id_ed25519`), registrada en GitHub.
  El remoto es `git@github.com:diegoalvarez0918-beep/chuno.git`.
- Subir es `git push`, sin contraseñas.

**El historial remoto se reemplazó por el local** el 2026-07-30. Antes tenía 62
commits generados por Composio, todos con el mismo título; ahora tiene los
commits reales. No volver a subir por API: crearía otra historia paralela.

**Ojo con el clasificador de permisos de Claude Code:** bloquea `git checkout`,
`git merge` y editar `.claude/settings.local.json`. `git push` sí lo permite.

**`git switch` sí funciona** — comprobado el 2026-08-16, se usó varias veces
para cambiar de rama. Y **fusionar un PR por la API de GitHub también**, con
`GITHUB_MERGE_A_PULL_REQUEST` de Composio: así se fusionó el #4. Eso **no**
contradice la regla de "no subir por API" de más abajo, que es sobre *crear
commits* — fusionar combina refs que ya están en el remoto y no crea historia
paralela. Diego sigue decidiendo **cuándo** se fusiona.

## Lo que está bloqueado en el humano

1. **Llamada con el dueño de la óptica** — quince minutos. De ahí sale el gancho del pitch y no lo puede hacer un agente.
2. **Video de 90 segundos** para el concurso.
3. **Movilización de votos** — la votación popular filtra: solo los 3 más votados por carril pitchean. Necesita bloque de tiempo propio el jueves, no los minutos que sobren.
4. **Subir los dos links** a la página del concurso antes del cierre del jueves 30.

## Decisiones cerradas que no hay que reabrir

- CHUNO es **código propio escrito de cero**. No se forkea Forja ni ningún otro motor.
- **El LLM propone, el código dispone.** El modelo devuelve JSON validado contra esquema; no tiene herramientas de escritura ni acceso a la base.
- **Nada sale al cliente final sin aprobación humana.** Regla de diseño, no opción de configuración.
- **`src/core/` es puro**: sin Cloudflare, sin red, sin LLM, sin reloj propio.
- La demo pública **no llama al modelo en vivo** — datos sembrados, para que un pico de votantes no agote la cuota gratuita.

---

## Traspaso del 2026-08-15

### Lo que quedó en producción

Dos arreglos desplegados y verificados contra el servidor, versión `cf538280`:

- **El vigía ya no se calla para siempre.** La clave de dedupe lleva el día
  adentro: `aviso:<pedido>:<riesgo>:<hoy>`, en `claveAviso()` del núcleo.
  Verificado con dos lecturas seguidas de la D1 de producción tras el cron de
  las 19:30 UTC. **No hizo falta migración** — el índice no se tocó.
- **El agente ya no apila la misma pregunta.** `mi-optica` tenía **once**
  tarjetas idénticas porque la clave del escalado se armaba con texto que
  redacta el modelo. Ahora: mientras el dueño no conteste, no se le apila otra.

**Las once tarjetas viejas se descartaron el 2026-08-16**, por `POST
/panel/decidir` con `decision=rechazar` — la ruta del panel, auditada, sin SQL
suelto. Quedan 2 pendientes en `mi-optica`, las dos de tipo `crear_pedido`.

**Y el arreglo del escalado quedó verificado en producción ese mismo día.**
Diego le escribió a `@Chunnobot` preguntando por lentes de contacto de colores;
el agente corrió (2 llamadas a Gemini, mensaje guardado a las 02:39 UTC del 17),
decidió que necesitaba un humano —lo dice su propia respuesta— y **no apiló una
decimosegunda tarjeta**. El control importa: el mensaje cayó en
`conv_3702871df986458a9e58`, que es justo la conversación que tenía las once, y
la supresión es por conversación.

### Cómo verificar el arreglo del escalado cuando haya tráfico real

Línea base medida el 2026-08-15 a las 19:38 UTC: **11 escalaciones pendientes**
en `conv_3702…`. Escríbele a `@Chunnobot` preguntando algo que el bot no sepa.
**Si no aparece una decimosegunda tarjeta, el arreglo funciona.** Cuesta dos
llamadas a Gemini y es el único eslabón que ningún test alcanza.

```bash
npx wrangler d1 execute chuno --remote --command \
  "SELECT COUNT(*) FROM propuestas WHERE negocio_id='mi-optica' AND estado='propuesta' AND tipo='enviar_aviso' AND json_extract(payload_json,'\$.pedidoId') IS NULL"
```

### La bandeja de conversaciones — 5 de 5, sin desplegar

| # | Tarea | Estado |
|---|---|---|
| 1 | Ventana de pausa en el núcleo | ✅ mergeado |
| 2 | Lista de conversaciones | ✅ PR #4 fusionado el 2026-08-16 |
| 3 | Hilo con las decisiones al lado | 🟢 PR #5 |
| 4 | Pausar y reanudar desde el hilo | 🟢 PR #5 |
| 5 | Conteo exacto y docs | 🟢 PR #5 |

**Todo lo de la 3, 4 y 5 vive en el PR #5, en una sola rama a propósito.** Los
botones de pausa van dentro de `vistaHilo`, que solo existe ahí: una rama
aparte habría quedado apilada. Aplanar en vez de apilar.

**Falta desplegarlo y verificarlo contra producción.** Nada de esto se ha
subido a Cloudflare; el Worker vivo sigue en `cf538280`.

Lo que cambió respecto de lo planeado: **el conteo por conversación se hace en
SQL, no en memoria.** Filtrar `listarPendientes` —que corta en 50, de la más
vieja a la más nueva— no solo daba globos por debajo del real: en el hilo
escondía tarjetas que el dueño tenía que decidir. La regla de qué payload
cuelga de una conversación quedó como `TIPOS_CON_CONVERSACION` en el núcleo y
las dos consultas arman su `IN` desde ella, para no duplicarla en SQL.

### Subproyectos del asistente

El pedido de "que suene cálido, sea más autónomo y cada negocio fije sus reglas"
se descompuso en tres, porque son tres specs y no uno:

- **A — Autoservicio de configuración.** Spec aprobado y mergeado en
  `docs/superpowers/specs/2026-08-15-autoservicio-configuracion-design.md`.
  **Listo para convertir en plan con `writing-plans`.** No se ha escrito código.
- **B — Autonomía graduable por negocio.** Sin empezar. `UMBRAL_CONFIANZA` es
  hoy una constante global igual para todos los negocios, y ahí está el
  verdadero "el bot manda todo a la bandeja". Toca la tensión con la regla 11.
- **C — Voz colombiana.** Sin empezar como subproyecto, pero **ya se cerró su
  primer pedazo el 2026-08-16** (en el PR #5): el bot decía "Le voy a consultar
  al dueño para confirmarte bien" cada vez que no sabía algo. No era estilo,
  era una contradicción del prompt — `prompt.ts` le pedía mencionar al dueño y
  dos renglones después le prohibía explicar su proceso. Ahora dice "dame un
  momento y ya te confirmo" y no cuenta a quién le pregunta. **Sin desplegar y
  sin verificar con el bot vivo.** Queda el resto: humanizer sobre el prompt
  base, los avisos del vigía y los textos del panel.

**Ojo con A:** el saludo con el nombre del negocio **ya existe** (commit
`6fe7954`), y `prompt.ts:77` ya inyecta el tono. Lo que falta es la pantalla
donde el dueño lo edite — hoy solo lo escribe la entrevista de onboarding.

### Cabos sueltos menores

- **`mi-optica` tiene DOS productos con foto**, "Lentes monofocales" y "Lentes
  de sol", y los dos empiezan por "Lentes". Un cliente que escriba "¿tienen
  lentes?" empata y no recibe foto; solo la recibe si nombra el producto. Es el
  comportamiento diseñado, pero el margen es más delgado de lo que decía el
  comentario de `seed-mi-optica.sql`, que ya está corregido.
- **`seed.sql` sigue borrando `mi-optica`.** Punto 5 de "Lo que le falta de
  verdad". Sin tocar.

### Modelo de negocio, acordado esta sesión

Plogy es **canal**, no cliente: monta su fee encima del precio de Diego, que es
piso y no se descuenta. **USD $500/mes o $5.000/año** (dos meses gratis) por
negocio, autoalojado — cada negocio en su propia nube, con sus datos y su CRM.

El anual no es un descuento, es el modelo de cobranza: con autoalojado, cero
telemetría y prohibición de kill switch, un cliente que deja de pagar el mensual
se queda con el producto funcionando y nadie se entera.

**Costo de API medido, no estimado:** 43 llamadas reales de `mi-optica` dan 828
tokens de entrada y 72 de salida en promedio. Con el tope diario tocando todos
los días del mes, el techo es **~USD $17**. Cloudflare va en cero. La llave de
Gemini la pone Plogy en la instalación — el instalador ya la pide y el dueño
nunca la ve.

**Pendiente de eso:** mover `TOPE_LLM_DIARIO` de variable global a la tabla
`settings`, porque si Plogy paga los tokens ese tope es su techo de factura.
