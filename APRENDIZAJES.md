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

- **2026-08-15 — Una clave de deduplicación sin tiempo adentro solo puede decir dos cosas, y las dos están mal:** la del vigía era `aviso:<pedido>:<riesgo>` sobre un índice único, así que descartar un aviso silenciaba ese pedido para siempre. El arreglo obvio —hacer el índice parcial sobre `estado='propuesta'`— se probó en local y arregla el mudo, pero el índice no distingue "descartada" de "aplicada": el cron volvía a proponer el mismo aviso en cada pasada, 48 veces al día, incluso después de que el dueño ya le había escrito al cliente. Se midió, no se supuso. Meterle el día a la clave (`:<hoy>`) da la tercera opción, que es la que un dueño espera: una vez al día. Y de paso no exigió tocar el índice ni migrar la D1 viva.
  **Por qué importa:** ante un "esto se repite / esto no se repite", la pregunta correcta no es dónde poner el índice sino **cada cuánto debería repetirse**, y esa respuesta casi siempre lleva tiempo adentro de la clave. Vale para reintentos, notificaciones, recordatorios y alertas. Y el corolario barato: un arreglo que evita una migración sobre datos vivos vale más que uno más elegante que la exige.

- **2026-08-15 — D1 corre el multi-statement como una transacción, así que un `CREATE INDEX` que falla revierte el `DROP` que iba antes:** al devolver el índice local a su forma de producción con `DROP INDEX …; CREATE UNIQUE INDEX …;` en un solo `--command`, el `CREATE` falló por filas duplicadas que había dejado un experimento anterior, y el `DROP` se deshizo con él. Resultado: el índice viejo seguía ahí y la prueba corrió con la muleta puesta. Se detectó solo porque el guion imprimía `SELECT sql FROM sqlite_master` como control.
  **Por qué importa:** dos reglas. Una, limpiar los datos **antes** de crear un índice único, nunca después. Dos —y es la que salva de un diagnóstico falso— cuando un guion deja el entorno en cierto estado para poder probar algo, ese estado se **imprime y se verifica**, no se asume porque el comando "no dio error": aquí el error estaba tragado por un `> /dev/null`.

- **2026-08-15 — Antes de creerle a un traspaso que dice "sin verificar", consulta la auditoría:** `docs/ESTADO.md` afirmaba que el envío de fotos por Telegram nunca se había probado en vivo y que hacía falta una prueba con teléfono. La tabla `auditoria` tenía `foto_enviada` ×3 y cero `foto_fallida`, la última tres días después de escribirse el documento. La funcionalidad se había verificado sola con uso real y nadie volvió a mirar. Iba a gastar una sesión probando algo que ya funcionaba —y con un control que además no servía, porque la foto de la demo es JPEG y las reales son WebP.
  **Por qué importa:** un traspaso es una foto de lo que alguien sabía ese día; la auditoría es lo que pasó después. Cuando el documento dice "pendiente de probar" y el sistema lleva días corriendo, la primera consulta es al registro, no al plan de pruebas. Es la misma disciplina de "verifica contra el servidor", aplicada al tiempo en vez de al caché.

