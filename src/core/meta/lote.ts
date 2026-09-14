/**
 * Partir un lote para que quepa en D1.
 *
 * D1 admite 100 parámetros vinculados por consulta, y Meta manda hasta 1000
 * actualizaciones por POST. Sin trocear, un lote grande no falla al escribirse:
 * falla al PREPARARSE, que es peor, porque ocurre después de haber autenticado
 * y antes de haber guardado nada — o sea, con Meta esperando un 200 que no va
 * a llegar y una cadena de reintentos de 36 horas por delante.
 */
export const PARAMETROS_MAXIMOS = 100;

export function trocear<T>(filas: readonly T[], columnas: number): T[][] {
  // Esta guarda va ANTES de la división y no después, porque `columnas = 0` da
  // `Infinity`, que no es menor que 1 y se colaría por la de abajo dejando el
  // lote entero en un solo trozo — justo lo que esta función existe para
  // impedir. Comprobado: sin esto, `trocear(mil, 0)` devuelve un trozo de mil.
  if (!Number.isInteger(columnas) || columnas < 1) {
    throw new Error(`columnas debe ser un entero de al menos 1, y llegó ${columnas}`);
  }

  const porTrozo = Math.floor(PARAMETROS_MAXIMOS / columnas);
  // Mejor reventar aquí, con el número delante, que emitir una sentencia que
  // D1 rechaza por una razón que no menciona el tope.
  if (porTrozo < 1) {
    throw new Error(`una fila de ${columnas} columnas ya excede el tope de D1`);
  }

  const trozos: T[][] = [];
  for (let i = 0; i < filas.length; i += porTrozo) {
    trozos.push(filas.slice(i, i + porTrozo));
  }

  return trozos;
}
