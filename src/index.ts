import { Hono, type Context } from "hono";
import { basicAuth } from "hono/basic-auth";

import { hoyEnZona, nuevoId } from "./db/id";
import { modelos, numero, type Env } from "./env";
import { AgenteConversacion, idDeConversacion } from "./agente/agente";
import { correrVigia } from "./crons/vigia";
import { decidirPropuesta } from "./admin/aplicar";
import { pagina } from "./admin/html";
import { vistaBandeja, vistaPedidos, vistaRegistro } from "./admin/vistas";
import { landing } from "./publico/landing";
import { crearCanalTelegram, registrarWebhook, webhookAutentico } from "./canales/telegram";
import { crearNegocio, listarNegocios, obtenerNegocio } from "./db/repos/negocio";
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
import { listarPedidos } from "./db/repos/pedido";
import { contarPendientes, listarPendientes } from "./db/repos/propuesta";
import { listarAuditoria, purgarMensajesViejos } from "./db/repos/varios";
import { listarContactos, listarLeads } from "./db/repos/crm";
import { borrarFaq, borrarItemCatalogo, guardarFaq, guardarItemCatalogo, listarCatalogo, listarFaq } from "./db/repos/catalogo";
import { vistaConocimiento } from "./admin/vistas-conocimiento";
import { calcularMetricas } from "./db/repos/metricas";
import { vistaMetricas } from "./admin/vistas-metricas";
import { vistaClientes } from "./admin/vistas-clientes";

export { AgenteConversacion };

const app = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────────────────────────  público ──

app.get("/", (c) => c.html(landing()));

app.get("/salud", (c) => c.json({ ok: true, servicio: "chuno" }));

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

function montarPanel(
  base: string,
  negocioDe: (c: Context<{ Bindings: Env }>) => string,
  conSelector: boolean,
) {
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
    if (!d) return c.text("Negocio no configurado", 404);

    const metricas = await calcularMetricas(c.env.DB, d.negocioId, d.negocio.zonaHoraria);

    return c.html(
      pagina({
        titulo: "Inicio",
        negocio: d.negocio.nombre,
        activo: "inicio",
        pendientes: metricas.decisionesPendientes,
        contenido: vistaMetricas(metricas),
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
        contenido: vistaClientes(contactos, leads),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

  app.get(`${base}/conocimiento`, async (c) => {
    const d = await datosPanel(c);
    if (!d) return c.text("Negocio no configurado", 404);

    const [items, faqs, pendientes] = await Promise.all([
      listarCatalogo(c.env.DB, d.negocioId),
      listarFaq(c.env.DB, d.negocioId),
      contarPendientes(c.env.DB, d.negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Conocimiento",
        negocio: d.negocio.nombre,
        activo: "conocimiento",
        pendientes,
        contenido: vistaConocimiento(items, faqs, base, d.consulta),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
  });

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
    if (id) await borrarItemCatalogo(c.env.DB, negocioId, id);
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

  app.post(`${base}/conocimiento/faq/borrar`, async (c) => {
    const negocioId = negocioDe(c);
    const id = String((await c.req.formData()).get("id") ?? "");
    if (id) await borrarFaq(c.env.DB, negocioId, id);
    return c.redirect(`${base}/conocimiento${consultaDe(c, negocioId)}`, 303);
  });

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
        contenido: vistaPedidos(pedidos, hoyEnZona(d.negocio.zonaHoraria)),
        base,
        consulta: d.consulta,
        selector: d.selector,
      }),
    );
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

    await decidirPropuesta(c.env, negocioId, id, decision, {
      ...(typeof texto === "string" ? { texto } : {}),
      ...(typeof fecha === "string" ? { fecha } : {}),
    });

    // Redirección después del POST: recargar la página no repite la decisión.
    return c.redirect(`${base}/bandeja${consultaDe(c, negocioId)}`, 303);
  });
}

// El panel real va detrás de contraseña. El usuario es siempre "admin".
app.use("/panel/*", async (c, next) =>
  basicAuth({ username: "admin", password: c.env.PANEL_PASSWORD })(c, next),
);

montarPanel("/panel", (c) => c.req.query("negocio") ?? c.env.NEGOCIO_TELEGRAM, true);
montarPanel("/demo", (c) => c.env.NEGOCIO_DEMO, false);

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

// ──────────────────────────────────────────────────────────────────  worker  ──

export default {
  fetch: app.fetch,

  async scheduled(evento: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // La purga solo de madrugada; el vigía en cada disparo, porque revisa
    // promesas contra el día de hoy y tiene que correr durante el día.
    const esMadrugada = new Date(evento.scheduledTime).getUTCHours() === 7;

    ctx.waitUntil(
      (async () => {
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
