# Guion del pitch — 4 minutos + demo en vivo

> Plug Nights, viernes 31 de julio, 18:30. Formato: 10 minutos **incluyendo
> preguntas del jurado**. Reparto: **4 min de pitch · 3 min de demo · 3 min de Q&A.**
>
> Las cursivas entre corchetes son indicaciones, no se leen.
> **Las frases en negrita van de memoria. No se leen.**

---

## 0:00 — 0:55 · El dato, y el giro

> **¿Sabían que casi una cuarta parte de las empresas nunca contesta?**
>
> Harvard Business Review auditó dos mil doscientas cuarenta y una empresas. Le
> mandaron un cliente falso a cada una. El veintitrés por ciento no contestó
> nunca. Las que sí contestaron se demoraron, en promedio, cuarenta y dos horas.
>
> *[pausa · dos segundos]*
>
> Y ustedes están pensando lo mismo que pensé yo: eso lo arregla un bot.
>
> *[pausa]*
>
> Pero ese no es el problema caro.
>
> El cuarenta y dos por ciento de los clientes deja de comprarle a un negocio
> cuando siente que le rompieron una promesa. No cuando le contestan tarde.
> Cuando le dijeron *el jueves*, y el jueves no pasó nada.
>
> **Contestar rápido ya lo resuelve cualquiera.**
> **Acordarse de lo que prometiste no lo resuelve nadie.**

---

## 0:55 — 1:40 · Quién soy, y por qué se llama CHUNO

> Me llamo Diego Álvarez, y esto se llama CHUNO.
>
> Se llama así porque **es como le digo a mi esposa.**
>
> *[pausa · deja que aterrice. No expliques el chiste.]*
>
> Para mí esa palabra es una casa. Es lo que digo cuando estoy en la mía.
>
> Y terminó describiendo lo que construí sin que yo lo planeara. CHUNO no vive
> en mi servidor. Se instala en la nube del negocio. Las conversaciones de sus
> clientes, sus pedidos, sus fechas comprometidas: nada de eso pasa por mí.
> Cada negocio tiene su propia casa, y su asistente vive adentro.
>
> **Le puse el nombre por cariño. Después me di cuenta de que también era la arquitectura.**

---

## 1:40 — 2:25 · El problema, y de quién es

> El noventa y dos por ciento de las empresas de este país son microempresas.
> Un millón quinientas mil.
>
> Y el negocio que me interesa no se define por industria. Se define por cómo
> trabaja: **el pedido nace en una conversación, hay un proceso de varios días,
> y alguien prometió una fecha.**
>
> Ópticas. Floristerías. Talleres. Veterinarias. Laboratorios dentales.
>
> En todos pasa lo mismo: el pedido nace en WhatsApp y muere ahí. La promesa
> —"sus gafas llegan el jueves"— vive en la cabeza del dueño o en una libreta.
> Cuando el cliente escribe "¿ya está listo?", toca buscar entre trescientos chats.
>
> **WhatsApp es el sistema operativo de estos negocios. Pero no es un sistema:**
> **no deja estado, no deja fecha, y no avisa nada.**

---

## 2:25 — 3:20 · Qué hace CHUNO distinto

> CHUNO atiende el chat, como cualquier asistente. Esa es la mitad menos
> interesante.
>
> Lo que hace distinto es que **produce estado**. Convierte la conversación en un
> pedido, con fecha comprometida, en un tablero.
>
> Cada media hora revisa las promesas. Y cuando una se va a caer, **no le escribe
> al cliente: le avisa al dueño**, con el mensaje ya redactado, y espera.
>
> Esa es la regla que no se negocia: nada sale hacia el cliente final sin que el
> dueño lo apruebe. No es una opción de configuración. Está en el diseño, y si
> un módulo necesita saltársela, el módulo está mal hecho.
>
> **Todo el mundo está construyendo bots que contestan.**
> **CHUNO es el que se acuerda de lo que prometiste.**

---

## 3:20 — 3:50 · Lo técnico, en tres frases

> Tres cosas, para el jurado técnico.
>
> **Uno.** El modelo no toca la base de datos. Propone un JSON, el código lo
> valida contra un esquema, y el código decide. Si alguien intenta manipularlo
> desde el chat, no puede: los campos que querría cambiar no existen en el
> contrato.
>
> **Dos.** Cada conversación corre aislada, en su propio proceso. Dos clientes
> distintos no se ven ni se estorban.
>
> **Tres.** Corre entero sobre capa gratuita. Un negocio lo instala con **un
> comando** y sin tarjeta de crédito.

---

## 3:50 — 4:00 · La transición a la demo

> Está desplegado y está vivo ahora mismo.
>
> **No les voy a mostrar diapositivas. Le voy a escribir desde mi teléfono,
> delante de ustedes, y vemos qué pasa.**

---

# LA DEMO — 3 minutos

## Antes de empezar (hazlo AHORA, no en vivo)

- [ ] Sesión de `/panel` **ya iniciada** en el navegador. Nunca teclees la
      contraseña en vivo.