- **2026-08-15 — Al fusionar PR apilados, la base del hijo hay que reapuntarla a `main` ANTES de mergearlo:** con tres PR encadenados (#1 base `main`, #2 base rama-de-#1, #3 base rama-de-#2), fusionar el #1 no reapunta solo a los otros. GitHub solo reapunta cuando la rama base se **borra**, y aquí no se borró. Mergear el #2 tal cual lo habría metido en una rama ya fusionada, **no en `main`**: el código desaparece de la rama principal y nadie se entera hasta que lo busca y no está. Se detectó consultando el estado de los tres PR entre fusión y fusión en vez de encadenarlas a ciegas.
  **Por qué importa:** dos reglas. Una, fusionar en orden y **verificar la base de cada PR justo antes** de mergearlo, no al planear. Dos, usar `merge` y nunca `squash` en una pila: aplastar los commits del padre rompe la ascendencia y los hijos salen con conflictos que no existían. Y la lección de fondo: apilar PR sobre PR crea trabajo de reconciliación que crece con la profundidad — mejor aplanar en cuanto haya dos niveles.

- **2026-08-15 — Un contador que sale de `.length` sobre una consulta con `LIMIT` miente, y miente justo cuando importa:** la ruta nueva de conversaciones ponía en el globo de la barra lateral `propuestas.length`, y esa lista viene de `listarPendientes`, que corta en 50. Un negocio con más de 50 decisiones pendientes habría visto "50" para siempre, y el conteo por conversación habría salido por debajo del real sin que nada lo dijera. No se ve leyendo la ruta: hay que ir a mirar el límite de la consulta que la alimenta.
  **Por qué importa:** un total se cuenta con `COUNT`, nunca con el largo de una página de resultados. Y vale para cualquier lista acotada que se le muestre a un usuario: si viene llena hasta el tope, la pantalla tiene que decirlo — una lista cortada en silencio se lee como "esto es todo lo que tengo". Es el mismo fallo ya registrado para las métricas de proporción: un indicador que engaña se deja de mirar, y entonces no sirve ni cuando el problema es real.

<!-- Nuevas entradas arriba de esta línea. -->

- **2026-07-31 — Un `wrangler deploy` que ya terminó todavía sirve la versión vieja:** pasó tres veces en una sola sesión y las tres estuve a punto de diagnosticar mal. El link del bot dio 0 apariciones cuando sí estaba; la ruta nueva de la agenda devolvió 404 en dos peticiones y 400 en otra, en el mismo segundo; y el recorte de texto guardó 9999 caracteres en el primer intento y 2000 un minuto después, sin tocar nada. El despliegue se propaga por la red de Cloudflare y las primeras peticiones caen en cualquiera de las dos versiones.
  **Por qué importa:** verificar contra el servidor no basta si se verifica de inmediato. Después de desplegar hay que esperar, o repetir hasta que dos lecturas seguidas coincidan, antes de creerle a la primera. Y ojo con el modo de falla peor: una tanda de comprobaciones puede salir mezclada, unas contra el código nuevo y otras contra el viejo, y eso se lee como un bug que no existe.

- **2026-07-31 — npm rechaza nombres "demasiado parecidos" a paquetes que ya existen, y lo hace al publicar, no antes:** `chuno` estaba libre (`npm view` daba 404) y aun así el `publish` devolvió `403 Package name too similar to existing package hono`. Ironía incluida: `hono` es la librería sobre la que corre este Worker. Que un nombre esté libre no significa que se pueda usar, y el filtro solo se ejerce en el momento de publicar. Quedó como `chuno-cli`, con el ejecutable llamándose `chuno` igual.
  **Por qué importa:** el nombre del paquete estaba impreso en la landing y en un video ya entregado, así que el rechazo llegó cuando ya era caro. Si un identificador público va a aparecer en material que no se puede cambiar, hay que reservarlo **antes** de imprimirlo: publicar una versión 0.0.1 vacía cuesta un minuto y elimina el riesgo entero.

- **2026-07-31 — `npx paquete@latest` sirve una versión vieja de su caché:** tras publicar 0.1.1 con un texto corregido, `npx --yes chuno-cli@latest revisar` seguía imprimiendo el texto de 0.1.0. No era el publish: era la caché de npx, que reusó el tarball bajado minutos antes. Se comprobó bajando el tarball publicado con `npm pack chuno-cli@0.1.1` y leyendo el archivo por dentro.
  **Por qué importa:** es la misma trampa de la caché del navegador, en otra herramienta. Para verificar qué contiene una versión publicada hay que **leer el artefacto del registro**, no observar el comportamiento de un ejecutor que cachea. Vale para npx, para pip y para cualquier cosa con caché local.

- **2026-07-30 — Una frase de la landing es una afirmación técnica y se verifica igual que un diagnóstico:** al enlazar el bot escribí en el hero "escríbele y tu pedido aparece en el tablero". Sonaba obvio y era falso: `@Chunnobot` entra por `NEGOCIO_TELEGRAM = "mi-optica"`, que vive detrás de la contraseña, mientras la demo pública muestra `demo-optica`. El visitante recibe respuesta real y no puede ver su pedido en ninguna parte. Se descubrió leyendo `wrangler.jsonc` y la ruta del webhook, no probándolo.
  **Por qué importa:** es la misma regla del detector sin control, aplicada a la copia. Todo lo que la página le promete a un desconocido es una afirmación sobre el código y hay que poder señalar el archivo que la sostiene **antes** de desplegarla. Una promesa falsa en la landing es peor que un bug: el bug se ve, la promesa la descubre el usuario cuando ya no confía.

- **2026-07-30 — Un flag cuyo nombre dejó de ser cierto es una mina para la próxima sesión:** `soloLectura` gobernaba la demo, y al abrir los tableros pasó a gobernar rutas que escriben. Mantener el nombre habría costado un diagnóstico equivocado dentro de un mes ("esta ruta no puede escribir, se llama soloLectura"). Se renombró a `esDemo` y el comentario separa las dos políticas que salen de él.
  **Por qué importa:** cuando una funcionalidad nueva cambia el significado de una bandera, el rename va en el mismo commit, no en la limpieza de después. Es más barato que el rastro falso que deja.

- **2026-07-30 — Un detector sin control es una moneda al aire:** para saber si el video subido a YouTube servía, busqué la palabra `UNPLAYABLE` en el HTML de la página. Dio positivo, y con eso le dije a Diego que estaba roto "confirmado por tres vías". Al pasar el mismo detector por un video suyo de 2020 que funciona perfectamente, también dio positivo: esa cadena está en la configuración del reproductor siempre. El detector bueno resultó ser `"lengthSeconds"`, que solo aparece si hay medio reproducible.
  **Por qué importa:** antes de creerle a una comprobación que uno mismo inventó, hay que correrla contra un caso que se sabe bueno y otro que se sabe malo. Sin eso no se está midiendo la propiedad, se está midiendo el ruido. Y el costo aquí fue peor que perder tiempo: fue afirmarle algo falso a Diego con tono de certeza.

- **2026-07-30 — Que la API diga "successful" no significa que el archivo llegó:** la primera subida del video devolvió `successful: true` con un id de YouTube válido y metadatos completos. El video estaba inservible: sin duración, sin título y listado como "Deleted video" en el canal. El registro se creó, los bytes no. Reintentar con `YOUTUBE_MULTIPART_UPLOAD_VIDEO` —la variante resumible, pensada para archivos grandes— sí funcionó con el mismo archivo de 107 MB.
  **Por qué importa:** para cualquier subida grande, el acuse de recibo no es evidencia; hay que consultar el artefacto después y comprobar una propiedad que solo existe si el contenido llegó de verdad. Y para archivos que pasen de unas decenas de MB, ir directo a la variante resumible en vez de descubrir el fallo a posteriori.

- **2026-07-30 — R2 exige tarjeta aunque sea gratis; Workers KV no:** Diego no quiso registrar un medio de pago. `wrangler r2 bucket list` responde `Please enable R2 through the Cloudflare Dashboard [code: 10042]`, y activarlo pide tarjeta incluso dentro del tramo gratuito. KV está incluido en el plan de Workers sin nada de eso: se comprobó creando el espacio, escribiendo una llave contra el servidor real, leyéndola y borrándola **antes** de construir la funcionalidad encima.
  **Por qué importa:** es el mismo patrón de Vectorize, que ya nos costó una vez. La regla que sale de las dos: antes de diseñar sobre un servicio de Cloudflare que se cree gratuito, ejercitarlo de punta a punta con la cuenta real. Y la consecuencia de diseño que quedó bien: la base guarda una llave, nunca los bytes, así que cambiar KV por R2 el día que haya tarjeta es reescribir un solo módulo (`db/imagenes.ts`).

- **2026-07-30 — Núcleo probado + cero llamadores = una función que el producto no tiene:** en una sola revisión aparecieron tres. `transicionar` (máquina de estados del pedido, 8 tests), `avanzarLead` (embudo del CRM, 7 tests) y `pausarConversacion`: todas escritas, todas verdes, ninguna alcanzable desde una ruta o un botón. El tablero de pedidos nunca llegaba a "listo" y el estado del lead era una etiqueta gris que no cambiaba jamás. `npm test` en verde decía que el dominio funcionaba, y era cierto — pero nadie lo estaba usando.
  **Por qué importa:** los tests del núcleo no prueban que la funcionalidad exista, solo que sería correcta si alguien la llamara. Al cerrar una fase, `grep` de cada export del núcleo contra `src/` excluyendo su propio archivo y `test/`: lo que solo aparece en tests es una promesa, no una función. Y es barato de cerrar, porque la parte difícil ya está escrita.

- **2026-07-30 — `mix-blend-mode` dentro de un elemento con `z-index` se mezcla contra nada:** la foto del hero llegó en JPEG sin canal alfa y su fondo blanco iba a ser un rectángulo sobre el crema. `multiply` lo resuelve —blanco por cualquier color da ese color— pero puesto en el `<img>` no hizo absolutamente nada. La capa contenedora tenía `z-index`, o sea que es su propio contexto de apilamiento, y un hijo que se mezcla ahí adentro lo hace contra el fondo transparente de su padre. Movido al contenedor, funcionó de una.
  **Por qué importa:** vale para todo el apilamiento CSS de este panel. Relacionado y del mismo día: un absoluto con `z-index: 0` pinta **encima** de sus hermanos estáticos, no debajo — la textura topográfica tapaba el texto de la sección hasta que los hijos se posicionaron. Cuando algo "no aplica" en CSS y la propiedad está bien escrita, el sospechoso es el contexto de apilamiento, no la propiedad.

- **2026-07-30 — El estado por defecto de un efecto no puede ser el apagado:** el hero copiaba el spotlight de la referencia con dos capas — la foto en gris abajo y a color arriba, revelada por el cursor. Se ve muy bien moviendo el mouse y es un desastre en reposo: el puntero arranca centrado, así que quien entra y no mueve nada ve un personaje gris. En una página que tiene treinta segundos con un votante, eso es la primera impresión.
  **Por qué importa:** todo efecto disparado por interacción hay que juzgarlo en su estado inicial, que es el que ve la mayoría. Si el reposo es peor que no tener el efecto, el efecto está al revés. Aplica igual al panel: hover, foco y arrastre son mejoras, nunca el mecanismo.

- **2026-07-30 — Con `main` y `assets` a la vez, quién responde primero no es tuyo:** el primer despliegue con archivos estáticos subió los dos assets ("Uploaded 2 of 2") y `curl /hero.jpg` devolvía **404 de Hono**, no de Cloudflare. El Worker atendía la ruta antes que la capa de assets. Se arregla haciéndolo explícito: el `notFound` del Worker consulta `env.ASSETS.fetch()` y solo responde 404 si eso también falla.
  **Por qué importa:** un orden de resolución que decide la plataforma puede cambiar entre versiones de wrangler y no lo cubre ningún test local. Cuando el fallback es una línea, se escribe. Y refuerza la regla que ya está: verificar el despliegue con `curl` contra el servidor, porque esto en local no se habría visto.

- **2026-07-30 — Un archivo de siembra que borra el negocio real es una mina, no una utilidad:** `seed.sql` hace `DELETE … WHERE negocio_id IN ('demo-optica','mi-optica')`. Hoy `mi-optica` solo tenía una conversación de prueba, pero es el negocio que recibe Telegram: el día que haya un cliente conectado, un `npm run seed:remote` distraído le borra el historial. Fue justo lo que impidió colgar `seed.sql` de un cron y obligó a escribir `crons/resembrar.ts` acotado a la demo.
  **Por qué importa:** los datos de demostración y los de producción no pueden compartir el mismo script de borrado, aunque compartan base. Si un comando destructivo puede correrse por error, la pregunta no es si alguien lo correrá, sino cuándo.

- **2026-07-30 — Para descartar que tu propio código borró algo, busca lo que SÍ sobrevivió:** al ver `mi-optica` en ceros, la duda era si el resembrado nuevo había ignorado su filtro. La prueba no fue leer el código otra vez: fue que `auditoria` y `uso_llm` de `mi-optica` seguían ahí, y ambas tablas están en la lista de borrado del resembrado. Si el filtro hubiera fallado, no estarían.
  **Por qué importa:** un borrado mal filtrado se delata por lo que falta *de más*. Antes de auditar la lógica, comparar qué sobrevivió contra qué habría muerto bajo la hipótesis del fallo — descarta o confirma en una consulta. Y cuando no se puede fechar el daño porque no se midió antes, se dice; no se rellena con la hipótesis más cómoda.

- **2026-07-30 — `datetime('now')` de SQLite y `toISOString()` no son el mismo formato, y en D1 las fechas se comparan como texto:** el seed escribía `2026-07-30 17:00:00` (con espacio) y la app escribe `2026-07-30T17:00:00.000Z`. El panel compara `creado_en >= '<fecha>T05:00:00.000Z'`, y como el espacio (0x20) ordena antes que la `T` (0x54), **ninguna fila sembrada superaba nunca el umbral de "hoy"**. La demo mostraba "0 mensajes hoy" y "0 clientes hoy" incluso recién sembrada; lo estábamos atribuyendo a que las fechas relativas habían envejecido.
  **Por qué importa:** en SQLite/D1 no hay tipo fecha, solo texto — dos formatos válidos en la misma columna producen comparaciones y `ORDER BY` silenciosamente incorrectos. Un solo formato en todo el proyecto, ISO-8601 con `T` y `Z`, y los tiempos de siembra se calculan en TypeScript en vez de delegarlos a SQL. Y ojo con el diagnóstico fácil: "los datos envejecieron" era una explicación plausible que encajaba con los síntomas y era falsa.

- **2026-07-30 — Anclar datos de demo a "hace N horas" los manda al día anterior de madrugada:** los mensajes sembrados como `-2 hours` caen en ayer si alguien abre la demo a la 1 a.m. en Bogotá, y las tarjetas de "hoy" vuelven a cero aunque el formato esté bien.
  **Por qué importa:** lo que tiene que verse como de hoy se ancla al día de hoy en la zona del negocio —las 9 a.m., o ahora si todavía no son—, no a un desplazamiento desde el instante de ejecución. Vale para cualquier dato de demostración que alimente una métrica diaria.

- **2026-07-30 — Un backtick dentro de un comentario rompe el template literal que lo contiene:** el `<script>` de la landing se arma como template literal, y escribir `` `margin-right` `` en un comentario del guion cerró la cadena. El error de `tsc` apuntaba a una coma esperada, no al backtick.
  **Por qué importa:** en código incrustado como cadena, los comentarios también son cadena. Nada de backticks ni `${` dentro de CSS o JS embebido, ni siquiera en comentarios.

- **2026-07-30 — Subir por API crea una historia paralela que después hay que reconciliar:** el repo de GitHub se había armado con `GITHUB_COMMIT_MULTIPLE_FILES` de Composio, y quedó con 62 commits titulados todos igual y **sin ancestro común** con el git local. Git los ve como dos proyectos distintos: el push normal se rechaza y solo `--force` los junta.
  **Por qué importa:** antes de forzar, comparar los árboles (`git ls-tree -r origin/main --name-only` contra el local) para confirmar que ningún archivo existe solo en el remoto. Y no volver a mezclar los dos caminos: o se sube por git, o se sube por API, pero no ambos.

- **2026-07-30 — El navegador miente al verificar un despliegue:** tras desplegar un rediseño completo, la captura mostraba la versión anterior. No era el despliegue: era caché. Estuve a punto de diagnosticar un problema que no existía.
  **Por qué importa:** verificar contra el servidor con `curl` y un `grep` de algo que solo exista en la versión nueva, ANTES de mirar el navegador. Si hay que mirarlo, con la URL cambiada (`?v=2`) o recarga dura.

- **2026-07-30 — Un instalador que reescribe su propia configuración no se puede probar donde vive:** `chuno init` modifica `wrangler.jsonc`, así que correrlo dentro de una instalación viva la repunta a una base vacía y el negocio deja de ver sus pedidos. Eso lo vuelve imposible de probar de punta a punta en el propio repo.
  **Por qué importa:** dos cosas lo arreglan y ambas valen para cualquier instalador — una guarda que detecte la instalación existente y exija confirmación escrita, y un subcomando de solo lectura (`revisar`) que ejercite las comprobaciones sin crear nada. Lo segundo además da algo demostrable en video sin riesgo.

- **2026-07-30 — Un tablero que termina en cifras no le dice a nadie qué hacer:** la pantalla de inicio mostraba seis números y media pantalla vacía. "5 esperando tu decisión" no es accionable; "Marta Ruiz · lentes progresivos · vencido hace 4 días · $680.000" sí.
  **Por qué importa:** cuando una métrica cuenta cosas que tienen nombre, la lista de esas cosas va justo debajo. El número es el titular, no el contenido.

- **2026-07-30 — Un `if (exito)` sin `else` es un fallo invisible:** el agente solo guardaba su respuesta cuando el envío a Telegram salía bien. Si `sendMessage` fallaba, no quedaba ni mensaje ni rastro: el cliente no recibía nada y el dueño no podía enterarse. Me costó dos diagnósticos creer que el agente no había corrido, cuando sí había corrido.
  **Por qué importa:** en todo camino donde algo sale hacia el cliente, la rama de fallo necesita su propia entrada de auditoría — no basta con no hacer nada. La regla del proyecto ("la auditoría guarda el motivo, no solo el hecho") aplica también a los motivos que nadie escribió todavía.

- **2026-07-30 — Gemini devuelve 503 por saturación, no solo 404 y 429:** `gemini-3.6-flash` empezó a responder `HTTP 503 "experiencing high demand"` y el proveedor no reintentaba con el siguiente modelo, porque su lista de errores reintentables solo tenía 404 y 429. Resultado: la extracción de pedidos moría entera aunque hubiera dos modelos de respaldo disponibles.
  **Por qué importa:** la lista de errores reintentables hay que revisarla contra lo que la API devuelve de verdad, no contra lo que uno supuso al escribirla. Un respaldo que no se activa es igual a no tener respaldo.

- **2026-07-30 — Un test escrito después de la implementación no ha demostrado nada:** los parsers del onboarding quedaron implementados antes que su test (se cortó una sesión a la mitad). El test pasó a la primera, que es justo lo que no prueba nada. Se rompió el parser a propósito (quitarle el `×100` al precio) y se comprobó que cuatro tests caían en rojo.
  **Por qué importa:** cuando el orden rojo-verde se pierde por la razón que sea, una mutación deliberada es el sustituto barato de la fase roja. Sin eso, un test que solo ha existido en verde puede estar comprobando nada.

- **2026-07-30 — El parser conservador escala; el permisivo inventa:** el parser de catálogo convertía cualquier renglón en un producto, así que "vendemos de todo un poco" se volvía un producto llamado así, que iba al catálogo del dueño y de ahí al prompt del agente. La regla que lo arregla es simple: un solo renglón sin precio ni días no es una lista, es una frase.
  **Por qué importa:** cuando hay un respaldo más capaz detrás (aquí el LLM), al parser determinista le conviene rendirse en vez de adivinar. Adivinar mal ensucia datos que después el agente le repite a un cliente.

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
