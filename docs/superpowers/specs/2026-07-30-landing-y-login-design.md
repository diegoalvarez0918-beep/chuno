# Landing pública con login, y blindaje de la demo

> Diseño validado el 2026-07-30. Cierra el mismo día: el concurso vence hoy.
> Alcance deliberadamente corto — lo que no está aquí, no entra.

## Por qué

La landing actual ([`src/publico/landing.ts`](../../../src/publico/landing.ts)) es la
única pantalla que quedó en el sistema de diseño viejo: fondo `#0d0f14`, acento
azul `#4f8cff`, `ui-sans-serif`. Es lo contrario de cada regla dura de Voz y es
lo primero que ve un jurado. Detrás de ella hay un panel crema, cálido y con
Raleway: el salto visual ocurre justo en el clic que más importa.

Además arrastra dos defectos de entrega: el botón "Ver el código" apunta a
`https://github.com/` —la portada, no el repo— y no hay forma de entrar al panel
que no sea el diálogo del navegador de Basic Auth, que no se puede maquetar.

Y la demo pública, que es el entregable #2, hoy se puede degradar desde internet.

## Qué se construye

Cuatro cosas, en este orden.

### 1 · Landing nueva — 3 secciones

Referencia visual: un hero de estudio creativo con splash de entrada, palabra
gigante detrás, revelado por spotlight y botón pill. Se adopta **la estructura y
el movimiento**, no la paleta: los colores, la tipografía y las reglas son las de
Voz, sin excepción.

**Fuente única de tokens.** Hoy el `:root` de Voz vive dentro de una constante
`CSS` en [`src/admin/html.ts`](../../../src/admin/html.ts). Se extrae a un export
`TOKENS_VOZ` (más `FUENTES_VOZ` con el `<link>` de Google Fonts) que consumen el
panel y la landing. La duplicación de tokens es exactamente lo que produjo el
choque actual; se arregla de raíz, no con un parche.

**Mapeo de la referencia a Voz:**

| Referencia | CHUNO |
|---|---|
| Fondo `#E4E4E4` | `--fondo-2` `#F5F5F2` |
| Cajas del splash `#75C5DE` | lima `--lima` `#D2FF00` |
| Círculo del pill `#75C5DE` | `--accion` `#FF2F00`, único rojo dominante |
| Texto crema `#F4F1E8` | `--texto` `#1A1D14` sobre claro |
| Palabra gigante en crema | `--fondo-3` `#EFEFEB`, decorativa, `aria-hidden` |
| Inter | Raleway (display) + Nunito Sans (cuerpo) |
| Panel de menú `rgba(17,17,17,.95)` | `rgba(26,29,20,.96)` — el carbón de Voz |

**Header fijo.** Logo arriba a la izquierda con `mix-blend-mode: difference`, y
botón hamburguesa a la derecha que abre el panel de menú. El panel lleva los
enlaces de sección, la demo, y abajo el pill **"Entrar al panel" → `/entrar`**.

**Splash.** Diez cajas lima que se abren en vertical. Total ~0.8 s, no 1.35 s.
`pointer-events: none` y `prefers-reduced-motion` lo salta por completo.

**Sección 1 · Hero.** Ocupa el viewport. De atrás hacia adelante:

1. La palabra **`PROMESAS`** en Raleway 800, `clamp(120px, 22vw, 420px)`,
   color `--fondo-3`, subiendo desde abajo. Decorativa y `aria-hidden`.
2. **Capa del caos:** una pared de burbujas de chat encimadas, rotadas apenas,
   en gris apagado — *"¿ya está listo?"*, *"¿para cuándo era?"*, *"le confirmo y
   le aviso"*, *"¿me quedó para el jueves?"*. Es el problema, dibujado.
3. **Capa del orden:** el tablero de CHUNO — filas con nombre, qué encargó,
   fecha comprometida y chip de riesgo, en tarjetas blancas a todo color.
4. El spotlight enmascara la capa 3, de modo que **el cursor destapa el orden
   que hay debajo del desorden**. El pitch entero sin copy.

Ambas capas son HTML propio. Sin imágenes externas, sin licencias, nítido en
retina y grabable para el video de 90 segundos.

Encima: el titular —*"Tu WhatsApp ya es tu sistema operativo. El problema es que
no es un sistema."*— revelado palabra por palabra, y el pill
**"Ver la demo — sin registro"**.

