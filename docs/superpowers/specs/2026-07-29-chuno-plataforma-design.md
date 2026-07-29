# CHUNO — plataforma de agentes empresariales

> Spec de diseño. Fuente de verdad de qué se construye y en qué orden.
> Fecha: 2026-07-29 · Estado: aprobado por el dueño del producto

---

## 1. Qué es CHUNO

Dos cosas que se sostienen mutuamente:

**a) Un agente que te arma tu propio agente.** `chuno init` abre una entrevista: qué vendes, horarios, precios, preguntas frecuentes, tono. De ahí sale un agente configurado, conectado a tus canales y publicado **en tu propia nube, con tu marca**.

**b) El agente que queda.** No es un chatbot: es un sistema de cuatro subsistemas independientes.

```
1. INGESTA MULTICANAL        WhatsApp · Telegram · Instagram · Messenger
2. FUENTES INTERNAS          RAG sobre los documentos privados del negocio
3. EJECUCIÓN DE ACCIONES     escrituras reales en las herramientas que ya usa
4. ESCALAMIENTO A HUMANO     cola de aprobación: nada sale sin permiso
```

Más dos capas transversales:

```
5. CRM AUTOALIMENTADO        contactos, empresas e interacciones que se llenan solas
6. PANEL Y MARCA BLANCA      métricas, salud, gasto — con el logo y el dominio del cliente
```

**La diferencia con una plataforma cerrada:** en un SaaS solo puedes hacer lo que el panel te permite. Aquí el agente es código tuyo, en tu infraestructura, y le puedes agregar cualquier función: que consulte tu inventario en tiempo real, que cobre con tu pasarela, que revise tu agenda antes de dar una cita, que hable con el sistema que ya usas.

## 2. Modelo de negocio

El creador define su precio; Plug paquetiza y suma su margen. Las marcas revenden el agente **a su nombre, con su logo y su dominio**. Por eso la marca blanca no es cosmética: es requisito del modelo comercial.

## 3. Principios de arquitectura — no negociables

1. **El LLM propone, el código dispone.** El modelo devuelve JSON validado contra esquema; toda mutación pasa por código determinista. El modelo no tiene herramientas de escritura.
2. **`src/core/` es puro.** Sin Cloudflare, sin red, sin LLM, sin reloj propio. Es lo que se prueba de forma determinista y lo que hace la plataforma portable.
3. **Aislamiento multi-tenant en la firma.** Ninguna función de datos consulta sin `negocio_id`.
4. **Nada sale al cliente final sin aprobación humana.** Regla de diseño, no opción de configuración.
5. **Cada subsistema entra por una interfaz.** Agregar un canal, una fuente o una integración no toca el agente.
6. **Los datos viven en la nube del negocio.** Cero telemetría, cero copia a servidores nuestros.
7. **Sin kill switch.** Un agente desplegado no se apaga ni degrada de forma remota.

## 4. Los subsistemas en detalle

### 4.1 Ingesta multicanal

Interfaz `Canal`: `interpretar(cuerpo) → MensajeEntrante | null` y `enviar(chatId, texto)`.

| Canal | Vía | Estado |
|---|---|---|
| Telegram | Bot API | ✅ funcionando |
| WhatsApp | Meta Cloud API | pendiente |
| Instagram | Meta Graph API | pendiente |
| Messenger | Meta Graph API | pendiente |

Los tres de Meta comparten firma de webhook (`X-Hub-Signature-256`) y estructura de entrega, así que se implementan como una familia con un verificador común.

### 4.2 Fuentes internas (RAG)

Hoy: búsqueda por términos sobre D1 — suficiente para una decena de párrafos.

Meta: fragmentación + embeddings con Workers AI (capa gratuita) y similitud por coseno calculada en el Worker, con los vectores en D1. Vectorize exige plan pago y no es requisito.

Interfaz `FuenteConocimiento`: `buscar(negocioId, consulta, limite) → Fragmento[]`. Cambiar la implementación no toca el agente.

### 4.3 Ejecución de acciones

Interfaz `Herramienta`:

```
nombre · descripcion · esquemaEntrada (Zod)
esLectura: boolean          las de escritura SIEMPRE pasan por aprobación
ejecutar(negocioId, entrada) → Resultado
```

