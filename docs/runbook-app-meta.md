# Runbook: conectar un negocio a WhatsApp, Messenger e Instagram

> Los pasos que da **una persona**, no el código. Va desde una cuenta de Meta
> vacía hasta un cliente escribiendo por WhatsApp y el dueño aprobando la
> respuesta desde el panel.
>
> Verificado contra la documentación de Meta el **2026-09-13**. Meta renombra
> sus pantallas cada pocos meses: si un rótulo no coincide, busca el **dato**
> —App Secret, Phone number ID— y no la ruta exacta del menú.

## Antes de empezar

| Necesitas | Dónde |
|---|---|
| Una cuenta de Meta for Developers | developers.facebook.com |
| Un número de teléfono para el negocio | no hace falta al principio: Meta regala uno de pruebas |
| El Worker desplegado con D2 | `npx wrangler deploy` desde el repo |
| La `CLAVE_CIFRADO` a mano | en `.dev.vars`, o como variable de entorno |

**La app de Meta es del negocio, no nuestra.** Su app, su Callback URL, su
Worker. Es lo que sostiene las reglas 7 y 8 —los datos del negocio en la
infraestructura del negocio, cero telemetría— y la razón de que no haya un
login OAuth alojado por nosotros. Ver el traspaso del 2026-08-17 en
`docs/ESTADO.md`.

---

## 1. Crear la app

En **developers.facebook.com → My Apps → Create App**. Tipo **Business**.

Al terminar quedas en el **App Dashboard** de esa app.

## 2. Copiar el App Secret

**Settings → Basic → App secret → Show.**

Es la credencial con la que Meta **firma** cada webhook que nos manda. Sin
ella, `/webhook/meta/:negocioId` responde 401 a todo y no hay forma de
distinguir un mensaje de Meta de uno inventado por cualquiera que descubra la
URL. Guárdalo donde guardas contraseñas; lo vas a pegar en el paso 6.

De la misma pantalla copia también el **App ID**.

## 3. Inventar el verify token

Es una cadena que **eliges tú**, no te la da Meta. Sirve una sola vez: cuando
registres el webhook, Meta llamará a nuestra URL con ella y esperará que se la
devolvamos. Si no coincide, no registra nada.

Que sea larga y aleatoria. Por ejemplo:

```bash
openssl rand -base64 24
```

Guárdala: la necesitas en el paso 6 y en el paso 7, y tienen que ser idénticas.

## 4. Agregar WhatsApp a la app

En el App Dashboard, **Add product → WhatsApp → Set up**.

Meta crea una cuenta de WhatsApp Business de pruebas y te regala **un número de
pruebas**. Con eso alcanza para probar el circuito entero sin registrar el
número real del negocio.

En el panel **API Setup** vas a ver:

- **Phone number ID** — el identificador del número. Cópialo, es el `--id` del
  paso 8. No es el número de teléfono: es un identificador numérico largo.
- Un **token temporal** de 24 horas, para probar.
- La lista de **números de destino de prueba** — Meta solo deja escribirle a
  números que agregues ahí. Agrega tu propio celular.

> **El token temporal caduca en 24 horas.** Sirve para probar hoy. Para dejarlo
> andando hace falta un token permanente de usuario de sistema, que se saca en
> Business Settings. Hazlo cuando el circuito ya funcione: no vale la pena
> pelearse con permisos antes de saber que lo demás anda.

## 5. Desplegar el Worker, si no está

La Callback URL tiene que existir antes de que Meta la llame. Desde el repo:

```bash
npx wrangler deploy
```

La URL pública sale de `wrangler.jsonc` (`URL_PUBLICA`). Hoy es
`https://chuno.vozdigital-ai.workers.dev`.

## 6. Guardar las credenciales de entrada en CHUNO

> ⚠️ **Este paso todavía no tiene comando.** Ver "Lo que falta" al final.
> Hasta que exista, el circuito se corta aquí: la puerta de entrada queda
> cerrada y Meta no puede registrar el webhook.

El App Secret del paso 2 y el verify token del paso 3 tienen que quedar
guardados —**cifrados**— para el negocio, como `meta_app_secret` y
`meta_verify_token`.

## 7. Registrar el webhook en Meta

En el App Dashboard: **WhatsApp → Configuration → Webhook → Edit**.

| Campo | Qué poner |
|---|---|
| **Callback URL** | `https://chuno.vozdigital-ai.workers.dev/webhook/meta/<negocioId>` |
| **Verify token** | la cadena del paso 3, idéntica |

El `<negocioId>` es el del negocio en CHUNO — por ejemplo `mi-optica`. Cada
negocio tiene su propia URL, y por eso un despliegue puede hospedar a varios.

Dale a **Verify and Save**. Meta llama a esa URL con un GET que trae
`hub.mode`, `hub.verify_token` y `hub.challenge`; si el token coincide, le
devolvemos el challenge y el webhook queda registrado.

**Si falla:**

