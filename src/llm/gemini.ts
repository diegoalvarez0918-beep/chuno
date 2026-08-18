import { MODELOS_GEMINI } from "../core/llm/configuracion";
import {
  msParaElSiguienteIntento,
  otroModeloPuedeAyudar,
  PRESUPUESTO_TOTAL_MS,
} from "../core/llm/reintento";
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

/**
 * La lista vive en el núcleo porque la necesitan dos: este adaptador y la regla
 * de precedencia, que la usa como valor por defecto del negocio que solo trae
 * llave. Escrita dos veces se desincroniza el día que se jubile un modelo.
 */
export const MODELOS_POR_DEFECTO: readonly string[] = MODELOS_GEMINI;

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

  /**
   * Recorre los modelos hasta que uno responda, dentro de un presupuesto total.
   *
   * El presupuesto existe porque al otro lado hay alguien esperando en un chat:
   * tres modelos a veinte segundos son un minuto de silencio, y vale más el
   * mensaje de respaldo a los treinta segundos que la respuesta buena a los
   * sesenta. Qué error merece otro modelo y cuánto puede durar cada intento lo
   * decide `core/llm/reintento.ts`, que sí está probado.
   */
  async function llamar(cuerpo: unknown): Promise<Resultado<string, string>> {
    let ultimoError = "sin modelos configurados";
    const limite = Date.now() + PRESUPUESTO_TOTAL_MS;

    for (const modelo of lista) {
      const msDisponibles = msParaElSiguienteIntento(limite - Date.now());
      if (msDisponibles === null) {
        // El motivo dice POR QUÉ se dejó de intentar, no solo que se dejó: la
        // auditoría es la herramienta de diagnóstico de este proyecto.
        ultimoError = `${ultimoError} (presupuesto agotado, quedaban modelos por probar)`;
        break;
      }

      const intento = await llamarModelo(modelo, cuerpo, msDisponibles);
      if (intento.ok) return intento;

      ultimoError = intento.error;
      if (!otroModeloPuedeAyudar(intento.error)) break;
    }

    return fallo(ultimoError);
  }

  async function llamarModelo(
    modelo: string,
    cuerpo: unknown,
    timeoutMs: number,
  ): Promise<Resultado<string, string>> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);

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