- [ ] Pestañas abiertas y en orden: `/panel/inicio` · `/panel/pedidos` ·
      `/demo/inicio` · el video de 93 s (`youtu.be/owZTkUv2oaY`)
- [ ] Teléfono con el chat de `@Chunnobot` abierto y el brillo arriba
- [ ] Modo avión de las notificaciones del teléfono

## El guion

**1 · Manda el mensaje PRIMERO.** Desde el teléfono, a la vista:

> "Buenas, necesito unas gafas progresivas. ¿Me las tienen para el jueves?"

**2 · Habla encima de la espera.** El asistente agrupa ráfagas ~15 segundos a
propósito, porque la gente escribe en tres mensajes seguidos. **No te quedes
callado mirando el teléfono.** Di exactamente esto:

> "Mientras contesta: está esperando unos segundos a propósito. La gente no
> escribe un párrafo, escribe 'hola', 'necesito gafas', 'para el jueves'. Si
> contestara cada mensaje, contestaría tres veces y entendería un tercio."

**3 · Llega la respuesta.** Léela en voz alta. Ese es el momento "esto es real".

**4 · Cambia al tablero.** El pedido está ahí, con su fecha comprometida.

> "Nadie capturó eso. Nadie llenó un formulario. Salió de la conversación."

**5 · La bandeja.** Muestra una promesa en riesgo que el vigía detectó solo, con
el mensaje ya escrito esperando aprobación.

> "Esto no lo pedí yo. Lo encontró él, revisando cada media hora."

**6 · Aprueba.** Y remata:

> "**Y ahí está la diferencia. El bot no le escribió al cliente. Me pidió permiso.**"

## El cierre y el pedido

> Esto está funcionando hoy, en capa gratuita, y se instala con un comando.
>
> Lo que necesito de Plug es acceso a los negocios que ya tienen el problema:
> ópticas, talleres, floristerías. Yo no necesito convencerlos de que lo
> tienen — necesito que me abran la puerta.

## Si algo falla

| Falla | Qué haces |
|---|---|
| No llega la respuesta en ~25 s | Pasas a `/demo/inicio` (datos sembrados, no llama al modelo, no puede fallar) y sigues. Sin disculparte. |
| El asistente responde con el mensaje de respaldo | Es la degradación por diseño. Dilo: "acaba de fallarle el modelo y respondió igual, sin dejar al cliente hablando solo." Y sigues al tablero. |
| Se cae la red | Video de 93 s, pestaña ya abierta. |

---

# Q&A — las cuatro minas

Ante un hueco: **hueco + causa + arreglo + cuándo.** Un jurado técnico premia eso
y castiga el "sí, claro".

**"¿Puedo escribirle al bot y ver mi pedido?"**
> No, y a propósito. El bot escribe al negocio real, que está detrás de
> contraseña. Apuntarlo a la demo pública les publicaría las conversaciones de
> unos visitantes a los otros. Prefiero que la demo sea menos vistosa a
> filtrar datos de gente.

**"¿Cada cuánto avisa el vigía?"**
> Hoy avisa una vez por pedido. Ya sé por qué —un índice de deduplicación que
> no filtra por estado— y el arreglo es una línea sin migración. Es lo próximo
> que entra.

**"¿El dueño puede leer la conversación completa?"**
> Todavía no. Aprueba con el contexto del pedido, no con el hilo. La bandeja de
> conversaciones es la siguiente pieza, y el código de soporte ya está escrito.

**"¿Cómo se instala?"**
> `npx chuno-cli init`. **Ojo: NO digas `npx chuno init`** — ese comando no
> existe, npm rechazó el nombre corto por parecerse a `hono`.

**"¿Y la privacidad / Habeas Data?"**
> Los datos viven en la infraestructura del negocio. Cero telemetría: no hay
> ping de activación ni reporte de uso. Los mensajes se purgan a los 90 días
> por cron, y está declarado. Y si le preguntan al asistente si es un bot, lo
> admite — negarlo no es una opción de configuración.

---

# Las cifras y su respaldo

| Dato | Fuente | Cómo citarla |
|---|---|---|
| 23% nunca responde · 42 h promedio · 2.241 empresas | [Harvard Business Review, 2011](https://hbr.org/2011/03/the-short-life-of-online-sales-leads) | Dilo con nombre |
| 42% deja de comprar tras una promesa rota | [Chain Store Age](https://chainstoreage.com/news/seller-beware-breaking-promise-could-lead-losing-your-customer) | "un estudio de retail en Estados Unidos" |
| 91,8% microempresas · 1.593.103 | DANE / Confecámaras | Dilo con nombre |

Si preguntan "¿y en Colombia?" por los dos primeros: **"el estudio es de Estados
Unidos; en Colombia no hay uno publicado equivalente, y por eso fui a hablar con
negocios reales."**

**Nunca uses** "el 80% de las mipymes pierde clientes por no contestar". Circula
en blogs de marketing sin estudio detrás.
