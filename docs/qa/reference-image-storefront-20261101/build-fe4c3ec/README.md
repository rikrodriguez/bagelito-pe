# Build de la aplicación imagen exacta

Código de aplicación: `fe4c3ec460a9fb7bdd33cd2e6ebaec8156db9ecc`. El build se ejecutó sobre el árbol de aplicación que se confirmó en ese commit; los commits posteriores de evidencia no cambian ese código. Copia literal del log `/tmp/bagelito-reference-build-v3.log`.

`npm run build`: PASS, exit0. Incluye bundling Vite/Nitro, `tsc --noEmit`, QA estructural11/11, fallback manual4/4 y movimiento14/14. Los casos heredados de movimiento prueban el módulo preservado; no acreditan un Canvas ni un juego en las nuevas rutas. Advertencias de dependencias/bundling permanecen en el log.

Este build es local. No es un despliegue ni prueba de CI remoto.
