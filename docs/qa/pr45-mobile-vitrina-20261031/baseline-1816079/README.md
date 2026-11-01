# Baseline 1816079: FAIL conservado

Comparación focal, **2/2 capturas bagels y 12 fallos reales**, proceso exit 1. Se esperan y conservan como evidencia del diseño anterior; no es una suite completa de 16 estados. No se ejecutaron catálogo, Tab ni resto del funnel en este modo `QA_MOBILE_FOCUS=bagels`.

Aplicación histórica compilada inmutable: `1816079a8e20b572bce14d9e832b2f99aff2c5c6`, `http://127.0.0.1:3198/`. Inicio `2026-10-31T23:34:11.761Z`; fin `2026-10-31T23:34:42.845Z`. Chromium `151.0.7922.173`, WebGL real bajo SwiftShader.

Mismo driver SHA256 `22956007fefd79e1f5733bd476e65d337d57a9e31a7f66f12d718ce2711e4da3`, mismos helpers y umbrales que [el resultado final](../mobile-final-0381000/README.md). Criterios fijados antes del CSS: Canvas libre ≥45%, ROI bagels ≥90%, 8/8 centros libres, targets efectivos ≥44×44 px. En cada ancho fallan Canvas, ROI, 8 centros tapados por DOM y tres targets pequeños (Volver, Ir a Elige, Ir a Bagels).

| Ancho | Canvas antes → después | ROI bagels antes → después | Centros antes → después |
| --- | ---: | ---: | ---: |
| 390 | 22.78% → 60.42% | 0.00% → 100.00% | 0/8 → 8/8 |
| 320 | 36.25% → 56.81% | 0.00% → 100.00% | 0/8 → 8/8 |

Comparación visual coincidente: [390 antes](390-bagels.png) / [390 después](../mobile-final-0381000/390-bagels.png), [320 antes](320-bagels.png) / [320 después](../mobile-final-0381000/320-bagels.png). Los anclajes son válidos y están dentro del viewport; su ROI cero registra la oclusión del panel DOM anterior, sin pasar vacuamente por ausencia de muestras.

## Provenancia histórica

`declaredAppSourceSHA256` procede de `git show 1816079:<ruta>` y corresponde a la aplicación servida. `sourceSHA256`/`repositorySHA` registran además el checkout actual desde el que se ejecutó el mismo driver; **no se atribuye su CSS posterior al baseline**. CSS histórico SHA256: `546c0b069febf92b85722ebd46acc0974d83d9be406392d22a62149372dbacb2`. `sourceChangedDuringRun=false`.

- `src/playable/GuidedCommerce.tsx`: `b7394f5f1b7fd89b96ca82e6c635a92535b148b650bbaa6910a1f080ca858888`
- `src/playable/guided-commerce.css`: `546c0b069febf92b85722ebd46acc0974d83d9be406392d22a62149372dbacb2`
- `src/playable/PlayableStore.tsx`: `adae043e55aebd8ef9bcd585dcbc7b3cc97cdc612477100c9f10c0ba928ad904`
- `src/playable/playable.css`: `ccc930855ef5ae000a752f45d488522db7463c8d3e605621371af0ce156f4ce6`

## Alcance e integridad

Pago desactivado; únicamente GET locales y fixture HDR fijada, sin errores de red/cierre ni acciones a proveedores. La medición cubre oclusión de DOM sobre Canvas/anclajes proyectados, sin certificar oclusión entre meshes, fidelidad fotorealista final ni dispositivos físicos.

JSON, dos PNG y stdout se copian sin alterar. `SHA256SUMS` enumera todos los archivos de esta carpeta.
