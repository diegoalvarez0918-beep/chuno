import { describe, expect, it } from "vitest";
import { productoDeMeta } from "../../src/core/meta/producto";

describe("productoDeMeta", () => {
  it("reconoce los tres objetos de Meta", () => {
    expect(productoDeMeta({ object: "whatsapp_business_account" })).toBe("whatsapp");
    expect(productoDeMeta({ object: "page" })).toBe("messenger");
    expect(productoDeMeta({ object: "instagram" })).toBe("instagram");
  });

  // Meta manda notificaciones de TODOS los campos a los que la app esté
  // suscrita. Uno que no nos interesa no es un error suyo: la ruta responde 200.
  it("devuelve null para un objeto ajeno", () => {
    expect(productoDeMeta({ object: "permissions" })).toBeNull();
  });

  it("devuelve null para basura, sin reventar", () => {
    expect(productoDeMeta(null)).toBeNull();
    expect(productoDeMeta("hola")).toBeNull();
    expect(productoDeMeta({})).toBeNull();
    expect(productoDeMeta({ object: 42 })).toBeNull();
  });
});
