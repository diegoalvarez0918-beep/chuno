# Autoservicio de configuración: que el dueño decida cómo suena su asistente

> Spec de diseño. Aprobado por Diego el 2026-08-15, sección por sección.
> Subproyecto **A** de tres. Ver "Qué NO entra aquí" al final.

## El problema

Diego pidió tres cosas: que el bot salude con el nombre del negocio y suene cálido en español colombiano, que sea más autónomo y no escale toda decisión al dueño, y que cada negocio pueda fijar sus propias reglas desde la plataforma.

Al mirar el código, dos de las tres resultaron ser el mismo problema, y una ya estaba hecha:

- **El saludo con el nombre del negocio ya existe.** Commit `6fe7954` del 2026-08-08. El asistente da la bienvenida al negocio por su nombre y no se anuncia como software.
- **El tono configurable existe a medias.** `prompt.ts` línea 77 ya inyecta `Así quiere el dueño que suenes: ${negocio.tono}`. El mecanismo está; la pantalla no. **`tono` solo lo escribe la entrevista de onboarding y después no se puede editar nunca más.** Igual pasa con el `conocimiento` libre — horario, dirección, garantía. Catálogo, FAQ y agenda sí se editan.

O sea: **la calidez no se arregla escribiendo un prompt mejor, se arregla dejando que cada negocio escriba el suyo.** Eso es este spec.

## Alcance

**Solo contenido.** El dueño edita cómo suena su asistente y lo que el asistente sabe del negocio. Las reglas de comportamiento —cuándo escala, cuándo pide aprobación— se quedan en el código.

Se descartó dejar que el dueño escriba instrucciones libres para el prompt del sistema. Es lo que hacen los competidores y da máxima flexibilidad, pero choca de frente con la columna vertebral del proyecto: *el LLM propone, el código dispone*. Un dueño podría escribir "nunca digas que eres un bot" y tumbar la regla 9, que `CLAUDE.md` marca como no negociable.

## Dónde vive el dato

**Sin migración.** La tabla `settings` ya existe con forma `(negocio_id, clave, valor)` y clave primaria compuesta, precisamente para que "agregar un ajuste no exija una migración" — lo dice su propio comentario en `schema.sql`.

Cinco filas nuevas por negocio: cuatro perillas y el matiz libre.

| Clave | Valores |
|---|---|
| `tono_trato` | `tuteo` · `usted` |
| `tono_cercania` | `cercano` · `formal` |
| `tono_detalle` | `breve` · `explicado` |
| `tono_emojis` | `si` · `no` |
| `tono_matiz` | texto libre, **máximo 300 caracteres** |

El tope son 300 y no un número redondo cualquiera: cabe una frase con matiz de verdad —"somos un negocio familiar, mencionálo cuando venga al caso"— y no cabe un prompt.

### Las perillas son la fuente de verdad; la frase es derivada y no se guarda

Si se guardara la frase redactada *además* de las perillas, el día que alguien cambie cómo se redacta, las frases viejas se quedan viejas y nadie se entera.

**Ese error ya se cometió dos veces en este proyecto, las dos el 2026-08-15:** la clave del vigía escrita como literal en dos archivos que se habrían desincronizado, y la clave del escalado armada con texto que redactaba el modelo. La frase se redacta al vuelo, en cada llamada, desde las perillas.

## Componentes

### `core/conocimiento/tono.ts` — nuevo, puro

```
redactarTono(ajustes, tonoHeredado) -> string    // la frase que entra al prompt
saludoDeEjemplo(ajustes, nombreNegocio) -> string // la vista previa, determinista
AjustesTonoSchema                                 // cuatro z.enum + tope del matiz
```

Sin reloj, sin red, sin LLM. `core/` es sagrado y esto no lo toca.

### `prompt.ts` — no cambia de forma

Ya hace `Así quiere el dueño que suenes: ${negocio.tono}`. Solo cambia de dónde sale ese texto. Lo que **sí** cambia es el orden, y es la parte de seguridad (ver abajo).

### `admin/vistas-conocimiento.ts` — se le agrega un bloque

El formulario del tono va arriba del catálogo, en la pantalla que ya existe.

### `db/repos/varios.ts` — dos funciones

`guardarConocimiento` ya existe. Faltan `actualizarConocimiento` y `borrarConocimiento`, ambas filtradas por `negocio_id` sin excepción.

## El blindaje

El matiz libre es texto del dueño entrando al prompt del sistema. Aunque el alcance sea "solo tono", nada le impide escribir *"nunca digas que eres un bot"*. Tres capas:

1. **Sándwich de instrucciones.** Reglas duras → tono del dueño → **recordatorio de las reglas innegociables después**. En la práctica la última instrucción pesa más, y hoy el tono va al final sin nada detrás.
2. **Tope de caracteres y validación de esquema en el borde**, como todo lo que entra. El matiz es una frase, no un prompt.
3. **Las perillas son enumeraciones, no texto.** Cuatro `z.enum`: por ahí no entra nada raro por construcción.

**No se intenta detectar intenciones maliciosas en el texto del dueño.** Es su negocio y su bot; el blindaje protege las reglas del proyecto, no vigila al cliente.

## La pantalla

