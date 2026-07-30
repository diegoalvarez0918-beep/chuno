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

/**
 * La textura topográfica del sistema Voz (`assets/topo-light.svg` del brandbook).
 *
 * Va como elemento SVG y no como `background-image` con data URI: codificar el
 * SVG dentro de una cadena CSS que a su vez vive en un template literal deja
 * tres niveles de escapado donde un `#` mal encodeado rompe en silencio y no lo
 * atrapa ningún test. Un elemento con `aria-hidden` no tiene ese problema.
 */
export function topo(clase: string, color = "#33382C", opacidad = ".06"): string {
  const anillo = (cx: number, cy: number, rx: number, ry: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;

  const foco = (cx: number, cy: number, escalas: readonly number[]) =>
    escalas.map((r) => anillo(cx, cy, r, Math.round(r * 0.76))).join("");

  return `<svg class="${clase}" viewBox="0 0 1000 1000" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <g fill="none" stroke="${color}" stroke-width="1.4" opacity="${opacidad}">
      ${foco(270, 300, [50, 95, 145, 200, 260, 325])}
      ${foco(740, 700, [60, 115, 175, 240, 310, 385])}
      ${foco(860, 150, [40, 80, 125, 175])}
    </g>
  </svg>`;
}

/** La onda de Voz: el indicador de sección del sistema, en lima. */
export function onda(alto = 16): string {
  const barras = [0.35, 0.62, 1, 0.78, 0.45, 0.9, 0.55];
  const cuerpo = barras
    .map((f, i) => {
      const h = Math.round(alto * f);
      return `<rect x="${i * 6}" y="${Math.round((alto - h) / 2)}" width="3" height="${h}" rx="1.5"/>`;
    })
    .join("");

  return `<svg class="onda" width="${barras.length * 6 - 3}" height="${alto}" viewBox="0 0 ${
    barras.length * 6 - 3
  } ${alto}" fill="currentColor" aria-hidden="true">${cuerpo}</svg>`;
}

/** Iconografía Voz: lineal, minimalista, trazos con extremos redondeados. */
const ICONOS: Record<string, string> = {
  inicio: '<path d="M3 9.5 10 3l7 6.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/>',
  bandeja: '<path d="M2.5 11.5h4l1.5 2.5h4l1.5-2.5h4M2.5 11.5 5 4h10l2.5 7.5v4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>',
  pedidos: '<path d="M6.5 3.5h7a1 1 0 0 1 1 1v12l-4.5-2.5L5.5 16.5v-12a1 1 0 0 1 1-1z"/><path d="M8 7.5h4"/>',
  clientes:
    '<circle cx="8" cy="7" r="2.8"/><path d="M2.8 16.5c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2"/><path d="M13.5 4.6a2.8 2.8 0 0 1 0 5.3M15 16.5c0-1.6-.5-3-1.4-4.1"/>',
  conocimiento:
    '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v11.5H5.5A1.5 1.5 0 0 0 4 16z"/><path d="M4 16a1.5 1.5 0 0 1 1.5-1.5H16V17H5.5A1.5 1.5 0 0 1 4 15.5z"/><path d="M7 7h6M7 10h4"/>',
  registro:
    '<circle cx="10" cy="10" r="7"/><path d="M10 6v4.2l2.8 1.8"/>',
  comenzar: '<path d="M10 4v12M4 10h12"/>',
};

function icono(clave: string): string {
  return `<svg class="ico" width="20" height="20" viewBox="0 0 20 20" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ICONOS[clave] ?? ""}</svg>`;
}

/**
 * Qué resuelve cada pantalla, en una línea y en lenguaje de dueño.
 *
 * No es decoración. Un panel con seis pestañas rotuladas "Inicio / Decisiones /
 * Pedidos" se lee como cualquier otro tablero: lo que lo distingue de un chatbot
 * es *por qué* existe cada pantalla, y eso hay que decirlo en la pantalla, no en
 * la landing que el dueño ya no va a volver a leer.
 */
const PROPOSITO: Record<string, string> = {
  inicio: "Lo que tienes que atender hoy, antes de que un cliente reclame.",
  bandeja: "Nada sale hacia un cliente sin que tú lo apruebes. Esto espera tu criterio.",
  pedidos: "Cada promesa que hiciste, con su fecha y su riesgo.",
  clientes: "Se llenó solo con lo que la gente escribió en el chat. Nadie capturó nada.",
  conocimiento: "Lo que el asistente sabe de tu negocio. Si no está aquí, no lo dice.",
  registro: "Qué propuso el asistente, qué aprobaste tú y cuándo.",
  comenzar: "Siete preguntas y queda un asistente configurado con tu catálogo.",
};

const GRUPOS: readonly { rotulo: string; items: readonly { ruta: string; texto: string; clave: string }[] }[] = [
  {
    rotulo: "Tu día",
    items: [
      { ruta: "/inicio", texto: "Inicio", clave: "inicio" },
      { ruta: "/bandeja", texto: "Decisiones", clave: "bandeja" },
      { ruta: "/pedidos", texto: "Pedidos", clave: "pedidos" },
    ],
  },
  {
    rotulo: "Tu negocio",
    items: [
      { ruta: "/clientes", texto: "Clientes", clave: "clientes" },
      { ruta: "/conocimiento", texto: "Conocimiento", clave: "conocimiento" },
    ],
  },
  {
    rotulo: "Confianza",
    items: [{ ruta: "/registro", texto: "Registro", clave: "registro" }],
  },
];

const CSS = `${TOKENS_VOZ}
body {
  margin: 0; color: var(--texto);
  font-family: var(--cuerpo); font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  background: var(--fondo);
  min-height: 100vh;
}

/* ───────────────────────────────────────────────────── armazón lateral ── */
/* Barra fija a la izquierda, contenido a la derecha. El dueño no navega: mira
   una sola columna de trabajo y siempre sabe dónde está parado. */
.armazon { display: grid; grid-template-columns: 252px 1fr; min-height: 100vh; }

.lateral {
  position: sticky; top: 0; align-self: start; height: 100vh;
  background: var(--invertido); color: var(--sobre-invertido);
  display: flex; flex-direction: column; overflow: hidden;
}
.lateral .topo-fondo {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
.lateral > * { position: relative; z-index: 1; }

.marca {
  display: flex; align-items: center; gap: 10px; text-decoration: none;
  padding: 24px 22px 18px; color: var(--sobre-invertido);
}
.marca .nombre {
  font-family: var(--display); font-size: 20px; font-weight: 800;
  letter-spacing: 1.6px; line-height: 1;
}
.marca .onda { color: var(--lima); display: block; }

.quien {
  margin: 0 16px 6px; padding: 11px 13px; border-radius: var(--radio-s);
  background: rgba(249,249,246,.06); border: 1px solid rgba(249,249,246,.09);
}
.quien .rotulo-mini {
  font-family: var(--display); font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.4px; color: #9A958C; display: block;
}
.quien .nombre-negocio {
  font-weight: 700; font-size: 14.5px; margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
select.negocios {
  font: inherit; font-weight: 700; font-size: 14.5px; margin-top: 3px;
  width: 100%; background: transparent; color: var(--sobre-invertido);
  border: none; padding: 0; cursor: pointer;
}
select.negocios option { color: var(--texto); }

.lateral nav { padding: 14px 16px 10px; overflow-y: auto; flex: 1; }
.grupo {
  font-family: var(--display); font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.5px; color: #8E897F;
  margin: 16px 0 7px 13px;
}
.grupo:first-child { margin-top: 0; }
.lateral nav a {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 13px; border-radius: var(--radio-s); margin-bottom: 2px;
  text-decoration: none; color: #CFCBC2; font-size: 14.5px; font-weight: 600;
  transition: background .15s, color .15s;
}
.lateral nav a .ico { flex: none; opacity: .78; }
.lateral nav a:hover { background: rgba(249,249,246,.07); color: var(--sobre-invertido); }
.lateral nav a.activo { background: var(--lima); color: var(--invertido); font-weight: 700; }
.lateral nav a.activo .ico { opacity: 1; }
.globo {
  margin-left: auto; background: var(--accion); color: #fff; border-radius: 999px;
  padding: 1px 8px; font-size: 12px; font-weight: 700; line-height: 1.5;
}
.lateral nav a.activo .globo { background: var(--invertido); color: var(--lima); }

.lateral-pie { padding: 14px 16px 20px; border-top: 1px solid rgba(249,249,246,.09); }
.lateral-pie a.nuevo {
  display: flex; align-items: center; gap: 10px; padding: 9px 13px;
  border-radius: var(--radio-s); text-decoration: none; font-size: 14px;
  font-weight: 700; color: var(--sobre-invertido);
  border: 1px dashed rgba(249,249,246,.28);
}
.lateral-pie a.nuevo:hover { border-color: var(--lima); color: var(--lima); }
.lateral-pie .nota { color: #8E897F; font-size: 11.5px; margin: 12px 0 0; line-height: 1.5; }
.enlace-pie {
  font: inherit; font-size: 11.5px; background: none; border: none; padding: 0;
  color: #8E897F; text-decoration: underline; cursor: pointer;
}
.enlace-pie:hover { color: var(--lima); }

/* ────────────────────────────────────────────────────────── contenido ── */
.principal { min-width: 0; }
.encabezado {
  padding: 34px 40px 22px; border-bottom: 1px solid var(--borde);
  background:
    radial-gradient(760px 220px at 12% -140px, rgba(210,255,0,.30), transparent 70%),
    var(--fondo);
}
.encabezado h1 {
  font-family: var(--display); font-size: 27px; font-weight: 700;
  letter-spacing: -.02em; margin: 0; color: var(--texto);
}
.encabezado .proposito {
  color: var(--suave); font-size: 15px; margin: 6px 0 0; max-width: 62ch;
}
.lienzo-panel { padding: 26px 40px 72px; max-width: 1120px; }

@media (max-width: 900px) {
  .armazon { grid-template-columns: 1fr; }
  .lateral { position: static; height: auto; flex-direction: column; }
  .lateral nav { display: flex; gap: 6px; overflow-x: auto; padding: 4px 14px 14px; }
  .lateral nav a { white-space: nowrap; margin-bottom: 0; }
  .grupo { display: none; }
  .lateral-pie { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .lateral-pie .nota { margin: 0; }
  .encabezado { padding: 24px 20px 18px; }
  .encabezado h1 { font-size: 23px; }
  .lienzo-panel { padding: 20px 20px 64px; }
}

/* ────────────────────────────────────────────── componentes de vista ── */
.seccion {
  font-family: var(--display); font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.6px; color: var(--suave);
  margin: 30px 0 12px; display: flex; align-items: center; gap: 9px;
}
.seccion:first-child { margin-top: 0; }
.seccion::before {
  content: ""; width: 4px; height: 13px; border-radius: 2px; background: var(--lima);
}

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

/* ── El embudo, como tablero ──────────────────────────────────────────────
   Cinco columnas con scroll horizontal. Cada estado lleva su color en la
   cabecera y en el borde superior de la columna: el color es lo que hace que
   "dónde está cada cliente" se lea de un vistazo y no leyendo etiquetas.
   Se respeta la gramática de Voz — sobre lima el texto va oscuro, y el rojo
   pequeño es #E02900, no #FF2F00. */
.embudo {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(252px, 1fr);
  gap: 12px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 26px;
  align-items: start;
}
.columna {
  background: var(--fondo-2); border: 1px solid var(--borde);
  border-radius: var(--radio); overflow: hidden; min-height: 140px;
  transition: background .15s, border-color .15s;
}
.columna.encima { background: var(--fondo-3); border-color: var(--carbon); }
.columna-cab { padding: 14px 15px 12px; border-top: 3px solid var(--suave); background: var(--tarjeta); }
.columna-cab h3 {
  font-family: var(--display); font-size: 15px; font-weight: 700; margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.columna-cab h3::before {
  content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--suave); flex: none;
}
.columna-cifras {
  margin: 5px 0 0; font-size: 12.5px; font-weight: 700; color: var(--texto-2);
  font-variant-numeric: tabular-nums;
}
.columna-ayuda { margin: 6px 0 0; font-size: 11.5px; color: var(--suave); line-height: 1.45; }
.columna-cuerpo { padding: 10px; display: grid; gap: 9px; }
.columna-vacia {
  color: var(--suave); font-size: 12.5px; text-align: center; padding: 18px 8px;
  border: 1px dashed var(--borde-fuerte); border-radius: var(--radio-s);
}

/* Un color por etapa. Neutro al entrar, lima cuando ya dijo que sí, verde si
   compró, rojo accesible si se perdió. */
.columna.nuevo      .columna-cab { border-top-color: var(--borde-fuerte); }
.columna.nuevo      .columna-cab h3::before { background: var(--borde-fuerte); }
.columna.contactado .columna-cab { border-top-color: var(--carbon); }
.columna.contactado .columna-cab h3::before { background: var(--carbon); }
.columna.interesado .columna-cab { border-top-color: var(--lima); }
.columna.interesado .columna-cab h3::before { background: var(--lima); }
.columna.cliente    .columna-cab { border-top-color: var(--bien); }
.columna.cliente    .columna-cab h3::before { background: var(--bien); }
.columna.perdido    .columna-cab { border-top-color: var(--accion-texto); }
.columna.perdido    .columna-cab h3::before { background: var(--accion-texto); }

.trato {
  background: var(--tarjeta); border: 1px solid var(--borde);
  border-radius: var(--radio-s); padding: 12px; box-shadow: var(--sombra);
  cursor: grab;
}
.trato.llevando { opacity: .45; cursor: grabbing; }
.trato-cab { display: flex; align-items: center; gap: 9px; font-size: 14.5px; }
.avatar {
  width: 26px; height: 26px; border-radius: 50%; flex: none;
  background: var(--fondo-3); color: var(--texto-2);
  font-size: 10.5px; font-weight: 700; letter-spacing: .3px;
  display: inline-flex; align-items: center; justify-content: center;
}
.trato-interes {
  margin: 8px 0 0; font-size: 12.8px; color: var(--suave); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.trato-pie {
  margin-top: 10px; display: flex; align-items: center; gap: 9px;
  font-size: 13px; font-variant-numeric: tabular-nums;
}
.trato-pie .valor { font-weight: 700; }
.trato-pie .canal {
  margin-left: auto; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .8px; color: var(--suave);
}
.trato-mover { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 10px; }
.trato-mover .mover {
  font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: 999px;
  border: 1px solid var(--borde-fuerte); background: var(--fondo-2); color: var(--suave);
}
.trato-mover .mover:hover { background: var(--invertido); color: var(--sobre-invertido); border-color: transparent; }

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
    `<a href="${opciones.base}${ruta}${consulta}" class="${
      opciones.activo === clave ? "activo" : ""
    }">${icono(clave)}<span>${texto}</span>${
      globo > 0 ? `<span class="globo">${globo}</span>` : ""
    }</a>`;

  const navegacion = GRUPOS.map(
    (g) => `<div class="grupo">${g.rotulo}</div>${g.items
      .map((i) => enlace(i.ruta, i.texto, i.clave, i.clave === "bandeja" ? opciones.pendientes : 0))
      .join("")}`,
  ).join("");

  const identidad =
    opciones.selector && opciones.selector.length > 1
      ? `<select class="negocios" onchange="location.href=this.value">${opciones.selector
          .map(
            (o) =>
              `<option value="${esc(o.url)}"${o.actual ? " selected" : ""}>${esc(o.nombre)}</option>`,
          )
          .join("")}</select>`
      : `<div class="nombre-negocio">${esc(opciones.negocio)}</div>`;

  const salir =
    opciones.base === "/panel"
      ? `<form method="post" action="/salir" style="display:inline"><button class="enlace-pie">Cerrar sesión</button></form>`
      : "";

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(opciones.titulo)} · CHUNO</title>
${FUENTES_VOZ}
<style>${CSS}</style>
</head><body>
<div class="armazon">

  <aside class="lateral">
    ${topo("topo-fondo", "#F9F9F6", ".07")}
    <a class="marca" href="${opciones.base}/inicio${consulta}">
      ${onda(20)}<span class="nombre">CHUNO</span>
    </a>

    <div class="quien">
      <span class="rotulo-mini">Negocio</span>
      ${identidad}
    </div>

    <nav>${navegacion}</nav>

    <div class="lateral-pie">
      <a class="nuevo" href="${opciones.base}/comenzar">${icono("comenzar")}<span>Nuevo asistente</span></a>
      <p class="nota">Los mensajes se borran a los 90 días. ${salir}</p>
    </div>
  </aside>

  <main class="principal">
    <div class="encabezado">
      <h1>${esc(opciones.titulo)}</h1>
      <p class="proposito">${esc(PROPOSITO[opciones.activo] ?? "")}</p>
    </div>
    <div class="lienzo-panel">${opciones.contenido}</div>
  </main>

</div></body></html>`;
}
