/**
 * Render de HTML desde el Worker, sin framework de UI.
 *
 * Server-rendered a propósito: el panel tiene que abrir rápido desde un teléfono
 * con mala señal en el mostrador de una óptica. No hay nada aquí que justifique
 * mandar un bundle de JavaScript.
 */

/** Escapa SIEMPRE lo que venga de la base. Un nombre de cliente es texto ajeno. */
export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function pesos(centavos: number | null): string {
  if (centavos === null) return "—";
  const valor = Math.round(centavos / 100);
  return `$${valor.toLocaleString("es-CO")}`;
}

export function fechaCorta(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

const CSS = `
:root {
  --fondo: #0b0d12; --fondo-2: #11141b;
  --tarjeta: #151922; --tarjeta-alta: #1b202b; --borde: #252b38;
  --texto: #eef1f6; --suave: #98a2b6;
  --acento: #5b8dff; --acento-suave: #93b4ff;
  --alerta: #ff6b6b; --aviso: #ffb648; --bien: #3ecf8e;
  --radio: 14px; --radio-s: 10px;
  --sombra: 0 1px 2px rgba(0,0,0,.28), 0 8px 24px rgba(0,0,0,.22);
  --display: "Raleway", ui-sans-serif, system-ui, sans-serif;
  --cuerpo: "Nunito Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
@media (prefers-color-scheme: light) {
  :root {
    --fondo: #f5f7fb; --fondo-2: #eef1f7;
    --tarjeta: #ffffff; --tarjeta-alta: #ffffff; --borde: #e2e7f0;
    --texto: #121722; --suave: #5d6880;
    --sombra: 0 1px 2px rgba(16,24,40,.05), 0 8px 24px rgba(16,24,40,.06);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; color: var(--texto);
  font-family: var(--cuerpo); font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(900px 420px at 50% -160px, color-mix(in srgb, var(--acento) 13%, transparent), transparent 70%),
    linear-gradient(var(--fondo-2), var(--fondo) 320px);
  background-color: var(--fondo);
  background-attachment: fixed;
  min-height: 100vh;
}
.envoltorio { max-width: 1000px; margin: 0 auto; padding: 28px 20px 72px; }

header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
h1 {
  font-family: var(--display); font-size: 21px; font-weight: 700;
  margin: 0; letter-spacing: 1.4px;
}
.negocio {
  color: var(--suave); font-size: 14px; font-weight: 600;
  padding-left: 14px; border-left: 1px solid var(--borde);
}

nav { display: flex; gap: 7px; margin: 22px 0 26px; flex-wrap: wrap; }
nav a {
  padding: 8px 15px; border-radius: 999px; text-decoration: none;
  color: var(--suave); border: 1px solid var(--borde); font-size: 14px;
  font-weight: 600; background: color-mix(in srgb, var(--tarjeta) 60%, transparent);
  transition: color .15s, border-color .15s, background .15s;
}
nav a:hover { color: var(--texto); border-color: color-mix(in srgb, var(--acento) 45%, var(--borde)); }
nav a.activo {
  color: #fff; border-color: transparent;
  background: linear-gradient(180deg, var(--acento), color-mix(in srgb, var(--acento) 78%, #000));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--acento) 32%, transparent);
}
nav .globo {
  background: var(--alerta); color: #fff; border-radius: 999px;
  padding: 1px 8px; font-size: 12px; font-weight: 700; margin-left: 7px;
}
nav a.activo .globo { background: rgba(255,255,255,.25); }

.seccion {
  font-family: var(--display); font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.6px; color: var(--suave);
  margin: 30px 0 12px;
}
.seccion:first-child { margin-top: 0; }

.tarjeta {
  background: var(--tarjeta); border: 1px solid var(--borde);
  border-radius: var(--radio); padding: 18px; margin-bottom: 14px;
  box-shadow: var(--sombra);
}
.tarjeta.urgente { border-left: 3px solid var(--alerta); }
.motivo { font-size: 15.5px; margin: 0 0 12px; line-height: 1.55; }
.propuesto {
  background: color-mix(in srgb, var(--fondo) 70%, transparent);
  border: 1px solid var(--borde); border-radius: var(--radio-s);
  padding: 14px; margin-bottom: 14px;
}
.etiqueta {
  font-family: var(--display); font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.2px; color: var(--suave);
  margin-bottom: 8px;
}
textarea {
  width: 100%; min-height: 78px; background: transparent; color: var(--texto);
  border: none; resize: vertical; font: inherit; padding: 0;
}
textarea:focus { outline: none; }
.acciones { display: flex; gap: 9px; flex-wrap: wrap; }
button {
  font-family: var(--cuerpo); font-size: 14.5px; font-weight: 700;
  padding: 10px 18px; border-radius: var(--radio-s); border: 1px solid var(--borde);
  background: var(--tarjeta-alta); color: var(--texto); cursor: pointer;
  transition: filter .15s, transform .08s;
}
button.primario {
  background: linear-gradient(180deg, var(--acento), color-mix(in srgb, var(--acento) 78%, #000));
  border-color: transparent; color: #fff;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--acento) 32%, transparent);
}
button:hover { filter: brightness(1.1); }
button:active { transform: translateY(1px); }

table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th {
  text-align: left; color: var(--suave); font-family: var(--display);
  font-weight: 700; font-size: 11px; text-transform: uppercase;
  letter-spacing: 1.2px; padding: 0 10px 10px;
}
td { padding: 13px 10px; border-top: 1px solid var(--borde); vertical-align: top; }
tbody tr:hover { background: color-mix(in srgb, var(--acento) 5%, transparent); }

.chip {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 700; white-space: nowrap;
}
.chip.vencida { background: color-mix(in srgb, var(--alerta) 18%, transparent); color: var(--alerta); }
.chip.en_riesgo { background: color-mix(in srgb, var(--aviso) 18%, transparent); color: var(--aviso); }
.chip.sin_fecha { background: color-mix(in srgb, var(--suave) 18%, transparent); color: var(--suave); }
.chip.ok { background: color-mix(in srgb, var(--bien) 16%, transparent); color: var(--bien); }

.vacio { color: var(--suave); text-align: center; padding: 44px 16px; }
.vacio strong {
  display: block; color: var(--texto); margin-bottom: 6px;
  font-family: var(--display); font-size: 16px; font-weight: 700;
}
.pie { color: var(--suave); font-size: 12.5px; margin-top: 36px; text-align: center; }
.registro {
  font-size: 13.5px; color: var(--suave); display: flex; gap: 12px;
  padding: 10px 0; border-top: 1px solid var(--borde); align-items: baseline;
}
.registro:first-of-type { border-top: none; padding-top: 0; }
.registro time { white-space: nowrap; font-variant-numeric: tabular-nums; }

.metricas { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); margin-bottom: 14px; }
.metrica {
  background: linear-gradient(180deg, var(--tarjeta-alta), var(--tarjeta));
  border: 1px solid var(--borde); border-radius: var(--radio);
  padding: 20px; box-shadow: var(--sombra); position: relative; overflow: hidden;
}
.metrica::after {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--acento) 40%, transparent), transparent);
}
.metrica .cifra {
  font-family: var(--display); font-size: 40px; font-weight: 700;
  letter-spacing: -1.5px; line-height: 1; font-variant-numeric: tabular-nums;
}
.metrica .rotulo { color: var(--suave); font-size: 13.5px; font-weight: 600; margin-top: 8px; }
.metrica.alerta .cifra { color: var(--alerta); }
.metrica.alerta::after { background: linear-gradient(90deg, transparent, var(--alerta), transparent); }
.salud {
  display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--display); font-size: 22px; font-weight: 700; line-height: 1.2;
}
.punto { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
.punto.bien { background: var(--bien); box-shadow: 0 0 0 4px color-mix(in srgb, var(--bien) 18%, transparent); }
.punto.atencion { background: var(--aviso); box-shadow: 0 0 0 4px color-mix(in srgb, var(--aviso) 18%, transparent); }
.punto.critico { background: var(--alerta); box-shadow: 0 0 0 4px color-mix(in srgb, var(--alerta) 18%, transparent); }

input:not([type=hidden]) {
  font: inherit; background: color-mix(in srgb, var(--fondo) 70%, transparent);
  color: var(--texto); border: 1px solid var(--borde);
  border-radius: var(--radio-s); padding: 9px 11px; width: 100%; min-width: 60px;
}
input:focus { outline: none; border-color: var(--acento); }
td .acciones { flex-wrap: nowrap; }
.fila-alta { display: grid; gap: 9px; grid-template-columns: 2fr 2fr 1fr 1fr auto; margin-top: 16px; }
@media (max-width: 640px) { .fila-alta { grid-template-columns: 1fr 1fr; } }

.burbuja {
  max-width: 86%; padding: 12px 16px; border-radius: 16px;
  margin-bottom: 9px; white-space: pre-wrap; box-shadow: var(--sombra);
}
.burbuja.pregunta { background: var(--tarjeta); border: 1px solid var(--borde); border-bottom-left-radius: 5px; }
.burbuja.respuesta {
  background: linear-gradient(180deg, var(--acento), color-mix(in srgb, var(--acento) 82%, #000));
  color: #fff; margin-left: auto; border-bottom-right-radius: 5px;
}
select.negocios {
  font: inherit; font-weight: 600; background: var(--tarjeta); color: var(--texto);
  border: 1px solid var(--borde); border-radius: var(--radio-s); padding: 7px 10px;
}

/* Lo que necesita atención hoy, en la pantalla de inicio. */
.atencion { display: grid; gap: 10px; }
.riesgo {
  display: flex; align-items: center; gap: 14px;
  background: var(--tarjeta); border: 1px solid var(--borde);
  border-left: 3px solid var(--suave); border-radius: var(--radio-s);
  padding: 13px 16px; box-shadow: var(--sombra);
}
.riesgo.vencida { border-left-color: var(--alerta); }
.riesgo.en_riesgo { border-left-color: var(--aviso); }
.riesgo .quien { font-weight: 700; }
.riesgo .que { color: var(--suave); font-size: 13.5px; }
.riesgo .cuando { margin-left: auto; text-align: right; white-space: nowrap; }
@media (max-width: 560px) {
  .riesgo { flex-wrap: wrap; }
  .riesgo .cuando { margin-left: 0; width: 100%; text-align: left; }
}
`;

export function pagina(opciones: {
  titulo: string;
  negocio: string;
  activo: "inicio" | "bandeja" | "pedidos" | "clientes" | "conocimiento" | "registro" | "comenzar";
  pendientes: number;
  contenido: string;
  base: string;
  /** Se agrega a los enlaces de la nav para conservar el negocio elegido. */
  consulta?: string;
  /** Si hay más de uno, la cabecera muestra un selector en vez del nombre. */
  selector?: readonly { url: string; nombre: string; actual: boolean }[];
}): string {
  const consulta = opciones.consulta ?? "";
  const enlace = (ruta: string, texto: string, clave: string, globo = 0) =>
    `<a href="${opciones.base}${ruta}${consulta}" class="${opciones.activo === clave ? "activo" : ""}">${texto}${
      globo > 0 ? `<span class="globo">${globo}</span>` : ""
    }</a>`;

  const cabecera =
    opciones.selector && opciones.selector.length > 1
      ? `<select class="negocios" onchange="location.href=this.value">${opciones.selector
          .map((o) => `<option value="${esc(o.url)}"${o.actual ? " selected" : ""}>${esc(o.nombre)}</option>`)
          .join("")}</select>`
      : `<span class="negocio">${esc(opciones.negocio)}</span>`;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(opciones.titulo)} · CHUNO</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- display=swap: el texto se pinta de inmediato con la fuente del sistema y
     cambia cuando llegue. El panel se abre desde el mostrador de una óptica,
     con la señal que haya; nunca puede quedarse en blanco esperando una fuente. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@600;700&family=Nunito+Sans:wght@400;600;700&display=swap">
<style>${CSS}</style>
</head><body><div class="envoltorio">
<header><h1>CHUNO</h1>${cabecera}</header>
<nav>
  ${enlace("/inicio", "Inicio", "inicio")}
  ${enlace("/bandeja", "Decisiones", "bandeja", opciones.pendientes)}
  ${enlace("/pedidos", "Pedidos", "pedidos")}
  ${enlace("/clientes", "Clientes", "clientes")}
  ${enlace("/conocimiento", "Conocimiento", "conocimiento")}
  ${enlace("/registro", "Registro", "registro")}
  ${enlace("/comenzar", "＋ Nuevo asistente", "comenzar")}
</nav>
${opciones.contenido}
<p class="pie">Los mensajes se borran automáticamente a los 90 días.</p>
</div></body></html>`;
}
