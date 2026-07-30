import { FUENTES_VOZ, TOKENS_VOZ, onda, topo } from "../admin/html";

/**
 * La página pública.
 *
 * Abre con el problema, no con el producto: es lo que ve un votante que llega
 * frío y le da treinta segundos. La demo está a un clic, sin registro.
 *
 * Los tokens de color y tipografía se importan del panel a propósito. Esta
 * página vivió meses con su propia paleta oscura mientras el panel ya era crema,
 * y el salto ocurría justo en el clic que más importa. Con una sola fuente de
 * verdad ese desfase no puede volver a aparecer.
 */

const REPO = "https://github.com/diegoalvarez0918-beep/chuno";

/**
 * El bot está vivo desde la primera fase y hasta hoy no había forma de llegar a
 * él desde la página. Es lo único del proyecto que un desconocido puede probar
 * sin creernos nada.
 *
 * Ojo con lo que se promete aquí: este bot escribe en `mi-optica`, que vive
 * detrás de la contraseña del panel. Quien le escriba recibe respuesta real,
 * pero NO puede ver su propio pedido en la demo, que muestra `demo-optica`.
 * Apuntarlo a la demo cerraría el lazo y publicaría las conversaciones de unos
 * visitantes a los otros, que es justo lo que las reglas de privacidad prohíben.
 */
const BOT = "https://t.me/Chunnobot";

/**
 * El titular del hero, palabra por palabra: cada una entra con su retraso.
 *
 * Dice lo que la plataforma HACE, en positivo y sin juego de palabras. Pasó por
 * dos versiones que no servían: una que pedía resolver un doble sentido ("tu
 * WhatsApp ya es tu sistema operativo, el problema es que no es un sistema") y
 * otra en forma de pregunta que dejaba al visitante en el problema sin ofrecerle
 * la salida. El dolor ya tiene su sección propia más abajo; el hero es para el
 * valor.
 */
const TITULAR = "Crea asistentes que atienden tu negocio y cumplen tus fechas.";

/** Lo que se ve debajo: el desorden del que sale el pedido. */
const BURBUJAS: readonly { texto: string; x: string; y: string; giro: string; mia?: boolean }[] = [
  { texto: "Hola, ¿ya están listas mis gafas?", x: "4%", y: "8%", giro: "-2.5deg" },
  { texto: "Le confirmo y le aviso 🙏", x: "46%", y: "2%", giro: "1.8deg", mia: true },
  { texto: "¿para cuándo era lo mío?", x: "13%", y: "26%", giro: "1.2deg" },
  { texto: "Buenas, ¿me quedó para el jueves?", x: "52%", y: "22%", giro: "-1.6deg" },
  { texto: "déjame reviso y te escribo", x: "2%", y: "45%", giro: "2.2deg", mia: true },
  { texto: "¿el progresivo cuánto se demora?", x: "44%", y: "42%", giro: "-2deg" },
  { texto: "necesito saber si alcanzo a viajar", x: "20%", y: "60%", giro: "1.4deg" },
  { texto: "¿alguna novedad?", x: "60%", y: "58%", giro: "-1.1deg" },
  { texto: "sí señora, mañana le confirmo", x: "6%", y: "76%", giro: "-2.4deg", mia: true },
  { texto: "llevo una semana esperando 😔", x: "48%", y: "78%", giro: "1.7deg" },
];

/** Lo que revela el spotlight: lo mismo, pero convertido en estado operativo. */
const FILAS: readonly { quien: string; que: string; cuando: string; chip: string; riesgo: string }[] = [
  { quien: "Marta Ruiz", que: "Lentes progresivos con antirreflejo", cuando: "vence hace 4 días", chip: "Vencido", riesgo: "vencida" },
  { quien: "Sandra Ospina", que: "Gafas monofocales para niña", cuando: "sin fecha acordada", chip: "Sin fecha", riesgo: "sin_fecha" },
  { quien: "Luisa Gómez", que: "Cambio de lentes con antirreflejo", cuando: "para hoy", chip: "Vence hoy", riesgo: "en_riesgo" },
  { quien: "Andrés Molina", que: "Gafas de sol formuladas", cuando: "para mañana", chip: "A tiempo", riesgo: "ok" },
  { quien: "Jorge Rivas", que: "Montura infantil flexible", cuando: "en 6 días", chip: "A tiempo", riesgo: "ok" },
];

const PASOS: readonly { n: string; titulo: string; texto: string }[] = [
  {
    n: "01",
    titulo: "El cliente escribe, como siempre",
    texto:
      "Por WhatsApp o Telegram, en renglones sueltos y sin formato. Nadie cambia de app y nadie llena un formulario.",
  },
  {
    n: "02",
    titulo: "CHUNO arma el pedido con su fecha",
    texto:
      "Lee la conversación y saca quién es, qué encargó, cuánto vale y para cuándo quedó. Si algo no le queda claro, no lo inventa: te lo pregunta.",
  },
  {
    n: "03",
    titulo: "El vigía levanta la mano a tiempo",
    texto:
      "Revisa tus promesas cada media hora. Cuando una se está por caer te avisa a tiempo, mientras todavía puedes llamar al cliente tú.",
  },
  {
    n: "04",
    titulo: "Tú apruebas. Siempre tú",
    texto:
      "Te deja el mensaje escrito y listo para enviar. Lo lees, lo editas si quieres, y sale con un clic. Nunca sin ti.",
  },
];

