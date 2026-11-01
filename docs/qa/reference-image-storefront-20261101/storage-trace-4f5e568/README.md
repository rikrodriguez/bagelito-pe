# Diagnóstico de lecturas de almacenamiento

Aplicación inmutable `4f5e568799e19c6b178c35dbc01f860d31a5e40b`, `http://127.0.0.1:3207/`, viewport390×844. Esta carpeta conserva un resultado global FAIL, procesoexit1; no es una validación completa del nuevo flujo.

PASS imagen/hotspots: GET realmente pintado con SHA256 exacto `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`, dimensiones naturales1536×1024, imagen completa390×260 sin recorte/filtro/opacidad de ancestros, overflow0 y Canvas0. Packs/Combos/Schmears tienen targets44px efectivos, centro alineado con cada tarjeta dibujada y Tab real con foco3px. La captura inicial se guarda antes de asserts/interacciones.

Packs abrió `pack-size` en `data-reference-mode=true` y `data-review-only=true`. A continuación falló el criterio estricto de cero almacenamiento: dos accesos `sessionStorage.getItem`, sin escrituras. No se ejecutaron callbacks restantes,320px ni escritorio. CeroAPI/fetch/XHR/POST/proveedores registrados; únicamente recursosGET locales.

Esta traza añade claves y stacks sin cambiar los asserts y atribuye ambas lecturas al framework TanStack, key `tsr-scroll-restoration-v1_3`: scriptSSR inline y router-core en bundle index. GuidedCommerce reviewOnly retorna antes del draftstorage. Este FAIL sigue preservado; no se silenció ni se permitió almacenamiento de aplicación.

Sin WebGL, HDR, llamadas a API, pagos, base de datos o despliegue. Chromium se lanzó con `--disable-gpu`. Los archivosJSON/PNG/stdout se copian sin modificar. `driver-frozen.cjs` guarda el source exacto; la versión de ejecución reside en/tmp y usa el repo como cwd. `SHA256SUMS` incluye todos los archivos.
