import { describe, expect, it } from "vitest";
import { cifrar, descifrar } from "../../src/core/cifrado";
import { cifrarValor } from "../../cli/cifrado.mjs";

/**
 * El CLI y el Worker cifran el mismo formato desde dos implementaciones.
 *
 * El CLI corre en Node y no puede importar TypeScript, así que `cifrarValor`
 * es una segunda escritura del mismo AES-GCM. Una duplicación así diverge en
 * silencio, y el día que lo haga el síntoma sería el peor posible: el token
 * guardado por el CLI deja de descifrar en producción y se lee como "el token
 * del cliente no sirve".
 *
 * Estos tests son el único punto donde las dos implementaciones se tocan. No
 * comprueban que cada una haga round-trip consigo misma —eso sería tautológico,
 * dos copias divergentes lo pasarían—: comprueban que lo que escribe una lo
 * lee la OTRA.
 */

// Las dos son 32 bytes de verdad. Una llave de otro tamaño también haría
// fallar el descifrado, pero por no poder importarse: el control de "otra
// llave" estaría midiendo una llave inválida, no una llave distinta.
const CLAVE = "XU9r7CJUMU1Ty4sKvci7CbWjdFtURXZEmil2EXtcEEw=";
const OTRA_CLAVE = "m4x4Wol4W5wIVJ8RSX7C4/Sta4p9o+MCrLdzS8dF0lw=";

describe("el cifrado del CLI y el del núcleo son el mismo formato", () => {
  it("lo que cifra el CLI lo descifra el Worker", async () => {
    const guardado = await cifrarValor("EAAB-token-de-whatsapp", CLAVE);

    expect(await descifrar(guardado, CLAVE)).toBe("EAAB-token-de-whatsapp");
  });

  it("lo que cifra el Worker lo descifra el CLI, con el mismo formato", async () => {
    // La dirección inversa importa: si el CLI leyera su propio formato pero no
    // el del Worker, un token guardado desde el panel sería ilegible para él.
    const guardado = await cifrar("token-escrito-por-el-worker", CLAVE);

    expect(await descifrar(guardado, CLAVE)).toBe("token-escrito-por-el-worker");
    expect(guardado).not.toContain("token-escrito-por-el-worker");
  });

  // El control: sin esto, un `cifrarValor` que devolviera el texto plano tal
  // cual pasaría los dos tests de arriba.
  it("con otra llave no descifra, devuelve null en vez de reventar", async () => {
    const guardado = await cifrarValor("EAAB-token-de-whatsapp", CLAVE);

    expect(await descifrar(guardado, OTRA_CLAVE)).toBeNull();
  });

  it("dos cifrados del mismo valor no son iguales: el iv es nuevo cada vez", async () => {
    const uno = await cifrarValor("mismo-token", CLAVE);
    const dos = await cifrarValor("mismo-token", CLAVE);

    expect(uno).not.toBe(dos);
    expect(await descifrar(uno, CLAVE)).toBe(await descifrar(dos, CLAVE));
  });
});
