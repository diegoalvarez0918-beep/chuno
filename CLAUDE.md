# CHUNO — el asistente que se acuerda de lo que le prometiste a tu cliente

> Constitución del proyecto. Claude Code la lee en cada sesión.
> Si algo aquí contradice una instrucción mía en el chat, **pregúntame antes de actuar**.
>
> Archivos hermanos: `APRENDIZAJES.md` (memoria entre sesiones) y
> `docs/00-contexto-reto-plug-nights.md` (el concurso y sus criterios).
> `AGENTS.md` y `GEMINI.md` son punteros de una línea a este archivo — **no los
> dupliques**, la duplicación se desincroniza sola.

---

## El problema

En los negocios por encargo, **el pedido nace en una conversación de WhatsApp y muere ahí.** El compromiso —"sus gafas llegan el jueves", "el arreglo se entrega el 14 a las 3"— vive en la cabeza del dueño o en una libreta. Cuando el cliente escribe "¿ya está listo?", toca buscar entre cientos de chats. Cuando un pedido se va a incumplir, nadie se entera hasta que el cliente reclama.

El WhatsApp es el sistema operativo de estos negocios, pero no es un sistema: no deja estado, no deja fecha y no avisa nada.

**Quién lo sufre:** el dueño-operador de una mipyme por encargo, de 1 a 15 empleados, que atiende personalmente el chat. El segmento se define por **patrón operativo, no por industria** — el pedido se origina en conversación, hay un proceso interno de varios días, y se prometió una fecha. Ópticas, floristerías, talleres, veterinarias, laboratorios dentales, imprentas.

## Qué es CHUNO

Un asistente que se instala **en la nube del propio negocio**, atiende sus canales de mensajería y —a diferencia de un chatbot— **produce estado operativo**: convierte conversaciones en pedidos con fecha comprometida, vigila las promesas en riesgo, y **nunca le escribe al cliente sin que el dueño apruebe**.

> Todo el mundo está construyendo bots que contestan. CHUNO es el que se acuerda de lo que prometiste.

**CHUNO es código propio, escrito de cero.** No es un fork de nadie y no arrastra atribuciones de terceros.

### Decisiones cerradas

```
CARRIL DEL CONCURSO:   optimización de procesos
DIFERENCIADOR #1:      estado operativo — pedidos con fecha comprometida,
                       vigía de promesas y bandeja de aprobación humana
VERTICAL DE ARRANQUE:  negocios por encargo. Ancla de demo: óptica
CANAL v0:              Telegram (WhatsApp Cloud API es el siguiente)
LLM POR DEFECTO:       Gemini, capa gratuita, tras interfaz intercambiable
```

---

## Cómo trabajamos juntos

Yo defino el qué y apruebo. Tú decides el cómo y ejecutas. La complejidad va empujada hacia código determinista —tests, typecheck, esquemas— porque un 90% de acierto por paso son 59% de éxito en cinco pasos. Tu trabajo es enrutar bien, no adivinar bien.

**Las herramientas deterministas del proyecto:**

```
npm test          40+ tests sobre src/core — puros, sin red ni LLM
npm run typecheck sin any nuevos, sin @ts-ignore
npx wrangler      despliegue, secretos, D1
```

`pnpm` **no** está disponible en esta máquina y no vale la pena instalarlo: usamos `npm`.

### Reglas de interacción

- Antes de escribir código en una tarea no trivial, muéstrame el plan y espera aprobación.
- Si una afirmación no la puedes respaldar con un archivo del repo, dilo. **No infieras y presentes la inferencia como hecho.**
- Prefiero un "esto no se puede" o "esto está mal planteado" a algo improvisado que parezca funcionar.
- **Nunca `git push` ni despliegues a producción sin que yo lo pida explícitamente.**
- Al cerrar una tarea: tests verdes, typecheck limpio, aprendizaje registrado si lo hubo, y commit.

### Ciclo de auto-corrección

1. Lee el error y el stack trace completo. No adivines la causa.
2. Corrige y vuelve a probar con el comando determinista que corresponda.
3. **Máximo 3 intentos por problema.** Al tercero fallido, para y escálame: qué probaste, qué error persiste, cuál es tu hipótesis.
4. **Si el intento consume créditos de pago**, consúltame **antes** del primer reintento.
5. Si el aprendizaje es reutilizable, regístralo en `APRENDIZAJES.md`.
6. **Nunca canalices la salida de un comando por `tail` sin `set -o pipefail`** — enmascara el código de salida y un fallo se ve como éxito.

---

## Arquitectura

La regla que gobierna todo: **el LLM propone, el código dispone.** El modelo no escribe en la base de datos ni ejecuta acciones — devuelve JSON que se valida contra un esquema. Toda mutación pasa por la máquina de estados.

```
Cliente (Telegram / WhatsApp)
   │ webhook
   ▼
Worker (Hono) ──► Durable Object "AgenteConversacion"   buffer + ciclo de herramientas
                        ├──► LLM          proveedor intercambiable (Gemini por defecto)
                        ├──► D1           negocios, conversaciones, pedidos, propuestas
                        └──► Propuestas   todo lo que sale al cliente pasa por aquí
Panel /admin  ── Basic Auth        tablero de pedidos + bandeja de decisiones
Demo /demo    ── público           datos sembrados, sin LLM en vivo
Cron */30     ── vigía de promesas
Cron 0 7      ── purga de mensajes
```

