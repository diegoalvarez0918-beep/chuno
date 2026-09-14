#!/usr/bin/env node
/**
 * `npx chuno-cli init` — instala CHUNO en la nube del propio negocio.
 *
 * Qué hace y qué no: orquesta `wrangler`, que es la herramienta oficial de
 * Cloudflare. No reimplementa su autenticación ni guarda credenciales propias.
 * Si `wrangler whoami` responde, este instalador funciona; si no, te manda a
 * `wrangler login` y se detiene.
 *
 * Los secretos NUNCA pasan por argumentos de línea de comandos —que quedan en
 * el historial del shell y en la lista de procesos— sino por la entrada
 * estándar de `wrangler secret put`. Y no se escriben en ningún archivo del
 * repositorio.
 */

import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { cifrarValor } from "./cifrado.mjs";
import {
  comprobarHandshake,
  PRODUCTOS_META,
  sqlGuardarAjuste,
  sqlGuardarCredencial,
  sqlGuardarMeta,
  urlWebhookMeta,
  validarAppMeta,
  validarMeta,
} from "./meta.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────────  consola ──
// Los colores de marca de Voz, hasta donde llega una terminal.
const c = {
  lima: (t) => `\x1b[38;2;210;255;0m${t}\x1b[0m`,
  rojo: (t) => `\x1b[38;2;224;41;0m${t}\x1b[0m`,
  suave: (t) => `\x1b[2m${t}\x1b[0m`,
  fuerte: (t) => `\x1b[1m${t}\x1b[0m`,
};

const log = (t = "") => console.log(t);
const paso = (n, total, t) => log(`\n${c.lima(`[${n}/${total}]`)} ${c.fuerte(t)}`);
const ok = (t) => log(`      ${c.lima("✓")} ${t}`);
const aviso = (t) => log(`      ${c.suave("·")} ${c.suave(t)}`);