**Sección 2 · Cómo funciona.** Cuatro pasos numerados `01 —`: el cliente
escribe → CHUNO arma el pedido con su fecha comprometida → el vigía levanta la
mano antes de que la promesa se caiga → tú apruebas, y nada sale sin ti.

**Sección 3 · Por qué puedes confiarle tu operación.** La lista de garantías que
ya está escrita y no se toca, porque es criterio de evaluación: corre en tu nube,
la IA no toca la base, nada sale sin tu visto bueno, queda registro de todo,
borrado a 90 días conforme a la Ley 1581, y admite que es un bot.

**Link al repo:** `https://github.com/diegoalvarez0918-beep/chuno`, tomado de
`git remote`, no escrito de memoria.

#### El spotlight no usa `toDataURL`

El código de referencia llama `canvas.toDataURL()` dentro del `requestAnimation­Frame`:
codifica un PNG completo y lo pasa a base64 en cada cuadro. En un teléfono de
gama media eso cae a un dígito de fps.

Aquí el mismo efecto es una `mask-image: radial-gradient(...)` con dos variables
CSS `--mx` y `--my` que `mousemove` actualiza, suavizadas por interpolación
dentro de un solo `requestAnimationFrame`. Nada se codifica.

**Sin hover no hay spotlight.** Bajo `@media (hover: none)` y bajo
`prefers-reduced-motion` la máscara se retira y la capa del orden se muestra
completa. Un teléfono no puede pasar el cursor: sin esta regla, la mitad de los
votantes vería solo el caos y ninguna solución.

### 2 · Login

**Núcleo nuevo y puro:** `src/core/sesion.ts`, siguiendo el precedente de
[`core/cifrado.ts`](../../../src/core/cifrado.ts) — WebCrypto es estándar en
Workers, Node y vitest; no toca red; el reloj entra como parámetro.

```
firmarSesion(claveBase64, password, expEpoch)      → "v1:<exp>:<sig>"
verificarSesion(token, claveBase64, password, ahoraEpoch) → boolean
```

`sig` es `HMAC-SHA256(CLAVE_CIFRADO, "v1:<exp>:<huella>")`, donde `huella` son
los primeros 16 hex de `SHA-256(PANEL_PASSWORD)`. Consecuencia buscada:
**cambiar la contraseña invalida todas las sesiones abiertas.** La comparación de
firmas es de tiempo constante. Sin tabla nueva, sin usuarios, sin dependencias.

**Rutas:**

- `GET /entrar` — formulario Voz de un solo campo. Con cookie válida, redirige al panel.
- `POST /entrar` — compara contra `PANEL_PASSWORD`; deja la cookie y redirige.
  Error genérico: no revela nada sobre la contraseña.
- `POST /salir` — borra la cookie. Enlace visible en el panel.

**Cookie:** `chuno_sesion`, `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7d`.

**Middleware de `/panel/*`** — acepta, en este orden:

1. Cookie de sesión válida.
2. Cabecera `Authorization` presente → Basic Auth, como hasta hoy. Esto es lo que
   mantiene funcionando el CLI y los `curl -u admin:$PASS` de `docs/ESTADO.md`
   sin tocarlos.
3. Ninguna de las dos → redirige a `/entrar?destino=<ruta>`.

`destino` se valida contra el prefijo `/panel/` antes de usarse. Un parámetro de
redirección sin validar es un redirect abierto, y aquí sale de la URL.

**Sobre CSRF:** al autenticar por cookie, un POST desde una página ajena pasaría a
ser posible. `SameSite=Lax` lo bloquea, y es la razón por la que el atributo no es
opcional en este diseño.

### 3 · `/demo` deja de aceptar escrituras destructivas

`basicAuth` cubre `/panel/*`, pero `montarPanel` registra los mismos POST bajo
`/demo`. Hoy están abiertos a internet `POST /demo/decidir`,
`/demo/conocimiento/catalogo/borrar`, `/demo/conocimiento/faq/borrar` y sus
`guardar`. Durante la votación abierta, cualquiera puede borrar el catálogo y las
preguntas frecuentes de la demo.

`montarPanel` pasa a recibir un objeto de opciones con `soloLectura`. Con la
bandera puesta:

- Las cuatro rutas de escritura de conocimiento **no se registran**. No existen;
  no hay 403 que sortear.
