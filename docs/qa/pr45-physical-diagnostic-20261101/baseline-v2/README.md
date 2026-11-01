# Physical baseline 0381000 — epoch v2

FAIL conservado: tres casos y cinco fallos, proceso exit 1. Aplicación histórica inmutable `0381000a91fc8eebe235c8ebf9c034def9dc64b6`, `http://127.0.0.1:3205/`. Inicio `2026-11-01T00:00:51.971Z`, fin `2026-11-01T00:02:03.397Z`. `sourceChangedDuringRun=false`.

| Viewport | Centros de crema libres | Esquinas logo dentro | Plane logo en viewport |
| --- | ---: | ---: | ---: |
| 320×700 | 3/5 | 2/4 | 44.49% |
| 390×844 | 3/5 | 2/4 | 44.80% |
| 1280×800 | 1/5 | 1/4 | 63.79% |

Este es el baseline válido para la comparación posterior con **la misma función, driver y criterios v2**: cinco centros reales de crema sin mesh sólido delante en los tres tamaños, cuatro esquinas del logo activo dentro del frustum móvil (tolerancia0.5CSSpx); logo desktop diagnóstico para no regresión. El grid5×5 de crema es diagnóstico sin umbral ajustado.

Driver SHA256 `0b2cac5a32bad0b2fc5aff761c61fba14cf034c401de924f54ce649451f26833`, guardado como `driver-frozen.cjs`. Esa copia conserva su fuente para auditoría; la ejecución usa su ubicación normal `scripts/qa-physical-vitrina.cjs` para resolver el repo/helper. No se han relajado los criterios5/5centros y4/4esquinas.

Se revalidó el antes después de corregir tres falsos PASS del medidor encontrados offline: targets de crema ocultos ya no aportan hits; un material sin blending transparente sigue bloqueando aunque opacity<1; el logo necesita material visible/opaco además de proyección. Estas condiciones no estaban activas en la aplicación real, por lo que la revalidación conserva el diagnóstico anterior. Nueve pruebas offline con geometría Three real y node--check PASS.

Causas guardadas por rayo: en móvil, asa azul de la bolsa tapa el bowl superior central y pantalla POS tapa el frontal derecho. En desktop, cuerpo de bolsa y pantalla bloquean cuatro centros. Se conservan primer blocker, distancia anterior al target, UV, material y ancestros. Cristal transmission0.94/opacity0.045–0.10 y hotspots se registran aparte. Material transparente opaco sí bloquea. Sin target real o muestras no vacías no hay PASS.

## Alcance

Scene/camera actuales se leen desde el ref ya existente del Canvas/R3F, sin hooks de aplicación ni cambios de renderer. Raycaster propio y todos los meshes visibles, no solo interactivos. El logo único es `approved-reference-logo-crop`, geometría real proyectada con profundidad válida. Raycast no resuelve texeles alfa; blockers con map/alphaTest quedan identificados con UV para revisión. Esta prueba física complementa DOM16; no acredita fidelidad fotorealista ni dispositivos físicos.

LoopbackGET y HDR fijado únicamente; pagos desactivados, sin POST/proveedores/despliegue. Cero errores de red/rutas/cierre. JSON/stdout/PNG son copias sin alterar.

## Fuentes históricas de aplicación

- `src/playable/PlayableStore.tsx`: `adae043e55aebd8ef9bcd585dcbc7b3cc97cdc612477100c9f10c0ba928ad904`
- `src/playable/StoreArchitectureVisual.tsx`: `9fa5a7b4aa9e361d57249f24cfcde39d536f0636d866155dc7fb88373411c265`
- `src/playable/GuidedCommerce.tsx`: `1b74c8e127b99f2788eed8e2e12aa17074e4f88d30f1c9c5ea2c278b7503a5b0`
- `src/playable/guided-commerce.css`: `386f491e27df15ffb211bc425c46f7c8ec084ef6eaf3cc8d32363516b1d5891e`
- `src/playable/playable.css`: `ccc930855ef5ae000a752f45d488522db7463c8d3e605621371af0ce156f4ce6`

`SHA256SUMS` enumera todos los archivos de evidencia. El [epoch dca anterior](../physical-before-0381000/README.md) queda preservado por separado, con sus límites conocidos.