function morir(mensaje, comoArreglarlo) {
  log(`\n${c.rojo("✗")} ${mensaje}`);
  if (comoArreglarlo) log(`\n  ${comoArreglarlo}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────  entrada ──

function preguntar(texto, { oculto = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  return new Promise((resolver) => {
    if (!oculto) {
      rl.question(texto, (r) => {
        rl.close();
        resolver(r.trim());
      });
      return;
    }

    // Entrada oculta: se escribe el prompt a mano y se silencia el eco, para
    // que un token de bot no quede a la vista de quien pase por detrás.
    process.stdout.write(texto);
    const alEscribir = rl._writeToOutput;
    rl._writeToOutput = () => {};
    rl.question("", (r) => {
      rl._writeToOutput = alEscribir;
      rl.close();
      process.stdout.write("\n");
      resolver(r.trim());
    });
  });
}

// ────────────────────────────────────────────────────────────────  procesos ──

/** Corre un comando y devuelve su salida. No imprime nada por sí solo. */
function correr(cmd, args, { entrada } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: RAIZ,
    encoding: "utf8",
    input: entrada,
    stdio: entrada === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** Corre mostrando la salida en vivo. Para el despliegue, que tarda. */
function correrVisible(cmd, args) {
  return new Promise((resolver) => {
    const p = spawn(cmd, args, { cwd: RAIZ, stdio: "inherit" });
    p.on("close", (codigo) => resolver(codigo === 0));
  });
}

// ───────────────────────────────────────────────────────────────────  pasos ──

const TOTAL = 8;

/**
 * ¿Corremos desde una copia del repositorio, o desde un paquete que `npx` acaba
 * de descargar?
 *
 * El paquete publicado viaja con el `wrangler.jsonc` de este repositorio, ids
 * incluidos. Sin esta distinción, `yaInstalado()` vería ese `database_id` y le
 * diría a cada usuario nuevo que su copia "ya está instalada", exigiéndole
 * escribir "instalar de nuevo" la primera vez que corre el comando. Un paquete
 * recién bajado no puede ser la instalación viva de nadie.
 */
function esPaqueteDescargado() {
  return /[\\/](?:_npx|node_modules)[\\/]/.test(RAIZ);
}

/** `total` viaja porque no todos los comandos tienen los ocho pasos de `init`. */
function verificarEntorno(total = TOTAL) {
  paso(1, total, "Revisando que tengas todo lo necesario");

  if (!existsSync(join(RAIZ, "src", "db", "schema.sql"))) {
    morir(
      "No encuentro el código de CHUNO.",
      "Corre esto desde la carpeta del proyecto, o usa:\n  npx chuno-cli init",
    );
  }
  ok("código de CHUNO encontrado");

  const version = correr("npx", ["--yes", "wrangler", "--version"]);
  if (!version.ok) {
    morir(
      "No pude ejecutar wrangler, la herramienta de Cloudflare.",
      "Instala Node 18 o superior y vuelve a intentar.",
    );
  }
  ok(`wrangler disponible ${c.suave(version.salida.split("\n").pop() ?? "")}`);

  const quien = correr("npx", ["--yes", "wrangler", "whoami"]);
  if (!quien.ok || /not authenticated|no account/i.test(quien.salida)) {
    morir(
      "No has iniciado sesión en Cloudflare.",
      "Corre esto, aprueba en el navegador, y vuelve:\n  npx wrangler login",
    );
  }
  const correo = quien.salida.match(/[\w.+-]+@[\w.-]+/)?.[0];
  ok(`sesión de Cloudflare activa${correo ? ` ${c.suave(correo)}` : ""}`);
}

async function crearBase(nombreBase) {
  paso(2, TOTAL, "Creando tu base de datos");

  const existentes = correr("npx", ["--yes", "wrangler", "d1", "list", "--json"]);
  let id = null;

  if (existentes.ok) {
    try {
      const lista = JSON.parse(existentes.salida.slice(existentes.salida.indexOf("[")));
      id = lista.find((b) => b.name === nombreBase)?.uuid ?? null;
    } catch {
      /* si el formato cambia, se sigue por el camino de crear */
    }
  }

  if (id) {
    aviso(`la base "${nombreBase}" ya existía, la reutilizo`);
  } else {
    const creada = correr("npx", ["--yes", "wrangler", "d1", "create", nombreBase]);
    if (!creada.ok) morir(`No pude crear la base de datos.\n\n${creada.salida}`);
    id = creada.salida.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] ?? null;
    if (!id) morir(`Creé la base pero no encontré su identificador.\n\n${creada.salida}`);
  }

  ok(`base "${nombreBase}" lista ${c.suave(id)}`);
  return id;
}

/**
 * El espacio KV donde viven las fotos del catálogo.
 *
 * Sin esto el despliegue falla: `wrangler.jsonc` viaja con el id del namespace
 * de NUESTRA cuenta, y ese id no existe en la del usuario. Mismo trato que la
 * base de datos: listar, crear si falta, y reescribir la configuración.
 */
async function crearKV(nombreKV) {
  paso(3, TOTAL, "Creando el espacio para las fotos de tu catálogo");

  const existentes = correr("npx", ["--yes", "wrangler", "kv", "namespace", "list"]);
  let id = null;

  if (existentes.ok && existentes.salida.includes("[")) {
    try {
      const lista = JSON.parse(existentes.salida.slice(existentes.salida.indexOf("[")));
      // Según la versión, wrangler antepone el nombre del Worker al título.
      const suyo = lista.find((n) => n.title === nombreKV || n.title?.endsWith(nombreKV));
      id = suyo?.id ?? null;
    } catch {
      /* si el formato cambia, se sigue por el camino de crear */
    }
  }

  if (id) {
    aviso(`el espacio "${nombreKV}" ya existía, lo reutilizo`);
  } else {
    const creado = correr("npx", ["--yes", "wrangler", "kv", "namespace", "create", nombreKV]);
    if (!creado.ok) morir(`No pude crear el espacio para las fotos.\n\n${creado.salida}`);

    // Primero el id rotulado, y solo si no está, el primer hexadecimal suelto.
    // Al revés, cualquier otro hash que wrangler imprima antes se llevaría el
    // puesto y el despliegue apuntaría a un espacio que no es.
    id =
      creado.salida.match(/\bid\s*[:=]\s*"?([0-9a-f]{32})"?/i)?.[1] ??
      creado.salida.match(/[0-9a-f]{32}/)?.[0] ??
      null;
    if (!id) morir(`Creé el espacio pero no encontré su identificador.\n\n${creado.salida}`);
  }

  ok(`espacio "${nombreKV}" listo ${c.suave(id)}`);
  return id;
}

/**
 * ¿Esta copia ya es una instalación viva?
 *
 * Importa mucho: `init` reescribe wrangler.jsonc, y correrlo dentro de un
 * CHUNO que ya está en producción repuntaría el proyecto a otra base y dejaría
 * al negocio hablando con una base vacía. Se detecta y se pregunta.
 */
function yaInstalado() {
  // Un paquete recién descargado trae nuestros ids, no los de una instalación
  // suya. Preguntarle ahí es garantizar una advertencia falsa.
  if (esPaqueteDescargado()) return null;

  const ruta = join(RAIZ, "wrangler.jsonc");
  if (!existsSync(ruta)) return null;

  const texto = readFileSync(ruta, "utf8");
  const id = texto.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1];
  const nombre = texto.match(/"database_name":\s*"([^"]*)"/)?.[1];

  return id ? { id, nombre } : null;
}

function configurarWrangler(nombreBase, idBase, idKV, nombreWorker) {
  paso(4, TOTAL, "Ajustando la configuración del proyecto");

  const ruta = join(RAIZ, "wrangler.jsonc");
  let texto = readFileSync(ruta, "utf8");

  // Copia de seguridad antes de tocar nada: si algo sale mal a mitad, el
  // archivo original se recupera con un `mv`, no con memoria.
  writeFileSync(`${ruta}.respaldo`, texto);

  // El id del KV se ancla a su binding y no al primer "id" que aparezca: en
  // este archivo hay varios y el orden puede cambiar.
  texto = texto
    .replace(/("database_name":\s*")[^"]*(")/, `$1${nombreBase}$2`)
    .replace(/("database_id":\s*")[^"]*(")/, `$1${idBase}$2`)
    .replace(/("binding":\s*"IMAGENES",\s*"id":\s*")[^"]*(")/, `$1${idKV}$2`)
    .replace(/^(\s*"name":\s*")[^"]*(")/m, `$1${nombreWorker}$2`);

  writeFileSync(ruta, texto);

  if (!texto.includes(idKV)) {
    morir(
      "No pude apuntar la configuración al espacio de fotos que acabo de crear.",
      "Es un fallo nuestro, no tuyo. Escríbenos con esta salida.",
    );
  }

  ok(`wrangler.jsonc apunta a "${nombreBase}"`);
}

function aplicarEsquema(nombreBase) {
  paso(5, TOTAL, "Creando las tablas");

  const r = correr("npx", [
    "--yes", "wrangler", "d1", "execute", nombreBase,
    "--remote", "--file=src/db/schema.sql", "--yes",
  ]);
  if (!r.ok) morir(`No pude crear las tablas.\n\n${r.salida}`);
  ok("16 tablas creadas");
}

async function cargarSecretos() {
  paso(6, TOTAL, "Guardando tus llaves");

  log(c.suave("      El cerebro es tuyo: tú eliges el proveedor y pagas solo lo que piensa."));
  log(c.suave("      1) Gemini — tiene capa gratuita, es la opción para arrancar."));
  log(c.suave("      2) Otro compatible con OpenAI — OpenRouter, OpenAI, Groq, el que uses.\n"));

  const eleccion = await preguntar("      ¿Cuál? (1 o 2): ");
  const proveedor = eleccion.trim() === "2" ? "compatible" : "gemini";

  let baseUrl = "";
  let listaModelos = "";

  if (proveedor === "compatible") {
    baseUrl = await preguntar("      URL base (ej. https://openrouter.ai/api/v1): ");
    if (!baseUrl) morir("Sin URL base no sé a dónde mandarle las preguntas.");

    listaModelos = await preguntar("      Modelos, del preferido al último, separados por coma: ");
    if (!listaModelos) {
      morir("Sin modelos no hay nada que intentar.", "Pon varios: si el primero está caído o saturado, el asistente pasa al siguiente.");
    }
  }

  log(c.suave("\n      Las llaves se guardan cifradas en Cloudflare, nunca en un archivo del proyecto."));
  log(c.suave("      Lo que escribas aquí no se ve en pantalla.\n"));

  const pista = proveedor === "gemini"
    ? "Llave de Gemini (aistudio.google.com/apikey): "
    : "Llave del proveedor: ";

  const llaveLLM = await preguntar(`      ${pista}`, { oculto: true });
  if (!llaveLLM) morir("Sin llave el asistente no puede pensar.");

  // Se valida ANTES de guardar, igual que el webhook de Telegram. Una llave
  // mala tiene que doler aquí, que es cuando hay alguien mirando la pantalla;
  // si se descubre en producción, el que se entera es un cliente sin respuesta.
  const validacion = await validarLlaveLLM(proveedor, llaveLLM, baseUrl, listaModelos);
  if (!validacion.ok) {
    morir(`La llave no funcionó: ${validacion.error}`, "Revisa que esté completa y que la cuenta tenga saldo o cuota disponible.");
  }
  ok("Llave verificada contra el proveedor");

  const telegram = await preguntar("      Token del bot de Telegram (de @BotFather): ", { oculto: true });
  if (!telegram) morir("Sin token de Telegram el asistente no tiene por dónde atender.");

  const panel = await preguntar("      Contraseña para tu panel (invéntala): ", { oculto: true });
  if (panel.length < 8) morir("La contraseña del panel necesita al menos 8 caracteres.");

  // Estas dos no se le preguntan a nadie: son aleatorias y de uso interno.
  const secretoWebhook = randomBytes(24).toString("base64url");
  const claveCifrado = randomBytes(32).toString("base64");

  const secretos = [
    ["GEMINI_API_KEY", llaveLLM],
    ["TELEGRAM_BOT_TOKEN", telegram],
    ["PANEL_PASSWORD", panel],
    ["TELEGRAM_WEBHOOK_SECRET", secretoWebhook],
    ["CLAVE_CIFRADO", claveCifrado],
  ];

  log("");
  for (const [nombre, valor] of secretos) {
    const r = correr("npx", ["--yes", "wrangler", "secret", "put", nombre], { entrada: valor });
    if (!r.ok) morir(`No pude guardar el secreto ${nombre}.\n\n${r.salida}`);
    ok(nombre);
  }

  ajustarCerebroEnWrangler(proveedor, baseUrl, listaModelos);

  return { telegram, secretoWebhook };
}

/**
 * Una llamada mínima para comprobar que la llave sirve. No pide texto útil:
 * solo que el proveedor conteste algo que no sea un error de autenticación.
 */
async function validarLlaveLLM(proveedor, llave, baseUrl, listaModelos) {
  try {
    if (proveedor === "gemini") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": llave },
      });
      return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
    }

    const modelo = listaModelos.split(",")[0].trim();
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${llave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: "ok" }],
        max_tokens: 1,
      }),
    });
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
  } catch {
    return { ok: false, error: "no pude contactar al proveedor" };
  }
}

/**
 * Proveedor, URL y modelos NO son secretos: van como vars del Worker, que se
 * leen sin descifrar nada y se ven en el dashboard cuando haya que revisarlas.
 * La llave, y solo la llave, va como secreto.
 */
function ajustarCerebroEnWrangler(proveedor, baseUrl, listaModelos) {
  const ruta = join(RAIZ, "wrangler.jsonc");
  let texto = readFileSync(ruta, "utf8");

  texto = texto.replace(/("LLM_PROVEEDOR":\s*")[^"]*(")/, `$1${proveedor}$2`);

  if (proveedor === "compatible") {
    texto = texto.replace(/("MODELOS_LLM":\s*")[^"]*(")/, `$1${listaModelos}$2`);

    // LLM_BASE_URL no viene en la plantilla porque Gemini no la necesita: se
    // inserta al lado del proveedor la primera vez que hace falta.
    texto = /"LLM_BASE_URL":/.test(texto)
      ? texto.replace(/("LLM_BASE_URL":\s*")[^"]*(")/, `$1${baseUrl}$2`)
      : texto.replace(
          /("LLM_PROVEEDOR":\s*"[^"]*",)/,
          `$1\n    "LLM_BASE_URL": "${baseUrl}",`,
        );
  }

  writeFileSync(ruta, texto);
  ok(`El cerebro queda en "${proveedor}"`);
}

async function desplegar() {
  paso(7, TOTAL, "Publicando tu asistente");
  log("");

  const bien = await correrVisible("npx", ["--yes", "wrangler", "deploy"]);
  if (!bien) morir("El despliegue falló. La salida de arriba dice por qué.");

  const info = correr("npx", ["--yes", "wrangler", "deployments", "list", "--json"]);
  const url = info.salida.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0] ?? null;
  return url;
}

function conectarTelegram(url, token, secreto) {
  paso(8, TOTAL, "Conectando tu bot de Telegram");

  if (!url) {
    aviso("no pude deducir la URL del Worker; conecta el bot desde el panel");
    return;
  }

  const destino = `${url}/webhook/telegram`;
  const r = correr("npx", [
    "--yes", "curl", "-s", "-X", "POST",
    `https://api.telegram.org/bot${token}/setWebhook`,
    "-H", "content-type: application/json",
    "-d", JSON.stringify({ url: destino, secret_token: secreto, allowed_updates: ["message"], drop_pending_updates: true }),
  ]);

  if (r.ok && /"ok":\s*true/.test(r.salida)) ok("Telegram entregará los mensajes a tu Worker");
  else aviso("no pude registrar el webhook; hazlo desde /panel/conectar-telegram");
}

