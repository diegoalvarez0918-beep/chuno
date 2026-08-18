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
  UsoLLM,
} from "./tipos";

/**
 * Proveedor para cualquier endpoint que hable el dialecto de OpenAI.
 *
 * Uno solo cubre OpenRouter —y a través de él Claude, GPT, Llama o DeepSeek—,
 * OpenAI directo, Groq, Together y hasta un servidor propio: lo único que
 * cambia es la URL base. Sin SDK, por la misma razón que `gemini.ts`: una
 * dependencia menos que pueda romperse en el runtime de Workers.
 */

interface RespuestaCompatible {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * El prompt de sistema va como un mensaje y de PRIMERO. Es la diferencia con
 * Gemini que más fácil se pasa por alto: puesto en otro sitio, el modelo lo lee
 * como si lo hubiera dicho el cliente a media conversación.
 */
export function aMensajesOpenAI(sistema: string, mensajes: readonly MensajeLLM[]) {
  return [
    { role: "system", content: sistema },
    ...mensajes.map((m) => ({
      role: m.rol === "usuario" ? "user" : "assistant",
      content: m.texto,
    })),
  ];
}

/**
 * Cero y no `undefined` cuando el proveedor no manda `usage`: la suma del gasto
 * no puede romperse porque falte un bloque opcional.
 */
export function usoDeRespuesta(
  datos: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  modelo: string,
  exito: boolean,
): UsoLLM {
  return {
    modelo,
    tokensEntrada: datos.usage?.prompt_tokens ?? 0,
    tokensSalida: datos.usage?.completion_tokens ?? 0,
    exito,
  };
}

export function crearProveedorCompatible(opciones: {
  apiKey: string;
  baseUrl: string;
  modelos: readonly string[];
  onUso?: ReporteUso;
}): ProveedorLLM {
  const { apiKey, baseUrl, modelos, onUso } = opciones;
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function llamar(cuerpoBase: Record<string, unknown>): Promise<Resultado<string, string>> {
    let ultimoError = "sin modelos configurados";
    const limite = Date.now() + PRESUPUESTO_TOTAL_MS;

    for (const modelo of modelos) {
      const msDisponibles = msParaElSiguienteIntento(limite - Date.now());
      if (msDisponibles === null) {
        ultimoError = `${ultimoError} (presupuesto agotado, quedaban modelos por probar)`;
        break;
      }

      const intento = await llamarModelo(modelo, cuerpoBase, msDisponibles);
      if (intento.ok) return intento;

      ultimoError = intento.error;
      if (!otroModeloPuedeAyudar(intento.error)) break;
    }

    return fallo(ultimoError);
  }

  async function llamarModelo(
    modelo: string,
    cuerpoBase: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Resultado<string, string>> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);

    try {
      const respuesta = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...cuerpoBase, model: modelo }),
        signal: control.signal,
      });

      const datos = (await respuesta.json()) as RespuestaCompatible;

      // Se reporta siempre: una respuesta rechazada también consumió cuota.
      onUso?.(usoDeRespuesta(datos, modelo, respuesta.ok));

      if (!respuesta.ok) {
        const detalle = datos.error?.message?.slice(0, 120) ?? "";
        return fallo(
          `compatible/${modelo}: HTTP ${respuesta.status}${detalle ? `: ${detalle}` : ""}`,
        );
      }

      const eleccion = datos.choices?.[0];
      if (!eleccion) return fallo(`compatible/${modelo}: respuesta sin choices`);

      // Cortada por límite de tokens: media frase al cliente o un JSON truncado.
      // Preferimos fallar y que otro modelo lo intente.
      if (eleccion.finish_reason && eleccion.finish_reason !== "stop") {
        return fallo(
          `compatible/${modelo}: HTTP 429 generación detenida por ${eleccion.finish_reason}`,
        );
      }

      const texto = eleccion.message?.content?.trim();
      if (!texto) return fallo(`compatible/${modelo}: respuesta vacía`);

      return ok(texto);
    } catch (e) {
      const razon = e instanceof Error && e.name === "AbortError" ? "timeout" : "red";
      return fallo(`compatible/${modelo}: fallo de ${razon}`);
    } finally {
      clearTimeout(reloj);
    }
  }

  return {
    nombre: `compatible:${modelos[0] ?? "sin-modelo"}`,

    async generarTexto(opcionesTexto: OpcionesTexto) {
      return llamar({
        messages: aMensajesOpenAI(opcionesTexto.sistema, opcionesTexto.mensajes),
        temperature: opcionesTexto.temperatura ?? 0.4,
        max_tokens: opcionesTexto.maxTokens ?? 1200,
      });
    },

    async generarJSON<T>(opcionesJSON: OpcionesJSON<T>): Promise<Resultado<T, string>> {
      const crudo = await llamar({
        messages: aMensajesOpenAI(opcionesJSON.sistema, opcionesJSON.mensajes),
        temperature: 0,
        max_tokens: opcionesJSON.maxTokens ?? 3000,
        // `json_object` y no esquema estricto: OpenRouter documenta que el
        // estricto no lo soportan todos los modelos, y pedírselo a uno que no
        // puede devuelve 400 — que nuestra política clasifica como culpa
        // nuestra y no reintenta. La frontera real es `validar`, que es Zod.
        response_format: { type: "json_object" },
      });

      if (!crudo.ok) return crudo;

      let parseado: unknown;
      try {
        parseado = JSON.parse(crudo.valor);
      } catch {
        return fallo("compatible: la respuesta no era JSON válido");
      }

      return opcionesJSON.validar(parseado);
    },
  };
}
