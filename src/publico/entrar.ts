import { esc } from "../admin/html";
import { FUENTES_VOZ, TOKENS_VOZ } from "../admin/html";

/**
 * La pantalla de entrada al panel.
 *
 * Existe porque Basic Auth abre el diálogo del navegador: no se puede maquetar,
 * no se puede explicar y no se parece al resto del producto. La autenticación
 * sigue siendo la misma contraseña; lo que cambia es que ahora se pide en una
 * pantalla nuestra y se recuerda en una cookie firmada.
 */
export function vistaEntrar(opciones: { destino: string; error?: string }): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Entrar · CHUNO</title>
${FUENTES_VOZ}
<style>${TOKENS_VOZ}
body {
  margin: 0; min-height: 100vh; color: var(--texto); font-family: var(--cuerpo);
  font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background:
    radial-gradient(1100px 380px at 50% -200px, color-mix(in srgb, var(--lima) 22%, transparent), transparent 72%),
    var(--fondo);
}
.caja {
  width: 100%; max-width: 380px; background: var(--tarjeta);
  border: 1px solid var(--borde); border-radius: var(--radio);
  box-shadow: 0 18px 50px rgba(26,29,20,.10); padding: 34px 30px;
}
.marca {
  display: inline-flex; align-items: center; gap: 9px; text-decoration: none;
  font-family: var(--display); font-weight: 800; font-size: 19px;
  letter-spacing: 1.5px; color: var(--carbon); margin-bottom: 22px;
}
.marca::before { content: ""; width: 5px; height: 19px; border-radius: 3px; background: var(--lima); }
h1 { font-family: var(--display); font-size: 23px; font-weight: 700; margin: 0 0 6px; letter-spacing: -.02em; }
p.sub { color: var(--suave); font-size: 14.5px; margin: 0 0 22px; }
label {
  display: block; font-family: var(--display); font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.2px; color: var(--suave); margin-bottom: 7px;
}
input {
  font: inherit; width: 100%; background: var(--fondo-2); color: var(--texto);
  border: 1px solid var(--borde-fuerte); border-radius: var(--radio-s); padding: 11px 13px;
}
input:focus { outline: none; border-color: var(--carbon); }
button {
  font-family: var(--cuerpo); font-size: 15px; font-weight: 700; width: 100%;
  margin-top: 16px; padding: 12px 18px; border: none; border-radius: var(--radio-s);
  background: var(--accion); color: #fff; cursor: pointer;
  box-shadow: 0 4px 14px rgba(255,47,0,.24);
}
button:hover { background: var(--accion-texto); }
.error {
  background: rgba(255,47,0,.08); color: var(--accion-texto); font-size: 14px;
  border-radius: var(--radio-s); padding: 10px 12px; margin-bottom: 18px;
}
.volver { display: block; margin-top: 20px; color: var(--suave); font-size: 13.5px; text-align: center; }
</style>
</head><body>
<div class="caja">
  <a class="marca" href="/">CHUNO</a>
  <h1>Entra a tu panel</h1>
  <p class="sub">Es el panel de tu negocio. Solo tú tienes la contraseña.</p>
  ${opciones.error ? `<div class="error">${esc(opciones.error)}</div>` : ""}
  <form method="post" action="/entrar">
    <input type="hidden" name="destino" value="${esc(opciones.destino)}">
    <label for="clave">Contraseña</label>
    <input id="clave" name="clave" type="password" autocomplete="current-password" autofocus required>
    <button type="submit">Entrar</button>
  </form>
  <a class="volver" href="/demo">¿Solo estás mirando? Abre la demo →</a>
</div>
</body></html>`;
}