// ───────────────────────────────────────────────────────────  canales meta ──

/**
 * La llave maestra con la que se cifran las credenciales.
 *
 * No se le pregunta a nadie: es aleatoria y quien instaló nunca la vio. Sale
 * del entorno o de `.dev.vars`, los dos sitios donde este proyecto admite
 * secretos locales.
 *
 * En una instalación hecha con `npx` no está en ninguno de los dos —`init` la
 * sube a Cloudflare y no la guarda—, así que este comando es hoy la vía del
 * que tiene el repositorio a mano. Cerrar ese hueco es el panel de Conexiones.
 */
function claveDeCifrado() {
  if (process.env.CLAVE_CIFRADO) return process.env.CLAVE_CIFRADO.trim();

  const ruta = join(RAIZ, ".dev.vars");
  if (existsSync(ruta)) {
    const linea = readFileSync(ruta, "utf8")
      .split("\n")
      .find((l) => l.startsWith("CLAVE_CIFRADO="));
    if (linea) return linea.slice("CLAVE_CIFRADO=".length).trim();
  }

  return null;
}

/** Comilla simple para SQL. Lo que llega de fuera ya viene validado por forma. */
const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;

function d1(nombreBase, comando) {
  return correr("npx", [
    "--yes", "wrangler", "d1", "execute", nombreBase,
    "--remote", "--command", comando, "--yes",
  ]);
}

