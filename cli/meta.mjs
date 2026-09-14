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
 * El SQL que guarda un canal conectado: token cifrado y su id, en una sola
 * sentencia.
 *
 * Vive aquí y no dentro del comando para poder correrlo contra una base de
 * pruebas tal cual. Escribirlo dos veces —una para el comando y otra para
 * verificarlo— comprobaría la copia, no lo que se ejecuta de verdad.
 */
export function sqlGuardarMeta(negocioId, cfg, cifrado, id, ahora) {
  return `INSERT INTO credenciales (negocio_id, clave, valor_cifrado, actualizado_en)
       VALUES (${sql(negocioId)}, ${sql(cfg.credencial)}, ${sql(cifrado)}, ${sql(ahora)})
       ON CONFLICT (negocio_id, clave) DO UPDATE SET
         valor_cifrado = excluded.valor_cifrado, actualizado_en = excluded.actualizado_en;
     INSERT INTO settings (negocio_id, clave, valor)
       VALUES (${sql(negocioId)}, ${sql(cfg.ajusteId)}, ${sql(id)})
       ON CONFLICT (negocio_id, clave) DO UPDATE SET valor = excluded.valor;`;
}

/** Un ajuste suelto, para la plantilla y la etiqueta de agente humano. */
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
