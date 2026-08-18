import { defineConfig } from "vitest/config";

// Aquí se prueba lo puro: `src/core` entero, y de los adaptadores —canales y
// proveedores de LLM— solo lo que no toca red. Determinista por diseño: corre
// en milisegundos y nunca falla por causas externas. Lo que hace red se
// verifica end-to-end contra el Worker.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