/** La URL pública del Worker, de `wrangler.jsonc`. */
function urlPublica() {
  const ruta = join(RAIZ, "wrangler.jsonc");
  if (!existsSync(ruta)) return null;
  return readFileSync(ruta, "utf8").match(/"URL_PUBLICA":\s*"([^"]*)"/)?.[1] ?? null;
}

/** Lee una bandera `--nombre valor` de una lista de argumentos. */
function banderaDe(argv, nombre) {
  const i = argv.indexOf(`--${nombre}`);
  return i === -1 ? null : argv[i + 1] ?? null;
}

/**
 * Comprueba que el negocio existe antes de escribirle nada.
 *
 * Sin esto el INSERT falla por clave foránea, y el error de SQLite no dice
 * cuál es el problema de verdad.
 */
function exigirNegocio(nombreBase, negocioId) {
  const existe = d1(nombreBase, `SELECT id FROM negocios WHERE id = ${sql(negocioId)}`);
  if (!existe.ok) morir(`No pude consultar la base.\n\n${existe.salida}`);
  if (!existe.salida.includes(negocioId)) {
    const listado = d1(nombreBase, "SELECT id FROM negocios");
    morir(`No hay ningún negocio con id "${negocioId}".`, `Los que existen:\n\n${listado.salida}`);
  }
}

