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

/**
 * Los tokens del sistema de diseño Voz, en un solo lugar.
 *
 * Los exporta este módulo —y no un archivo aparte— porque el panel es su
 * consumidor principal, pero la landing pública los importa desde aquí. Tener
 * dos copias de la paleta es exactamente lo que produjo que la landing se
 * quedara oscura y azul mientras el panel ya era crema: el jurado saltaba de
 * un diseño a otro en el clic que más importa. Una sola fuente no se puede
 * desincronizar.
 *
 * Reglas que se respetan y no se relajan:
 *   · Sobre lima el texto SIEMPRE va oscuro. Nunca lima sobre crema.
 *   · #FF2F00 es exclusivo del CTA principal, uno dominante por pantalla.
 *     Para texto pequeño en rojo se usa #E02900, que sí contrasta.
 *   · Lima y rojo-naranja no van adyacentes con el mismo peso: compiten.
 */
export const TOKENS_VOZ = `
:root {
  --fondo: #FCFCFA; --fondo-2: #F5F5F2; --fondo-3: #EFEFEB;
  --tarjeta: #FFFFFF; --tarjeta-alta: #FFFFFF; --borde: #EFEFEB;
  --borde-fuerte: #E2E2DC;
  --texto: #1A1D14; --texto-2: #3D403A; --suave: #747069;
  --carbon: #33382C; --invertido: #282C20; --sobre-invertido: #F9F9F6;
  --lima: #D2FF00; --accion: #FF2F00; --accion-texto: #E02900;
  --bien: #3E9B6B;
  --radio: 14px; --radio-s: 10px;
  --sombra: 0 1px 2px rgba(26,29,20,.04), 0 6px 20px rgba(26,29,20,.06);
  --display: "Raleway", ui-sans-serif, system-ui, sans-serif;
  --cuerpo: "Nunito Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
  /* Alias de compatibilidad con las vistas ya escritas. */
  --acento: var(--carbon); --alerta: var(--accion-texto); --aviso: var(--carbon);
}
*, *::before, *::after { box-sizing: border-box; }
`;

/**
 * Las fuentes, con `display=swap` a propósito: el texto se pinta de inmediato
 * con la del sistema y cambia cuando llegue. Esto se abre desde el mostrador de
 * una óptica, con la señal que haya; nunca puede quedarse en blanco esperando
 * una fuente.
 */
export const FUENTES_VOZ = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap">`;