- `vistaConocimiento` recibe `soloLectura` y renderiza sin formularios ni botones.
  Si no, la demo mostraría controles que devuelven 404.
- **`POST /demo/decidir` se conserva.** Aprobar es la experiencia de la demo y el
  canal `demo` no envía nada a nadie ([`canales/demo.ts`](../../../src/canales/demo.ts)).
  Lo que lo hace sostenible es el punto siguiente.

### 4 · Resembrado de la demo

`seed.sql` afirma que la demo nunca envejece porque sus fechas son relativas —
pero solo al momento en que corre, y no ha corrido en días. Ahora mismo
`/demo/inicio` abre con **"0 Mensajes hoy"**, **"0 Clientes hoy"** y tres
"Vencido" seguidos: la mezcla que el seed diseñó a propósito colapsó.

**`seed.sql` no puede colgarse del cron tal como está.** Sus `DELETE` incluyen
`mi-optica`, el negocio que recibe las conversaciones reales de Telegram; un cron
sobre ese archivo borraría pedidos y chats de verdad cada media hora.

Por eso: `src/crons/resembrar.ts`, que toca **únicamente `demo-optica`**, con las
mismas fechas relativas. Corre en el disparo de `*/30` que ya existe,
**antes del vigía** — así el vigía evalúa datos frescos y sus claves de dedupe
coinciden con las propuestas ya sembradas, que es lo que evita duplicarlas.

Efecto: cada votante encuentra la demo con su mezcla completa —vencido, vence
hoy, a tiempo, sin fecha, entregado— con mensajes del día en las tarjetas, y lo
que el visitante anterior aprobó se restaura solo. La demo deja de ser estado
global degradable.

`seed.sql` se conserva sin cambios para la siembra manual completa.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/publico/landing.ts` | reescrito |
| `src/publico/entrar.ts` | nuevo — vista del login |
| `src/core/sesion.ts` | nuevo — puro |
| `test/core/sesion.test.ts` | nuevo |
| `src/crons/resembrar.ts` | nuevo |
| `src/admin/html.ts` | exporta `TOKENS_VOZ` y `FUENTES_VOZ` |
| `src/admin/vistas-conocimiento.ts` | acepta `soloLectura` |
| `src/index.ts` | rutas de sesión, middleware, `soloLectura`, orden del cron |

## Puertas de verificación

1. `npm test` verde, incluidos los tests nuevos de `sesion.ts`.
2. `npm run typecheck` limpio — sin `any`, sin `@ts-ignore`.
3. Round-trip de sesión probado en el núcleo: firma válida acepta; firma alterada
   rechaza; token expirado rechaza; **cambiar la contraseña invalida el token**.
4. Verificación de la landing **contra el servidor con `curl` y `grep`** de una
   cadena que solo exista en la versión nueva, antes de mirar cualquier navegador.
   El 2026-07-30 una captura del navegador mostró una versión cacheada y estuvo a
   punto de provocar el diagnóstico de un problema inexistente.
5. `curl -u admin:$PASS` sobre una ruta de `/panel` sigue devolviendo 200: la
   compatibilidad con Basic Auth no es opcional, la usan el CLI y los guiones de
   verificación.
6. `curl -X POST` sobre `/demo/conocimiento/faq/borrar` devuelve 404.

Sin `git push` ni `wrangler deploy` hasta que Diego lo pida explícitamente.

## Fuera de alcance, y por qué se anota

Cuatro defectos reales de la plataforma quedan sin tocar hoy. Ninguno se
manifiesta en la demo sembrada, que es lo que el jurado abre — por eso pueden
esperar a mañana, y por eso quedan escritos:

1. **Los pedidos se duplican.** El agente re-extrae el hilo completo en cada
   ráfaga y la propuesta `crear_pedido` se crea sin `claveDedupe`. Un cliente que
   escribe tres veces produce tres pedidos.
2. **El pedido nunca avanza de estado.** La máquina `borrador → … → entregado`
   está implementada, probada y sin ruta ni botón que la alcance.
3. **El vigía avisa una sola vez por pedido, para siempre.** El índice único de
   `clave_dedupe` no filtra por estado: descartar un aviso lo silencia
   definitivamente.
4. **No hay bandeja de conversaciones.** El dueño aprueba mensajes hacia su
   cliente sin poder leer lo que el cliente escribió, y `pausarConversacion`
   —tomar el control del chat— es código que nadie llama.