/** Lo que comparten los dos comandos de Meta antes de tocar nada. */
function prepararConexionMeta(negocioId, pasos) {
  if (!/^[a-z0-9-]{1,60}$/.test(negocioId)) {
    morir("El id del negocio solo admite minúsculas, números y guiones.");
  }

  const instalacion = yaInstalado();
  if (!instalacion) {
    morir("No encuentro una instalación de CHUNO aquí.", "Corre este comando desde la carpeta del proyecto instalado.");
  }

  const clave = claveDeCifrado();
  if (!clave) {
    morir(
      "No encuentro CLAVE_CIFRADO, y sin ella no puedo guardar el token cifrado.",
      "Ponla en .dev.vars o pásala como variable de entorno. Es la misma que subiste a Cloudflare al instalar.",
    );
  }

  paso(2, pasos, "Buscando el negocio");
  exigirNegocio(instalacion.nombre, negocioId);
  ok(`negocio "${negocioId}"`);

  return { instalacion, clave };
}

const PASOS_APP_META = 5;

/**
 * Conecta la APP de Meta de un negocio: lo que le permite RECIBIR.
 *
 * Va aparte de `conectar-meta` porque son cosas distintas. La app es una sola
 * por negocio y sus credenciales gobiernan la entrada —firma y handshake— de
 * los tres productos a la vez; el token de envío es de cada producto. Juntarlos
 * obligaría a repetir el App Secret tres veces y a decidir qué pasa cuando no
 * coinciden.
 */