const CSS = `${TOKENS_VOZ}
body {
  margin: 0; color: var(--texto);
  font-family: var(--cuerpo); font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(1100px 380px at 50% -200px, color-mix(in srgb, var(--lima) 22%, transparent), transparent 72%),
    var(--fondo);
  background-color: var(--fondo);
  background-attachment: fixed;
  min-height: 100vh;
}
.envoltorio { max-width: 1000px; margin: 0 auto; padding: 28px 20px 72px; }

header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
h1 {
  font-family: var(--display); font-size: 21px; font-weight: 800;
  margin: 0; letter-spacing: 1.4px; color: var(--carbon);
  display: inline-flex; align-items: center; gap: 9px;
}
/* La onda de marca, reducida a su gesto mínimo: una barra lima. */
h1::before {
  content: ""; width: 5px; height: 20px; border-radius: 3px;
  background: var(--lima);
}
.negocio {
  color: var(--suave); font-size: 14px; font-weight: 600;
  padding-left: 14px; border-left: 1px solid var(--borde);
}

nav { display: flex; gap: 7px; margin: 22px 0 26px; flex-wrap: wrap; }
nav a {
  padding: 8px 15px; border-radius: 999px; text-decoration: none;
  color: var(--suave); border: 1px solid var(--borde); font-size: 14px;
  font-weight: 600; background: var(--tarjeta);
  transition: color .15s, border-color .15s, background .15s;
}
nav a:hover { color: var(--texto); border-color: var(--carbon); }
nav a.activo {
  color: var(--sobre-invertido); border-color: transparent;
  background: var(--invertido);
  box-shadow: 0 4px 14px rgba(40,44,32,.18);
}
nav .globo {
  background: var(--accion); color: #fff; border-radius: 999px;
  padding: 1px 8px; font-size: 12px; font-weight: 700; margin-left: 7px;
}
nav a.activo .globo { background: var(--lima); color: var(--invertido); }

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
.tarjeta.urgente { border-left: 3px solid var(--accion); }
.motivo { font-size: 15.5px; margin: 0 0 12px; line-height: 1.55; }
.propuesto {
  background: var(--fondo-2);
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
  background: var(--accion); border-color: transparent; color: #fff;
  box-shadow: 0 4px 14px rgba(255,47,0,.24);
}
button.primario:hover { background: var(--accion-texto); filter: none; }
button:hover { filter: brightness(.98); }
button:active { transform: translateY(1px); }

table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th {
  text-align: left; color: var(--suave); font-family: var(--display);
  font-weight: 700; font-size: 11px; text-transform: uppercase;
  letter-spacing: 1.2px; padding: 0 10px 10px;
}
td { padding: 13px 10px; border-top: 1px solid var(--borde); vertical-align: top; }
tbody tr:hover { background: var(--fondo-2); }

.chip {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 700; white-space: nowrap;
}
.chip.vencida { background: rgba(255,47,0,.10); color: var(--accion-texto); }
.chip.en_riesgo { background: var(--lima); color: var(--invertido); }
.chip.sin_fecha { background: var(--fondo-3); color: var(--suave); }
.chip.ok { background: rgba(62,155,107,.12); color: var(--bien); }

.vacio { color: var(--suave); text-align: center; padding: 44px 16px; }
.vacio strong {
  display: block; color: var(--texto); margin-bottom: 6px;
  font-family: var(--display); font-size: 16px; font-weight: 700;
}
.pie { color: var(--suave); font-size: 12.5px; margin-top: 36px; text-align: center; }
.enlace-pie {
  font: inherit; background: none; border: none; padding: 0;
  color: var(--suave); text-decoration: underline; cursor: pointer;
}
.enlace-pie:hover { color: var(--texto); }
.registro {
  font-size: 13.5px; color: var(--suave); display: flex; gap: 12px;
  padding: 10px 0; border-top: 1px solid var(--borde); align-items: baseline;
}
.registro:first-of-type { border-top: none; padding-top: 0; }
.registro time { white-space: nowrap; font-variant-numeric: tabular-nums; }

.metricas { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); margin-bottom: 14px; }
.metrica {
  background: var(--tarjeta);
  border: 1px solid var(--borde); border-radius: var(--radio);
  padding: 20px; box-shadow: var(--sombra); position: relative; overflow: hidden;
}
.metrica::after {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--lima), transparent);
}
.metrica .cifra {
  font-family: var(--display); font-size: 40px; font-weight: 700;
  letter-spacing: -1.5px; line-height: 1; font-variant-numeric: tabular-nums;
}
.metrica .rotulo { color: var(--suave); font-size: 13.5px; font-weight: 600; margin-top: 8px; }
.metrica.alerta .cifra { color: var(--accion-texto); }
.metrica.alerta::after { background: linear-gradient(90deg, transparent, var(--accion), transparent); }
.salud {
  display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--display); font-size: 22px; font-weight: 700; line-height: 1.2;
}
.punto { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
.punto.bien { background: var(--bien); box-shadow: 0 0 0 4px rgba(62,155,107,.16); }
.punto.atencion { background: var(--lima); box-shadow: 0 0 0 4px rgba(210,255,0,.35); }
.punto.critico { background: var(--accion); box-shadow: 0 0 0 4px rgba(255,47,0,.16); }

input:not([type=hidden]) {
  font: inherit; background: var(--fondo-2);
  color: var(--texto); border: 1px solid var(--borde-fuerte);
  border-radius: var(--radio-s); padding: 9px 11px; width: 100%; min-width: 60px;
}
input:focus { outline: none; border-color: var(--carbon); }
td .acciones { flex-wrap: nowrap; }
.fila-alta { display: grid; gap: 9px; grid-template-columns: 2fr 2fr 1fr 1fr auto; margin-top: 16px; }
@media (max-width: 640px) { .fila-alta { grid-template-columns: 1fr 1fr; } }

.burbuja {
  max-width: 86%; padding: 12px 16px; border-radius: 16px;
  margin-bottom: 9px; white-space: pre-wrap; box-shadow: var(--sombra);
}
.burbuja.pregunta { background: var(--tarjeta); border: 1px solid var(--borde); border-bottom-left-radius: 5px; }
.burbuja.respuesta {
  background: var(--invertido); color: var(--sobre-invertido);
  margin-left: auto; border-bottom-right-radius: 5px;
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
.riesgo.vencida { border-left-color: var(--accion); }
.riesgo.en_riesgo { border-left-color: var(--lima); }
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
${FUENTES_VOZ}
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
<p class="pie">Los mensajes se borran automáticamente a los 90 días.${
    opciones.base === "/panel"
      ? ` · <form method="post" action="/salir" style="display:inline"><button class="enlace-pie">Cerrar sesión</button></form>`
      : ""
  }</p>
</div></body></html>`;
}
