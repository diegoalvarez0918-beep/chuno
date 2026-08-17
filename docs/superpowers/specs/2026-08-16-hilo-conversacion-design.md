# El hilo de la conversación: dejar de aprobar a ciegas

> Spec de diseño. Aprobado por Diego el 2026-08-16.
> Tarea **3 de 5** de la bandeja de conversaciones. Ver "Qué NO entra aquí" al final.

## El problema

La promesa central del producto es que **nada sale al cliente sin que el dueño lo apruebe**. Hoy esa aprobación se pide en la bandeja, que muestra la propuesta del asistente y nada más: el dueño lee "Hola Marta, tus gafas se demoran dos días más" y decide sobre ella **sin poder leer lo que Marta escribió**.

Una aprobación sin contexto no es una aprobación, es un trámite. El dueño acaba dándole a aprobar por inercia, y el día que el asistente proponga algo equivocado lo va a aprobar igual.

La tarea 2 construyó la lista de conversaciones y **a propósito no enlaza a ningún lado**: la ruta del hilo es esta tarea, y una lista que abre en 404 es peor que una que no abre. Este spec le da destino.

## Alcance

**Solo decidir.** El hilo muestra los mensajes y las tarjetas de decisión —aprobar, editar el texto, descartar—. No lleva caja para escribir un mensaje libre al cliente.

Se descartó la caja libre por dos razones. Abre un camino de salida hacia el cliente que hoy no existe, con su propia auditoría, su escritura en `mensajes` y la duda de si pausa la conversación sola; y no hace falta para cerrar el problema de este spec. Cuando el dueño quiera hablar él, pausa el asistente (tarea 4) y escribe por Telegram.

## La ruta

`GET {base}/conversaciones/:id`, registrada en `montarPanel` igual que la lista, así que existe en `/panel` y en `/demo`.

Cuatro consultas en paralelo:

| Consulta | Para qué |
|---|---|
| `obtenerConversacion` | quién es, por qué canal, si está pausada |
| `leerHilo` | los mensajes |
| `listarPendientes` | las decisiones, que se filtran a esta conversación |
| `contarPendientes` | el globo de la barra lateral, con `COUNT` de verdad |

`obtenerConversacion` ya recibe `negocioId` y filtra por él. Si devuelve `null`, la ruta responde 404. El aislamiento multi-tenant de la regla 1 queda cubierto sin código nuevo, y un id de otro negocio es indistinguible de uno que no existe.

## Un predicado, dos consumidores

`contarPendientesPorConversacion` lleva adentro la regla de qué propuesta pertenece a una conversación: las que traen `conversacionId` en el payload. `cambiar_estado` y `cambiar_fecha` llevan `pedidoId` y quedan fuera.

El hilo necesita esa misma regla, pero para **listar** en vez de contar. Escrita dos veces se desincroniza el día que alguien agregue un tipo de propuesta nuevo: el globo diría 3 sobre una página que muestra 5, y el dueño no tendría forma de saber cuál de los dos miente.

**Ese error ya se cometió en este proyecto.** `claveAviso` era el mismo literal escrito en dos archivos, sostenido por un comentario, hasta que se subió al núcleo el 2026-08-15.

```
esDeConversacion(propuesta, conversacionId) -> boolean
```

En `core/propuesta/tipos.ts`, y la usan las dos: el contador que alimenta el globo y el filtro que alimenta la página. Así **no pueden** discrepar.

## Una tarjeta, dos pantallas

`tarjetaPropuesta` es hoy una función privada de `src/admin/vistas.ts`. Se exporta y el hilo la reutiliza.

Escribir una segunda tarjeta para el hilo costaría que editar el texto antes de aprobar funcione en una pantalla y no en la otra, y que se arreglen bugs en una sola. Con una sola función, la bandeja y el hilo no pueden divergir.

**Cambia en una cosa:** acepta un parámetro opcional con el id de la conversación a la que volver, y lo pinta como campo oculto del formulario. La bandeja no lo pasa y su comportamiento no cambia. Es la única modificación, y va por parámetro y no por bandera global para que la tarjeta siga siendo una función de sus argumentos.

