import { defineConfig } from "vitest/config";

// Solo probamos src/core aquí: es TypeScript puro, sin Cloudflare, sin red y sin
// LLM. Determinista por diseño — corre en milisegundos y nunca falla por causas
// externas. Lo que toca la plataforma se verifica end-to-end contra el Worker.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
