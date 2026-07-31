import { Hono, type Context } from "hono";
import { basicAuth } from "hono/basic-auth";

import { ahoraISO, hoyEnZona, nuevoId } from "./db/id";
import { avanzarLead } from "./core/crm/embudo";
import { ESTADOS_LEAD, type EstadoLead } from "./core/crm/tipos";
import { ESTADOS_PEDIDO, type EstadoPedido } from "./core/pedido/tipos";
import { transicionar } from "./core/pedido/estado";
import { CLAVE_AGENDA, normalizarUrlAgenda } from "./core/conocimiento/agenda";
import { modelos, numero, type Env } from "./env";
import { AgenteConversacion, idDeConversacion } from "./agente/agente";
import { correrVigia } from "./crons/vigia";
import { decidirPropuesta } from "./admin/aplicar";
import { pagina } from "./admin/html";
import { vistaBandeja, vistaPedidos, vistaRegistro } from "./admin/vistas";
import { landing } from "./publico/landing";
import { vistaEntrar } from "./publico/entrar";
import { DURACION_SESION_SEGUNDOS, firmarSesion, verificarSesion } from "./core/sesion";
import { resembrarDemo } from "./crons/resembrar";
import { crearCanalTelegram, registrarWebhook, webhookAutentico } from "./canales/telegram";
import { crearNegocio, escribirSetting, leerSetting, listarNegocios, obtenerNegocio } from "./db/repos/negocio";
import { leerCredencial } from "./db/repos/credencial";
import { crearProveedorGemini } from "./llm/gemini";
import {
  aplicarRespuesta,
  armarConfiguracion,
  esFinal,
  estadoInicial,
  interpretar,
} from "./core/onboarding/entrevista";
import {
  borrarEntrevista,
  crearEntrevista,
  guardarEntrevista,
  leerEntrevista,
} from "./db/repos/entrevista";
import { estructurarConLLM } from "./onboarding/estructurar";
import { materializarConfiguracion } from "./onboarding/materializar";
import { vistaEntrevista, vistaEntrevistaDemo } from "./admin/vistas-onboarding";
import { guardarMensaje, obtenerOCrearConversacion } from "./db/repos/conversacion";
import { guardarPedido, listarPedidos, obtenerPedido } from "./db/repos/pedido";
import { contarPendientes, listarPendientes } from "./db/repos/propuesta";
import { auditar, listarAuditoria, purgarMensajesViejos } from "./db/repos/varios";
import { guardarLead, listarContactos, listarLeads, obtenerLead } from "./db/repos/crm";
import { borrarFaq, borrarItemCatalogo, fijarImagenCatalogo, guardarFaq, guardarItemCatalogo, listarCatalogo, listarFaq, obtenerItemCatalogo } from "./db/repos/catalogo";
import { MAXIMO_BYTES, borrarImagen, claveImagen, guardarImagen, leerImagen, tipoAceptado } from "./db/imagenes";
import { vistaConocimiento } from "./admin/vistas-conocimiento";
import { calcularMetricas } from "./db/repos/metricas";
import { vistaMetricas } from "./admin/vistas-metricas";
import { vistaClientes } from "./admin/vistas-clientes";

export { AgenteConversacion };

const app = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────────────────────────  público ──

app.get("/", (c) => c.html(landing()));

app.get("/salud", (c) => c.json({ ok: true, servicio: "chuno" }));

/**
 * Las fotos del catálogo, públicas.
 *
 * Tienen que serlo: cuando el dueño aprueba mandarle la foto de un producto a
 * un cliente, quien va a descargarla es Telegram o WhatsApp desde sus propios
 * servidores, no un navegador con la sesión del dueño. Son fotos de producto,
 * no datos de nadie.
 *
 * La versión va en la ruta, así que una llave dada nunca cambia de contenido y
 * se puede cachear para siempre. Reemplazar la foto genera una llave nueva.
 */