| Lo que ves | Qué pasó |
|---|---|
| `The URL couldn't be validated` | la URL no responde, o el verify token no coincide |
| Responde 403 | el verify token guardado no es el que pusiste aquí |
| Responde 400 | Meta no mandó los tres parámetros — raro, revisa la URL |

Puedes probar el handshake tú mismo, sin Meta:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://chuno.vozdigital-ai.workers.dev/webhook/meta/mi-optica?hub.mode=subscribe&hub.verify_token=EL_TOKEN&hub.challenge=hola"
```

`200` es que funciona. `403` es token equivocado. `400` es que faltan
parámetros.

Después, en **Webhook fields → Manage**, marca la casilla de **`messages`** y
dale a Done. Sin esa suscripción, Meta valida la URL y no manda nunca nada.

## 8. Conectar el canal de salida

Ya recibes. Falta poder contestar:

```bash
npx chuno-cli conectar-meta mi-optica --producto whatsapp --id <Phone number ID>
```

Te pide el token con el eco apagado —no se pasa por bandera, porque los
argumentos quedan en el historial del shell— y lo **valida contra el Graph
antes de guardar nada**. Si el par token+id no sirve, no escribe y te dice cuál
de los dos falló.

Opcional, para poder escribir fuera de la ventana de 24 horas:

```bash
  --plantilla aviso_pedido:es   # una plantilla ya aprobada por Meta
```

## 9. Probar el circuito entero

Desde el celular que agregaste como número de prueba, escríbele al número de
pruebas de WhatsApp. Deberías ver:

1. El mensaje aparece en `/panel/conversaciones`.
2. El agente contesta, si la ventana de 24 h está abierta — y lo está, porque
   el cliente acaba de escribir.
3. Si el agente propone algo, te queda pendiente en la bandeja.

Si no llega nada, la tabla `auditoria` dice por qué. Es la herramienta de
diagnóstico del proyecto: guarda el motivo, no solo el hecho.

```bash
npx wrangler d1 execute chuno --remote --command \
  "SELECT creado_en, accion, detalle_json FROM auditoria WHERE negocio_id='mi-optica' ORDER BY creado_en DESC LIMIT 10"
```

---

## Messenger e Instagram

Misma app, misma Callback URL, mismo App Secret: los tres productos de Meta
comparten la puerta de entrada. Lo que cambia es el producto que agregas en el
dashboard y el canal de salida que conectas.

| | Qué agregas | Qué suscribes | Qué id pide `conectar-meta` |
|---|---|---|---|
| Messenger | Messenger → Settings | `messages` | el id de la página de Facebook |
| Instagram | Instagram → API setup | `messages` | el id de la cuenta profesional |

**Ojo con la diferencia que decide la arquitectura:** WhatsApp admite endpoint
por cliente (`override_callback_uri`, por WABA y por número). Messenger e
Instagram **no**: su Callback URL se fija en el App Dashboard y todas las
notificaciones de esa app llegan ahí. Por eso la app tiene que ser del negocio
— con una app nuestra, los tres negocios llegarían a la misma URL y haría falta
un relay central, que rompe las reglas 7 y 8.

Fuera de la ventana de 24 horas, Messenger e Instagram no usan plantillas sino
la etiqueta de agente humano:

```bash
npx chuno-cli conectar-meta mi-optica --producto messenger --id <page id> --agente-humano
```

Si no configuras ni plantilla ni etiqueta, un aviso aprobado fuera de la
ventana **no sale**, y la decisión te vuelve a quedar pendiente en la bandeja
con el motivo. Es deliberado: decirte que el aviso no salió es honesto; fingir
que salió, no.

---

## Lo que falta para que este runbook se pueda seguir entero

**El paso 6 no tiene comando.** `meta_app_secret` y `meta_verify_token` se leen
en las dos rutas de Meta (`src/index.ts`), y sin ellas el webhook responde 403
al handshake y 401 a todo POST — pero **ningún código del repo las escribe**.
Los únicos llamadores de `guardarCredencial` guardan `telegram_token` y
`telegram_webhook_secret`, en `src/onboarding/materializar.ts`.

Es el patrón que ya está registrado en `APRENDIZAJES.md`: núcleo probado, cero
llamadores. D1 se cerró y se verificó en producción con puras respuestas
negativas —400, 401, 403— y todas eran correctas justamente **porque no había
credencial**. Nadie notó que tampoco había forma de ponerla.

Se cierra con un comando hermano de `conectar-meta`, del estilo
`chuno-cli conectar-app-meta <negocio>`, que pida el App ID, el App Secret y el
verify token, los valide —el App Secret sí se puede comprobar contra el Graph
usando `<app-id>|<app-secret>` como token de app— y los guarde cifrados.
Reutiliza casi todo lo que ya existe.

**Mientras tanto, no metas esas credenciales con SQL suelto contra
producción.** Es lo que el proyecto decidió no volver a hacer después del rastro
que costó una sesión de diagnóstico, en el traspaso del 2026-08-15.
