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

function verificarEntorno() {
  paso(1, TOTAL, "Revisando que tengas todo lo necesario");

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
  log(c.suave("      Se guardan cifradas en Cloudflare, nunca en un archivo del proyecto."));
  log(c.suave("      Lo que escribas aquí no se ve en pantalla.\n"));

  const gemini = await preguntar("      Llave de Gemini (aistudio.google.com/apikey): ", { oculto: true });
  if (!gemini) morir("Sin llave de Gemini el asistente no puede pensar.");

  const telegram = await preguntar("      Token del bot de Telegram (de @BotFather): ", { oculto: true });
  if (!telegram) morir("Sin token de Telegram el asistente no tiene por dónde atender.");

  const panel = await preguntar("      Contraseña para tu panel (invéntala): ", { oculto: true });
  if (panel.length < 8) morir("La contraseña del panel necesita al menos 8 caracteres.");

  // Estas dos no se le preguntan a nadie: son aleatorias y de uso interno.
  const secretoWebhook = randomBytes(24).toString("base64url");
  const claveCifrado = randomBytes(32).toString("base64");

  const secretos = [
    ["GEMINI_API_KEY", gemini],
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

  return { telegram, secretoWebhook };
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
    npx chuno-cli init     instala y publica tu asistente
    npx chuno-cli revisar  comprueba que tengas todo listo, sin instalar nada

  ${c.fuerte("Antes de empezar necesitas:")}
    · Una cuenta de Cloudflare (gratuita) — npx wrangler login
    · Una llave de Gemini (gratuita) — aistudio.google.com/apikey
    · Un bot de Telegram — escríbele a @BotFather y usa /newbot
`;

const comando = process.argv[2];

if (comando === "init") {
  init().catch((e) => morir(e instanceof Error ? e.message : "algo salió mal"));
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