## Volver al hilo después de decidir

`/decidir` redirige hoy siempre a `${base}/bandeja`. Quien decide desde el hilo tiene que volver al hilo: está trabajando ahí.

El formulario lleva un campo oculto con el **id de la conversación**, no con la URL de destino. El servidor reconstruye la URL.

Es la diferencia entre un parámetro y un redirect abierto. Si el destino viajara como URL, quien mande el POST elige a dónde rebota el navegador del dueño después de una acción autenticada. Con el id, el peor caso es un 404.

Sin campo, el comportamiento no cambia: se vuelve a la bandeja.

## Recortes declarados

`leerHilo` trae los últimos 30 mensajes; el número está puesto para la ventana de contexto del modelo, no para una pantalla.

Se exporta `LIMITE_HILO` y, si el hilo viene lleno hasta el tope, la pantalla lo dice. Misma regla que la lista de conversaciones con `LIMITE_CONVERSACIONES`: **una lista cortada en silencio se lee como "esto es todo lo que tengo"**, y el dueño que busca un mensaje viejo y no lo encuentra concluye que se perdió.

## Reparto en pantalla

Dos columnas en escritorio: el hilo a la izquierda, las decisiones en una columna fija a la derecha que no se va con el scroll.

En pantalla angosta se apila y **las decisiones quedan arriba**. El orden no es cosmético: el dueño en el mostrador necesita actuar, no leer. Quien quiera el contexto baja; quien ya sabe qué pasó, decide sin scroll.

Es la misma razón por la que las fuentes del panel cargan con `display=swap` — esta pantalla se abre desde un mostrador con la señal que haya.

## Escapado

Todo el texto del hilo lo escribió un desconocido por Telegram. Pasa entero por `esc()`, sin excepción: texto del mensaje, nombre del cliente y nombre del canal.

Es el único lugar del panel donde se pinta contenido de terceros en volumen, y por eso se dice explícitamente en vez de darlo por hecho.

## La demo

El hilo existe en `/demo` y sus botones funcionan. No hay riesgo: las conversaciones de `demo-optica` son sembradas y ficticias, y su canal es `demo`, cuyo `enviar` es un no-op que no manda nada a ningún lado (`src/canales/demo.ts`).

La bandeja de la demo ya decide con este mismo mecanismo desde antes; el hilo no estrena nada.

## Qué se prueba

Tests nuevos en `test/core/propuesta.test.ts`, sobre el núcleo puro:

- `esDeConversacion` reconoce `enviar_aviso` y `crear_pedido` de la conversación dada.
- Rechaza `cambiar_estado` y `cambiar_fecha`, que no cuelgan de una conversación.
- Rechaza propuestas de **otra** conversación — el caso que un filtro mal escrito deja pasar.
- El contador y el filtro coinciden sobre el mismo conjunto de entrada. Es el test que hace verdad la sección "un predicado, dos consumidores".

Vista y ruta no llevan test: en este proyecto solo `src/core/` se prueba, y es a propósito.

## Qué NO entra aquí

- **Caja para escribir libre al cliente.** Descartado arriba.
- **Botones de pausar y reanudar.** Es la tarea 4. El hilo de esta tarea **sí muestra** si la conversación está pausada y cuántos minutos faltan, con `minutosRestantesDePausa`, que ya existe y está probado. Lo que falta es quien la pause.
- **El subconteo por encima de 50 pendientes.** Los globos por conversación se calculan sobre `listarPendientes`, que corta en 50 ordenando de más viejo a más nuevo: con más de 50 pendientes subcuentan en silencio, y lo que se cae son las decisiones recientes. Se arregla con `GROUP BY` en el repo, en la tarea 5. Hoy no muerde — `mi-optica` tiene 2 pendientes.
- **Marcar mensajes como leídos, buscar dentro del hilo, adjuntar fotos.** Nada de eso hace falta para dejar de aprobar a ciegas.
