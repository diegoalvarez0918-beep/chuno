# Estado del proyecto

> Traspaso entre sesiones. Léelo después de `CLAUDE.md` y antes de tocar nada.
> Última actualización: 2026-07-29, madrugada.

---

## Lo que está vivo ahora mismo

| Qué | Dónde | Notas |
|---|---|---|
| Herramienta pública | https://chuno.vozdigital-ai.workers.dev | Entregable #2 del concurso |
| Demo sin registro | `/demo/inicio` | Negocio sembrado `demo-optica` |
| Panel del dueño | `/panel/inicio` | Basic Auth, usuario `admin` |
| Repositorio público | https://github.com/diegoalvarez0918-beep/chuno | Entregable #1 |
| Bot de Telegram | `@Chunnobot` | Escribe al negocio `mi-optica` |
| Base de datos D1 | `chuno` · `50f72126-740e-4813-8c9c-355ca32a8698` | 12 tablas |

**Dos negocios separados a propósito:** `demo-optica` es lo que ve el público; `mi-optica` recibe las conversaciones reales de Telegram. La demo nunca muestra chats reales.

## Credenciales

Nunca están en el repo. Viven en dos sitios:

- **Local:** `.dev.vars` en la raíz (ignorado por git). Cuatro llaves: Gemini, token de Telegram, secreto del webhook y contraseña del panel.
- **Producción:** secretos de Cloudflare, cargados con `wrangler secret put`.

Cloudflare está autenticado por OAuth en `~/.wrangler`. GitHub **no** tiene credenciales de git: el código se subió por la API de Composio (`GITHUB_COMMIT_MULTIPLE_FILES`), por eso el repo remoto muestra un solo commit aunque localmente hay diez.

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Núcleo, pedidos, vigía, bandeja, Telegram, panel, demo | ✅ cerrada |
| 1 | CRM autoalimentado y panel de métricas | ✅ cerrada |
| 2 | Conocimiento estructurado: catálogo y preguntas frecuentes | ⏭️ **siguiente** |
| 3 | Onboarding conversacional (`/comenzar`) | pendiente |
| 4 | Ingesta multicanal — familia Meta (WhatsApp, Instagram, Messenger) | pendiente |
| 5 | Marca blanca | pendiente |
| 6 | Entrega del concurso: video, links, votos | pendiente |
| 7-9 | Herramientas con escritura, RAG con embeddings, CLI instalador | después del concurso |

Spec completo: `docs/superpowers/specs/2026-07-29-chuno-plataforma-design.md`
Plan de la Fase 1 (modelo a seguir): `docs/superpowers/plans/2026-07-29-fase-1-crm-y-metricas.md`

**Fases 2 y 3 van juntas.** La entrevista del onboarding *produce* el catálogo y las preguntas frecuentes estructuradas: separarlas obligaría a construir dos veces la misma forma de datos.

## Cómo verificar que todo sigue en pie

```bash
npm test          # 60 tests deterministas, sin red ni LLM
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

## Gotchas que ya costaron tiempo

Están en `APRENDIZAJES.md` con más detalle. Los que muerden más rápido:

- **`pnpm` no existe en esta máquina** y corepack no está enlazado. Usa `npm`.
- **Nunca `| tail` sin `set -o pipefail`** — enmascara el código de salida y un fallo se lee como éxito.
- **Durable Objects:** la migración usa `new_sqlite_classes`, no `new_classes`. Con `new_classes` el despliegue falla en el plan gratuito.
- **Vectorize es de pago.** El RAG usa búsqueda por términos sobre D1 detrás de la misma interfaz.
- **Los modelos de Gemini se jubilan sin aviso** y el listado de la API los sigue mostrando. Por eso `MODELOS_LLM` es una var con lista de respaldo y el proveedor cae al siguiente ante 404 o 429.
- **La auditoría es la herramienta de diagnóstico.** Cuando algo falle, consulta `auditoria` antes de reproducir nada: guarda el motivo, no solo el hecho.

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