async function conectarAppMeta(argv) {
  const negocioId = argv[0];
  const appId = banderaDe(argv, "app-id");

  if (!negocioId || !appId) morir("Faltan datos.", AYUDA_APP_META);
  if (!/^[0-9]{1,32}$/.test(appId)) {
    morir("Ese no parece un App ID.", "Los App ID de Meta son solo dígitos, y están en Settings → Basic.");
  }

  const { instalacion, clave } = prepararConexionMeta(negocioId, PASOS_APP_META);

  paso(3, PASOS_APP_META, "Validando contra Meta");
  log(c.suave("      Lo que escribas no se ve en pantalla.\n"));

  const appSecret = await preguntar("      App Secret (Settings → Basic → Show): ", { oculto: true });
  if (!appSecret) morir("Sin App Secret no puedo verificar la firma de los webhooks.");

  const validacion = await validarAppMeta(appId, appSecret);
  if (!validacion.ok) {
    morir(
      `No guardé nada: ${validacion.motivo}.`,
      "Revisa los dos en Settings → Basic. Meta los valida juntos, así que no puedo decirte cuál de ellos es.",
    );
  }
  ok("Meta acepta el par App ID + App Secret");

  // El verify token NO se valida contra Meta: es una cadena que eliges tú y que
  // Meta solo usa para devolvértela en el handshake. Lo que sí se comprueba,
  // más abajo, es que nuestro propio Worker la reconozca.
  const verifyToken = await preguntar("      Verify token (el que vas a pegar en Meta): ", { oculto: true });
  if (!verifyToken) {
    morir("Sin verify token, Meta no puede registrar el webhook.", "Invéntalo tú. Por ejemplo: openssl rand -base64 24");
  }

  paso(4, PASOS_APP_META, "Guardando");
  const ahora = new Date().toISOString();
  const guardado = d1(
    instalacion.nombre,
    `${sqlGuardarCredencial(negocioId, "meta_app_secret", await cifrarValor(appSecret, clave), ahora)}
     ${sqlGuardarCredencial(negocioId, "meta_verify_token", await cifrarValor(verifyToken, clave), ahora)}`,
  );
  if (!guardado.ok) morir(`No pude guardar.\n\n${guardado.salida}`);
  ok("App Secret y verify token, cifrados");

  paso(5, PASOS_APP_META, "Comprobando la puerta contra tu propio Worker");
  const base = urlPublica();
  const url = base ? urlWebhookMeta(base, negocioId) : null;

  if (!base) {
    aviso("no encuentro URL_PUBLICA en wrangler.jsonc; me salto la comprobación");
  } else {
    const prueba = await comprobarHandshake(base, negocioId, verifyToken);
    if (prueba.ok) ok("tu Worker devolvió el challenge: la puerta abre");
    // No es fatal: las credenciales ya están bien guardadas y lo que falla es
    // el Worker desplegado, que puede ser viejo o no existir todavía.
    else aviso(`la puerta todavía no abre — ${prueba.motivo}`);
  }

  log(`
  ${c.lima("▌")} ${c.fuerte(`La app de Meta de "${negocioId}" quedó conectada.`)}

  ${c.fuerte("Ahora, en el App Dashboard de Meta:")}

    Callback URL   ${c.fuerte(url ?? "https://<tu worker>/webhook/meta/" + negocioId)}
    Verify token   el que acabas de escribir

  Dale a ${c.fuerte("Verify and Save")}, y después suscribe el campo ${c.fuerte("messages")}
  en Webhook fields → Manage. Sin esa suscripción Meta valida la URL y no
  manda nunca nada.

  ${c.suave("Con esto el negocio RECIBE. Para que pueda contestar, conecta cada")}
  ${c.suave("producto con: npx chuno-cli conectar-meta " + negocioId + " --producto whatsapp --id <id>")}
`);
}

const PASOS_META = 4;

