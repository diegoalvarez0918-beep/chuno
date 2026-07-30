# Estado del proyecto

> Traspaso entre sesiones. Léelo después de `CLAUDE.md` y antes de tocar nada.
> Última actualización: 2026-07-30, tras cerrar Fases 2 y 3, el CLI y el rediseño.

---

## Lo que está vivo ahora mismo

| Qué | Dónde | Notas |
|---|---|---|
| Herramienta pública | https://chuno.vozdigital-ai.workers.dev | Entregable #2 del concurso |
| Landing | `/` | Sistema Voz, 3 secciones, hero con spotlight |
| Entrada al panel | `/entrar` | Formulario propio; deja cookie de sesión firmada |
| Demo sin registro | `/demo/inicio` | `demo-optica`, **solo lectura** y resembrada cada 30 min |
| Panel del dueño | `/panel/inicio` | Cookie de sesión **o** Basic Auth |
| Conocimiento del negocio | `/panel/conocimiento` | CRUD de catálogo y preguntas frecuentes |
| Entrevista de onboarding | `/panel/comenzar` | 7 preguntas → negocio nuevo configurado |
| Repetición de la entrevista | `/demo/comenzar` | Pública, determinista, sin LLM y sin escribir |
| Webhook multi-bot | `/webhook/telegram/:negocioId` | Un bot por negocio, con secreto propio |
| Instalador | `npx chuno init` · `cli/chuno.mjs` | Crea D1, despliega y conecta el bot |
| Repositorio público | https://github.com/diegoalvarez0918-beep/chuno | Entregable #1 |
| Bot de Telegram | `@Chunnobot` | Escribe al negocio `mi-optica` |
| Base de datos D1 | `chuno` · `50f72126-740e-4813-8c9c-355ca32a8698` | 16 tablas |

**Dos negocios separados a propósito:** `demo-optica` es lo que ve el público; `mi-optica` recibe las conversaciones reales de Telegram. La demo nunca muestra chats reales.

## Credenciales

Nunca están en el repo. Viven en dos sitios:

- **Local:** `.dev.vars` en la raíz (ignorado por git). Cinco llaves: Gemini, token de Telegram, secreto del webhook, contraseña del panel y `CLAVE_CIFRADO`.
- **Producción:** secretos de Cloudflare, cargados con `wrangler secret put`.

`CLAVE_CIFRADO` es la llave maestra AES-GCM (base64, 32 bytes) de la tabla `credenciales`: ahí viven, **cifrados**, el token de bot y el secreto de webhook de cada negocio creado por el onboarding. La base sola no alcanza para hablar por esos bots — hace falta también la llave. Si se rota, esas credenciales dejan de descifrar y `leerCredencial` las trata como ausentes (cae al bot global; el webhook por negocio responde 401).

Cloudflare está autenticado por OAuth en `~/.wrangler`. GitHub **no** tiene credenciales de git: el código se subió por la API de Composio (`GITHUB_COMMIT_MULTIPLE_FILES`), por eso el repo remoto muestra un solo commit aunque localmente hay diez.

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Núcleo, pedidos, vigía, bandeja, Telegram, panel, demo | ✅ cerrada |
| 1 | CRM autoalimentado y panel de métricas | ✅ cerrada |
| 2 | Conocimiento estructurado: catálogo y preguntas frecuentes | ✅ cerrada |
| 3 | Onboarding conversacional (`/comenzar`) | ✅ cerrada |
| 4 | Ingesta multicanal — familia Meta (WhatsApp, Instagram, Messenger) | pendiente · bloqueado por trámite de Meta |
| 5 | Marca blanca | pendiente |
| 6 | Entrega del concurso: video, links, votos | pendiente |
| 7-8 | Herramientas con escritura, RAG con embeddings | después del concurso |
| 9 | CLI instalador | ✅ adelantada — `npx chuno init` |

Spec completo: `docs/superpowers/specs/2026-07-29-chuno-plataforma-design.md`
Planes ejecutados: `docs/superpowers/plans/2026-07-29-fase-1-crm-y-metricas.md` y `docs/superpowers/plans/2026-07-29-fase-2-3-conocimiento-y-onboarding.md`

**Fases 2 y 3 fueron juntas.** La entrevista del onboarding *produce* el catálogo y las preguntas frecuentes estructuradas: separarlas habría obligado a construir dos veces la misma forma de datos.

El motor de la entrevista es una máquina de estados pura en `src/core/onboarding/`, sin LLM: el CLI de la Fase 9 lo reutiliza tal cual. El LLM solo entra como respaldo cuando los parsers deterministas no pueden leer el catálogo o las FAQ pegadas.

## Cómo verificar que todo sigue en pie

```bash
npm test          # 106 tests deterministas, sin red ni LLM
npm run typecheck # limpio, sin any ni @ts-ignore
curl -s -o /dev/null -w '%{http_code}\n' https://chuno.vozdigital-ai.workers.dev/demo/inicio
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

Revisión del 2026-07-30. Ninguno se ve en la demo sembrada; los cuatro muerden con uso real.

1. **Los pedidos se duplican.** El agente re-extrae el hilo completo en cada ráfaga y la propuesta `crear_pedido` se crea sin `claveDedupe` (`agente.ts`). Un cliente que escribe tres veces produce tres pedidos. `listarPedidosDeConversacion` ya existe y no la llama nadie.
2. **El pedido nunca avanza de estado.** `borrador → … → entregado` está implementado y probado, pero no hay ruta ni botón: los payloads `cambiar_estado` y `cambiar_fecha` se ejecutan en `aplicar.ts` y nadie los crea. El tablero es de solo lectura y nada llega nunca a "listo".
3. **El vigía avisa una sola vez por pedido, para siempre.** `idx_prop_dedupe` es único sobre `(negocio_id, clave_dedupe)` sin filtrar por estado: descartar un aviso lo silencia definitivamente.
4. **No hay bandeja de conversaciones.** El dueño aprueba mensajes hacia su cliente sin poder leer lo que el cliente escribió, y `pausarConversacion` —tomar el control del chat— es código que nadie llama. `listarConversaciones` y `listarTicketsAbiertos`, igual.

También: el `conocimiento` libre (horario, dirección, garantía) y el `tono` solo los escribe el onboarding y no son editables después.

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
