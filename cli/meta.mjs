/**
 * Validación de las credenciales de Meta contra el Graph.
 *
 * Vive aparte de `chuno.mjs` para poder ejercitarse: un detector que nunca se
 * corrió contra un caso conocido es una moneda al aire, y este proyecto ya
 * pagó ese error una vez. Hace red, así que no lo cubre vitest — se verifica
 * de punta a punta contra el Graph real, que para los casos de error no cuesta
 * ni credenciales ni cuota.
 */

/**
 * Qué guarda cada producto de Meta. El id acompaña al token y no es secreto:
 * va a `settings` en claro, igual que `llm_proveedor` va aparte de su llave.
 * Cifrar un id solo haría más difícil diagnosticar.
 */
export const PRODUCTOS_META = {
  whatsapp: {
    credencial: "whatsapp_token",
    ajusteId: "meta_phone_number_id",
    graph: "https://graph.facebook.com/v25.0",
    comoSeLlamaElId: "el id del número de teléfono (Phone number ID)",
  },
  messenger: {
    credencial: "messenger_page_token",
    ajusteId: "meta_page_id",
    graph: "https://graph.facebook.com/v25.0",
    comoSeLlamaElId: "el id de la página de Facebook",
  },
  instagram: {
    credencial: "instagram_token",
    ajusteId: "meta_ig_id",
    // Host distinto, no es un descuido: Instagram no se consulta en
    // graph.facebook.com. Verificado contra la documentación.
    graph: "https://graph.instagram.com/v25.0",
    comoSeLlamaElId: "el id de la cuenta profesional de Instagram",
  },
};

/**
 * Códigos del Graph que culpan al TOKEN, y los que culpan al ID.
 *
 * Se enumera por código de Meta y no por status HTTP porque el status no
 * distingue: medido el 2026-09-13, un token basura da `HTTP 401 código 190` y
 * la misma petición sin token da `HTTP 400 código 104` — los dos son el token,
 * con status distinto. Y el Graph prácticamente no devuelve 404, así que
 * ramificar por "404 = id malo" deja esa rama muerta y manda a revisar el
 * token cuando el equivocado era el id.
 *
 * Lo que no esté en ninguna de las dos listas se reporta como indistinguible,
 * con su código. Es la forma de lista que este proyecto ya tuvo que invertir
 * tres veces: adivinar mal aquí manda a revisar la mitad que estaba bien, y
 * eso cuesta más que decir "no sé".
 */
const CODIGOS_DEL_TOKEN = [102, 104, 190, 463, 467];
const CODIGOS_DEL_ID = [803];

/** Comilla simple para SQL. Lo que llega de fuera ya viene validado por forma. */
const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * Una credencial cifrada.
 *
 * `ON CONFLICT` y no `INSERT` a secas porque reconectar un canal es normal:
 * los tokens de Meta caducan y el de pruebas dura 24 horas.
 */
export function sqlGuardarCredencial(negocioId, clave, cifrado, ahora) {
  return `INSERT INTO credenciales (negocio_id, clave, valor_cifrado, actualizado_en)
       VALUES (${sql(negocioId)}, ${sql(clave)}, ${sql(cifrado)}, ${sql(ahora)})
       ON CONFLICT (negocio_id, clave) DO UPDATE SET
         valor_cifrado = excluded.valor_cifrado, actualizado_en = excluded.actualizado_en;`;
}

/**
 * El SQL que guarda un canal conectado: token cifrado y su id, en una sola
 * sentencia.
 *
 * Vive aquí y no dentro del comando para poder correrlo contra una base de
 * pruebas tal cual. Escribirlo dos veces —una para el comando y otra para
 * verificarlo— comprobaría la copia, no lo que se ejecuta de verdad.
 */
export function sqlGuardarMeta(negocioId, cfg, cifrado, id, ahora) {
  return `${sqlGuardarCredencial(negocioId, cfg.credencial, cifrado, ahora)}
     ${sqlGuardarAjuste(negocioId, cfg.ajusteId, id)}`;
}

