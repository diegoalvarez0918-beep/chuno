# CHULETA — pitch 4 min

> **▸ = va de memoria, palabra por palabra. Lo demás son anclas, no libreto.**
> **Si te pierdes:** salta a la frase de rescate del final.

---

## 0:00 · EL DATO

- **«¿Sabían que casi una de cada cuatro empresas nunca contesta?»**
- Harvard Business Review · **2.241 empresas** · un cliente falso a cada una
- **23% no contestó nunca** · las que sí: **42 horas** de promedio
- *[PAUSA]* → "y están pensando lo mismo que pensé yo: eso lo arregla un bot"
- *[PAUSA]* → **pero ese no es el problema caro**
- **42%** deja de comprar cuando le rompen una promesa
- No por contestar tarde → por el **jueves que no pasó nada**

> **▸ «Contestar rápido ya lo resuelve cualquiera.**
> **Acordarse de lo que prometiste no lo resuelve nadie.»**

---

## 0:55 · QUIÉN SOY · EL NOMBRE

- Diego Álvarez · esto se llama **CHUNO**

> **▸ «Se llama así porque es como le digo a mi esposa.»**  *[PAUSA — no expliques]*

- Para mí esa palabra es **una casa**. Lo que digo cuando estoy en la mía
- **No vive en mi servidor** → se instala en la nube del negocio
- Sus conversaciones, sus pedidos, sus fechas: **nada pasa por mí**

> **▸ «Le puse el nombre por cariño.**
> **Después me di cuenta de que también era la arquitectura.»**

---

## 1:40 · EL PROBLEMA · DE QUIÉN ES

- **91,8%** de las empresas del país son microempresas · **1,5 millones**
- No lo define la industria — lo define **cómo trabajan**:
  - el pedido nace en una **conversación**
  - hay un **proceso de varios días**
  - alguien **prometió una fecha**
- Ópticas · floristerías · talleres · veterinarias · laboratorios dentales
- El pedido nace en WhatsApp y **muere ahí**
- "Sus gafas llegan el jueves" → vive en la cabeza del dueño o en una libreta

> **▸ «WhatsApp es el sistema operativo de estos negocios.**
> **Pero no es un sistema: no deja estado, no deja fecha y no avisa nada.»**

---

## 2:25 · QUÉ HACE DISTINTO

- Atiende el chat → **esa es la mitad aburrida**
- Lo distinto: **produce ESTADO**
- Conversación → **pedido con fecha comprometida** → en un tablero
- **Cada 30 minutos** revisa las promesas
- Cuando una se va a caer: **no le escribe al cliente → me avisa a mí**, con el mensaje ya redactado
- Nada sale al cliente sin aprobación. **No es configuración, es diseño**

> **▸ «Todo el mundo está construyendo bots que contestan.**
> **CHUNO es el que se acuerda de lo que prometiste.»**

---

## 3:20 · TÉCNICO · tres frases

- **1 ·** El modelo **no toca la base de datos**
  - propone JSON → el código valida contra esquema → **el código decide**
  - si te manipulan desde el chat, **no pueden**: esos campos no existen en el contrato
- **2 ·** Cada conversación **aislada**, en su propio proceso
- **3 ·** Corre entero en **capa gratuita** · un comando · **sin tarjeta de crédito**

---

## 3:50 · A LA DEMO

> **▸ «Está desplegado y está vivo ahora mismo. No les voy a mostrar**
> **diapositivas — le voy a escribir desde mi teléfono.»**

---

# DEMO

**Mensaje exacto** (cópialo tal cual, está calculado):

> ### Hola, quiero unos lentes monofocales para el martes. ¿Cuánto valen?

1. **Manda primero.** No mires el teléfono
2. **Habla encima de los ~15 s:** *"espera unos segundos a propósito — la gente escribe 'hola', 'necesito gafas', 'para el jueves'. Si contestara cada uno, entendería un tercio"*
3. Llega la respuesta → **léela en voz alta**
4. **Tablero** → *"nadie capturó eso. Salió de la conversación"*
5. **Bandeja** → *"esto no lo pedí yo. Lo encontró él"*
6. **Apruebas** → **▸ «El bot no le escribió al cliente. Me pidió permiso.»**

**Cierre + pedido:**
> Funciona hoy, en capa gratuita, se instala con un comando.
> Lo que necesito de Plug es **acceso a los negocios que ya tienen el problema.**
> No necesito convencerlos — necesito que me abran la puerta.

**Si falla:** `/demo/inicio` (sembrado, no puede fallar) → sigues sin disculparte.
**Si se cae la red:** video de 93 s, pestaña ya abierta.

---

# 🆘 FRASE DE RESCATE

Si te pierdes por completo, di esto y vuelves al carril:

> **«Y volviendo a lo que importa: todo el mundo está construyendo bots que**
> **contestan. CHUNO es el que se acuerda de lo que prometiste.»**

---

# NO DIGAS

- ❌ `npx chuno init` → es **`npx chuno-cli init`**
- ❌ "escríbele al bot y verás tu pedido" → el bot escribe al negocio real, tras contraseña
- ❌ No anuncies la foto. Si sale, es regalo
- ❌ Nunca "el 80% de las mipymes…" → no existe ese estudio

# SI PREGUNTAN

- **¿Cada cuánto avisa?** → hoy, una vez por pedido. Sé por qué y el arreglo es una línea
- **¿Lee la conversación?** → todavía no. Es la siguiente pieza
- **¿Privacidad?** → datos en la infraestructura del negocio · cero telemetría · purga a 90 días · si le preguntan si es bot, lo admite
