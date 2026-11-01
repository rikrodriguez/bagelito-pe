# Preview descargable de Bagelito

[Descargar ZIP](bagelito-reference-review-6f765ce.zip) (8.964.021 bytes). Aplicación `6f765cee68f4c4d2f013a1082b497a73b5191bd7`, Node24.19.0. No requiere instalar paquetes, DB ni credenciales. El ZIP contiene el servidor local y los assets compilados, no una captura estática.

1. Descomprimir en una carpeta nueva.
2. Desde esa carpeta: `node start-review.mjs`.
3. Abrir `http://127.0.0.1:4173/` en el mismo equipo. Ctrl+C lo detiene.

La preview permite selección real y revisión de entrega/consentimiento. No cobra, reserva ni crea pedidos. Fidelidad y canje están pendientes; no ofrece Wallet ni una integración GHL. Ambos entrypoints documentados fuerzan loopback y el cierre de API, incluso ante variables de entorno que intenten desactivarlos. No se ha desplegado un servicio público.

SHA256 del ZIP: `a8429039f9b911094b76dfb794692c6d1f07750ded8dddf16d3607ebf86c9f48`.

El [probe original](artifact-probe.json) verificó los113 hashes del manifiesto interno, inició el ZIP descomprimido fuera del repositorio, sirvió HTML/assets/imagen con200 y conservó el hash exacto del WebP aprobado. `/api/batch` y `/api/payments/culqi/config` devolvieron503/no-store, sin cookies. Una segunda ejecución directa de `server/index.mjs` con `BAGELITO_REFERENCE_REVIEW_ONLY=false` y host0.0.0.0 terminó escuchando exclusivamente127.0.0.1 y mantuvo API503. Sólo se usaron GETs locales; no se ejecutaron handlers financieros con el flag abierto. El script y stdout se conservan sin alterar.

`manifest.json` dentro del ZIP identifica el código y cada archivo. El entrypoint Nitro original se conserva byte por byte como `server/review-runtime.mjs`; el wrapper añadido `server/index.mjs` fija la seguridad del artefacto. Se puede reproducir desde el build inmutable con [el packager](../../../scripts/package-reference-preview.py). Las rutas temporales del probe son evidencia del entorno que lo ejecutó, no rutas requeridas por el usuario.

Los [resultados del flujo y sus límites](../../reference-storefront-20261101.md) se registran por separado. Los textos/precios dibujados en la imagen no sustituyen el catálogo ni validan importes cobrables.