/** Un ajuste suelto: el id de un producto, la plantilla, la etiqueta. */
export function sqlGuardarAjuste(negocioId, clave, valor) {
  return `INSERT INTO settings (negocio_id, clave, valor)
       VALUES (${sql(negocioId)}, ${sql(clave)}, ${sql(valor)})
       ON CONFLICT (negocio_id, clave) DO UPDATE SET valor = excluded.valor;`;
}

/**
 * ¿De quién es la culpa: del token o del id?
 *
 * Pura y aparte del `fetch` para que se pueda probar sin credenciales. El
 * camino que importa —token válido con id inexistente— no se puede producir
 * contra el Graph real sin un token de verdad, así que se cubre aquí con los
 * cuerpos que Meta documenta, y la llamada real confirma que sus errores
 * llegan con esta forma.
 */
export function clasificarErrorMeta(status, cuerpo, id) {
  const error = cuerpo?.error ?? {};
  const codigo = Number(error.code);
  const subcodigo = Number(error.error_subcode);

  if (CODIGOS_DEL_TOKEN.includes(codigo)) {
    return { ok: false, culpa: "token", motivo: `Meta rechazó el token (código ${codigo})` };
  }

  // 100/33 es el caso corriente de un id que no existe con un token que sí
  // sirve. El propio mensaje de Meta dice "no existe O falta permiso", así que
  // el nuestro tampoco elige: decir solo "no existe" mandaría a buscar un id
  // que puede estar bien escrito y fuera del alcance del token.
  if (CODIGOS_DEL_ID.includes(codigo) || (codigo === 100 && subcodigo === 33)) {
    return {
      ok: false,
      culpa: "id",
      motivo: `el id ${id} no existe, o este token no lo alcanza (código ${codigo})`,
    };
  }

  return {
    ok: false,
    motivo:
      `Meta rechazó el par (HTTP ${status}, código ${codigo || "sin código"}). ` +
      "No puedo decirte cuál de los dos falló",
  };
}

/**
 * Valida el par App ID + App Secret contra el Graph.
 *
 * Meta los acepta pegados como token de aplicación, `<app-id>|<app-secret>`,
 * así que una lectura de la propia app prueba los dos de una.
 *
 * **No se puede decir cuál de los dos falló**, y el mensaje no lo finge:
 * medido el 2026-09-13, un par inventado da `HTTP 400 código 190` igual que un
 * token mal formado, porque Meta valida el token entero antes de mirar el
 * objeto de la URL. Inventar aquí una atribución mandaría a revisar la mitad
 * que estaba bien, que es justo el error que este comando existe para evitar.
 */
export async function validarAppMeta(appId, appSecret) {
  const token = `${appId}|${appSecret}`;

  let respuesta;
  try {
    respuesta = await fetch(
      `${PRODUCTOS_META.whatsapp.graph}/${encodeURIComponent(appId)}?access_token=${encodeURIComponent(token)}`,
    );
  } catch {
    return { ok: false, motivo: "no pude contactar a Meta; revisa tu conexión" };
  }

  if (respuesta.ok) return { ok: true };

  const cuerpo = await respuesta.json().catch(() => ({}));
  const codigo = Number(cuerpo?.error?.code);

  return {
    ok: false,
    motivo: `Meta no reconoce ese App ID con ese App Secret (código ${
      Number.isFinite(codigo) ? codigo : "sin código"
    })`,
  };
}

/**
 * La URL del webhook de un negocio. Es lo que se pega en la Callback URL del
 * App Dashboard, y lo que este comando llama para comprobarse a sí mismo.
 */
export function urlWebhookMeta(urlPublica, negocioId) {
  return `${urlPublica.replace(/\/$/, "")}/webhook/meta/${encodeURIComponent(negocioId)}`;
}

