import { describe, expect, it } from "vitest";
import { cifrar, descifrar } from "../../src/core/cifrado";

// 32 bytes fijos, solo para tests. La llave real sale de `openssl rand -base64 32`.
const CLAVE = btoa("0123456789abcdef0123456789abcdef");
const OTRA_CLAVE = btoa("fedcba9876543210fedcba9876543210");

describe("cifrado de credenciales", () => {
  it("descifra lo que cifró", async () => {
    const cifrado = await cifrar("123456789:AAubcCDefGHijKLmnOPqrsTUvwxYZabcdefg", CLAVE);
    expect(await descifrar(cifrado, CLAVE)).toBe("123456789:AAubcCDefGHijKLmnOPqrsTUvwxYZabcdefg");
  });

  it("el mismo texto produce cifrados distintos (IV aleatorio)", async () => {
    expect(await cifrar("secreto", CLAVE)).not.toBe(await cifrar("secreto", CLAVE));
  });

  it("con otra llave no descifra: devuelve null, no basura", async () => {
    const cifrado = await cifrar("secreto", CLAVE);
    expect(await descifrar(cifrado, OTRA_CLAVE)).toBeNull();
  });

  it("un valor manipulado no descifra", async () => {
    const cifrado = await cifrar("secreto", CLAVE);
    const roto = cifrado.slice(0, -4) + (cifrado.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await descifrar(roto, CLAVE)).toBeNull();
  });

  it("basura que ni es base64 devuelve null", async () => {
    expect(await descifrar("esto no es base64 !!!", CLAVE)).toBeNull();
  });
});