Dentro de `/panel/conocimiento`, arriba del catálogo. No una sección nueva en la nav: cuatro perillas no justifican una entrada propia, y esa pantalla ya es "lo que tu asistente sabe de tu negocio". Queda: *cómo suena* → *lo que sabe* → *qué vende* → *qué le preguntan*.

Como las rutas de escritura de conocimiento no se registran cuando `esDemo`, **la demo la muestra y no la edita**, sin un solo `403` que sortear.

**Formulario nativo, sin JavaScript.** Cuatro grupos de radios y un `submit`. No es pereza: las fuentes cargan con `display=swap` porque, dice el comentario en `html.ts`, *"el panel se abre desde un mostrador con la señal que haya"*. Lo que no depende de JS funciona con esa señal.

### La vista previa

Cuatro perillas abstractas no le dicen nada a un tendero. Debajo va **un saludo de ejemplo real que cambia con lo que elige**:

- `usted · cercano · breve · sin emojis` → "Buenas, bienvenido a Óptica del Parque. ¿En qué le puedo ayudar?"
- `tuteo · cercano · breve · con emojis` → "¡Hola! 👋 Bienvenido a Óptica del Parque. ¿En qué te ayudo?"

**Determinista, sin LLM.** Las variantes se escriben a mano y las perillas eligen; el nombre del negocio se interpola. Cero cuota, respuesta instantánea, y funciona en la demo pública, que no puede llamar al modelo. Es la diferencia entre un formulario que se llena y uno que se mira.

## Compatibilidad

Hoy `tono` lo escribe la entrevista como texto libre. Si las perillas pasan a ser la fuente de verdad, **un negocio que nunca abra esta pantalla perdería el tono que la entrevista le configuró** — una regresión invisible que nadie ve hasta que el bot suena distinto.

Se resuelve sin migración: `redactarTono` recibe también el `tono` heredado y, **si el negocio no tiene guardada NINGUNA de las cuatro perillas, devuelve el heredado tal cual.** Nada cambia para quien no toque la pantalla; en cuanto guarde una vez, mandan las perillas. Al abrir el formulario por primera vez, el matiz viene precargado con ese texto viejo, así que no se pierde ni se duplica.

**"Ninguna" es literal, y la regla es todo o nada a propósito.** El formulario guarda las cuatro perillas de una sola vez, así que un estado parcial solo puede venir de datos escritos a mano. Si aparece —una perilla guardada y tres ausentes— mandan las perillas, y las que falten toman su valor por defecto: `usted`, `cercano`, `breve`, `sin emojis`. La alternativa —mezclar el tono heredado con perillas sueltas— produciría una frase contradictoria que nadie escribió y que sería imposible de explicar al mirarla.

El onboarding no se toca. La entrevista sigue siendo el primer camino a ese dato; esta pantalla es el segundo.

## Pruebas

En `npm test`, puras y en milisegundos:

- `redactarTono` **sin perillas devuelve el heredado tal cual** — el caso que impide la regresión invisible.
- `saludoDeEjemplo`: el nombre se interpola; sin emojis no salen emojis.
- **Un test por perilla, comprobando que cambiarla cambia la salida.** Atrapa la perilla decorativa: la que el dueño mueve y no hace nada. Es el mismo hueco que dejó `pausarConversacion` durante un mes.
- El esquema: cuatro enums y el tope del matiz.
- **Estructura del prompt:** las reglas innegociables aparecen **después** del texto del dueño.

**El blindaje se prueba por estructura, no por obediencia.** Ningún test puro puede probar que el modelo respete ese orden. Verificamos el sándwich, no la digestión.

### Verificación contra el servidor

`curl` al panel con `grep` de algo que solo exista en la versión nueva, y **dos lecturas seguidas que coincidan** antes de creerle a la primera — la propagación de Cloudflare ya produjo tres diagnósticos falsos en este proyecto.

### Una prueba viva, barata y única

Después de desplegar: poner las perillas en una combinación inconfundible —tuteo + emojis— y escribirle una vez al bot. Si contesta de usted y sin emojis, las perillas no llegaron al prompt. Dos llamadas a Gemini, una sola vez, y es la única forma de comprobar el eslabón que ningún test alcanza.

## Qué NO entra aquí

- **El onboarding.** No se toca.
- **`requiereAprobacion` y el umbral de escalado.** Es el subproyecto **B**, "autonomía graduable por negocio". Hoy `UMBRAL_CONFIANZA` es una constante global igual para todos los negocios, y ahí está el verdadero "el bot manda todo a la bandeja".
- **Humanizer sobre el prompt base, los avisos del vigía y los textos del panel.** Es el subproyecto **C**, "voz colombiana".
- **Reglas de comportamiento editables**, en cualquier forma. Descartado arriba, con su razón.

## Tensión conocida, sin resolver

La regla **11** de `CLAUDE.md` dice *"Nada sale al cliente final sin aprobación del dueño"* y está marcada como no negociable. (La 12 es la prohibición del kill switch, que no viene al caso aquí.) El pedido de más autonomía la toca de frente. En la práctica el agente **sí** responde solo en el chat; lo que pasa por la bandeja son los avisos proactivos y los pedidos dudosos, así que hay margen sin romper la regla.

**Dónde está el límite exacto es una decisión de Diego y pertenece al subproyecto B.** Se deja anotada aquí para que no se pierda entre specs.
