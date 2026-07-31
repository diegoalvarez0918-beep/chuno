import { costoTotalCentavos, type UsoModelo } from "../../core/metricas/gasto";
import { evaluarSalud, type EstadoSalud } from "../../core/metricas/salud";
import { contarContactosActivos, contarLeadsAbiertos } from "./crm";
import { contarPendientes } from "./propuesta";
import { inicioDelDiaISO } from "../id";

export interface Metricas {
  readonly mensajesHoy: number;
  readonly clientesUnicosHoy: number;
  readonly leadsAbiertos: number;
  readonly decisionesPendientes: number;
  readonly salud: EstadoSalud;
  readonly gastoMesCentavos: number;
  readonly todoGratis: boolean;
}

/**
 * El "hoy" se calcula contra la medianoche del negocio, no contra UTC.
 *
 * A las 7 p.m. en Bogotá ya cambió el día en UTC: con UTC, el panel mostraría
 * cero mensajes en plena tarde de trabajo. Colombia es UTC-5 todo el año y no
 * tiene horario de verano, así que el desfase es constante — cuando haya
 * negocios fuera de Colombia esto necesita calcularse por zona.
 */

export async function calcularMetricas(
  db: D1Database,
  negocioId: string,
  zonaHoraria: string,
): Promise<Metricas> {
  const desde = inicioDelDiaISO(zonaHoraria);
  const haceUnMes = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [mensajes, clientes, leads, pendientes, fallos, usos] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM mensajes WHERE negocio_id = ? AND creado_en >= ?")
      .bind(negocioId, desde)
      .first<{ n: number }>(),
    contarContactosActivos(db, negocioId, desde),
    contarLeadsAbiertos(db, negocioId),
    contarPendientes(db, negocioId),
    db
      .prepare(
        `SELECT SUM(CASE WHEN exito = 0 THEN 1 ELSE 0 END) AS fallos, COUNT(*) AS total
           FROM uso_llm WHERE negocio_id = ? AND creado_en >= ?`,
      )
      .bind(negocioId, haceUnMes)
      .first<{ fallos: number | null; total: number }>(),
    db
      .prepare(
        `SELECT modelo, SUM(tokens_entrada) AS entrada, SUM(tokens_salida) AS salida
           FROM uso_llm WHERE negocio_id = ? AND creado_en >= ? GROUP BY modelo`,
      )
      .bind(negocioId, haceUnMes)
      .all<{ modelo: string; entrada: number; salida: number }>(),
  ]);

  const consumo: UsoModelo[] = usos.results.map((u) => ({
    modelo: u.modelo,
    tokensEntrada: u.entrada ?? 0,
    tokensSalida: u.salida ?? 0,
  }));

  const gasto = costoTotalCentavos(consumo);

  return {
    mensajesHoy: mensajes?.n ?? 0,
    clientesUnicosHoy: clientes,
    leadsAbiertos: leads,
    decisionesPendientes: pendientes,
    salud: evaluarSalud({ fallos: fallos?.fallos ?? 0, total: fallos?.total ?? 0 }),
    gastoMesCentavos: gasto,
    // Distingue "no ha gastado nada" de "todavía no ha usado el modelo".
    todoGratis: gasto === 0 && consumo.length > 0,
  };
}
