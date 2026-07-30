import { fallo, ok, type Resultado } from "../core/resultado";
import type {
  MensajeLLM,
  OpcionesJSON,
  OpcionesTexto,
  ProveedorLLM,
  ReporteUso,
} from "./tipos";

/**
 * Proveedor Gemini contra la API REST, sin SDK.
 *
 * Sin SDK a propósito: una dependencia menos que pueda romperse en el runtime de
 * Workers, y el contrato de la API REST es estable y pequeño.
 *
 * Recibe una LISTA de modelos, no uno. Google jubila modelos sin aviso —
 * `gemini-2.5-flash` dejó de estar disponible para cuentas nuevas y devolvía 404
 * aunque seguía apareciendo en el listado de la API— y la cuota gratuita se
 * agota por modelo. Con una lista, el asistente degrada en vez de callarse.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20_000;

/** Verificados contra la capa gratuita: responden y devuelven JSON limpio. */
export const MODELOS_POR_DEFECTO = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function aContenido(mensajes: readonly MensajeLLM[]) {
  return mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));
}

/**
 * Algunos modelos envuelven el JSON en un bloque de markdown pese a pedirles
 * `application/json`. Quitarlo es más barato que descartar la respuesta.
 */
function quitarCerca(texto: string): string {
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (cerca?.[1] ?? texto).trim();
}

export function crearProveedorGemini(
  apiKey: string,
  modelos: readonly string[] = MODELOS_POR_DEFECTO,
  onUso?: ReporteUso,
): ProveedorLLM {
  const lista = modelos.length > 0 ? modelos : MODELOS_POR_DEFECTO;

  /** Recorre los modelos hasta que uno responda. */
  async function llamar(cuerpo: unknown): Promise<Resultado<string, string>> {
    let ultimoError = "sin modelos configurados";

    for (const modelo of lista) {
      const intento = await llamarModelo(modelo, cuerpo);
      if (intento.ok) return intento;

      ultimoError = intento.error;

      // 404 = modelo jubilado. 429 = cuota agotada. 503 = ese modelo está
      // saturado ahora mismo (visto en producción el 2026-07-30, tumbando la
      // extracción entera). En los tres, el siguiente modelo puede funcionar.
      // Cualquier otro error es nuestro y no lo arregla cambiar de modelo, así
      // que no seguimos gastando tiempo.
      const reintentable = ["HTTP 404", "HTTP 429", "HTTP 503"];
      if (!reintentable.some((codigo) => intento.error.includes(codigo))) break;
    }

    return fallo(ultimoError);
  }

  async function llamarModelo(modelo: string, cuerpo: unknown): Promise<Resultado<string, string>> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

    try {
      const respuesta = await fetch(`${BASE}/${modelo}:generateContent`, {
        method: "POST",
        // La llave va en cabecera y no en la URL: las URLs terminan en logs.
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      });

      const datos = (await respuesta.json()) as RespuestaGemini;

      // Se reporta siempre, incluso si la llamada falló: una respuesta cortada o
      // rechazada también consumió cuota.
      onUso?.({
        modelo,
        tokensEntrada: datos.usageMetadata?.promptTokenCount ?? 0,
        tokensSalida: datos.usageMetadata?.candidatesTokenCount ?? 0,
        exito: respuesta.ok,
      });

      if (!respuesta.ok) {
        const detalle = datos.error?.message?.slice(0, 120) ?? "";
        return fallo(`gemini/${modelo}: HTTP ${respuesta.status}${detalle ? `: ${detalle}` : ""}`);
      }

      const candidato = datos.candidates?.[0];
      if (!candidato) return fallo(`gemini/${modelo}: respuesta sin candidatos`);

      // MAX_TOKENS deja la respuesta cortada: media frase al cliente o un JSON
      // truncado. Preferimos fallar y que otro modelo lo intente.
      if (candidato.finishReason && candidato.finishReason !== "STOP") {
        return fallo(`gemini/${modelo}: HTTP 429 generación detenida por ${candidato.finishReason}`);
      }

      const texto = candidato.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!texto) return fallo(`gemini/${modelo}: respuesta vacía`);

      return ok(texto);
    } catch (e) {
      const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
      return fallo(`gemini/${modelo}: fallo de ${razon}`);
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    nombre: `gemini:${lista[0]}`,

    async generarTexto(opciones: OpcionesTexto) {
      return llamar({
        systemInstruction: { parts: [{ text: opciones.sistema }] },
        contents: aContenido(opciones.mensajes),
        generationConfig: {
          temperature: opciones.temperatura ?? 0.4,
          maxOutputTokens: opciones.maxTokens ?? 1200,
        },
      });
    },

    async generarJSON<T>(opciones: OpcionesJSON<T>): Promise<Resultado<T, string>> {
      const crudo = await llamar({
        systemInstruction: { parts: [{ text: opciones.sistema }] },
        contents: aContenido(opciones.mensajes),
        generationConfig: {
          // Temperatura 0: extraer no es escribir. La misma conversación tiene
          // que producir el mismo pedido.
          temperature: 0,
          // Holgado a propósito: los modelos con razonamiento consumen parte del
          // presupuesto antes de emitir el JSON, y un JSON cortado no sirve.
          maxOutputTokens: opciones.maxTokens ?? 3000,
          responseMimeType: "application/json",
          responseSchema: opciones.esquema,
        },
      });

      if (!crudo.ok) return crudo;

      let parseado: unknown;
      try {
        parseado = JSON.parse(quitarCerca(crudo.valor));
      } catch {
        return fallo("gemini: la respuesta no era JSON válido");
      }

      // La validación real la hace quien llama, con su esquema Zod. Que el
      // proveedor haya devuelto JSON no significa que sea JSON aceptable.
      return opciones.validar(parseado);
    },
  };
}
