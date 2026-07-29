import { fallo, ok, type Resultado } from "../core/resultado";
import type { MensajeLLM, OpcionesJSON, OpcionesTexto, ProveedorLLM } from "./tipos";

/**
 * Proveedor Gemini contra la API REST, sin SDK.
 *
 * Sin SDK a propósito: una dependencia menos que pueda romperse en el runtime de
 * Workers, y el contrato de la API REST es estable y pequeño. `fetch` es global
 * en Workers.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELO_POR_DEFECTO = "gemini-2.5-flash";
const TIMEOUT_MS = 20_000;

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
}

function aContenido(mensajes: readonly MensajeLLM[]) {
  return mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));
}

function extraerTexto(datos: RespuestaGemini): Resultado<string, string> {
  if (datos.error) {
    return fallo(`gemini: ${datos.error.status ?? "error"} — ${datos.error.message ?? "sin detalle"}`);
  }

  const candidato = datos.candidates?.[0];
  if (!candidato) return fallo("gemini: respuesta sin candidatos");

  // MAX_TOKENS significa que la respuesta viene cortada: mejor fallar que
  // guardar un JSON truncado o mandarle media frase al cliente.
  if (candidato.finishReason && !["STOP", "MAX_TOKENS"].includes(candidato.finishReason)) {
    return fallo(`gemini: generación detenida por ${candidato.finishReason}`);
  }

  const texto = candidato.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!texto) return fallo("gemini: respuesta vacía");

  return ok(texto);
}

export function crearProveedorGemini(apiKey: string, modelo = MODELO_POR_DEFECTO): ProveedorLLM {
  async function llamar(cuerpo: unknown): Promise<Resultado<string, string>> {
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

      if (!respuesta.ok) {
        // 429 es la cuota gratuita agotada — quien llama decide si degrada.
        return fallo(
          `gemini: HTTP ${respuesta.status}${datos.error?.message ? ` — ${datos.error.message}` : ""}`,
        );
      }

      return extraerTexto(datos);
    } catch (e) {
      const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
      return fallo(`gemini: fallo de ${razon}`);
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    nombre: `gemini:${modelo}`,

    async generarTexto(opciones: OpcionesTexto) {
      return llamar({
        systemInstruction: { parts: [{ text: opciones.sistema }] },
        contents: aContenido(opciones.mensajes),
        generationConfig: {
          temperature: opciones.temperatura ?? 0.4,
          maxOutputTokens: opciones.maxTokens ?? 500,
        },
      });
    },

    async generarJSON<T>(opciones: OpcionesJSON<T>): Promise<Resultado<T, string>> {
      const crudo = await llamar({
        systemInstruction: { parts: [{ text: opciones.sistema }] },
        contents: aContenido(opciones.mensajes),
        generationConfig: {
          // Temperatura 0: extraer no es escribir. Queremos que la misma
          // conversación produzca el mismo pedido.
          temperature: 0,
          maxOutputTokens: opciones.maxTokens ?? 1000,
          responseMimeType: "application/json",
          responseSchema: opciones.esquema,
        },
      });

      if (!crudo.ok) return crudo;

      let parseado: unknown;
      try {
        parseado = JSON.parse(crudo.valor);
      } catch {
        return fallo("gemini: la respuesta no era JSON válido");
      }

      // La validación real la hace quien llama, con su esquema Zod. Que el
      // proveedor haya devuelto JSON no significa que sea JSON aceptable.
      return opciones.validar(parseado);
    },
  };
}