```
src/
  index.ts      Worker Hono: webhooks, panel, demo, scheduled()
  agente/       Durable Object, prompt, registro de herramientas
  core/         TypeScript PURO — sin Cloudflare, sin red, sin LLM
  llm/          interfaz de proveedor + gemini + anthropic
  canales/      Mensaje normalizado + telegram + whatsapp
  giros/        contrato de giro: generico, por-encargo
  db/           schema.sql + repos tipados, siempre filtrados por negocio
  admin/        panel server-rendered
  crons/        vigía, purga
test/core/      lo único que se prueba con vitest, y a propósito
```

**`src/core/` es sagrado.** No importa nada de Cloudflare, no hace red y no llama al LLM. Si algo ahí necesita `env`, `fetch` o la hora del sistema, está en la capa equivocada — la hora entra como parámetro. Ese aislamiento es lo que hace que el dominio se pruebe en milisegundos y lo que permite portarlo a otra plataforma sin reescribirlo.

**Estados del pedido:** `borrador → confirmado → en_proceso → listo → entregado`, más `cancelado` desde cualquier no-terminal. Las transiciones inválidas se rechazan en `core/pedido/estado.ts`, nunca en el prompt.

**La frontera de seguridad** está en `core/pedido/extraccion.ts`. Lo que el modelo puede proponer no incluye `id`, `estado` ni `negocioId`: no puede expresarlos aunque el atacante controle el texto de la conversación, porque los campos no existen en el contrato.

---

## Reglas duras — no negociables

Si una implementación rompe cualquiera de estas, **recházala y avísame**. No las relajes "temporalmente".

### Seguridad

1. **Aislamiento multi-tenant:** `negocio_id` en toda consulta, sin excepción. Ninguna función de repo acepta no recibirlo.
2. **Validación de esquema en cada borde**, incluida la salida del modelo antes de tocar la base de datos.
3. **El LLM no tiene acceso a datos ni a herramientas de escritura.** Devuelve JSON; el código decide.
4. **Secretos solo en secretos de Cloudflare y en `.dev.vars`** (ignorado por git). Nunca en el código, nunca en un Markdown, nunca en un commit. Si encuentras uno filtrado en el historial, para todo y avísame.
5. **El webhook valida su secreto** antes de procesar nada. Sin eso, cualquiera inyecta mensajes falsos.
6. **Cero PII en logs.** Ni teléfonos, ni contenido de mensajes, ni ids completos de usuario. Trunca a los últimos 4 caracteres si necesitas correlacionar.

### Privacidad

7. **Los datos del negocio viven en la infraestructura del negocio.** Nada de conversaciones ni de clientes finales se copia a un servidor nuestro.
8. **Cero telemetría.** No hay ping de activación, ni analíticas ocultas, ni reporte de uso.
9. **Si le preguntan al bot si es un bot, lo admite.** Negarlo es un anti-patrón, no una opción de configuración.
10. **Retención declarada:** los mensajes se purgan a los 90 días por cron, y el README lo dice en español claro junto con la referencia a Habeas Data (Ley 1581).

### Producto

11. **Nada sale al cliente final sin aprobación del dueño.** Es la promesa central; si un módulo necesita saltársela, el módulo está mal diseñado.
12. **Prohibido cualquier kill switch.** Un bot desplegado no se apaga, degrada ni limita de forma remota — nunca.

---

## Organización de archivos

```
src/ test/                        el código
docs/                             contexto del concurso y material del pitch
.tmp/                             intermedios — gitignored, siempre regenerable
.dev.vars                         secretos locales — gitignored
APRENDIZAJES.md                   memoria entre sesiones
```

**Principio:** nada en `.tmp/` es fuente de verdad. Cualquier salida debe ser reproducible corriendo el flujo de nuevo, nunca editada a mano. Si borrar `.tmp/` rompe algo, ese algo estaba mal puesto.

## Convenciones

- **Idioma:** español para el dominio (`pedido`, `propuesta`, `vigía`, `giro`); inglés para lo técnico heredado de la plataforma (`fetch`, `handler`, `binding`). Sigue lo que ya haya en el archivo.
- **Dinero:** siempre entero, en centavos. Nunca flotantes.
- **Fechas comprometidas:** `YYYY-MM-DD`, sin hora. La promesa al cliente es un día.
- **Comentarios:** explican *por qué*, no *qué*. Si el comentario repite el código, sobra.
- **Commits:** uno por unidad lógica, y el mensaje explica el porqué.

---

## Estado y puertas de verificación

**No avances sin pasar la puerta.** Si la puerta falla, arregla; no sigas.

| # | Hito | Puerta |
|---|---|---|
| 0 | Núcleo de dominio | ✅ `npm test` verde (40 tests), `npm run typecheck` limpio |
| 1 | Infraestructura | Worker desplegado respondiendo en una URL pública · D1 creada y con esquema |
| 2 | **Bot vivo** | Le escribes desde el teléfono por Telegram y contesta |
| 3 | Pedidos | El agente crea un pedido con fecha y aparece en el tablero |
| 4 | Bandeja y vigía | El vigía detecta una promesa en riesgo y el dueño aprueba el aviso |
| 5 | Demo pública | `/demo` abre sin registro y muestra valor en 30 segundos |
| 6 | Entrega | Los dos links cargados en la página del concurso |

**El hito 2 es el filtro.** Webhooks y secretos son donde se pierde el tiempo real. Si el bot no contesta, nada de lo demás importa.

**Estado actual: hito 0 cerrado.**