async function conectarMeta(argv) {
  const negocioId = argv[0];
  const producto = banderaDe(argv, "producto");
  const id = banderaDe(argv, "id");
  const plantilla = banderaDe(argv, "plantilla");
  const agenteHumano = argv.includes("--agente-humano");

  if (!negocioId || !producto || !id) morir("Faltan datos.", AYUDA_META);
  if (!PRODUCTOS_META[producto]) {
    morir(`No conozco el producto "${producto}".`, "Son: whatsapp, messenger o instagram.");
  }
  if (!/^[0-9]{1,32}$/.test(id)) {
    morir(`Ese no parece ${PRODUCTOS_META[producto].comoSeLlamaElId}.`, "Los ids de Meta son solo dígitos.");
  }
  if (plantilla && !/^[a-z0-9_]{1,64}:[a-zA-Z]{2}(_[A-Z]{2})?$/.test(plantilla)) {
    morir(
      `La plantilla "${plantilla}" no tiene la forma nombre:idioma.`,
      "Por ejemplo: aviso_pedido:es o aviso_pedido:es_MX",
    );
  }
  if (plantilla && producto !== "whatsapp") {
    morir("Las plantillas son de WhatsApp.", "Messenger e Instagram usan --agente-humano.");
  }

  const cfg = PRODUCTOS_META[producto];
  const { instalacion, clave } = prepararConexionMeta(negocioId, PASOS_META);

  // El token se pregunta, nunca se recibe por bandera: un argumento queda en
  // el historial del shell y en la lista de procesos. Es la misma regla que
  // sigue el resto de este instalador.
  paso(3, PASOS_META, "Validando contra Meta");
  log(c.suave("      Lo que escribas no se ve en pantalla.\n"));
  const token = await preguntar(`      Token de ${producto}: `, { oculto: true });
  if (!token) morir("Sin token no hay nada que guardar.");

  const validacion = await validarMeta(producto, token, id);
  if (!validacion.ok) {
    const pista = validacion.culpa === "id"
      ? `Revisa ${cfg.comoSeLlamaElId} en el panel de Meta. El token no se tocó.`
      : validacion.culpa === "token"
        ? "Genera un token nuevo en el panel de Meta. El id no se tocó."
        : "Revisa los dos en el panel de Meta.";
    morir(`No guardé nada: ${validacion.motivo}.`, pista);
  }
  ok("Meta acepta el par token + id");

  paso(4, PASOS_META, "Guardando");
  const cifrado = await cifrarValor(token, clave);
  const ahora = new Date().toISOString();

  const guardado = d1(instalacion.nombre, sqlGuardarMeta(negocioId, cfg, cifrado, id, ahora));
  if (!guardado.ok) morir(`No pude guardar.\n\n${guardado.salida}`);
  ok(`token cifrado y ${cfg.ajusteId}`);

  if (plantilla) {
    const r = d1(
      instalacion.nombre,
      sqlGuardarAjuste(negocioId, "whatsapp_plantilla_aviso", plantilla),
    );
    if (!r.ok) morir(`Guardé el token pero no la plantilla.\n\n${r.salida}`);
    ok(`plantilla "${plantilla}" para fuera de la ventana de 24 h`);
  }

  if (agenteHumano) {
    const r = d1(instalacion.nombre, sqlGuardarAjuste(negocioId, "meta_agente_humano", "si"));
    if (!r.ok) morir(`Guardé el token pero no la etiqueta.\n\n${r.salida}`);
    ok("etiqueta de agente humano activada");
  }

  const fueraDeVentana = plantilla || agenteHumano
    ? "Fuera de esas 24 horas sale con lo que acabas de configurar."
    : `Fuera de esas 24 horas ${c.fuerte("no saldrá")}, y la decisión te queda pendiente en la bandeja con el motivo.`;

  log(`
  ${c.lima("▌")} ${c.fuerte(`${producto} conectado a "${negocioId}".`)}

  Tu asistente responde libremente durante las 24 horas siguientes a cada
  mensaje del cliente, que es la ventana que da Meta. ${fueraDeVentana}

  ${c.suave("Nada sale al cliente sin que tú lo apruebes. Eso no cambia por canal.")}
`);
}

// ──────────────────────────────────────────────────────────────────  inicio ──

async function init() {
  log(`
  ${c.lima("▌")} ${c.fuerte("CHUNO")}
  ${c.suave("El asistente que se acuerda de lo que le prometiste a tu cliente.")}
  ${c.suave("Se instala en TU nube. Tus datos no pasan por ningún servidor nuestro.")}
`);

  verificarEntorno();

  const previo = yaInstalado();
  if (previo) {
    log(`
  ${c.rojo("Atención:")} esta copia ya está instalada y apunta a la base
  "${previo.nombre}". Seguir la va a repuntar a una base nueva y vacía —
  el negocio que atiende hoy dejaría de ver sus pedidos.

  ${c.suave("Si lo que quieres es agregar OTRO bot al mismo CHUNO, no uses init:")}
  ${c.suave('entra a tu panel y dale a "＋ Nuevo asistente".')}
`);
    const seguir = await preguntar('      Escribe "instalar de nuevo" para continuar: ');
    if (seguir.toLowerCase() !== "instalar de nuevo") {
      log(`\n      Cancelado. No se tocó nada.\n`);
      process.exit(0);
    }
  }

  log("");
  const nombreNegocio = await preguntar("      ¿Cómo se llama tu negocio? ");
  if (nombreNegocio.length < 2) morir("Necesito el nombre del negocio.");

  const babosa = nombreNegocio
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const nombreBase = `chuno-${babosa}`;
  const nombreWorker = `chuno-${babosa}`;

  const idBase = await crearBase(nombreBase);
  const idKV = await crearKV(`chuno-imagenes-${babosa}`);
  configurarWrangler(nombreBase, idBase, idKV, nombreWorker);
  aplicarEsquema(nombreBase);
  const { telegram, secretoWebhook } = await cargarSecretos();
  const url = await desplegar();
  conectarTelegram(url, telegram, secretoWebhook);

  log(`
  ${c.lima("▌")} ${c.fuerte("Listo.")}

  Tu panel:      ${c.fuerte(`${url ?? "(revisa la salida del despliegue)"}/panel`)}
  Usuario:       admin
  Contraseña:    la que acabas de escribir

  ${c.fuerte("Lo que sigue:")} entra al panel y dale a "＋ Nuevo asistente".
  Son siete preguntas y tu asistente queda con tu catálogo y tu tono.

  ${c.suave("Los mensajes se borran solos a los 90 días. Sin telemetría.")}
`);
}

