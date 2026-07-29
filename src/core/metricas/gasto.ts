export interface UsoModelo {
  readonly modelo: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
}

/** Centavos de dólar por millón de tokens. Cero = capa gratuita. */
export const TARIFAS: Readonly<Record<string, { entrada: number; salida: number }>> = {
  "gemini-3.6-flash": { entrada: 0, salida: 0 },
  "gemini-3.1-flash-lite": { entrada: 0, salida: 0 },
  "gemini-flash-lite-latest": { entrada: 0, salida: 0 },
  "claude-sonnet-5": { entrada: 300, salida: 1500 },
  "claude-haiku-4-5-20251001": { entrada: 100, salida: 500 },
};

export function esGratis(modelo: string): boolean {
  const tarifa = TARIFAS[modelo];
  return tarifa !== undefined && tarifa.entrada === 0 && tarifa.salida === 0;
}

/**
 * Costo de una llamada, en centavos.
 *
 * Un modelo que no está en la tabla se cobra como cero: preferimos subestimar el
 * gasto a mostrarle al dueño un número inventado que luego no cuadre con su
 * factura.
 */
export function costoCentavos(uso: UsoModelo): number {
  const tarifa = TARIFAS[uso.modelo];
  if (!tarifa) return 0;

  return (uso.tokensEntrada * tarifa.entrada + uso.tokensSalida * tarifa.salida) / 1_000_000;
}

/** Se redondea una sola vez, al final: redondear cada llamada perdería el total. */
export function costoTotalCentavos(usos: readonly UsoModelo[]): number {
  return Math.round(usos.reduce((suma, uso) => suma + costoCentavos(uso), 0));
}
