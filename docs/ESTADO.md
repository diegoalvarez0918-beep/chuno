# Estado del proyecto

> Traspaso entre sesiones. Léelo después de `CLAUDE.md` y antes de tocar nada.
> Última actualización: **2026-07-31**, cerrando la ventana de refinamiento.
> 152 tests verdes, typecheck limpio, todo desplegado y verificado.
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

**Lo que NO se pudo verificar en vivo y queda pendiente de una prueba real:**
el envío de fotos y el tope por conversación. El webhook sintético no sirve
para ninguno de los dos: su chat no existe, así que el envío falla y el bloque
de la foto ni se intenta, y llegar al tope exigiría 30 llamadas reales al
modelo. Hay que probarlos escribiéndole a `@Chunnobot` desde un teléfono.

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
3. **El vigía avisa una sola vez por pedido, para siempre.** `idx_prop_dedupe` es único sobre `(negocio_id, clave_dedupe)` sin filtrar por estado: descartar un aviso lo silencia definitivamente. **Se arregla haciendo el índice parcial** (`WHERE estado = 'propuesta'`), lo que exige migración sobre la D1 viva; por eso el arreglo de duplicados del punto 1 no pasa por ahí.
4. **No hay bandeja de conversaciones.** El dueño aprueba mensajes hacia su cliente sin poder leer lo que el cliente escribió, y `pausarConversacion` —tomar el control del chat— es código que nadie llama. `listarConversaciones` y `listarTicketsAbiertos`, igual.

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

**Cabo suelto sin resolver:** el 2026-07-30 `mi-optica` apareció sin conversaciones ni mensajes, conservando su auditoría y su `uso_llm` del webhook sintético de las 03:07 UTC. El resembrado queda descartado como causa —borra esas dos tablas también, y sobrevivieron—, pero no se pudo fechar la pérdida porque no se midió antes de desplegar. El único código que borra `conversaciones` es `seed.sql`, que se corre a mano.

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
Las fusiones de rama las corre Diego a mano.

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
