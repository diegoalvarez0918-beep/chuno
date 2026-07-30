# Archivos estáticos

Lo que hay aquí lo sirve la CDN de Cloudflare directamente, antes de que el
Worker se despierte. No cuestan invocación y se cachean solos.

## `hero.png` — la imagen del hero de la landing

**No está en el repo todavía.** La landing la usa si existe y, si no existe,
cae sola a la composición de burbujas y tablero. No hay que tocar código para
cambiar de una a otra: `landing.ts` decide en el navegador según si la imagen
carga.

Requisitos:

- **Nombre exacto:** `hero.png` (o `hero.webp`, ajustando la ruta en
  `src/publico/landing.ts`).
- **Fondo transparente o blanco.** El hero es crema `#F5F5F2`; una foto con
  fondo blanco recortado se nota.
- **Peso:** por debajo de 400 KB. Es lo primero que se descarga en la página
  que ve un votante, y el proyecto asume señal mala.
- **Lado largo:** 1600 px alcanza de sobra. Más es peso que nadie ve.

El spotlight del cursor no necesita dos imágenes: la capa de abajo va en gris y
la de arriba a color, recortada por la máscara. Es el mismo archivo dos veces.