**Regla dura:** una herramienta de escritura nunca la invoca el modelo. El modelo puede *proponer* invocarla; la propuesta va a la bandeja y la ejecuta el código tras la aprobación.

Orden de implementación: inventario (Google Sheets) → agenda (Google Calendar / Cal.com) → cobros (Wompi/Bold). Cada una necesita OAuth por negocio y sus tokens cifrados.

### 4.4 Escalamiento a humano

✅ Funcionando. Propuestas con estados `propuesta → aplicada | descartada`, resolución idempotente, edición del contenido antes de aprobar, deduplicación, y auditoría inmutable.

### 4.5 CRM autoalimentado

Se llena desde las conversaciones, sin que nadie capture nada.

- `contactos` — nombre, canal, identificador, primera y última interacción, etiquetas
- `interacciones` — resumen y sentimiento por conversación
- `leads` — intención detectada, estado del embudo, valor estimado

Vista de contacto: sus pedidos, sus conversaciones, su historial. El agente escribe hechos del cliente al vuelo (`customer_facts`) y el panel los muestra.

### 4.6 Panel y marca blanca

Métricas: mensajes de hoy · clientes únicos · leads captados · decisiones pendientes · salud del agente (fallos recientes, latencia) · **gasto estimado** (llamadas al modelo × tarifa, contabilizadas por llamada).

Marca blanca por negocio: nombre, logo, color de acento y dominio propio.

### 4.7 El onboarding — `chuno init`

Un agente entrevista al dueño en 6–8 preguntas y genera configuración, conocimiento, catálogo, preguntas frecuentes y tono. Dos superficies sobre el **mismo motor**:

- **Web** (`/comenzar`) — para la demo pública y para dueños no técnicos.
- **CLI** (`npx chuno init`) — para instalar en la nube del cliente.

El motor es una máquina de estados de entrevista en `core/`, determinista y testeable sin LLM. El LLM solo redacta preguntas y estructura respuestas.

## 5. Fases y puertas de verificación

Cada fase cierra con `npm test` verde, `npm run typecheck` limpio y verificación en producción. **No se avanza sin pasar la puerta.**

| # | Fase | Puerta |
|---|---|---|
| 0 | Núcleo, pedidos, vigía, bandeja, Telegram, panel, demo | ✅ cerrada — 43 tests |
| 1 | CRM autoalimentado + panel de métricas | Un mensaje nuevo crea contacto e interacción; el panel muestra las seis métricas |
| 2 | Conocimiento estructurado: catálogo y preguntas frecuentes | El agente responde precios del catálogo sin escalar; una pregunta fuera del catálogo escala |
| 3 | Onboarding conversacional en web | Un negocio nuevo queda configurado y respondiendo sin tocar código |
| 4 | Ingesta multicanal — familia Meta | Un mensaje de WhatsApp entra y se responde por el mismo camino que Telegram |
| 5 | Marca blanca | Dos negocios en la misma instancia se ven distintos |
| 6 | Entrega del concurso | Repo público, README, video, dos links cargados |
| 7 | Herramientas con escritura (inventario, agenda, cobros) | Una escritura real ejecutada tras aprobación humana |
| 8 | RAG con embeddings | Responde bien una pregunta que la búsqueda por términos falla |
| 9 | CLI `npx chuno init` | Instalación completa en una cuenta limpia |

**Fases 1–6 son el alcance del concurso** (jueves 30 de julio). **Fases 7–9 continúan después** y se presentan como visión — son el subsistema 3 completo, el RAG profundo y el instalador, y ninguno cabe en 30 horas sin romper las demás.

## 6. Fuera de alcance, explícitamente

Facturación electrónica DIAN · app móvil · roles y permisos por usuario · analítica avanzada · marketplace de herramientas.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| El alcance del concurso se desborda | Las fases 1–6 son el corte. Lo demás se cuenta, no se construye. |
| Trámites de Meta bloquean WhatsApp | Telegram ya funciona y es el plan A; la familia Meta es mejora. |
| Cuota gratuita de Gemini durante la votación | La demo pública no llama al modelo; lista de modelos con respaldo automático. |
| Regresión al agregar subsistemas | Puerta por fase: tests verdes y verificación en producción antes de seguir. |