/**
 * Registra nuestra URL como webhook de esa cuenta de WhatsApp, sin que nadie
 * entre al panel de Meta.
 *
 * Es el paso donde más gente se atasca —copiar una URL larga y una contraseña
 * en dos campos, y acordarse de marcar la casilla `messages`— y Meta permite
 * hacerlo por API: `POST /{WABA}/subscribed_apps` con `override_callback_uri`.
 * Para Telegram el instalador ya registraba el webhook solo desde el primer
 * día; esto es ponerle a Meta el mismo trato.
 *
 * Dos llamadas y no una: Meta exige que la app esté suscrita a la cuenta antes
 * de poder sobrescribirle la URL. La primera suscribe, la segunda apunta.
 */
export async function registrarWebhookMeta(wabaId, token, urlCallback, verifyToken) {
  const url = `${PRODUCTOS_META.whatsapp.graph}/${encodeURIComponent(wabaId)}/subscribed_apps`;

  const suscripcion = await postGraph(url, token, {});
  if (!suscripcion.ok) return suscripcion;

  return postGraph(url, token, {
    override_callback_uri: urlCallback,
    verify_token: verifyToken,
  });
}

/**
 * Un POST al Graph. El cuerpo del error NO viaja en el motivo: puede traer el
 * teléfono del negocio. Solo el código, que es lo que sirve para diagnosticar.
 */
async function postGraph(url, token, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, motivo: "no pude contactar a Meta" };
  }

  if (respuesta.ok) return { ok: true };

  const datos = await respuesta.json().catch(() => ({}));
  const codigo = Number(datos?.error?.code);
  return {
    ok: false,
    motivo: `Meta rechazó el registro (HTTP ${respuesta.status}, código ${
      Number.isFinite(codigo) ? codigo : "sin código"
    })`,
  };
}

/**
 * Repite el handshake que hará Meta, contra nuestro propio Worker.
 *
 * Es el **camino feliz** de esta puerta, y hasta hoy no existía: D1 se
 * verificó con puras negativas —400, 401, 403— que eran correctas porque no
 * había credencial, y por eso nadie notó que tampoco había forma de ponerla.
 * Una tanda de rechazos demuestra que la puerta no se abre de más, nunca que
 * se abra.
 *
 * No es fatal si falla: el Worker puede no estar desplegado todavía, o estar
 * sirviendo una versión vieja. Se informa y quien conecta decide.
 */
export async function comprobarHandshake(urlPublica, negocioId, verifyToken) {
  const reto = `chuno-${Date.now()}`;
  const url =
    `${urlWebhookMeta(urlPublica, negocioId)}?hub.mode=subscribe` +
    `&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${reto}`;

  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch {
    return { ok: false, motivo: "no pude contactar a tu Worker" };
  }

  // El challenge devuelto tal cual es la prueba de verdad: un 200 con otro
  // cuerpo sería un endpoint que responde pero no es el nuestro.
  const cuerpo = (await respuesta.text()).trim();
  if (respuesta.ok && cuerpo === reto) return { ok: true };

  if (respuesta.status === 403) {
    return {
      ok: false,
      motivo:
        "tu Worker respondió 403: tiene otro verify token guardado, o todavía " +
        "sirve una versión anterior al despliegue",
    };
  }
  if (respuesta.status === 404) {
    return { ok: false, motivo: "tu Worker no conoce esa ruta: falta desplegar D2" };
  }

  return { ok: false, motivo: `tu Worker respondió HTTP ${respuesta.status}` };
}

/**
 * Valida el par token+id contra el Graph antes de guardarlo.
 *
 * "Pega el token" falla en silencio: un token malo no da error hasta que un
 * cliente escribe y nadie contesta. Una lectura barata prueba las dos cosas de
 * una, porque el id va en la URL y el token en la cabecera: si responde 200,
 * el par sirve.
 */
export async function validarMeta(producto, token, id) {
  const { graph } = PRODUCTOS_META[producto];

  let respuesta;
  try {
    respuesta = await fetch(`${graph}/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, motivo: "no pude contactar a Meta; revisa tu conexión" };
  }

  if (respuesta.ok) return { ok: true };

  const cuerpo = await respuesta.json().catch(() => ({}));
  return clasificarErrorMeta(respuesta.status, cuerpo, id);
}
