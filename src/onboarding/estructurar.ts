import { fallo, ok, type Resultado } from "../core/resultado";
import {
  ESQUEMA_GEMINI_CATALOGO,
  ESQUEMA_GEMINI_FAQ,
  PROMPT_ESTRUCTURAR_CATALOGO,
  PROMPT_ESTRUCTURAR_FAQ,
  validarCatalogoLLM,
  validarFaqLLM,
} from "../core/onboarding/esquemas-llm";
import type { RespuestaPaso } from "../core/onboarding/tipos";
import type { ProveedorLLM } from "../llm/tipos";

/**
 * Fallback probabilístico: SOLO corre cuando el parser determinista no pudo, y
 * solo para catálogo y FAQ. La salida ya viene validada contra Zod por el
 * proveedor (opción `validar`), así que aquí no hay JSON crudo.
 */
export async function estructurarConLLM(
  llm: ProveedorLLM,
  paso: "catalogo" | "faq",
  texto: string,
): Promise<Resultado<RespuestaPaso, string>> {
  if (paso === "catalogo") {
    const r = await llm.generarJSON({
      sistema: PROMPT_ESTRUCTURAR_CATALOGO,
      mensajes: [{ rol: "usuario", texto }],
      esquema: ESQUEMA_GEMINI_CATALOGO,
      validar: validarCatalogoLLM,
    });
    if (!r.ok) return r;
    if (r.valor.length === 0) {
      return fallo("Tampoco así encontré productos en el texto. Intenta un producto por línea.");
    }
    return ok({ paso: "catalogo", items: r.valor });
  }

  const r = await llm.generarJSON({
    sistema: PROMPT_ESTRUCTURAR_FAQ,
    mensajes: [{ rol: "usuario", texto }],
    esquema: ESQUEMA_GEMINI_FAQ,
    validar: validarFaqLLM,
  });
  if (!r.ok) return r;
  if (r.valor.length === 0) return fallo("Tampoco así encontré pares de pregunta y respuesta.");
  return ok({ paso: "faq", faqs: r.valor });
}
