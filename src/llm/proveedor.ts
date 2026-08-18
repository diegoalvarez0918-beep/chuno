import {
  MODELOS_GEMINI,
  resolverConfiguracionLLM,
  type ConfiguracionLLM,
} from "../core/llm/configuracion";
import { TOPE_DIARIO } from "../core/limites";
import { leerCredencial } from "../db/repos/credencial";
import { leerSetting } from "../db/repos/negocio";
import { modelos as modelosDelEntorno, numero, type Env } from "../env";
import { crearProveedorGemini } from "./gemini";
import { crearProveedorCompatible } from "./openai-compatible";
import type { ProveedorLLM, ReporteUso } from "./tipos";

/**
 * El cerebro de un negocio.
 *
 * Mismo patrón que `canalSaliente` con el token de Telegram: lo del negocio si
 * existe, si no lo de la instalación. La diferencia de fondo es de facturación
 * — con una llave global, un despliegue que hospede a varios clientes les cobra
 * los tokens a todos en la misma cuenta.
 */

/** Ajustes que NO son secretos, así que viven en `settings` y sin cifrar. */
const AJUSTE_PROVEEDOR = "llm_proveedor";
const AJUSTE_BASE_URL = "llm_base_url";
const AJUSTE_MODELOS = "llm_modelos";
const AJUSTE_TOPE = "llm_tope_diario";

function comoLista(valor: string | null): string[] {
  return (valor ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export async function configuracionLLMDe(
  env: Env,
  negocioId: string,
): Promise<ConfiguracionLLM> {
  /**
   * La misma regla se aplica DOS veces, y la de arriba no es adorno: una
   * instalación que se declare `compatible` sin URL base tampoco se completa
   * sola. Sin esto caería a Gemini con la llave del otro proveedor, que es un
   * fallo silencioso — el peor tipo.
   */
  const soloGemini: ConfiguracionLLM = {
    proveedor: "gemini",
    apiKey: env.GEMINI_API_KEY,
    baseUrl: null,
    modelos: MODELOS_GEMINI,
    topeDiario: numero(env.TOPE_LLM_DIARIO, TOPE_DIARIO),
  };

  const deLaInstalacion = resolverConfiguracionLLM(
    {
      apiKey: env.GEMINI_API_KEY,
      proveedor: env.LLM_PROVEEDOR ?? null,
      baseUrl: env.LLM_BASE_URL ?? null,
      modelos: modelosDelEntorno(env),
      topeDiario: env.TOPE_LLM_DIARIO ? numero(env.TOPE_LLM_DIARIO, TOPE_DIARIO) : null,
    },
    soloGemini,
  );

  const [apiKey, proveedor, baseUrl, listaModelos, tope] = await Promise.all([
    leerCredencial(env.DB, negocioId, "llm_api_key", env.CLAVE_CIFRADO),
    leerSetting(env.DB, negocioId, AJUSTE_PROVEEDOR),
    leerSetting(env.DB, negocioId, AJUSTE_BASE_URL),
    leerSetting(env.DB, negocioId, AJUSTE_MODELOS),
    leerSetting(env.DB, negocioId, AJUSTE_TOPE),
  ]);

  return resolverConfiguracionLLM(
    {
      apiKey,
      proveedor,
      baseUrl,
      modelos: comoLista(listaModelos),
      topeDiario: tope === null ? null : numero(tope, TOPE_DIARIO),
    },
    deLaInstalacion,
  );
}

export function crearProveedor(
  configuracion: ConfiguracionLLM,
  onUso?: ReporteUso,
): ProveedorLLM {
  if (configuracion.proveedor === "compatible" && configuracion.baseUrl) {
    return crearProveedorCompatible({
      apiKey: configuracion.apiKey,
      baseUrl: configuracion.baseUrl,
      modelos: configuracion.modelos,
      onUso,
    });
  }

  return crearProveedorGemini(configuracion.apiKey, configuracion.modelos, onUso);
}
