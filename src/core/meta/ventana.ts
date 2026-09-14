/**
 * La ventana de mensajería de Meta.
 *
 * Los tres productos dan 24 horas desde el último mensaje del cliente para
 * escribirle libremente; fuera de eso WhatsApp exige plantilla pre-aprobada y
 * Messenger e Instagram exigen etiqueta. Telegram no tiene nada de esto, y por
 * eso hasta D2 no existía una línea de código que lo contemplara.
 *
 * Vive en `core` y la hora entra por parámetro: sin red, sin reloj, sin `env`.
 */

export const VENTANA_HORAS = 24;

export type EstadoVentana = "abierta" | "cerrada";

export type ModoEnvio =
  | { readonly tipo: "libre" }
  | { readonly tipo: "plantilla"; readonly nombre: string; readonly idioma: string }
  | { readonly tipo: "etiqueta" }
  | { readonly tipo: "cerrada" };

export function estadoVentana(ultimoClienteEn: string | null, ahora: string): EstadoVentana {
  if (!ultimoClienteEn) return "cerrada";

  const desde = Date.parse(ultimoClienteEn);
  const hasta = Date.parse(ahora);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return "cerrada";

  return hasta - desde < VENTANA_HORAS * 3_600_000 ? "abierta" : "cerrada";
}

export interface OpcionesFueraDeVentana {
  readonly plantilla?: { readonly nombre: string; readonly idioma: string } | null;
  readonly etiquetaAgenteHumano?: boolean;
}

/**
 * La plantilla gana a la etiqueta porque es la que Meta aprueba de antemano:
 * la etiqueta se evalúa al enviar y puede rechazarse, y un rechazo cuesta un
 * aviso que el dueño creía enviado.
 */
export function resolverModo(
  estado: EstadoVentana,
  opciones: OpcionesFueraDeVentana,
): ModoEnvio {
  if (estado === "abierta") return { tipo: "libre" };

  const plantilla = opciones.plantilla;
  if (plantilla?.nombre) {
    return { tipo: "plantilla", nombre: plantilla.nombre, idioma: plantilla.idioma };
  }

  return opciones.etiquetaAgenteHumano ? { tipo: "etiqueta" } : { tipo: "cerrada" };
}
