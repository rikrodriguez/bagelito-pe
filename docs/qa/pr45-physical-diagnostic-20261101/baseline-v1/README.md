# Physical baseline 0381000 — FAIL conservado

Tres capturas reales en estado `schmears`, cinco fallos de aceptación, proceso exit 1. Aplicación compilada inmutable `0381000a91fc8eebe235c8ebf9c034def9dc64b6` en `http://127.0.0.1:3205/`. Inicio `2026-10-31T23:56:35.068Z`, fin `2026-10-31T23:57:40.608Z`. `sourceChangedDuringRun=false`.

| Viewport | Centros de crema libres | Esquinas logo dentro | Plane logo en viewport | Cámara real |
| --- | ---: | ---: | ---: | --- |
| 320×700 | 3/5 | 2/4 | 44.49% | `4.19995, 2.27225, 9.19286` |
| 390×844 | 3/5 | 2/4 | 44.80% | `4.20000, 2.26186, 9.11043` |
| 1280×800 | 1/5 | 1/4 | 63.79% | `4.20000, 1.69531, 4.61495` |

Criterios congelados antes de modificar la cámara: cinco centros de crema sin mesh opaco delante en los tres tamaños; cuatro esquinas completas del mesh `approved-reference-logo-crop` dentro del viewport móvil, con profundidad/frustum válidos y tolerancia numérica de 0.5 CSS px. El logo desktop se registra como baseline recortado para comparar sin regresión. La cobertura de crema del grid5×5 es diagnóstica, sin umbral ajustado a los resultados.

En móvil, el centro del bowl superior central queda bloqueado por el asa azul de la bolsa (`TorusGeometry`, radius0.18/tube0.025); el centro del bowl frontal derecho, por la pantalla azul del POS (`BoxGeometry`1.18×0.76×0.12). En desktop, el cuerpo de la bolsa (`BoxGeometry`0.62×0.82×0.18) y el POS bloquean cuatro centros. Se guardan el primer hit opaco, distancias, UV, color, material y jerarquía de objetos para cada rayo.

Los cinco bowls se identifican por sus cilindros reales0.41/0.34/0.19; los rayos deben intersectar geometría de crema y cada bowl debe aportar muestras no vacías. Se lee el estado vigente de R3F desde el ref existente en el fiber React del Canvas: sin hooks de aplicación ni estado/renderer mutados. Un raycaster nuevo evita modificar el compartido por Fiber. Se recorren todos los meshes visibles, incluidos POS, bolsa, counter y worker; no solo objetos interactivos.

Cristal/transmisión y hotspots de baja opacidad quedan registrados por separado. Un hit solo bloquea si materialvisible, opacity≥0.8, transmission≤0.1 y está al menos0.001 unidades delante de la crema. `transparent=true` no descarta material opaco; los rayos no muestrean texeles alfa, limitación explícita para cualquier blocker con textura/alfa. La oclusión por DOM sigue cubierta por la suite16 independiente, no por esta medición física.

Driver SHA256: `dca342207b3a28623d6998acf3df1670112f567de9cd67ae09e7f65f8f5705ea`. Sus seis pruebas offline con geometría Three real pasan: muestras no vacías, atribución/distancia del blocker, cristal, material transparente opaco, ancestros ocultos/ref existente y logo fuera/detrás de cámara. Node--check y preflight sin browser PASS. Este epoch original dca se conserva separado; la comparación posterior usa el [baseline v2 revalidado](../physical-before-0381000-v2/README.md), que corrige tres falsos PASS del medidor no activados en esta aplicación real. La fuente original queda en driver-frozen.cjs.

LoopbackGET más el HDR aprobado fijado por SHA256; config de pagos desactivada. Sin POST, proveedores, despliegues, compras ni cambios de aplicación. Esta evidencia no acredita fidelidad fotorealista final ni dispositivo físico.

## Fuentes históricas de la aplicación

- `src/playable/PlayableStore.tsx`: `adae043e55aebd8ef9bcd585dcbc7b3cc97cdc612477100c9f10c0ba928ad904`
- `src/playable/StoreArchitectureVisual.tsx`: `9fa5a7b4aa9e361d57249f24cfcde39d536f0636d866155dc7fb88373411c265`
- `src/playable/GuidedCommerce.tsx`: `1b74c8e127b99f2788eed8e2e12aa17074e4f88d30f1c9c5ea2c278b7503a5b0`
- `src/playable/guided-commerce.css`: `386f491e27df15ffb211bc425c46f7c8ec084ef6eaf3cc8d32363516b1d5891e`
- `src/playable/playable.css`: `ccc930855ef5ae000a752f45d488522db7463c8d3e605621371af0ce156f4ce6`

## Integridad

JSON/stdout y tres PNG se copian sin modificar. `SHA256SUMS` incluye todos los archivos de esta carpeta; el JSON conserva además los hashes de cada PNG.