/**
 * La comparación que la página no tenía y que era su hueco más grande.
 *
 * Un votante que llega frío ve "asistente para WhatsApp" y lo archiva mentalmente
 * como un chatbot más. La diferencia de CHUNO no es cómo contesta —es lo que
 * queda escrito después—, y eso hay que ponerlo lado a lado o no se ve.
 */
const CONTRASTE: readonly { bot: string; chuno: string }[] = [
  {
    bot: "Contesta el mensaje y lo olvida.",
    chuno: "Convierte la conversación en un pedido con fecha comprometida.",
  },
  {
    bot: "Al otro día nadie sabe qué se le prometió a quién.",
    chuno: "Un tablero con qué venció, qué vence hoy y qué va a tiempo.",
  },
  {
    bot: "Te enteras de que incumpliste cuando el cliente reclama.",
    chuno: "Revisa tus promesas cada media hora y te avisa antes de que reclame.",
  },
  {
    bot: "Le escribe a tu cliente por su cuenta.",
    chuno: "Te deja el mensaje redactado. Sale solo cuando tú lo apruebas.",
  },
  {
    bot: "Tus conversaciones viven en el servidor de otro.",
    chuno: "Corre en la nube de tu propio negocio, con tus datos y sin telemetría.",
  },
];

const GARANTIAS: readonly { fuerte: string; resto: string }[] = [
  { fuerte: "Corre en tu propia nube.", resto: "Tus conversaciones y tus clientes no pasan por servidores nuestros." },
  { fuerte: "La IA no toca la base de datos.", resto: "Solo propone datos que el sistema valida; si algo no cuadra, va a tu bandeja en vez de escribirse solo." },
  { fuerte: "Nada sale sin tu visto bueno.", resto: "Es una regla del diseño, no una opción que se pueda apagar." },
  { fuerte: "Queda registro de todo:", resto: "qué propuso el asistente, qué aprobaste tú y cuándo." },
  { fuerte: "Los mensajes se borran a los 90 días.", resto: "Tratamiento de datos conforme a la Ley 1581 (Habeas Data)." },
  { fuerte: "Si le preguntan si es un bot, lo admite.", resto: "Siempre." },
];

const FLECHA = `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 13L13 5M13 5H6M13 5V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function pill(href: string, texto: string, clase = ""): string {
  return `<a class="pill ${clase}" href="${href}">
    <span class="pill-fondo"></span>
    <span class="pill-texto">${texto}</span>
    <span class="pill-circulo">${FLECHA}</span>
  </a>`;
}

const CSS = `${TOKENS_VOZ}
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--fondo-2); color: var(--texto);
  font-family: var(--cuerpo); font-size: 16px; line-height: 1.65;
  overflow-x: hidden; -webkit-font-smoothing: antialiased;
}

/* ─────────────────────────────────────────────────────────────── cortina ── */
/* Diez cajas lima que se abren en abanico. Es lo primero que ve un jurado: el
   gesto tarda ~1.35 s en total, que es intención deliberada y no una espera. */
.cortina {
  position: fixed; inset: 0; z-index: 9999; pointer-events: none;
  overflow: hidden; animation: cortinaFuera .3s ease 1.35s forwards;
}
.cortina-fila { display: flex; width: 100%; height: 50%; }
.cortina-caja { width: 20%; height: 100%; background: var(--lima); }
.cortina-fila.arriba .cortina-caja { animation: cortinaArriba 1s cubic-bezier(.96,-.02,.38,1.01) forwards; }
.cortina-fila.abajo .cortina-caja { animation: cortinaAbajo 1s cubic-bezier(.96,-.02,.38,1.01) forwards; }
.cortina-caja:nth-child(2) { animation-delay: .05s; }
.cortina-caja:nth-child(3) { animation-delay: .1s; }
.cortina-caja:nth-child(4) { animation-delay: .15s; }
.cortina-caja:nth-child(5) { animation-delay: .2s; }
@keyframes cortinaArriba { to { transform: translateY(-100%); } }
@keyframes cortinaAbajo { to { transform: translateY(100%); } }
@keyframes cortinaFuera { to { opacity: 0; visibility: hidden; } }

/* ────────────────────────────────────────────────────────── navegación ── */
/* La marca va en modo diferencia: se lee oscura sobre el crema del hero y
   clara si algo oscuro pasa por debajo, sin necesidad de dos versiones del
   logo ni de saber qué hay detrás en cada scroll. */
.marca-fija {
  position: fixed; top: 30px; left: 20px; z-index: 20;
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--display); font-weight: 800; font-size: 21px;
  letter-spacing: 1.6px; color: #F4F1E8; text-decoration: none;
  mix-blend-mode: difference;
}
.marca-fija .onda { display: block; }
@media (min-width: 768px) { .marca-fija { top: 40px; left: 40px; } }

