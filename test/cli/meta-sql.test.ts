import { describe, expect, it } from "vitest";
import {
  PRODUCTOS_META,
  sqlGuardarAjuste,
  sqlGuardarCredencial,
  sqlGuardarMeta,
} from "../../cli/meta.mjs";

/**
 * El SQL que el CLI escribe contra la D1 del negocio.
 *
 * Lo que se prueba aquí es la **forma**: que las claves caigan en la tabla que
 * les toca y que el escapado aguante. Que el SQL sea válido para SQLite se
 * verifica corriéndolo contra una base de verdad, no leyéndolo.
 *
 * Importa porque es el único SQL del proyecto que se arma concatenando en vez
 * de con parámetros — `wrangler d1 execute` recibe una cadena, no un binding.
 */

describe("sqlGuardarCredencial", () => {
  it("escribe en credenciales, con el valor ya cifrado", () => {
    const s = sqlGuardarCredencial("mi-optica", "meta_app_secret", "eNcRiPtAdO==", "2026-09-13T00:00:00.000Z");

    expect(s).toContain("INSERT INTO credenciales");
    expect(s).toContain("'meta_app_secret'");
    expect(s).toContain("'eNcRiPtAdO=='");
    // Reconectar un canal no puede fallar por la fila que ya existe.
    expect(s).toContain("ON CONFLICT");
  });

  // El negocioId viene validado por forma antes de llegar aquí, pero el
  // escapado es la última línea de defensa y no cuesta nada sostenerla.
  it("escapa la comilla simple en vez de dejarla cerrar la cadena", () => {
    const s = sqlGuardarCredencial("o'brien", "meta_app_secret", "x", "2026-09-13T00:00:00.000Z");

    expect(s).toContain("'o''brien'");
  });
});

describe("sqlGuardarMeta", () => {
  it("manda el token a credenciales y el id a settings, nunca al revés", () => {
    const s = sqlGuardarMeta("mi-optica", PRODUCTOS_META.whatsapp, "cifrado", "123456789012345", "2026-09-13T00:00:00.000Z");

    const credenciales = s.slice(0, s.indexOf("INSERT INTO settings"));
    const settings = s.slice(s.indexOf("INSERT INTO settings"));

    // El secreto va cifrado a credenciales; el id, en claro, a settings. Es la
    // misma separación que ya tienen llm_api_key y llm_proveedor.
    expect(credenciales).toContain("'whatsapp_token'");
    expect(credenciales).toContain("'cifrado'");
    expect(settings).toContain("'meta_phone_number_id'");
    expect(settings).toContain("'123456789012345'");

    expect(credenciales).not.toContain("meta_phone_number_id");
    expect(settings).not.toContain("whatsapp_token");
  });

  it("cada producto escribe sus propias claves", () => {
    const messenger = sqlGuardarMeta("n", PRODUCTOS_META.messenger, "c", "1", "t");
    const instagram = sqlGuardarMeta("n", PRODUCTOS_META.instagram, "c", "1", "t");

    expect(messenger).toContain("'messenger_page_token'");
    expect(messenger).toContain("'meta_page_id'");
    expect(instagram).toContain("'instagram_token'");
    expect(instagram).toContain("'meta_ig_id'");
  });
});

describe("sqlGuardarAjuste", () => {
  it("escribe en settings, no en credenciales", () => {
    const s = sqlGuardarAjuste("mi-optica", "meta_agente_humano", "si");

    expect(s).toContain("INSERT INTO settings");
    expect(s).not.toContain("credenciales");
  });
});
