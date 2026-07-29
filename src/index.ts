import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";

import { hoyEnZona } from "./db/id";
import { numero, type Env } from "./env";
import { AgenteConversacion, idDeConversacion } from "./agente/agente";
import { correrVigia } from "./crons/vigia";
import { decidirPropuesta } from "./admin/aplicar";
import { pagina } from "./admin/html";
import { vistaBandeja, vistaPedidos, vistaRegistro } from "./admin/vistas";
import { landing } from "./publico/landing";
import { crearCanalTelegram, registrarWebhook, webhookAutentico } from "./canales/telegram";
import { obtenerNegocio } from "./db/repos/negocio";
import { guardarMensaje, obtenerOCrearConversacion } from "./db/repos/conversacion";
import { listarPedidos } from "./db/repos/pedido";
import { contarPendientes, listarPendientes } from "./db/repos/propuesta";
import { listarAuditoria, purgarMensajesViejos } from "./db/repos/varios";
import { listarContactos, listarLeads } from "./db/repos/crm";
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
function montarPanel(base: string, negocioDe: (env: Env) => string) {
  app.get(`${base}`, (c) => c.redirect(`${base}/inicio`));

  app.get(`${base}/inicio`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const metricas = await calcularMetricas(c.env.DB, negocioId, negocio.zonaHoraria);

    return c.html(
      pagina({
        titulo: "Inicio",
        negocio: negocio.nombre,
        activo: "inicio",
        pendientes: metricas.decisionesPendientes,
        contenido: vistaMetricas(metricas),
        base,
      }),
    );
  });

  app.get(`${base}/clientes`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const [contactos, leads, pendientes] = await Promise.all([
      listarContactos(c.env.DB, negocioId),
      listarLeads(c.env.DB, negocioId),
      contarPendientes(c.env.DB, negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Clientes",
        negocio: negocio.nombre,
        activo: "clientes",
        pendientes,
        contenido: vistaClientes(contactos, leads),
        base,
      }),
    );
  });

  app.get(`${base}/bandeja`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const propuestas = await listarPendientes(c.env.DB, negocioId);

    return c.html(
      pagina({
        titulo: "Decisiones",
        negocio: negocio.nombre,
        activo: "bandeja",
        pendientes: propuestas.length,
        contenido: vistaBandeja(propuestas, base),
        base,
      }),
    );
  });

  app.get(`${base}/pedidos`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const [pedidos, pendientes] = await Promise.all([
      listarPedidos(c.env.DB, negocioId),
      contarPendientes(c.env.DB, negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Pedidos",
        negocio: negocio.nombre,
        activo: "pedidos",
        pendientes,
        contenido: vistaPedidos(pedidos, hoyEnZona(negocio.zonaHoraria)),
        base,
      }),
    );
  });

  app.get(`${base}/registro`, async (c) => {
    const negocioId = negocioDe(c.env);
    const negocio = await obtenerNegocio(c.env.DB, negocioId);
    if (!negocio) return c.text("Negocio no configurado", 404);

    const [entradas, pendientes] = await Promise.all([
      listarAuditoria(c.env.DB, negocioId),
      contarPendientes(c.env.DB, negocioId),
    ]);

    return c.html(
      pagina({
        titulo: "Registro",
        negocio: negocio.nombre,
        activo: "registro",
        pendientes,
        contenido: vistaRegistro(entradas),
        base,
      }),
    );
  });

  app.post(`${base}/decidir`, async (c) => {
    const negocioId = negocioDe(c.env);
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
    return c.redirect(`${base}/bandeja`, 303);
  });
}

// El panel real va detrás de contraseña. El usuario es siempre "admin".
app.use("/panel/*", async (c, next) =>
  basicAuth({ username: "admin", password: c.env.PANEL_PASSWORD })(c, next),
);

montarPanel("/panel", (env) => env.NEGOCIO_TELEGRAM);
montarPanel("/demo", (env) => env.NEGOCIO_DEMO);

// ───────────────────────────────────────────────────────────────  Telegram  ──

app.post("/webhook/telegram", async (c) => {
  // Primero la autenticidad, antes de leer o escribir nada. La URL del Worker es
  // pública; sin este chequeo cualquiera inyecta mensajes falsos.
  if (!webhookAutentico(c.req.raw, c.env.TELEGRAM_WEBHOOK_SECRET)) {
    return c.text("no autorizado", 401);
  }

  const canal = crearCanalTelegram(c.env.TELEGRAM_BOT_TOKEN);
  const entrante = canal.interpretar(await c.req.json());

  // Siempre 200: un error nuestro no debe hacer que Telegram reintente en bucle.
  if (!entrante) return c.text("ok");

  const negocioId = c.env.NEGOCIO_TELEGRAM;

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