.hamburguesa {
  position: fixed; top: 16px; right: 20px; z-index: 22;
  width: 59px; height: 59px; border-radius: 50%; border: none;
  background: var(--sobre-invertido); cursor: pointer; box-shadow: var(--sombra);
  display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center;
  transition: background .4s ease;
}
@media (min-width: 768px) { .hamburguesa { top: 27px; right: 40px; } }
.hamburguesa .barra {
  display: block; width: 24px; height: 2px; border-radius: 2px;
  background: var(--texto); transition: transform .3s ease, background .3s ease;
}
.hamburguesa:hover { background: var(--invertido); }
.hamburguesa:hover .barra { background: var(--sobre-invertido); }
.hamburguesa[aria-expanded="true"] { background: var(--invertido); }
.hamburguesa[aria-expanded="true"] .barra { background: var(--sobre-invertido); }
.hamburguesa[aria-expanded="true"] .barra:first-child { transform: rotate(45deg) translate(2px, 2px); }
.hamburguesa[aria-expanded="true"] .barra:last-child { transform: rotate(-45deg) translate(2px, -2px); }

.menu {
  position: fixed; z-index: 21; left: 8px; right: 8px; top: -640px; opacity: 0;
  pointer-events: none; border-radius: 20px;
  background: rgba(26,29,20,.95);
  -webkit-backdrop-filter: blur(26px); backdrop-filter: blur(26px);
  padding: 90px 32px 32px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px;
  transition: top .5s cubic-bezier(.25,.46,.45,.94), opacity .4s ease;
}
@media (min-width: 768px) { .menu { left: auto; right: 7px; width: 420px; padding: 60px; padding-top: 108px; } }
.menu.abierto { top: 8px; opacity: 1; pointer-events: auto; }
@media (min-width: 768px) { .menu.abierto { top: 7px; } }
.menu nav { display: flex; flex-direction: column; gap: 8px; }
.menu nav a {
  font-family: var(--display); font-weight: 700; font-size: 36px; line-height: 1.3;
  color: var(--sobre-invertido); text-decoration: none; transition: opacity .3s ease;
}
@media (min-width: 768px) { .menu nav a { font-size: 42px; } }
.menu nav a:hover { opacity: .7; }
.menu .apunte { color: #9A958C; font-size: 15px; margin: 0; }

/* ────────────────────────────────────────────────────────────────  hero ── */
.hero {
  position: relative; width: 100%; min-height: 100vh; overflow: hidden;
  background: var(--fondo-2);
}
@media (min-width: 768px) { .hero { height: 100vh; min-height: 800px; } }

/* La palabra gigante detrás de todo. Decorativa: no la lee un lector de pantalla.
   Va MÁS clara que el fondo, no más oscura: así se lee como un relieve y no
   compite con las burbujas ni con el tablero que van encima.
   Va en SVG con textLength y no en CSS con un tamaño en vw: con nowrap la
   palabra se desborda por los dos costados y se lee solo el trozo del medio.
   Forzando la longitud calza el ancho exacto en cualquier pantalla, y sin
   depender de que Raleway ya haya cargado cuando el navegador mide.
   lengthAdjust va en "spacing" y no en "spacingAndGlyphs": con cinco letras,
   estirar los glifos deforma la marca; separarlas, no. */
.palabra {
  position: absolute; bottom: -6px; left: 0; right: 0; z-index: 2;
  pointer-events: none; line-height: 0;
  transform: translateY(330px); animation: palabraSube 1s cubic-bezier(.16,1,.3,1) 1.5s forwards;
}
@media (min-width: 768px) { .palabra { bottom: -10px; } }
.palabra svg { display: block; width: 100%; height: auto; }
/* Más oscura que el fondo, no más clara. En blanco sobre crema la palabra
   apenas se insinuaba; con la marca detrás del hero eso no sirve: tiene que
   leerse. Sigue por debajo del texto y del tablero en peso, que es lo que la
   mantiene de fondo y no de titular. */
.palabra text {
  font-family: var(--display); font-weight: 800; font-size: 235px;
  fill: #B9B9AC;
}
@keyframes palabraSube { to { transform: translateY(0); } }

/* En escritorio las capas viven en la mitad derecha: el titular ocupa la
   izquierda y las burbujas cruzándole encima lo vuelven ilegible. En móvil van
   debajo del texto, a todo el ancho. */
.capa { position: absolute; left: 0; right: 0; bottom: 0; top: 46vh; pointer-events: none; }
@media (min-width: 768px) { .capa { top: 0; left: 41%; } }
@media (min-width: 1280px) { .capa { left: 37%; } }

/* Debajo: el desorden. Encima y recortada por el spotlight: el orden. */
.capa-caos { z-index: 5; }
.capa-orden {
  z-index: 7;
  --mx: 50%; --my: 50%;
  /* Núcleo opaco y caída corta: con un degradado suave el tablero se lee como
     un fantasma encima del caos en vez de reemplazarlo.
     El núcleo tiene que cubrir la MEDIA DIAGONAL del tablero (~350 px), no su
     mitad de ancho: si no, las esquinas se recortan y el bloque oscuro se ve
     como una mancha circular en vez de una tarjeta. */
  -webkit-mask-image: radial-gradient(circle 620px at var(--mx) var(--my), #000 0 62%, rgba(0,0,0,.85) 76%, rgba(0,0,0,.3) 90%, transparent 100%);
  mask-image: radial-gradient(circle 620px at var(--mx) var(--my), #000 0 62%, rgba(0,0,0,.85) 76%, rgba(0,0,0,.3) 90%, transparent 100%);
}
/* Un teléfono no tiene cursor: sin esto la mitad de los votantes vería solo el
   problema y nunca la solución. Igual con quien pidió menos movimiento. */
@media (hover: none), (prefers-reduced-motion: reduce) {
  .capa-orden { -webkit-mask-image: none; mask-image: none; }
  .capa-caos { opacity: .25; }
}

.lienzo { position: relative; width: 100%; height: 100%; max-width: 1100px; margin: 0 auto; }

/* ── La foto del hero ─────────────────────────────────────────────────────
   Arranca oculta y solo entra si /hero.jpg carga de verdad. Si el archivo no
   está, la página se queda con las burbujas y el tablero en vez de mostrar un
   hero vacío: un despliegue no puede depender de que alguien se acordara de
   subir un PNG.
   El spotlight no necesita dos imágenes. La de abajo va en gris y la de
   arriba a color, recortada por la misma máscara. Es el mismo archivo. */
/* El modo multiply es lo que hace desaparecer el fondo blanco de la foto sobre
   el crema del hero, sin recortarla ni exigir un PNG con transparencia: blanco
   por cualquier color da ese color. El verde del personaje queda intacto.
   Va en el CONTENEDOR y no en la imagen: la capa tiene z-index, o sea que
   es su propio contexto de apilamiento, y una imagen que se mezcla ahí adentro
   lo hace contra un fondo transparente, es decir, contra nada. */
.capa-foto {
  z-index: 6; display: none;
  mix-blend-mode: multiply;
  /* Ocupa el hero completo, no la mitad derecha que usan las capas de burbujas:
     la foto es el fondo de la pantalla, no un elemento al lado del texto. */
  left: 0; top: 0;
}
.hero.con-foto .capa-foto { display: block; }
.hero.con-foto .capa-caos, .hero.con-foto .capa-orden { display: none; }
/* El JPEG no deja el fondo en 255 exacto y bajo multiply eso pinta un rectángulo
   tenue alrededor del personaje. Un empujón mínimo de brillo y contraste lleva
   ese casi-blanco a blanco puro (que bajo multiply es invisible) sin que el
   verde ni las llamas se noten alterados. */
.capa-foto img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; object-position: 76% bottom;
  filter: brightness(1.05) contrast(1.05);
  /* El guion escribe transform en cada cuadro; avisarlo evita que el navegador
     recomponga la capa entera cada vez. */
  will-change: transform;
}
@media (max-width: 767px) { .capa-foto img { object-position: center bottom; } }
.capa-foto.gris img { filter: grayscale(1) brightness(1.08) contrast(1.05) opacity(.5); }
/* La foto va a color y sin recortar, siempre.
   La versión de dos capas (gris abajo, color revelada por el spotlight) se
   probó y falla en reposo: el puntero arranca en el centro, así que quien
   entra y no mueve el mouse ve un personaje gris. En una página que tiene
   treinta segundos para convencer, el estado por defecto no puede ser el
   apagado. */
.capa-foto.color { z-index: 7; }
.hero.con-foto .capa-foto.gris { display: none; }

/* Apagadas a propósito: son el ruido del que el tablero rescata al dueño. Si
   compiten en contraste con lo que revela el spotlight, no se lee ninguno. */
/* Apagadas, pero no invisibles: con el tablero ya en oscuro, unas burbujas casi
   del color del fondo dejaban medio hero en gris plano. */
.burbuja-caos {
  position: absolute; max-width: 15rem; padding: 11px 15px; border-radius: 15px;
  background: #E6E6DF; color: #8C8880; font-size: 14px; line-height: 1.45;
  border: 1px solid #DBDBD3; border-bottom-left-radius: 5px;
}
.burbuja-caos.mia {
  background: #DEDED6; border-bottom-left-radius: 15px; border-bottom-right-radius: 5px;
}
@media (max-width: 767px) { .burbuja-caos { font-size: 12.5px; max-width: 11rem; padding: 9px 12px; } }

/* El tablero va invertido, no blanco.
   Sobre un hero crema, una tarjeta blanca sobre fondo casi blanco no produce
   ningún contraste: la pantalla entera se lee como un gris plano. El bloque
   oscuro es el único elemento con masa del hero, y además dice lo que hay que
   decir: el desorden es pálido, el orden pesa. */
.tablero {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(560px, 88%); background: var(--invertido); color: var(--sobre-invertido);
  border-radius: var(--radio);
  box-shadow: 0 30px 80px rgba(26,29,20,.32); overflow: hidden;
}
.tablero-titulo {
  font-family: var(--display); font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.5px; color: var(--lima);
  padding: 16px 20px 12px;
}
.tablero-fila {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 20px; border-top: 1px solid rgba(249,249,246,.10);
}
.tablero-fila .quien { font-weight: 700; font-size: 14.5px; }
.tablero-fila .que { color: #9A958C; font-size: 12.5px; }
.tablero-fila .cuando { margin-left: auto; text-align: right; white-space: nowrap; }
.tablero-fila .cuando small { display: block; color: #9A958C; font-size: 11.5px; margin-top: 3px; }
.marca-chip {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 700; white-space: nowrap;
}
/* Sobre el invertido el rojo de marca no contrasta: va el fondo sólido con
   texto blanco, que es la única combinación accesible de las dos. */
.marca-chip.vencida { background: var(--accion); color: #fff; }
.marca-chip.en_riesgo { background: var(--lima); color: var(--invertido); }
.marca-chip.sin_fecha { background: rgba(249,249,246,.14); color: #CFCBC2; }
.marca-chip.ok { background: rgba(62,155,107,.24); color: #9EE0BC; }
@media (max-width: 767px) { .tablero-fila .que { display: none; } }

.hero-texto {
  position: relative; z-index: 8; max-width: 1600px; margin: 0 auto;
  padding: 110px 16px 24px; display: flex; flex-direction: column;
  align-items: flex-start; gap: 30px; pointer-events: none;
}
@media (min-width: 768px) {
  .hero-texto { position: absolute; inset: 0; justify-content: flex-start; padding: 160px 40px 100px; }
}
.hero-texto > * { pointer-events: auto; }
.hero-titular {
  font-family: var(--display); font-weight: 700; color: var(--texto);
  font-size: 22px; line-height: 1.2; letter-spacing: -.02em; max-width: 447px; margin: 0;
}
@media (min-width: 768px) { .hero-titular { font-size: 28px; } }
.palabra-entra { opacity: 0; display: inline-block; animation: palabraEntra .4s ease forwards; }
@keyframes palabraEntra {
  from { opacity: 0; transform: translateY(10px); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
/* Dos destinos, un solo botón dominante. El de Telegram va "suave" porque el
   rojo de acción es exclusivo del CTA principal: dos círculos rojos lado a lado
   dejan de señalar cuál es el camino. */
.hero-cta {
  opacity: 0; animation: ctaEntra .8s cubic-bezier(.25,.46,.45,.94) 1s forwards;
  display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap;
}
/* Debajo del CTA, no en una sección aparte: es la mitad inferior izquierda del
   hero, que sin esto queda como un vacío de media pantalla.
   Era una fila de tres viñetas ("corre en tu propia nube", "sin tarjeta") que
   se partían en dos renglones, se las comía la ilustración y hablaban de
   infraestructura en el sitio más caro de la página. Ahora es una frase: cómo
   se arranca y qué queda funcionando. */
.hero-apunte {
  opacity: 0; animation: ctaEntra .8s cubic-bezier(.25,.46,.45,.94) 1.25s forwards;
  margin: 0; max-width: 447px;
  color: var(--suave); font-size: 14.5px; line-height: 1.6;
}
/* El comando en caja clara y no en lima: el círculo rojo del CTA queda justo
   encima, y lima y rojo-naranja al mismo peso compiten. */
.hero-apunte code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; font-weight: 700; color: var(--texto);
  background: var(--fondo-3); border: 1px solid var(--borde-fuerte);
  padding: 2px 7px; border-radius: 5px; white-space: nowrap;
}
@keyframes ctaEntra {
  from { opacity: 0; transform: translateY(52px) scale(.5); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ────────────────────────────────────────────────────────────────  pill ── */
.pill {
  position: relative; display: inline-flex; align-items: center; gap: 12px;
  border-radius: 999px; padding: 8px; overflow: hidden; text-decoration: none;
}
.pill-fondo {
  position: absolute; top: 5px; bottom: 5px; left: 8px;
  width: calc(100% - 8px - 8px - 48px - 12px); border-radius: 999px;
  background: var(--tarjeta); box-shadow: var(--sombra); z-index: 0;
  transition: width .4s cubic-bezier(.25,.46,.45,.94);
}
@media (min-width: 768px) { .pill-fondo { width: calc(100% - 8px - 8px - 54px - 12px); } }
.pill:hover .pill-fondo { width: calc(100% - 16px); }
.pill-texto {
  position: relative; z-index: 1; color: var(--texto); font-weight: 700;
  font-size: 16px; padding: 12px 32px; white-space: nowrap;
}
@media (min-width: 768px) { .pill-texto { font-size: 18px; padding: 16px 40px; } }
.pill-circulo {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;
  background: var(--accion); color: #fff;
  transition: transform .4s cubic-bezier(.25,.46,.45,.94);
}
@media (min-width: 768px) { .pill-circulo { width: 54px; height: 54px; } }
.pill:hover .pill-circulo { transform: translateX(-7px); }
/* Lima y rojo-naranja no compiten al mismo peso: el secundario no lleva ninguno. */
.pill.suave .pill-fondo { background: transparent; box-shadow: none; border: 1px solid var(--borde-fuerte); }
.pill.suave .pill-circulo { background: var(--invertido); }
.pill.clara .pill-texto { color: var(--texto); }
.pill.clara .pill-fondo { background: var(--sobre-invertido); }

/* ────────────────────────────────────────────────────────────  secciones ── */
.seccion-p { position: relative; z-index: 1; max-width: 1000px; margin: 0 auto; padding: 92px 22px; }
@media (min-width: 768px) { .seccion-p { padding: 116px 40px; } }
.seccion-p.alterna { background: var(--fondo); }
.franja { position: relative; overflow: hidden; background: var(--fondo); }
/* La textura topográfica del brandbook de Voz: da fondo sin robar atención. */
.franja .topo-fondo, .con-topo .topo-fondo {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 0;
}
.con-topo { position: relative; overflow: hidden; }
/* Un absoluto con z-index 0 pinta ENCIMA de los bloques estáticos hermanos, no
   debajo. Sin esto la textura queda sobre el texto en vez de detrás. */
.con-topo > *:not(svg) { position: relative; z-index: 1; }
.rotulo {
  font-family: var(--display); font-size: 11.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.8px; color: var(--suave);
  margin: 0 0 14px; display: flex; align-items: center; gap: 10px;
}
.rotulo .onda { color: var(--lima); flex: none; }

/* ── El contraste: un bot cualquiera contra CHUNO, lado a lado ───────────── */
.contraste {
  display: grid; gap: 1px; background: var(--borde);
  border: 1px solid var(--borde); border-radius: var(--radio); overflow: hidden;
}
@media (min-width: 820px) { .contraste { grid-template-columns: 1fr 1fr; } }
.contraste .cab {
  font-family: var(--display); font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.5px;
  padding: 15px 22px; background: var(--fondo-3); color: var(--suave);
}
.contraste .cab.nuestra { background: var(--invertido); color: var(--lima); }
.contraste .celda { padding: 17px 22px; font-size: 15.2px; line-height: 1.5; }
.contraste .celda.bot { background: var(--fondo-2); color: var(--suave); }
.contraste .celda.bot::before {
  content: "×"; color: var(--suave); font-weight: 700; margin-right: 9px;
}
.contraste .celda.nuestra { background: var(--tarjeta); color: var(--texto); font-weight: 600; }
.contraste .celda.nuestra::before {
  content: "✓"; color: var(--invertido); font-weight: 700; margin-right: 9px;
  background: var(--lima); border-radius: 50%; display: inline-block;
  width: 20px; height: 20px; text-align: center; font-size: 12px; line-height: 20px;
  vertical-align: 1px;
}
@media (max-width: 819px) {
  .contraste .cab { display: none; }
  .contraste .celda.bot { padding-bottom: 10px; }
  .contraste .celda.nuestra { padding-top: 10px; }
}
h2 {
  font-family: var(--display); font-weight: 700; font-size: clamp(27px, 4.2vw, 40px);
  line-height: 1.15; letter-spacing: -.02em; margin: 0 0 16px; max-width: 20ch;
}
.entrada { color: var(--texto-2); font-size: 17px; max-width: 62ch; margin: 0 0 44px; }

.pasos { display: grid; gap: 2px; background: var(--borde); border-radius: var(--radio); overflow: hidden; }
@media (min-width: 860px) { .pasos { grid-template-columns: repeat(2, 1fr); } }
.paso { background: var(--tarjeta); padding: 26px 24px; }
.paso .n {
  font-family: var(--display); font-size: 12px; font-weight: 700;
  letter-spacing: 1.6px; color: var(--suave); display: block; margin-bottom: 9px;
}
.paso h3 { font-family: var(--display); font-size: 18px; font-weight: 700; margin: 0 0 7px; }
.paso p { margin: 0; color: var(--texto-2); font-size: 14.8px; }

.comando {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin-top: 26px; padding: 17px 20px; border-radius: var(--radio);
  background: var(--invertido); color: var(--sobre-invertido);
}
.comando code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px;
}
.comando .prompt { color: var(--lima); }
.comando button {
  margin-left: auto; font: inherit; font-size: 13px; font-weight: 700;
  background: transparent; color: var(--sobre-invertido); cursor: pointer;
  border: 1px solid rgba(249,249,246,.28); border-radius: 999px; padding: 7px 15px;
}
.comando button:hover { background: rgba(249,249,246,.12); }

.garantias { list-style: none; padding: 0; margin: 0; display: grid; gap: 1px; background: var(--borde); }
.garantias li { background: var(--fondo); padding: 17px 2px; color: var(--texto-2); font-size: 15.5px; }
.garantias strong { color: var(--texto); }

footer {
  border-top: 1px solid var(--borde); background: var(--fondo-2);
  color: var(--suave); font-size: 13.5px;
}
footer .adentro {
  max-width: 1000px; margin: 0 auto; padding: 30px 22px;
  display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
}
footer a { color: var(--suave); }
footer .der { margin-left: auto; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .cortina { animation: cortinaFuera .01s linear forwards; }
  .cortina-caja { animation: none !important; }
  .palabra, .palabra-entra, .hero-cta {
    animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important;
  }
}
`;

const GUION = `
(function () {
  // El titular ya viene escrito en el HTML: si este script no corre, la frase
  // más importante de la página sigue ahí. Aquí solo se envuelve cada palabra
  // para que entren una tras otra.
  //
  // Los espacios son nodos de texto de verdad, no margin-right: con margen,
  // copiar el titular o leerlo con un lector de pantalla daba las palabras
  // pegadas: "TuWhatsAppyaestusistema".
  var titular = document.getElementById('titular');
  var palabras = titular.textContent.trim().split(/\\s+/);
  titular.textContent = '';

  palabras.forEach(function (palabra, i) {
    var s = document.createElement('span');
    s.className = 'palabra-entra';
    s.textContent = palabra;
    s.style.animationDelay = (1 + i * 0.05) + 's';
    titular.appendChild(s);
    titular.appendChild(document.createTextNode(' '));
  });

  var boton = document.getElementById('hamburguesa');
  var menu = document.getElementById('menu');
  function cerrar() { boton.setAttribute('aria-expanded', 'false'); menu.classList.remove('abierto'); }
  boton.addEventListener('click', function () {
    var abierto = boton.getAttribute('aria-expanded') === 'true';
    boton.setAttribute('aria-expanded', String(!abierto));
    menu.classList.toggle('abierto', !abierto);
  });
  menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', cerrar); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });

  // Copiar el comando de instalación.
  var copiar = document.getElementById('copiar');
  if (copiar && navigator.clipboard) {
    copiar.addEventListener('click', function () {
      navigator.clipboard.writeText('npx chuno init').then(function () {
        copiar.textContent = 'Copiado';
        setTimeout(function () { copiar.textContent = 'Copiar'; }, 1600);
      });
    });
  }

  // El puntero mueve dos cosas: el spotlight del tablero cuando NO hay foto, y
  // la foto misma cuando sí la hay.
  //
  // El spotlight se hace con una máscara de gradiente y dos variables CSS. La
  // versión obvia (pintar un canvas y pasarlo con toDataURL) codifica un PNG
  // completo en CADA cuadro; en un teléfono de gama media eso cae a un dígito
  // de fps.
  //
  // La geometría se toma del hero y no de la capa: cuando la foto carga, la
  // capa del tablero queda en display:none y su rectángulo mide cero, así que
  // todas las cuentas darían cero sin fallar en ningún lado.
  var hero = document.querySelector('.hero');
  var orden = document.getElementById('orden');
  var fotos = document.querySelectorAll('.capa-foto img');
  var quieto = window.matchMedia('(hover: none), (prefers-reduced-motion: reduce)');

  if (hero && !quieto.matches) {
    var destinoX = 0, destinoY = 0, x = 0, y = 0, arrancado = false;

    function centrar() {
      var r = hero.getBoundingClientRect();
      if (!arrancado) { destinoX = x = r.width / 2; destinoY = y = r.height / 2; }
    }
    centrar();
    window.addEventListener('resize', centrar);

    window.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      arrancado = true;
      destinoX = e.clientX - r.left;
      destinoY = e.clientY - r.top;
    }, { passive: true });

    // Cuánto se despega el ninja del puntero. Poco a propósito: el gesto tiene
    // que sentirse vivo, no mareado.
    var DESPLAZA = 18;
    var GIRA = 1.6;

    (function seguir() {
      x += (destinoX - x) * 0.12;
      y += (destinoY - y) * 0.12;

      if (orden) {
        orden.style.setProperty('--mx', x.toFixed(1) + 'px');
        orden.style.setProperty('--my', y.toFixed(1) + 'px');
      }

      var r = hero.getBoundingClientRect();
      // -0.5 a 0.5 desde el centro del hero.
      var rx = r.width ? x / r.width - 0.5 : 0;
      var ry = r.height ? y / r.height - 0.5 : 0;

      var t = 'translate3d(' + (rx * DESPLAZA).toFixed(2) + 'px, ' +
              (ry * DESPLAZA).toFixed(2) + 'px, 0) rotate(' +
              (rx * GIRA).toFixed(2) + 'deg)';

      for (var i = 0; i < fotos.length; i++) fotos[i].style.transform = t;

      requestAnimationFrame(seguir);
    })();
  }
})();
`;

export function landing(): string {
  const cortina = (clase: string) =>
    `<div class="cortina-fila ${clase}">${'<div class="cortina-caja"></div>'.repeat(5)}</div>`;

  const burbujas = BURBUJAS.map(
    (b) =>
      `<div class="burbuja-caos ${b.mia ? "mia" : ""}" style="left:${b.x};top:${b.y};transform:rotate(${b.giro})">${b.texto}</div>`,
  ).join("");

  const filas = FILAS.map(
    (f) => `<div class="tablero-fila">
      <div>
        <div class="quien">${f.quien}</div>
        <div class="que">${f.que}</div>
      </div>
      <div class="cuando">
        <span class="marca-chip ${f.riesgo}">${f.chip}</span>
        <small>${f.cuando}</small>
      </div>
    </div>`,
  ).join("");

  const pasos = PASOS.map(
    (p) => `<div class="paso">
      <span class="n">${p.n}</span>
      <h3>${p.titulo}</h3>
      <p>${p.texto}</p>
    </div>`,
  ).join("");

  const garantias = GARANTIAS.map(
    (g) => `<li><strong>${g.fuerte}</strong> ${g.resto}</li>`,
  ).join("");

  const contraste = [
    `<div class="cab">Un bot que solo contesta</div>`,
    `<div class="cab nuestra">CHUNO</div>`,
    ...CONTRASTE.flatMap((c) => [
      `<div class="celda bot">${c.bot}</div>`,
      `<div class="celda nuestra">${c.chuno}</div>`,
    ]),
  ].join("");

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CHUNO: el asistente que se acuerda de lo que le prometiste a tu cliente</title>
<meta name="description" content="En los negocios por encargo el pedido nace en un chat de WhatsApp y muere ahí. CHUNO lo convierte en un pedido con fecha, vigila las promesas en riesgo y nunca le escribe a tu cliente sin tu permiso.">
${FUENTES_VOZ}
<style>${CSS}</style>
</head><body>

<div class="cortina" aria-hidden="true">${cortina("arriba")}${cortina("abajo")}</div>

<a class="marca-fija" href="/">${onda(21)}<span>CHUNO</span></a>

<button class="hamburguesa" id="hamburguesa" aria-expanded="false" aria-controls="menu" aria-label="Abrir menú">
  <span class="barra"></span><span class="barra"></span>
</button>

<div class="menu" id="menu">
  <nav>
    <a href="#diferencia">En qué se diferencia</a>
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#confianza">Por qué confiar</a>
    <a href="/demo">Ver la demo</a>
    <a href="${BOT}">Escríbele al bot</a>
    <a href="${REPO}">El código</a>
  </nav>
  <p class="apunte">Se instala en la nube de tu propio negocio. Tus conversaciones no pasan por nosotros.</p>
  <div>${pill("/entrar", "Entrar al panel", "clara")}</div>
</div>

<main class="hero">
  <div class="palabra" aria-hidden="true">
    <svg viewBox="0 0 1000 175" preserveAspectRatio="xMidYMax meet">
      <text x="0" y="170" textLength="1000" lengthAdjust="spacing">CHUNO</text>
    </svg>
  </div>

  <!-- Debajo, el problema. Encima y recortado por el spotlight, lo mismo
       convertido en estado operativo: el cursor destapa el orden. -->
  <!-- La foto manda si existe; si no carga, no se activa y quedan las capas de
       abajo. El onload va inline porque tiene que dispararse antes de que el
       guion del final del documento corra. -->
  <div class="capa capa-foto gris" aria-hidden="true">
    <img src="/hero.jpg" alt="" onload="document.querySelector('.hero').classList.add('con-foto')">
  </div>
  <div class="capa capa-foto color" id="foto-color" aria-hidden="true">
    <img src="/hero.jpg" alt="">
  </div>

  <div class="capa capa-caos" aria-hidden="true"><div class="lienzo">${burbujas}</div></div>
  <div class="capa capa-orden" id="orden" aria-hidden="true">
    <div class="lienzo">
      <div class="tablero">
        <div class="tablero-titulo">Tus promesas, hoy</div>
        ${filas}
      </div>
    </div>
  </div>

  <div class="hero-texto">
    <h1 class="hero-titular" id="titular">${TITULAR}</h1>
    <div class="hero-cta">
      ${pill("/demo", "Ver la demo, sin registro")}
      ${pill(BOT, "Escríbele al bot", "suave")}
    </div>
    <p class="hero-apunte">
      Todo arranca con <code>npx chuno init</code>. Respondes siete preguntas y tu
      asistente queda atendiendo, uno por cada negocio o sucursal.
    </p>
  </div>
</main>

<section class="seccion-p con-topo" id="diferencia">
  ${topo("topo-fondo")}
  <p class="rotulo">${onda(14)}En qué se diferencia</p>
  <h2>Todo el mundo está haciendo bots que contestan.</h2>
  <p class="entrada">
    Tú ya contestas, a las once de la noche. Lo difícil viene después:
    acordarte de qué le prometiste a cada cliente y para cuándo. Un bot que
    contesta más rápido no te ayuda con eso.
  </p>
  <div class="contraste">${contraste}</div>
</section>

<div class="franja">
  ${topo("topo-fondo")}
  <section class="seccion-p" id="como-funciona">
    <p class="rotulo">${onda(14)}Cómo funciona</p>
    <h2>Un chatbot contesta. CHUNO se acuerda.</h2>
    <p class="entrada">
      Cada conversación deja un pedido con nombre, con lo que encargó y con la
      fecha que le prometiste. Después alguien vigila esa fecha por ti.
    </p>
    <div class="pasos">${pasos}</div>
    <div class="comando">
      <code><span class="prompt">❯</span> npx chuno init</code>
      <button id="copiar" type="button">Copiar</button>
    </div>
  </section>
</div>

<section class="seccion-p" id="confianza">
  <p class="rotulo">${onda(14)}Por qué puedes confiarle tu operación</p>
  <h2>Le estás dando tu chat a un programa. Estas son las reglas.</h2>
  <ul class="garantias">${garantias}</ul>
</section>

<footer><div class="adentro">
  <span>CHUNO · Se instala en la nube de tu propio negocio</span>
  <span class="der"><a href="${REPO}">Código abierto</a> · <a href="/entrar">Entrar al panel</a></span>
</div></footer>

<script>${GUION}</script>
</body></html>`;
}
