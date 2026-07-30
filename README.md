# CHUNO

**El asistente que se acuerda de lo que le prometiste a tu cliente.**

🔗 **[Ver la demo — sin registro](https://chuno.vozdigital-ai.workers.dev/demo)** · [Página del proyecto](https://chuno.vozdigital-ai.workers.dev)

---

## El problema

En una óptica, una floristería o un taller, **el pedido nace en una conversación de WhatsApp y muere ahí.**

La fecha que le prometiste al cliente —"sus gafas llegan el jueves", "el arreglo se entrega el 14 a las 3"— vive en la cabeza del dueño o en una libreta. Cuando el cliente escribe *"¿ya está listo?"*, toca buscar entre cientos de chats. Y cuando un pedido se va a atrasar, el dueño se entera el día que el cliente reclama.

El WhatsApp es el sistema operativo de estos negocios, pero no es un sistema: **no deja estado, no deja fecha y no avisa nada.**

**Quién lo sufre:** el dueño-operador de una mipyme por encargo, de 1 a 15 empleados, que atiende personalmente el chat. El segmento se define por **patrón operativo, no por industria** — el pedido se origina en conversación, hay un proceso interno de varios días, y se prometió una fecha. Ópticas, floristerías, talleres, veterinarias, laboratorios dentales, imprentas.

## Qué hace CHUNO

Un chatbot **responde mensajes**. CHUNO produce **estado operativo**:

1. **Lee la conversación y arma el pedido** — cliente, qué encargó, cuánto, y para cuándo. Sin que nadie llene un formulario.
2. **Vigila las promesas** — cada 30 minutos revisa qué fechas se están cayendo.
3. **Pide permiso antes de hablar** — nada le llega al cliente sin que el dueño lo apruebe, y puede editar el mensaje antes de enviarlo.

> Todo el mundo está construyendo bots que contestan.
> CHUNO es el que se acuerda de lo que prometiste.

## Cómo está construido

La regla que gobierna todo el diseño: **el LLM propone, el código dispone.**

El modelo no escribe en la base de datos y no ejecuta acciones. Devuelve JSON que se valida contra un esquema, y toda mutación pasa por una máquina de estados determinista.

```
Cliente (Telegram / WhatsApp)
   │ webhook  ── se valida el secreto ANTES de leer nada
   ▼
Worker (Hono) ──► Durable Object por conversación   agrupa ráfagas + serializa
                        ├──► LLM       proveedor intercambiable (Gemini gratis)
                        ├──► D1        pedidos, propuestas, auditoría
                        └──► Bandeja   todo lo que sale al cliente pasa por aquí
Panel  /panel  ── contraseña      tablero de pedidos + decisiones
Demo   /demo   ── público         datos sembrados, sin LLM en vivo
Cron   */30    ── vigía de promesas
Cron   0 7     ── purga de mensajes a los 90 días
```

**El núcleo (`src/core/`) es TypeScript puro:** no importa nada de Cloudflare, no hace red y no llama al LLM. Por eso se prueba en milisegundos y por eso se puede portar a otra plataforma sin reescribirlo.

Los módulos son piezas reemplazables: cambiar de proveedor de IA, agregar un canal o agregar un giro (floristería, taller) **no toca el agente**.

## Seguridad y privacidad

Esto no es una sección de relleno: es la razón por la que un dueño le entregaría su operación a un asistente.

- **La IA no tiene acceso a la base de datos ni a herramientas de escritura.** El esquema de extracción no tiene campos para `id`, `estado` ni `negocio` — el modelo no puede expresarlos aunque alguien le inyecte instrucciones dentro del chat. La superficie de inyección de prompt para *acciones* es cero.
- **Aislamiento entre negocios en la firma, no en la disciplina:** ninguna función de acceso a datos consulta sin `negocio_id`.
- **Nada sale al cliente sin aprobación humana.** Es una regla del diseño, no una opción de configuración.
- **Los datos viven en la nube del propio negocio.** Las conversaciones no se copian a servidores de terceros.
- **Cero PII en los logs:** ni teléfonos, ni contenido de mensajes, ni identificadores completos.
- **Auditoría inmutable:** qué propuso el asistente, quién lo aprobó y cuándo.
- **El webhook valida su secreto** antes de procesar. La URL del Worker es pública; sin eso, cualquiera inyectaría mensajes falsos.
- **Retención de 90 días** por cron, conforme a la Ley 1581 de 2012 (Habeas Data).
- **Sin telemetría oculta y sin kill switch:** un asistente desplegado no se apaga ni se degrada de forma remota.

Cuando el modelo se equivoca, el modo de falla es **molestar a un humano**, no escribir basura: si la confianza es baja, si hay ambigüedades o si falta la fecha, la propuesta cae en la bandeja del dueño.

## Alcance de esta versión

**Funciona:** conversación → pedido con fecha · tablero con lo vencido primero · vigía de promesas · bandeja de decisiones con aprobar, editar y descartar · catálogo y preguntas frecuentes que el asistente cita sin escalar · onboarding conversacional de 7 preguntas · varios bots en una instalación, con su token cifrado · CRM que se llena solo · auditoría · instalador `npx chuno init` · demo pública.

**Todavía no:** WhatsApp Business API, herramientas de escritura hacia fuera (inventario, agenda, cobros), búsqueda semántica con embeddings, marca blanca por dominio propio.

La demo pública corre sobre datos sembrados y **no llama al modelo en vivo**, a propósito: así un pico de visitas no agota la cuota gratuita y la demo no se puede romper.

## Instalarlo en tu propia nube

Un comando. CHUNO no es un servicio al que te suscribes: es código que corre en
**tu** cuenta de Cloudflare, con tus datos.

```bash
npx github:diegoalvarez0918-beep/chuno init
```

La entrevista pide el nombre del negocio y tus tres llaves, y se encarga del
resto: crea la base de datos, aplica el esquema, guarda los secretos cifrados
del lado de Cloudflare, despliega el Worker y conecta el bot de Telegram.

Antes de correrlo necesitas tres cosas, todas gratuitas:

| Qué | Dónde | Para qué |
|---|---|---|
| Cuenta de Cloudflare | `npx wrangler login` | Donde vive tu asistente |
| Llave de Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | El cerebro |
| Bot de Telegram | [@BotFather](https://t.me/BotFather) → `/newbot` | El canal |

¿Quieres comprobar que tienes todo antes de instalar? `npx chuno revisar` no
crea ni despliega nada, solo revisa.

Al terminar, entra a tu panel y dale a **＋ Nuevo asistente**: siete preguntas
—qué vendes, tu horario, tu lista de precios, tu tono— y el asistente queda
configurado con tu catálogo, sin tocar código.

## Correrlo localmente

```bash
npm install
cp .env.example .dev.vars    # y llenar las llaves
npm test                     # núcleo de dominio: sin red, sin LLM
npm run typecheck
npx wrangler dev
```

Para desplegar hace falta una cuenta de Cloudflare (plan gratuito), una llave de Google AI Studio y un bot de Telegram:

```bash
npx wrangler d1 create chuno          # copiar el id a wrangler.jsonc
npm run db:remote                     # esquema
npm run seed:remote                   # datos de ejemplo
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put PANEL_PASSWORD
npx wrangler deploy
```

Los secretos nunca viven en el repositorio: `.dev.vars` está ignorado por git y en producción se guardan cifrados del lado de Cloudflare.

## Estructura

```
src/core/       dominio puro — máquina de estados, reglas del vigía, esquemas
src/agente/     Durable Object y prompts
src/llm/        interfaz de proveedor + Gemini
src/canales/    Telegram, demo (WhatsApp entra por la misma interfaz)
src/giros/      contrato de vertical
src/db/         esquema y acceso a datos
src/admin/      panel del dueño
src/onboarding/ materializa la entrevista en filas y conecta el bot
cli/            npx chuno init — el instalador
test/core/      lo único que se prueba con vitest, y a propósito
```

---

Construido para **Plug Nights 2026** · carril de optimización de procesos.
