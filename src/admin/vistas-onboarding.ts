import { aplicarRespuesta, esFinal, estadoInicial, interpretar, numeroDePaso, preguntaDe } from "../core/onboarding/entrevista";
import { PASOS, type DatosEntrevista, type EstadoEntrevista, type Paso } from "../core/onboarding/tipos";
import { esc } from "./html";

const TOTAL_PREGUNTAS = PASOS.length - 1; // "listo" no es pregunta

/**
 * Qué se muestra de cada respuesta ya dada. El token de Telegram NUNCA se
 * muestra, ni parcial: solo el hecho de que llegó.
 */
function resumenRespuesta(paso: Paso, datos: DatosEntrevista): string | null {
  switch (paso) {
    case "nombre":
      return datos.nombre ?? null;
    case "queVendes":
      return datos.queVendes ?? null;
    case "horario":
      return datos.horario ?? null;
    case "catalogo":
      return datos.catalogo ? `${datos.catalogo.length} producto(s) leídos` : null;
    case "faq":
      return datos.faq ? `${datos.faq.length} pregunta(s) frecuentes` : null;
    case "tono":
      return datos.tono === undefined ? null : (datos.tono ?? "estándar");
    case "telegram":
      return datos.telegramToken === undefined
        ? null
        : datos.telegramToken
          ? "token recibido (se guarda cifrado)"
          : "para después";
    case "listo":
      return null;
  }
}

export function resumenFinal(datos: DatosEntrevista): string {
  const filas = PASOS.filter((p) => p !== "listo")
    .map((paso) => {
      const r = resumenRespuesta(paso, datos);
      return r === null
        ? ""
        : `<div class="registro"><span>${esc(preguntaDe(paso, datos))}</span>
           <span style="margin-left:auto;text-align:right">${esc(r)}</span></div>`;
    })
    .join("");

  return `<div class="tarjeta"><div class="etiqueta">Así queda tu asistente</div>${filas}</div>`;
}

export function vistaEntrevista(opciones: {
  estado: EstadoEntrevista;
  accion: string;
  error?: string;
}): string {
  const { estado, accion, error } = opciones;

  const contestados = PASOS.slice(0, PASOS.indexOf(estado.paso));
  const transcripcion = contestados
    .map((paso) => {
      const r = resumenRespuesta(paso, estado.datos);
      if (r === null) return "";
      return `<div class="burbuja pregunta">${esc(preguntaDe(paso, estado.datos))}</div>
        <div class="burbuja respuesta">${esc(r)}</div>`;
    })
    .join("");

  const formulario = esFinal(estado)
    ? `${resumenFinal(estado.datos)}
       <form method="post" action="${esc(accion)}">
         <input type="hidden" name="confirmar" value="si">
         <div class="acciones"><button class="primario">Crear mi asistente</button></div>
       </form>`
    : `<form method="post" action="${esc(accion)}">
         <div class="tarjeta">
           <div class="etiqueta">Pregunta ${numeroDePaso(estado.paso)} de ${TOTAL_PREGUNTAS}</div>
           <p class="motivo">${esc(preguntaDe(estado.paso, estado.datos))}</p>
           <textarea name="texto" required autofocus></textarea>
         </div>
         <div class="acciones"><button class="primario">Continuar</button></div>
       </form>`;

  return `${transcripcion}
    ${error ? `<div class="tarjeta urgente"><p class="motivo">${esc(error)}</p></div>` : ""}
    ${formulario}`;
}

/**
 * La entrevista de ejemplo que ve el público. Corre el motor REAL con
 * respuestas fijas — determinista, sin LLM y sin escribir nada: un pico de
 * votantes no gasta ni un token ni deja basura en la base.
 */
const RESPUESTAS_DEMO: readonly string[] = [
  "Floristería La Orquídea",
  "Armamos arreglos florales por encargo: ramos, cajas y decoración para eventos.",
  "Lunes a sábado de 8:00 a.m. a 6:00 p.m. Carrera 15 # 45-12, Chapinero, Bogotá.",
  "Ramo de 12 rosas - $95.000 - entrega mismo día\nCaja de girasoles - $120.000 - 1 día\nArreglo para eventos - $350.000 - 3 días",
  "P: ¿Hacen domicilios?\nR: Sí, en toda Bogotá por $8.000.\nP: ¿Puedo pagar con Nequi?\nR: Sí: Nequi, Daviplata y tarjeta.",
  "Cálido y alegre, tuteando",
  "saltar",
];

export function vistaEntrevistaDemo(): string {
  let estado = estadoInicial();
  const burbujas: string[] = [];

  for (const respuesta of RESPUESTAS_DEMO) {
    burbujas.push(`<div class="burbuja pregunta">${esc(preguntaDe(estado.paso, estado.datos))}</div>`);
    burbujas.push(`<div class="burbuja respuesta">${esc(respuesta)}</div>`);

    const r = interpretar(estado.paso, respuesta);
    if (!r.ok) break; // no pasa: respuestas fijas sobre un motor determinista
    const avance = aplicarRespuesta(estado, r.valor);
    if (!avance.ok) break;
    estado = avance.valor;
  }

  return `<div class="tarjeta"><p class="motivo">Así se crea un asistente nuevo: una entrevista de
    7 preguntas y el negocio queda configurado y respondiendo — sin tocar código. Esta es una
    repetición con un negocio de ejemplo; en tu instalación la respondes tú.</p></div>
  ${burbujas.join("\n")}
  ${resumenFinal(estado.datos)}
  <div class="acciones"><a href="/demo/inicio"><button class="primario" type="button">Ver el panel de la demo</button></a></div>`;
}
