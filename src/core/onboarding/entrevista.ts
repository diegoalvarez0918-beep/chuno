import { fallo, ok, type Resultado } from "../resultado";
import { esSaltar, parsearCatalogo, parsearFaq, parsearTokenTelegram } from "./respuestas";
import {
  PASOS,
  type DatosEntrevista,
  type EstadoEntrevista,
  type FaqEntrada,
  type ItemCatalogoEntrada,
  type Paso,
  type RespuestaPaso,
} from "./tipos";

/**
 * La máquina de estados de la entrevista.
 *
 * Determinista y sin LLM a propósito: es el mismo motor para la web de hoy,
 * la demo pública (que no puede gastar tokens) y el CLI de la Fase 9. El LLM
 * solo estructura respuestas difíciles, afuera, y lo que devuelve entra por
 * `aplicarRespuesta` igual que cualquier otra respuesta.
 */

export function estadoInicial(): EstadoEntrevista {
  return { paso: "nombre", datos: {} };
}

export function esFinal(estado: EstadoEntrevista): boolean {
  return estado.paso === "listo";
}

/** 1-based, para pintar "Pregunta 3 de 7". */
export function numeroDePaso(paso: Paso): number {
  return PASOS.indexOf(paso) + 1;
}

export function preguntaDe(paso: Paso, datos: DatosEntrevista): string {
  const nombre = datos.nombre ?? "tu negocio";

  switch (paso) {
    case "nombre":
      return "¿Cómo se llama tu negocio?";
    case "queVendes":
      return `¿Qué vende o qué hace ${nombre}? Cuéntamelo como se lo dirías a un cliente.`;
    case "horario":
      return "¿Cuál es el horario de atención y dónde están ubicados?";
    case "catalogo":
      return 'Pégame tu lista de productos o servicios con precios, uno por línea. Por ejemplo: "Lentes monofocales - $180.000 - 3 días". Si no la tienes a la mano, escribe "saltar".';
    case "faq":
      return '¿Qué te preguntan siempre los clientes, y qué respondes? Escríbelo como "P: …" y "R: …" en líneas seguidas, o la pregunta y la respuesta en una sola línea. Si no se te ocurren, escribe "saltar".';
    case "tono":
      return '¿Cómo quieres que suene el asistente? Por ejemplo "cercano y tuteando" o "más bien formal". Escribe "saltar" para dejar el tono estándar.';
    case "telegram":
      return 'Si ya creaste un bot en Telegram, pégame el token que te dio @BotFather (se guarda cifrado y nunca se muestra). Si todavía no, escribe "saltar" y lo conectas después.';
    case "listo":
      return `¡Eso es todo! Revisa el resumen y confirma para crear el asistente de ${nombre}.`;
  }
}

/** Texto crudo → respuesta estructurada, con los parsers deterministas. */
export function interpretar(paso: Paso, texto: string): Resultado<RespuestaPaso, string> {
  const limpio = texto.trim();

  switch (paso) {
    case "nombre": {
      if (limpio.length < 2 || limpio.length > 120) {
        return fallo("Necesito el nombre del negocio: entre 2 y 120 caracteres.");
      }
      return ok({ paso, nombre: limpio });
    }
    case "queVendes": {
      if (limpio.length < 5) return fallo("Cuéntame un poco más: con una o dos frases basta.");
      return ok({ paso, queVendes: limpio.slice(0, 1000) });
    }
    case "horario": {
      if (limpio.length < 5) {
        return fallo("Necesito al menos el horario; la dirección es opcional pero ayuda.");
      }
      return ok({ paso, horario: limpio.slice(0, 1000) });
    }
    case "catalogo": {
      const items = parsearCatalogo(limpio);
      if (items.length === 0 && !esSaltar(limpio)) {
        return fallo(
          'No logré leer la lista. Escribe un producto por línea, por ejemplo "Lentes monofocales - $180.000", o escribe "saltar".',
        );
      }
      return ok({ paso, items });
    }
    case "faq": {
      const faqs = parsearFaq(limpio);
      if (faqs.length === 0 && !esSaltar(limpio)) {
        return fallo(
          'No logré separar preguntas y respuestas. Usa "P: …" y "R: …" en líneas seguidas, o escribe "saltar".',
        );
      }
      return ok({ paso, faqs });
    }
    case "tono": {
      if (esSaltar(limpio)) return ok({ paso, tono: null });
      if (limpio.length < 3) {
        return fallo('Descríbelo en pocas palabras, por ejemplo "cercano y breve", o escribe "saltar".');
      }
      return ok({ paso, tono: limpio.slice(0, 300) });
    }
    case "telegram": {
      const token = parsearTokenTelegram(limpio);
      if (!token.ok) return token;
      return ok({ paso, token: token.valor });
    }
    case "listo":
      return fallo("La entrevista ya terminó: solo falta confirmar.");
  }
}

export function aplicarRespuesta(
  estado: EstadoEntrevista,
  respuesta: RespuestaPaso,
): Resultado<EstadoEntrevista, string> {
  if (respuesta.paso !== estado.paso) {
    return fallo(`la entrevista va en "${estado.paso}", no en "${respuesta.paso}"`);
  }

  const indice = PASOS.indexOf(estado.paso);
  const siguiente = PASOS[indice + 1];
  if (!siguiente) return fallo("la entrevista ya terminó");

  return ok({ paso: siguiente, datos: { ...estado.datos, ...datosDe(respuesta) } });
}

function datosDe(r: RespuestaPaso): Partial<DatosEntrevista> {
  switch (r.paso) {
    case "nombre":
      return { nombre: r.nombre };
    case "queVendes":
      return { queVendes: r.queVendes };
    case "horario":
      return { horario: r.horario };
    case "catalogo":
      return { catalogo: r.items };
    case "faq":
      return { faq: r.faqs };
    case "tono":
      return { tono: r.tono };
    case "telegram":
      return { telegramToken: r.token };
  }
}

export interface Configuracion {
  readonly nombre: string;
  readonly giro: "por-encargo";
  readonly zonaHoraria: "America/Bogota";
  readonly conocimiento: readonly { titulo: string; contenido: string }[];
  readonly catalogo: readonly ItemCatalogoEntrada[];
  readonly faq: readonly FaqEntrada[];
  readonly tono: string | null;
  readonly telegramToken: string | null;
}

/**
 * De respuestas sueltas a configuración lista para materializar. Puro: quien
 * escribe filas con esto es la capa de arriba, no el núcleo.
 */
export function armarConfiguracion(datos: DatosEntrevista): Resultado<Configuracion, string> {
  if (!datos.nombre || !datos.queVendes || !datos.horario) {
    return fallo("faltan respuestas obligatorias de la entrevista");
  }

  return ok({
    nombre: datos.nombre,
    giro: "por-encargo",
    zonaHoraria: "America/Bogota",
    conocimiento: [
      { titulo: "Qué hacemos", contenido: datos.queVendes },
      { titulo: "Horario y ubicación", contenido: datos.horario },
    ],
    catalogo: datos.catalogo ?? [],
    faq: datos.faq ?? [],
    tono: datos.tono ?? null,
    telegramToken: datos.telegramToken ?? null,
  });
}
