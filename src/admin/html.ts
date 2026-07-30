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
  --fondo: #0f1115; --tarjeta: #171a21; --borde: #262b36;
  --texto: #e8eaee; --suave: #9aa3b2; --acento: #4f8cff;
  --alerta: #ff6b6b; --aviso: #ffb648; --bien: #3ecf8e;
  --radio: 12px;
}
@media (prefers-color-scheme: light) {
  :root {
    --fondo: #f6f7f9; --tarjeta: #ffffff; --borde: #e3e6ec;
    --texto: #131720; --suave: #626b7b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--fondo); color: var(--texto);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.envoltorio { max-width: 940px; margin: 0 auto; padding: 20px 16px 64px; }
header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
h1 { font-size: 20px; margin: 0; letter-spacing: -0.2px; }
.negocio { color: var(--suave); font-size: 14px; }
nav { display: flex; gap: 6px; margin: 18px 0 22px; flex-wrap: wrap; }
nav a {
  padding: 7px 13px; border-radius: 999px; text-decoration: none;
  color: var(--suave); border: 1px solid var(--borde); font-size: 14px;
}
nav a.activo { color: var(--texto); border-color: var(--acento); background: color-mix(in srgb, var(--acento) 12%, transparent); }
nav .globo { background: var(--alerta); color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 12px; margin-left: 6px; }
.tarjeta { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: var(--radio); padding: 16px; margin-bottom: 12px; }
.tarjeta.urgente { border-left: 3px solid var(--alerta); }
.motivo { font-size: 15px; margin: 0 0 10px; }
.propuesto { background: var(--fondo); border: 1px solid var(--borde); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.etiqueta { font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--suave); margin-bottom: 6px; }
textarea {
  width: 100%; min-height: 78px; background: transparent; color: var(--texto);
  border: none; resize: vertical; font: inherit; padding: 0;
}
textarea:focus { outline: none; }
.acciones { display: flex; gap: 8px; flex-wrap: wrap; }
button {
  font: inherit; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--borde);
  background: var(--tarjeta); color: var(--texto); cursor: pointer;
}
button.primario { background: var(--acento); border-color: var(--acento); color: #fff; font-weight: 600; }
button:hover { filter: brightness(1.12); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; color: var(--suave); font-weight: 500; font-size: 12px;
     text-transform: uppercase; letter-spacing: 0.6px; padding: 0 10px 8px; }
td { padding: 12px 10px; border-top: 1px solid var(--borde); vertical-align: top; }
.chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.chip.vencida { background: color-mix(in srgb, var(--alerta) 20%, transparent); color: var(--alerta); }
.chip.en_riesgo { background: color-mix(in srgb, var(--aviso) 20%, transparent); color: var(--aviso); }
.chip.sin_fecha { background: color-mix(in srgb, var(--suave) 20%, transparent); color: var(--suave); }
.chip.ok { background: color-mix(in srgb, var(--bien) 18%, transparent); color: var(--bien); }
.vacio { color: var(--suave); text-align: center; padding: 40px 16px; }
.vacio strong { display: block; color: var(--texto); margin-bottom: 4px; }
.pie { color: var(--suave); font-size: 12px; margin-top: 28px; text-align: center; }
.registro { font-size: 13px; color: var(--suave); display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--borde); }
.registro time { white-space: nowrap; }
.metricas { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-bottom:12px; }
.metrica { background:var(--tarjeta); border:1px solid var(--borde); border-radius:var(--radio); padding:16px; }
.metrica .cifra { font-size:30px; font-weight:700; letter-spacing:-1px; line-height:1.1; }
.metrica .rotulo { color:var(--suave); font-size:13px; margin-top:4px; }
.metrica.alerta .cifra { color:var(--alerta); }
.salud { display:inline-flex; align-items:center; gap:7px; font-size:17px; font-weight:600; line-height:1.6; }
.punto { width:9px; height:9px; border-radius:50%; display:inline-block; }
.punto.bien { background:var(--bien); }
.punto.atencion { background:var(--aviso); }
.punto.critico { background:var(--alerta); }
input:not([type=hidden]) { font: inherit; background: var(--fondo); color: var(--texto);
  border: 1px solid var(--borde); border-radius: 8px; padding: 7px 10px; width: 100%; min-width: 60px; }
td .acciones { flex-wrap: nowrap; }
.fila-alta { display: grid; gap: 8px; grid-template-columns: 2fr 2fr 1fr 1fr auto; margin-top: 14px; }
@media (max-width: 640px) { .fila-alta { grid-template-columns: 1fr 1fr; } }
.burbuja { max-width: 85%; padding: 10px 14px; border-radius: 14px; margin-bottom: 8px; white-space: pre-wrap; }
.burbuja.pregunta { background: var(--tarjeta); border: 1px solid var(--borde); }
.burbuja.respuesta { background: color-mix(in srgb, var(--acento) 14%, transparent); margin-left: auto; }
select.negocios { font: inherit; background: var(--tarjeta); color: var(--texto);
  border: 1px solid var(--borde); border-radius: 8px; padding: 5px 8px; }
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