app.get("/img/:negocioId/:itemId/:version", async (c) => {
  const clave = claveImagen(
    c.req.param("negocioId"),
    c.req.param("itemId"),
    Number(c.req.param("version")),
  );

  const imagen = await leerImagen(c.env, clave);
  if (!imagen) return c.text("No encontrada", 404);

  return new Response(imagen.bytes, {
    headers: {
      "content-type": imagen.tipo,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

// ─────────────────────────────────────────────────────────────────  el panel ──

/**
 * El panel se monta dos veces sobre el mismo código:
 *
 *   /panel  → el negocio real, detrás de contraseña
 *   /demo   → un negocio sembrado, abierto a cualquiera
 *
 * Es la misma pantalla porque tiene que serlo: lo que un votante ve en la demo
 * es exactamente lo que un dueño recibe. Nada de maquetas.
 */
/** El formulario pide pesos; la base guarda centavos. Vacío o basura → null. */
function precioFormulario(texto: string): number | null {
  const limpio = texto.replace(/[$.\s]/g, "");
  if (limpio === "") return null;
  const pesos = Number(limpio);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  return Math.round(pesos) * 100;
}

function enteroFormulario(texto: string): number | null {
  const n = Number(texto.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function montarPanel(opciones: {
  base: string;
  negocioDe: (c: Context<{ Bindings: Env }>) => string;
  conSelector: boolean;
  /**
   * Marca el montaje público. De aquí salen dos políticas distintas y conviene
   * no confundirlas, porque ya no es "solo lectura":
   *
   * - **El conocimiento no se edita.** Sus rutas de escritura ni siquiera se
   *   registran: no existe la ruta, no hay 403 que sortear. Un desconocido
   *   borrando el catálogo dejaría la demo vacía media hora.
   * - **Los tableros sí se mueven.** Es la demo, no un folleto. Lo único que se
   *   quita son los destinos que la degradan y que nadie puede deshacer hasta
   *   el próximo resembrado: "cancelado" en pedidos y "perdido" en el embudo.
   *
   * Aprobar decisiones también se conserva: es la experiencia central del
   * producto, y el canal `demo` no le manda nada a nadie.
   */
  esDemo?: boolean;
}) {
  const { base, negocioDe, conSelector } = opciones;
  const esDemo = opciones.esDemo ?? false;
  /**
   * Resuelve el negocio de la petición. En /panel el dueño puede tener varios
   * negocios (multi-bot) y elige con ?negocio=; en /demo el negocio es fijo —
   * un visitante no puede pivotear hacia los datos reales.
   */
  async function datosPanel(c: Context<{ Bindings: Env }>) {
    const negocioId = negocioDe(c);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return null;

    const consulta =
      conSelector && negocioId !== c.env.NEGOCIO_TELEGRAM ? `?negocio=${negocioId}` : "";

    const selector = conSelector
      ? (await listarNegocios(c.env.DB)).map((n) => ({
          url: `${base}/inicio${n.id === c.env.NEGOCIO_TELEGRAM ? "" : `?negocio=${n.id}`}`,
          nombre: n.nombre,
          actual: n.id === negocioId,
        }))
      : [];

    return { negocioId, negocio, consulta, selector };
  }

  /** La consulta que conserva el negocio elegido en los redirects de los POST. */
  function consultaDe(c: Context<{ Bindings: Env }>, negocioId: string): string {
    return conSelector && negocioId !== c.env.NEGOCIO_TELEGRAM ? `?negocio=${negocioId}` : "";
  }

  app.get(`${base}`, (c) => c.redirect(`${base}/inicio`));

  app.get(`${base}/inicio`, async (c) => {
    const d = await datosPanel(c);
    if (!d) {
      /**
       * Instalación recién hecha: el esquema está aplicado pero no hay ni un
       * negocio. `NEGOCIO_TELEGRAM` sigue apuntando al nombre que viaja en la
       * configuración, así que sin esto la primera pantalla que ve alguien que
       * acaba de instalar es un 404, justo después de que el instalador le dijo
       * que entrara a crear su asistente. Se lo damos.
       *
       * El 404 se conserva para el otro caso, que es distinto: sí hay negocios
       * pero el `?negocio=` que pidió no existe.
       */
      if (!esDemo && (await listarNegocios(c.env.DB)).length === 0) {
        return c.redirect("/panel/comenzar", 302);
      }
      return c.text("Negocio no configurado", 404);
    }

    const [metricas, pedidos] = await Promise.all([
      calcularMetricas(c.env.DB, d.negocioId, d.negocio.zonaHoraria),
      listarPedidos(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Inicio",
        negocio: d.negocio.nombre,
        activo: "inicio",
        pendientes: metricas.decisionesPendientes,
        contenido: vistaMetricas(metricas, pedidos, hoyEnZona(d.negocio.zonaHoraria)),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  app.get(`${base}/clientes`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const [contactos, leads, pendientes] = await Promise.all([
      listarContactos(c.env.DB, d.negocioId),
      listarLeads(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Clientes",
        negocio: d.negocio.nombre,
        activo: "clientes",
        pendientes,
        contenido: vistaClientes(contactos, leads, `${base}/clientes/mover${d.consulta}`, esDemo),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  app.get(`${base}/conocimiento`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const [items, faqs, pendientes, agendaUrl] = await Promise.all([
      listarCatalogo(c.env.DB, d.negocioId),
      listarFaq(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
      leerSetting(c.env.DB, d.negocioId, CLAVE_AGENDA),
    ]);

    return c.html(
      pagina({
        titulo: "Conocimiento",
        negocio: d.negocio.nombre,
        activo: "conocimiento",
        pendientes,
        contenido: vistaConocimiento(items, faqs, base, d.consulta, esDemo, agendaUrl),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  /**
   * Mover un lead en el embudo.
   *
   * La transición la valida `avanzarLead` en el núcleo, no esta ruta: qué
   * movimiento es legal vive en `core/crm/embudo.ts`, que es puro y probado.
   * Aquí solo se lee, se pide el movimiento y se guarda lo que salga.
   *
   * Se registra también en la demo, por el mismo motivo que la de pedidos.
   */
  app.post(`${base}/clientes/mover`, async (c) => {
    const negocioId = negocioDe(c);
    const f = await c.req.formData();

    const id = String(f.get("id") ?? "");
    const hacia = String(f.get("hacia") ?? "");
    if (!id || !(ESTADOS_LEAD as readonly string[]).includes(hacia)) {
      return c.text("Petición inválida", 400);
    }

    // El equivalente de "cancelado" en el embudo: el único destino que empeora
    // el tablero de la demo sin que nadie pueda devolverlo.
    if (esDemo && hacia === "perdido") {
      return c.text("En la demo no se pierden clientes", 403);
    }

    const lead = await obtenerLead(c.env.DB, negocioId, id);
    if (!lead) return c.text("Ese cliente ya no existe", 404);

    const movido = avanzarLead(lead, hacia as EstadoLead, ahoraISO());
    if (!movido.ok) return c.text(movido.error, 409);

    await guardarLead(c.env.DB, movido.valor);
    await auditar(c.env.DB, negocioId, "lead_movido", { hacia }, "admin");

    return c.redirect(`${base}/clientes${consultaDe(c, negocioId)}`, 303);
  });

  if (!esDemo) {
  app.post(`${base}/conocimiento/catalogo/guardar`, async (c) => {
    const negocioId = negocioDe(c);
    const f = await c.req.formData();

    const nombre = String(f.get("nombre") ?? "").trim();
    if (!nombre) return c.text("Falta el nombre del producto", 400);

    await guardarItemCatalogo(c.env.DB, {
      id: String(f.get("id") ?? "").trim() || null,
      negocioId,
      nombre,
      descripcion: String(f.get("descripcion") ?? "").trim() || null,
      precioCentavos: precioFormulario(String(f.get("precio") ?? "")),
      diasEntrega: enteroFormulario(String(f.get("dias") ?? "")),
    });

    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

  app.post(`${base}/conocimiento/catalogo/borrar`, async (c) => {
    const negocioId = negocioDe(c);
    const id = String((await c.req.formData()).get("id") ?? "");

    if (id) {
      // La foto se va con el producto. Si no, queda un objeto en KV que ya no
      // referencia nadie y que nadie va a salir a buscar nunca.
      const item = await obtenerItemCatalogo(c.env.DB, negocioId, id);
      if (item?.imagenClave) await borrarImagen(c.env, item.imagenClave);
      await borrarItemCatalogo(c.env.DB, negocioId, id);
    }

    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

  /**
   * La foto de un producto.
   *
   * El navegador ya la manda recortada, redimensionada y comprimida: aquí solo
   * se valida y se guarda. Validar igual, aunque el guion del panel ya lo haya
   * hecho, porque un POST se puede armar a mano y el tamaño y el tipo son la
   * única defensa contra alguien subiendo un video de 2 GB.
   */
  app.post(`${base}/conocimiento/catalogo/imagen`, async (c) => {
    const negocioId = negocioDe(c);
    const f = await c.req.formData();

    const id = String(f.get("id") ?? "").trim();
    if (!id) return c.text("Falta el producto", 400);

    const item = await obtenerItemCatalogo(c.env.DB, negocioId, id);
    if (!item) return c.text("Ese producto ya no existe", 404);

    const anterior = item.imagenClave;

    // Sin archivo: es el botón de quitar la foto.
    const archivo = f.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      await fijarImagenCatalogo(c.env.DB, negocioId, id, null);
      if (anterior) await borrarImagen(c.env, anterior);
      return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
    }

    if (!tipoAceptado(archivo.type)) return c.text("Eso no es una imagen", 415);
    if (archivo.size > MAXIMO_BYTES) return c.text("La imagen pesa demasiado", 413);

    // La versión va en la llave para que reemplazar la foto no obligue a
    // esperar a que expire la caché del navegador con la vieja.
    const clave = claveImagen(negocioId, id, Date.now());
    await guardarImagen(c.env, clave, await archivo.arrayBuffer(), archivo.type);
    await fijarImagenCatalogo(c.env.DB, negocioId, id, clave);

    // Solo después de que la nueva quedó apuntada. Al revés, un fallo entre
    // medias dejaría al producto sin foto y con la vieja ya borrada.
    if (anterior) await borrarImagen(c.env, anterior);

    await auditar(c.env.DB, negocioId, "imagen_cargada", { itemId: id }, "admin");

    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

  app.post(`${base}/conocimiento/faq/guardar`, async (c) => {
    const negocioId = negocioDe(c);
    const f = await c.req.formData();

    const pregunta = String(f.get("pregunta") ?? "").trim();
    const respuesta = String(f.get("respuesta") ?? "").trim();
    if (!pregunta || !respuesta) return c.text("Faltan la pregunta o la respuesta", 400);

    await guardarFaq(c.env.DB, {
      id: String(f.get("id") ?? "").trim() || null,
      negocioId,
      pregunta,
      respuesta,
    });

    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

  /**
   * El link de agenda del negocio.
   *
   * Vacío significa quitarlo, y por eso no se valida ese caso: es el botón de
   * "Quitar", no un error del dueño.
   */
  app.post(`${base}/conocimiento/agenda`, async (c) => {
    const negocioId = negocioDe(c);
    const crudo = String((await c.req.formData()).get("url") ?? "").trim();

    if (crudo === "") {
      await escribirSetting(c.env.DB, negocioId, CLAVE_AGENDA, "");
      return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
    }

    const url = normalizarUrlAgenda(crudo);
    if (!url.ok) return c.text(url.error, 400);

    await escribirSetting(c.env.DB, negocioId, CLAVE_AGENDA, url.valor);
    await auditar(c.env.DB, negocioId, "agenda_actualizada", {}, "admin");

    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

  app.post(`${base}/conocimiento/faq/borrar`, async (c) => {
    const negocioId = negocioDe(c);
    const id = String((await c.req.formData()).get("id") ?? "");
    if (id) await borrarFaq(c.env.DB, negocioId, id);
    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });
  }

  app.get(`${base}/bandeja`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const propuestas = await listarPendientes(c.env.DB, d.negocioId);

    return c.html(
      pagina({
        titulo: "Decisiones",
        negocio: d.negocio.nombre,
        activo: "bandeja",
        pendientes: propuestas.length,
        contenido: vistaBandeja(propuestas, `${base}/decidir${d.consulta}`),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  app.get(`${base}/pedidos`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const [pedidos, pendientes] = await Promise.all([
      listarPedidos(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Pedidos",
        negocio: d.negocio.nombre,
        activo: "pedidos",
        pendientes,
        contenido: vistaPedidos(
          pedidos,
          hoyEnZona(d.negocio.zonaHoraria),
          `${base}/pedidos/mover${d.consulta}`,
          esDemo,
        ),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  /**
   * Avanzar un pedido por su máquina de estados.
   *
   * Esta ruta SÍ se registra en la demo, al revés que las de conocimiento, y es
   * a propósito: la diferencia entre enseñar un tablero y dejar usarlo. Lo que
   * un desconocido puede romper está acotado por tres lados. `transicionar()`
   * rechaza cualquier salto que no esté en su tabla, la demo solo alcanza a
   * `demo-optica`, y el resembrado repone ese negocio cada media hora.
   *
   * Quién decide qué movimiento es legal sigue siendo el núcleo, no esta ruta.
   */
  app.post(`${base}/pedidos/mover`, async (c) => {
    const negocioId = negocioDe(c);
    const f = await c.req.formData();

    const id = String(f.get("id") ?? "");
    const hacia = String(f.get("hacia") ?? "");
    if (!id || !(ESTADOS_PEDIDO as readonly string[]).includes(hacia)) {
      return c.text("Petición inválida", 400);
    }

    // Cancelar es el único movimiento que deja el tablero peor de lo que estaba,
    // y en la demo no hay quien lo devuelva hasta el siguiente resembrado. Se
    // rechaza aquí y no solo en la vista: un POST se arma a mano.
    if (esDemo && hacia === "cancelado") {
      return c.text("En la demo no se cancelan pedidos", 403);
    }

    const pedido = await obtenerPedido(c.env.DB, negocioId, id);
    if (!pedido) return c.text("Ese pedido ya no existe", 404);

    const movido = transicionar(pedido, hacia as EstadoPedido, ahoraISO());
    if (!movido.ok) return c.text(movido.error, 409);

    await guardarPedido(c.env.DB, movido.valor);
    await auditar(c.env.DB, negocioId, "pedido_movido", { hacia }, "admin");

    return c.redirect(`${base}/pedidos${consultaDe(c, negocioId)}`, 303);
  });

  app.get(`${base}/registro`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const [entradas, pendientes] = await Promise.all([
      listarAuditoria(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Registro",
        negocio: d.negocio.nombre,
        activo: "registro",
        pendientes,
        contenido: vistaRegistro(entradas),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  app.post(`${base}/decidir`, async (c) => {
    const negocioId = negocioDe(c);
    const formulario = await c.req.formData();

    const id = String(formulario.get("id") ?? "");
    const decision = String(formulario.get("decision") ?? "");
    if (!id || (decision !== "aprobar" && decision !== "rechazar")) {
      return c.text("Petición inválida", 400);
    }

    const texto = formulario.get("texto");
    const fecha = formulario.get("fecha");

    await decidirPropuesta(
      c.env,
      negocioId,
      id,
      decision,
      {
        ...(typeof texto === "string" ? { texto } : {}),
        ...(typeof fecha === "string" ? { fecha } : {}),
      },
      // Una casilla sin marcar no viaja en el formulario: su ausencia ES el no.
      formulario.get("aprender") === "si",
    );

    // Redirección después del POST: recargar la página no repite la decisión.
    return c.redirect(`${base}/bandeja${consultaDe(c, negocioId)}`, 303);
  });
}

// ────────────────────────────────────────────────────────────────  sesión ──

const COOKIE_SESION = "chuno_sesion";

/** Segundos epoch. El núcleo no tiene reloj propio; se lo damos aquí. */
function ahoraEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function leerCookie(c: Context<{ Bindings: Env }>, nombre: string): string | null {
  const crudo = c.req.header("cookie");
  if (!crudo) return null;

  for (const parte of crudo.split(";")) {
    const [k, ...resto] = parte.trim().split("=");
    if (k === nombre) return resto.join("=");
  }

  return null;
}

/**
 * A dónde mandar al dueño después de entrar.
 *
 * Se valida contra el prefijo `/panel/` porque sale de la URL: un parámetro de
 * redirección sin validar es un redirect abierto, y desde una landing pública
 * eso es un regalo para quien quiera montar una página de phishing encima.
 */
function destinoSeguro(crudo: string | undefined): string {
  return crudo && crudo.startsWith("/panel/") && !crudo.startsWith("//")
    ? crudo
    : "/panel/inicio";
}

async function haySesion(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const token = leerCookie(c, COOKIE_SESION);
  if (!token) return false;

  return verificarSesion(token, c.env.CLAVE_CIFRADO, c.env.PANEL_PASSWORD, ahoraEpoch());
}

/**
 * El panel acepta dos formas de identificarse, y el orden importa:
 *
 * 1. La cookie de sesión, que es lo que deja el formulario de `/entrar`.
 * 2. Basic Auth, si viene la cabecera. **No se puede quitar:** lo usan el CLI y
 *    los `curl -u admin:$PASS` de `docs/ESTADO.md`.
 *
 * Sin ninguna de las dos no se responde 401 —que dispararía el diálogo feo del
 * navegador— sino que se manda a la pantalla de entrada.
 */
app.use("/panel/*", async (c, next) => {
  if (await haySesion(c)) return next();

  if (c.req.header("authorization")) {
    return basicAuth({ username: "admin", password: c.env.PANEL_PASSWORD })(c, next);
  }

  return c.redirect(`/entrar?destino=${encodeURIComponent(new URL(c.req.url).pathname)}`, 302);
});

app.get("/entrar", async (c) => {
  if (await haySesion(c)) return c.redirect(destinoSeguro(c.req.query("destino")), 302);
  return c.html(vistaEntrar({ destino: destinoSeguro(c.req.query("destino")) }));
});

app.post("/entrar", async (c) => {
  const formulario = await c.req.formData();
  const destino = destinoSeguro(String(formulario.get("destino") ?? ""));

  if (String(formulario.get("clave") ?? "") !== c.env.PANEL_PASSWORD) {
    // Mensaje genérico a propósito: no confirma ni desmiente nada.
    return c.html(vistaEntrar({ destino, error: "Esa contraseña no es." }), 401);
  }

  const token = await firmarSesion(
    c.env.CLAVE_CIFRADO,
    c.env.PANEL_PASSWORD,
    ahoraEpoch() + DURACION_SESION_SEGUNDOS,
  );

  // SameSite=Lax es lo que impide que una página ajena haga un POST a
  // /panel/decidir desde el navegador del dueño y le mande un mensaje a un
  // cliente. Con autenticación por cookie no es un adorno: es la defensa CSRF.
  c.header(
    "set-cookie",
    `${COOKIE_SESION}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DURACION_SESION_SEGUNDOS}`,
  );

  return c.redirect(destino, 303);
});

app.post("/salir", (c) => {
  c.header("set-cookie", `${COOKIE_SESION}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return c.redirect("/", 303);
});

montarPanel({
  base: "/panel",
  negocioDe: (c) => c.req.query("negocio") ?? c.env.NEGOCIO_TELEGRAM,
  conSelector: true,
});

montarPanel({
  base: "/demo",
  negocioDe: (c) => c.env.NEGOCIO_DEMO,
  conSelector: false,
  esDemo: true,
});

// ─────────────────────────────────────────────────────────────  onboarding  ──
// La entrevista vive SOLO en /panel (Basic Auth): crear negocios es del dueño
// de la instancia. La demo tiene su replay determinista en /demo/comenzar.

function paginaEntrevista(contenido: string): string {
  return pagina({
    titulo: "Nuevo asistente",
    negocio: "entrevista",
    activo: "comenzar",
    pendientes: 0,
    contenido,
    base: "/panel",
  });
}

app.get("/panel/comenzar", (c) =>
  c.html(paginaEntrevista(vistaEntrevista({ estado: estadoInicial(), accion: "/panel/comenzar" }))),
);

// La primera respuesta (el nombre) CREA el negocio: así la entrevista nace ya
// con su negocio_id y no hay estado sin dueño en ninguna tabla.
app.post("/panel/comenzar", async (c) => {
  const texto = String((await c.req.formData()).get("texto") ?? "");

  const r = interpretar("nombre", texto);
  if (!r.ok || r.valor.paso !== "nombre") {
    const error = r.ok ? "Petición inválida" : r.error;
    return c.html(
      paginaEntrevista(vistaEntrevista({ estado: estadoInicial(), accion: "/panel/comenzar", error })),
    );
  }

  const avance = aplicarRespuesta(estadoInicial(), r.valor);
  if (!avance.ok) return c.text(avance.error, 400);

  const negocioId = nuevoId("neg");
  await crearNegocio(c.env.DB, {
    id: negocioId,
    nombre: r.valor.nombre,
    giro: "por-encargo",
    zonaHoraria: "America/Bogota",
  });
  await crearEntrevista(c.env.DB, negocioId, avance.valor);

  return c.redirect(`/panel/comenzar/${negocioId}`, 303);
});

app.get("/panel/comenzar/:negocioId", async (c) => {
  const negocioId = c.req.param("negocioId");
  const estado = await leerEntrevista(c.env.DB, negocioId);
  if (!estado) return c.text("Entrevista no encontrada", 404);

  return c.html(paginaEntrevista(vistaEntrevista({ estado, accion: `/panel/comenzar/${negocioId}` })));
});

app.post("/panel/comenzar/:negocioId", async (c) => {
  const negocioId = c.req.param("negocioId");
  const estado = await leerEntrevista(c.env.DB, negocioId);
  if (!estado) return c.text("Entrevista no encontrada", 404);

  const f = await c.req.formData();
  const accion = `/panel/comenzar/${negocioId}`;

  if (esFinal(estado)) {
    if (String(f.get("confirmar")) !== "si") return c.redirect(accion, 303);

    const config = armarConfiguracion(estado.datos);
    if (!config.ok) return c.text(config.error, 400);

    await materializarConfiguracion(c.env, new URL(c.req.url).origin, negocioId, config.valor);
    await borrarEntrevista(c.env.DB, negocioId);

    return c.redirect(`/panel/inicio?negocio=${negocioId}`, 303);
  }

  const texto = String(f.get("texto") ?? "");
  let r = interpretar(estado.paso, texto);

  // Fallback probabilístico SOLO para catálogo y FAQ, y solo si el parser
  // determinista no pudo. La salida del modelo ya viene validada contra Zod.
  if (!r.ok && (estado.paso === "catalogo" || estado.paso === "faq")) {
    const llm = crearProveedorGemini(c.env.GEMINI_API_KEY, modelos(c.env));
    r = await estructurarConLLM(llm, estado.paso, texto);
  }

  if (!r.ok) {
    return c.html(paginaEntrevista(vistaEntrevista({ estado, accion, error: r.error })));
  }

  const avance = aplicarRespuesta(estado, r.valor);
  if (!avance.ok) return c.text(avance.error, 400);

  await guardarEntrevista(c.env.DB, negocioId, avance.valor);
  return c.redirect(accion, 303);
});

app.get("/demo/comenzar", (c) =>
  c.html(
    pagina({
      titulo: "Nuevo asistente",
      negocio: "Floristería La Orquídea (ejemplo)",
      activo: "comenzar",
      pendientes: 0,
      contenido: vistaEntrevistaDemo(),
      base: "/demo",
    }),
  ),
);

// ───────────────────────────────────────────────────────────────  Telegram  ──

/**
 * Lo que pasa cuando llega un mensaje, sea del bot global o de un bot por
 * negocio: normalizar, guardar y despertar al Durable Object. La autenticación
 * ya ocurrió — cada ruta valida SU secreto antes de llamar aquí.
 */
async function atenderTelegram(
  c: Context<{ Bindings: Env }>,
  negocioId: string,
  botToken: string,
): Promise<Response> {
  const canal = crearCanalTelegram(botToken);
  const entrante = canal.interpretar(await c.req.json());

  // Siempre 200: un error nuestro no debe hacer que Telegram reintente en bucle.
  if (!entrante) return c.text("ok");

  const conversacion = await obtenerOCrearConversacion(
    c.env.DB,
    negocioId,
    entrante.canal,
    entrante.canalChatId,
    entrante.autorNombre,
  );

  // El mensaje se guarda de inmediato: si el agente falla después, el hilo del
  // cliente no se pierde.
  await guardarMensaje(c.env.DB, negocioId, conversacion.id, "cliente", entrante.texto);

  const agente = idDeConversacion(c.env.AGENTE, negocioId, conversacion.id);
  await agente.fetch("https://agente/mensaje", {
    method: "POST",
    body: JSON.stringify({
      negocioId,
      conversacionId: conversacion.id,
      canalChatId: entrante.canalChatId,
    }),
  });

  return c.text("ok");
}

app.post("/webhook/telegram", async (c) => {
  // Primero la autenticidad, antes de leer o escribir nada. La URL del Worker es
  // pública; sin este chequeo cualquiera inyecta mensajes falsos.
  if (!webhookAutentico(c.req.raw, c.env.TELEGRAM_WEBHOOK_SECRET)) {
    return c.text("no autorizado", 401);
  }

  return atenderTelegram(c, c.env.NEGOCIO_TELEGRAM, c.env.TELEGRAM_BOT_TOKEN);
});

// Multi-bot: los negocios creados por el onboarding reciben aquí, cada uno con
// SU secreto. El negocioId de la URL no autentica nada — el secreto sí.
app.post("/webhook/telegram/:negocioId", async (c) => {
  const negocioId = c.req.param("negocioId");

  const secreto = await leerCredencial(
    c.env.DB,
    negocioId,
    "telegram_webhook_secret",
    c.env.CLAVE_CIFRADO,
  );
  if (!secreto || !webhookAutentico(c.req.raw, secreto)) {
    return c.text("no autorizado", 401);
  }

  const token = await leerCredencial(c.env.DB, negocioId, "telegram_token", c.env.CLAVE_CIFRADO);
  if (!token) return c.text("ok");

  return atenderTelegram(c, negocioId, token);
});

/** Le dice a Telegram a dónde mandar los mensajes. Se corre una sola vez. */
app.get("/panel/conectar-telegram", async (c) => {
  const url = new URL(c.req.url);
  const destino = `${url.origin}/webhook/telegram`;

  const r = await registrarWebhook(
    c.env.TELEGRAM_BOT_TOKEN,
    destino,
    c.env.TELEGRAM_WEBHOOK_SECRET,
  );

  return c.text(
    r.ok ? `Listo. Telegram enviará los mensajes a ${destino}` : `Falló: ${r.error}`,
    r.ok ? 200 : 502,
  );
});

/**
 * Lo que no atendió ninguna ruta lo intentan los archivos estáticos.
 *
 * Explícito y no implícito: con `main` y `assets` declarados a la vez, quién
 * responde primero lo decide la plataforma, y en el primer despliegue con
 * assets la imagen del hero devolvió 404 aunque wrangler la había subido. Un
 * orden que no controlamos no es una garantía.
 */
app.notFound(async (c) => {
  if (c.env.ASSETS) {
    const estatico = await c.env.ASSETS.fetch(c.req.raw);
    if (estatico.status !== 404) return estatico;
  }

  return c.text("No encontrado", 404);
});

// ──────────────────────────────────────────────────────────────────  worker  ──

export default {
  fetch: app.fetch,

  async scheduled(evento: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // La purga solo de madrugada; el vigía en cada disparo, porque revisa
    // promesas contra el día de hoy y tiene que correr durante el día.
    const esMadrugada = new Date(evento.scheduledTime).getUTCHours() === 7;

    ctx.waitUntil(
      (async () => {
        // El resembrado va ANTES del vigía, y no al revés: así el vigía evalúa
        // pedidos frescos, y sus claves de dedupe chocan con las propuestas que
        // el resembrado acaba de dejar en vez de duplicarlas.
        if (env.NEGOCIO_DEMO) {
          try {
            const demo = await resembrarDemo(env.DB);
            console.log("demo resembrada", demo);
          } catch (e) {
            // La demo es importante, pero no tanto como para que su fallo se
            // lleve por delante al vigía, que es quien cuida promesas reales.
            console.error("resembrado falló", e instanceof Error ? e.message : "desconocido");
          }
        }

        const resumen = await correrVigia(env.DB);
        console.log("vigía", resumen);

        if (esMadrugada) {
          const borrados = await purgarMensajesViejos(env.DB, numero(env.RETENCION_DIAS, 90));
          console.log("purga", { borrados });
        }
      })(),
    );
  },
};
