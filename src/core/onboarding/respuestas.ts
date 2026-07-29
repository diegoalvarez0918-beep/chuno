import { fallo, ok, type Resultado } from "../resultado";
import {
  FaqEntradaSchema,
  ItemCatalogoEntradaSchema,
  type FaqEntrada,
  type ItemCatalogoEntrada,
} from "./tipos";

/**
 * Parsers deterministas de las respuestas de la entrevista.
 *
 * Son la primera línea: gratis, instantáneos y predecibles. El LLM solo entra
 * como fallback cuando estos no pueden (y su salida se valida igual). Por eso
 * la demo pública puede correr la entrevista completa sin gastar un token.
 */

const SALTAR = /^(saltar|ningun[ao]s?|no|luego|despu[eé]s)[.!]?$/i;

export function esSaltar(texto: string): boolean {
  return SALTAR.test(texto.trim());
}

/**
 * Precio en pesos colombianos → centavos. Reconoce "$850.000", "850.000" y
 * números pelados de 4+ dígitos. Un número corto sin signo ("3") no es precio:
 * casi siempre son días de entrega.
 */
export function parsearPrecio(texto: string): number | null {
  const conSigno = texto.match(/\$\s*(\d{1,3}(?:\.\d{3})+|\d+)/);
  const miles = texto.match(/\b\d{1,3}(?:\.\d{3})+\b/);
  const pelado = texto.match(/\b\d{4,}\b/);

  const crudo = conSigno?.[1] ?? miles?.[0] ?? pelado?.[0];
  if (!crudo) return null;

  const pesos = Number(crudo.replaceAll(".", ""));
  if (!Number.isFinite(pesos) || pesos <= 0) return null;

  return pesos * 100;
}

export function parsearDiasEntrega(texto: string): number | null {
  const m = texto.match(/(\d{1,3})\s*d[ií]as?/i);
  if (m) {
    const n = Number(m[1]);
    return n > 0 && n <= 365 ? n : null;
  }
  if (/mismo\s+d[ií]a/i.test(texto)) return 1;
  return null;
}

/** Borra del texto lo que ya se extrajo como precio o días, para aislar el nombre. */
function quitarPrecioYDias(texto: string): string {
  return texto
    .replace(/\$\s*[\d.]+/g, "")
    .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/(entrega\s+(en\s+)?)?\d{1,3}\s*d[ií]as?(\s+h[aá]biles)?/gi, "")
    .replace(/(entrega\s+)?mismo\s+d[ií]a/gi, "")
    .replace(/\bpesos\b/gi, "")
    .trim();
}

function parsearLineaCatalogo(linea: string): ItemCatalogoEntrada | null {
  const limpia = linea.replace(/^[\s*•·\-–—]+/, "").trim();
  if (limpia.length < 3) return null;

  const precioCentavos = parsearPrecio(limpia);
  const diasEntrega = parsearDiasEntrega(limpia);

  const segmentos = limpia
    .split(/\s*[–—:|]\s*|\s+-\s+/)
    .map((s) => quitarPrecioYDias(s).replace(/[,;.\s]+$/, "").trim())
    .filter((s) => s.length > 0);

  const nombre = segmentos[0];
  if (!nombre) return null;

  const r = ItemCatalogoEntradaSchema.safeParse({
    nombre,
    descripcion: segmentos.slice(1).join(", ") || null,
    precioCentavos,
    diasEntrega,
  });

  return r.success ? r.data : null;
}

export function parsearCatalogo(texto: string): ItemCatalogoEntrada[] {
  if (esSaltar(texto)) return [];
  return texto
    .split(/\r?\n/)
    .map(parsearLineaCatalogo)
    .filter((i): i is ItemCatalogoEntrada => i !== null);
}

export function parsearFaq(texto: string): FaqEntrada[] {
  if (esSaltar(texto)) return [];

  const pares: FaqEntrada[] = [];
  let pendiente: string | null = null;

  const agregar = (pregunta: string, respuesta: string) => {
    const v = FaqEntradaSchema.safeParse({
      pregunta: pregunta.trim(),
      respuesta: respuesta.replace(/^[\s\-–—:.,]+/, "").trim(),
    });
    if (v.success) pares.push(v.data);
  };

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;

    const p = linea.match(/^p(?:regunta)?\s*[:.\-]\s*(.+)$/i);
    if (p?.[1]) {
      pendiente = p[1].trim();
      continue;
    }

    const r = linea.match(/^r(?:espuesta)?\s*[:.\-]\s*(.+)$/i);
    if (r?.[1] && pendiente) {
      agregar(pendiente, r[1]);
      pendiente = null;
      continue;
    }

    const signo = linea.lastIndexOf("?");
    if (signo > 0 && signo < linea.length - 1) {
      agregar(linea.slice(0, signo + 1), linea.slice(signo + 1));
      continue;
    }
    if (signo === linea.length - 1) {
      pendiente = linea;
      continue;
    }
    if (pendiente) {
      agregar(pendiente, linea);
      pendiente = null;
    }
  }

  return pares;
}

/**
 * Token de BotFather o "saltar". Cualquier otra cosa es un error EXPLICADO:
 * quien contesta es el dueño de una óptica, no un ingeniero.
 */
export function parsearTokenTelegram(texto: string): Resultado<string | null, string> {
  const limpio = texto.trim();
  if (esSaltar(limpio)) return ok(null);
  if (/^\d{6,12}:[A-Za-z0-9_-]{30,60}$/.test(limpio)) return ok(limpio);

  return fallo(
    'Eso no parece un token de BotFather (tiene la forma "123456789:AA…"). ' +
      'Pégalo tal cual te lo dio @BotFather, o escribe "saltar" para conectar el bot después.',
  );
}
