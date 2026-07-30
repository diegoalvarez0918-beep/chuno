import { describe, expect, it } from "vitest";
import { DURACION_SESION_SEGUNDOS, firmarSesion, verificarSesion } from "../../src/core/sesion";

// 32 bytes fijos, solo para tests. La llave real sale de `openssl rand -base64 32`.
const CLAVE = btoa("0123456789abcdef0123456789abcdef");
const OTRA_CLAVE = btoa("fedcba9876543210fedcba9876543210");

const PASSWORD = "contraseña-del-panel";
const AHORA = 1_800_000_000;

describe("sesión del panel", () => {
  it("acepta un token recién firmado", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + DURACION_SESION_SEGUNDOS);
    expect(await verificarSesion(token, CLAVE, PASSWORD, AHORA)).toBe(true);
  });

  it("rechaza un token expirado", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + 60);
    expect(await verificarSesion(token, CLAVE, PASSWORD, AHORA + 61)).toBe(false);
  });

  it("acepta justo en el último segundo de vida", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + 60);
    expect(await verificarSesion(token, CLAVE, PASSWORD, AHORA + 60)).toBe(true);
  });

  /**
   * Lo que hace útil meter la huella de la contraseña dentro del mensaje
   * firmado: rotarla echa a todo el mundo, que es lo que uno espera de cambiar
   * una contraseña. Sin esto, un token robado sobreviviría al cambio.
   */
  it("cambiar la contraseña invalida los tokens ya emitidos", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + DURACION_SESION_SEGUNDOS);
    expect(await verificarSesion(token, CLAVE, "otra-contraseña", AHORA)).toBe(false);
  });

  it("con otra llave maestra no verifica", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + DURACION_SESION_SEGUNDOS);
    expect(await verificarSesion(token, OTRA_CLAVE, PASSWORD, AHORA)).toBe(false);
  });

  it("rechaza una firma manipulada", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + DURACION_SESION_SEGUNDOS);
    const roto = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verificarSesion(roto, CLAVE, PASSWORD, AHORA)).toBe(false);
  });

  /** Alargarse la sesión a mano es el ataque obvio: la firma cubre el vencimiento. */
  it("rechaza un token al que le estiraron el vencimiento", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + 60);
    const [version, , firma] = token.split(":");
    const estirado = `${version}:${AHORA + 999_999}:${firma}`;
    expect(await verificarSesion(estirado, CLAVE, PASSWORD, AHORA)).toBe(false);
  });

  it("rechaza una versión de formato que no conoce", async () => {
    const token = await firmarSesion(CLAVE, PASSWORD, AHORA + DURACION_SESION_SEGUNDOS);
    expect(await verificarSesion(`v9${token.slice(2)}`, CLAVE, PASSWORD, AHORA)).toBe(false);
  });

  it("rechaza basura sin lanzar excepción", async () => {
    for (const basura of ["", "hola", "v1:abc:def", "v1:", ":::", "v1:123"]) {
      expect(await verificarSesion(basura, CLAVE, PASSWORD, AHORA)).toBe(false);
    }
  });
});
