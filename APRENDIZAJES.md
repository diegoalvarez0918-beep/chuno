# Aprendizajes del proyecto

Memoria persistente entre sesiones. `CLAUDE.md` apunta aquí; este archivo se lee cuando haga falta, no en cada arranque — por eso puede crecer sin inflar el contexto de todas las sesiones.

## Cuándo escribir aquí

**Solo si el aprendizaje es reutilizable y no trivial.** Si en la sesión no pasó nada de eso, no escribas nada. Una entrada de relleno vale menos que cero: mete ruido y hace que las buenas se pierdan.

Sí va aquí: restricciones o rate limits medidos, no supuestos · un supuesto que resultó falso · una decisión de diseño que tomamos juntos y su razón · un gotcha del entorno (Cloudflare, wrangler, D1, npm, el runtime de Workers) · un error que ya se repitió dos veces.

No va aquí: detalles de una sola tarea · algo ya documentado en `CLAUDE.md` · cualquier cosa derivable leyendo el código.

## Formato

```
- **YYYY-MM-DD — Tema corto:** qué se aprendió, en 1–3 líneas.
  **Por qué importa:** la consecuencia práctica o cómo aplicarlo la próxima vez.
```

## Higiene

Más recientes arriba. Si una entrada queda obsoleta o la contradice otra más nueva, **edítala o bórrala** — no acumules versiones. Si pasas de ~25 entradas, consolida las viejas o promuévelas a `CLAUDE.md` si son reglas.

---

## Registro

<!-- Nuevas entradas arriba de esta línea. -->

- **2026-07-29 — Verificar contra producción con un webhook sintético:** para probar el camino completo (Durable Object → LLM → CRM → consumo) sin escribirle a una persona real, se hace POST a `/webhook/telegram` con el secreto correcto y un `chat.id` inexistente. El agente procesa todo y solo falla el envío final, que queda auditado.
  **Por qué importa:** da verificación real de extremo a extremo sin depender de que alguien tenga el teléfono a mano, y sin mandarle mensajes de prueba a un cliente. Es el patrón para probar cualquier canal nuevo.

- **2026-07-29 — Los indicadores necesitan muestra mínima:** la salud del agente exige tres llamadas antes de emitir juicio. Sin eso, el primer fallo del día da 100% de fallos sobre un intento y pinta el panel de rojo.
  **Por qué importa:** aplica a cualquier métrica de proporción que se le muestre a un usuario. Un indicador que se dispara con ruido se deja de mirar a la semana, y entonces no sirve ni cuando el problema es real.

- **2026-07-29 — El listado de modelos de Gemini miente, y por eso hay lista de respaldo:** `gemini-2.5-flash` aparecía en `GET /v1beta/models` pero devolvía **404 "no longer available to new users"**. De los candidatos probados con una llave gratuita nueva: `gemini-3.6-flash`, `gemini-3.1-flash-lite` y `gemini-flash-lite-latest` funcionan y devuelven JSON limpio; `gemini-3.5-flash` envuelve el JSON en markdown; `gemini-flash-latest` se queda sin tokens antes de emitirlo (consume presupuesto razonando); `gemini-2.0-flash` da 429 de una.
  **Por qué importa:** nunca fijar un modelo único en el código. `MODELOS_LLM` es una var con lista en orden de preferencia y el proveedor cae al siguiente ante 404 o 429 — cambiar de modelo no exige desplegar. Y `maxOutputTokens` para JSON va holgado (3000) porque los modelos con razonamiento gastan parte del presupuesto antes de escribir.

- **2026-07-29 — La auditoría pagó su costo el primer día:** el bot respondía solo con su mensaje de respaldo. Una consulta a `auditoria` devolvió el motivo exacto (`HTTP 404` con el texto de Google) sin necesidad de reproducir el fallo ni leer logs.
  **Por qué importa:** registrar el *motivo* del fallo, y no solo que hubo fallo, es lo que convierte la auditoría en herramienta de diagnóstico. Mantener esa disciplina en todo camino de error nuevo.

- **2026-07-29 — El subdominio de workers.dev es un paso manual y el TLS tarda:** `wrangler deploy` falla con `code: 10063` hasta que el dueño de la cuenta entra al dashboard y crea el subdominio. Después, el certificado tarda ~40 segundos en emitirse y `curl` falla con error de handshake SSL mientras tanto.
  **Por qué importa:** no es un bug del código. En un despliegue nuevo, contar con ese paso manual y con la espera antes de dar el despliegue por roto.

- **2026-07-28 — `| tail` enmascara los fallos:** `npm install 2>&1 | tail -20` devolvió éxito mientras npm fallaba por conflicto de peer dependency; el código de salida era el de `tail`. Se perdieron varios minutos creyendo que había instalado.
  **Por qué importa:** en este repo, todo comando cuyo resultado importe va con `set -o pipefail` antes del pipe, o sin pipe. Ya está escrito como regla en `CLAUDE.md`.

- **2026-07-28 — Durable Objects sí están en el plan gratuito; Vectorize no:** los Durable Objects con backend SQLite corren en Workers Free (100K solicitudes/día, sin cobro de almacenamiento). Vectorize exige plan pago. En `wrangler.jsonc` la migración **tiene que declarar `new_sqlite_classes`**, no `new_classes`, o el despliegue falla en el plan gratuito.
  **Por qué importa:** CHUNO v0 corre sin tarjeta. El RAG usa búsqueda por palabras clave sobre D1 detrás de la misma interfaz, y se cambia a Vectorize el día que haya plan pago sin tocar el agente.

- **2026-07-28 — Los "437 tests" de Forja no existen:** se verificó el repo público `santmun/forja`. El README no declara ningún número de tests, no hay badge ni umbral de cobertura; hay 60 *archivos* `.test.ts`. El repo tenía 11 días de vida, 9 commits y un solo autor.
  **Por qué importa:** el plan original de CHUNO usaba "437/437 tests verdes" como puerta de verificación de una fase entera. Era inverificable. De ahí la regla de no presentar inferencias como hechos.

- **2026-07-28 — Forja no tiene estado operativo, y por eso CHUNO existe:** en sus 17 tablas no hay pedidos, ni fecha comprometida, ni promesa en riesgo, ni cola de aprobación de acciones hacia el cliente. Tiene *handoff* (ceder la conversación a un humano), que es otra cosa: no pide permiso, se hace a un lado.
  **Por qué importa:** confirmó que el diferenciador de CHUNO es código nuevo por definición, forkeando o no. Forkear no ahorraba ni una hora del trabajo que importa, y por eso se construyó de cero.

- **2026-07-28 — La demo pública no puede llamar al LLM:** la cuota gratuita de Gemini se quemaría justo durante la votación abierta, que es cuando más tráfico habrá.
  **Por qué importa:** `/demo` corre sobre datos sembrados con respuestas cacheadas y no toca el proveedor de LLM. El modelo en vivo se usa en Telegram y en el panel del dueño, que son de bajo volumen.