// ──────────────────────────────────────────────────────────────────  ruteo  ──

const AYUDA = `
  ${c.fuerte("chuno")} — instala CHUNO en tu propia nube de Cloudflare

  ${c.fuerte("Uso:")}
    npx chuno-cli init           instala y publica tu asistente
    npx chuno-cli revisar        comprueba que tengas todo listo, sin instalar nada
    npx chuno-cli conectar-app-meta  conecta la app de Meta del negocio (recibir)
    npx chuno-cli conectar-meta      conecta un canal para poder contestar

  ${c.fuerte("Antes de empezar necesitas:")}
    · Una cuenta de Cloudflare (gratuita) — npx wrangler login
    · Una llave de Gemini (gratuita) — aistudio.google.com/apikey
    · Un bot de Telegram — escríbele a @BotFather y usa /newbot
`;

const AYUDA_APP_META = `  ${c.fuerte("Uso:")}
    npx chuno-cli conectar-app-meta <negocio> --app-id <id>

  Conecta la APP de Meta del negocio: es lo que le permite RECIBIR mensajes.
  Una app por negocio, y sus credenciales valen para WhatsApp, Messenger e
  Instagram a la vez.

  Te pide dos cosas con el eco apagado:

    ${c.fuerte("App Secret")}     Settings → Basic → Show. Con él se verifica la firma
                   de cada webhook. Se valida contra Meta antes de guardar.
    ${c.fuerte("Verify token")}   una cadena que inventas tú y que pegarás en Meta.
                   Sugerencia: openssl rand -base64 24

  Después de conectar el canal de salida con ${c.fuerte("conectar-meta")}, el negocio
  puede recibir y contestar.

  ${c.fuerte("Ejemplo:")}
    npx chuno-cli conectar-app-meta mi-optica --app-id 1234567890123456
`;

const AYUDA_META = `  ${c.fuerte("Uso:")}
    npx chuno-cli conectar-meta <negocio> --producto <cual> --id <id>

  ${c.fuerte("Productos:")} whatsapp · messenger · instagram

  ${c.fuerte("Opcionales:")}
    --plantilla <nombre>:<idioma>  plantilla aprobada para escribir fuera de
                                   las 24 h de ventana (solo WhatsApp)
    --agente-humano                usar la etiqueta de agente humano fuera de
                                   la ventana (Messenger e Instagram)

  El token se pregunta al correr el comando: no se pasa como argumento, porque
  los argumentos quedan en el historial del shell y en la lista de procesos.

  ${c.fuerte("Ejemplo:")}
    npx chuno-cli conectar-meta mi-optica --producto whatsapp --id 123456789012345
`;

const comando = process.argv[2];

if (comando === "init") {
  init().catch((e) => morir(e instanceof Error ? e.message : "algo salió mal"));
} else if (comando === "conectar-app-meta") {
  verificarEntorno(PASOS_APP_META);
  conectarAppMeta(process.argv.slice(3)).catch((e) =>
    morir(e instanceof Error ? e.message : "algo salió mal"),
  );
} else if (comando === "conectar-meta") {
  verificarEntorno(PASOS_META);
  conectarMeta(process.argv.slice(3)).catch((e) =>
    morir(e instanceof Error ? e.message : "algo salió mal"),
  );
} else if (comando === "revisar") {
  // Solo lecturas: comprueba requisitos sin crear, escribir ni desplegar nada.
  verificarEntorno();
  const previo = yaInstalado();
  log(
    previo
      ? `\n      ${c.suave(`Ya instalado, apuntando a la base "${previo.nombre}".`)}\n`
      : `\n      ${c.lima("Todo listo.")} Corre ${c.fuerte("npx chuno-cli init")} para instalar.\n`,
  );
} else {
  log(AYUDA);
  process.exit(comando ? 1 : 0);
}
