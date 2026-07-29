/**
 * La página pública.
 *
 * Abre con el problema, no con el producto: es lo que ve un votante que llega
 * frío y le da treinta segundos. La demo está a un clic, sin registro.
 */
export function landing(): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CHUNO — el asistente que se acuerda de lo que le prometiste a tu cliente</title>
<meta name="description" content="En los negocios por encargo el pedido nace en un chat de WhatsApp y muere ahí. CHUNO lo convierte en un pedido con fecha, vigila las promesas en riesgo y nunca le escribe a tu cliente sin tu permiso.">
<style>
:root {
  --fondo:#0d0f14; --tarjeta:#161a22; --borde:#252b38; --texto:#eceef2;
  --suave:#98a2b3; --acento:#4f8cff; --alerta:#ff6b6b; --bien:#3ecf8e;
}
@media (prefers-color-scheme: light) {
  :root { --fondo:#fbfbfd; --tarjeta:#fff; --borde:#e4e7ee; --texto:#0f1420; --suave:#5c6675; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--fondo); color:var(--texto);
  font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
.envoltorio { max-width:760px; margin:0 auto; padding:0 20px 80px; }
.marca { padding:28px 0 0; font-weight:700; letter-spacing:-0.3px; }
h1 { font-size:clamp(28px,5.4vw,44px); line-height:1.18; letter-spacing:-0.8px; margin:44px 0 0; }
.entrada { font-size:clamp(17px,2.4vw,19px); color:var(--suave); margin:20px 0 0; max-width:62ch; }
.acciones { display:flex; gap:12px; flex-wrap:wrap; margin:34px 0 0; }
.boton { display:inline-block; padding:13px 24px; border-radius:10px; text-decoration:none;
  font-weight:600; background:var(--acento); color:#fff; }
.boton.suave { background:transparent; color:var(--texto); border:1px solid var(--borde); }
.nota { color:var(--suave); font-size:14px; margin:12px 0 0; }
h2 { font-size:21px; letter-spacing:-0.3px; margin:56px 0 14px; }
p { max-width:66ch; }
.cita { border-left:3px solid var(--acento); padding:4px 0 4px 18px; margin:26px 0;
  color:var(--texto); font-size:18px; }
.rejilla { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); margin-top:18px; }
.caja { background:var(--tarjeta); border:1px solid var(--borde); border-radius:12px; padding:18px; }
.caja h3 { margin:0 0 6px; font-size:15px; }
.caja p { margin:0; color:var(--suave); font-size:14px; }
ul { color:var(--suave); max-width:66ch; padding-left:20px; }
li { margin:7px 0; }
li strong { color:var(--texto); }
footer { margin-top:64px; padding-top:22px; border-top:1px solid var(--borde);
  color:var(--suave); font-size:14px; }
</style>
</head><body><div class="envoltorio">

<div class="marca">CHUNO</div>

<h1>Tu WhatsApp ya es tu sistema operativo.<br>El problema es que no es un sistema.</h1>

<p class="entrada">
En una óptica, una floristería o un taller, el pedido nace en una conversación
y muere ahí. La fecha que le prometiste al cliente vive en tu cabeza o en una
libreta. Cuando el cliente escribe <em>"¿ya está listo?"</em>, te toca buscar
entre cientos de chats. Y cuando un pedido se va a atrasar, te enteras el día
que el cliente reclama.
</p>

<div class="acciones">
  <a class="boton" href="/demo">Ver la demo — sin registro</a>
  <a class="boton suave" href="https://github.com/">Ver el código</a>
</div>
<p class="nota">Datos de ejemplo de una óptica. Puedes aprobar decisiones y ver qué pasa.</p>

<h2>Qué hace distinto</h2>
<p>
Un chatbot responde mensajes. CHUNO produce <strong>estado operativo</strong>:
lee la conversación, arma el pedido con su fecha comprometida, y te avisa
<em>antes</em> de que la promesa se caiga.
</p>

<div class="cita">
  Todo el mundo está construyendo bots que contestan.<br>
  CHUNO es el que se acuerda de lo que prometiste.
</div>

<div class="rejilla">
  <div class="caja">
    <h3>Convierte chats en pedidos</h3>
    <p>Cliente, qué encargó, cuánto y para cuándo. Sin que nadie llene un formulario.</p>
  </div>
  <div class="caja">
    <h3>Vigila las promesas</h3>
    <p>Revisa tus pedidos cada media hora y levanta la mano cuando una fecha está en riesgo.</p>
  </div>
  <div class="caja">
    <h3>Te pide permiso</h3>
    <p>Nunca le escribe a tu cliente sin que tú lo apruebes. Puedes editar el mensaje antes.</p>
  </div>
</div>

<h2>Por qué puedes confiarle tu operación</h2>
<ul>
  <li><strong>Corre en tu propia nube.</strong> Tus conversaciones y tus clientes no pasan por servidores nuestros.</li>
  <li><strong>La IA no toca la base de datos.</strong> Solo propone datos que el sistema valida; si algo no cuadra, va a tu bandeja en vez de escribirse solo.</li>
  <li><strong>Nada sale sin tu visto bueno.</strong> Es una regla del diseño, no una opción que se pueda apagar.</li>
  <li><strong>Queda registro de todo:</strong> qué propuso el asistente, qué aprobaste tú y cuándo.</li>
  <li><strong>Los mensajes se borran a los 90 días.</strong> Tratamiento de datos conforme a la Ley 1581 (Habeas Data).</li>
  <li><strong>Si le preguntan si es un bot, lo admite.</strong> Siempre.</li>
</ul>

<h2>Para quién es</h2>
<p>
Negocios donde el pedido se origina en una conversación, hay un proceso interno
de varios días y se le prometió una fecha al cliente: ópticas, floristerías,
talleres, veterinarias, laboratorios dentales, imprentas. No es un sector, es una
forma de operar.
</p>

<footer>
  CHUNO · Construido para Plug Nights 2026 · Carril de optimización de procesos
</footer>

</div></body></html>`;
}
