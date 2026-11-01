# Mobile final 0381000

PASS: 16/16 escenas (8 estados × 390×844 y 320×700), 30/30 comprobaciones de catálogo, 26/26 entradas de Tab real y 0 fallos. 22 capturas incluyen seis estados seleccionados adicionales. Los reportes y stdout se copian sin modificar.

Aplicación compilada inmutable: `0381000a91fc8eebe235c8ebf9c034def9dc64b6`, `http://127.0.0.1:3205/`. Inicio `2026-10-31T23:21:45.758Z`; fin `2026-10-31T23:34:01.357Z`. `sourceChangedDuringRun=false`. Chromium `151.0.7922.173`, WebGL real bajo SwiftShader; emulación de viewport móvil, sin validación de dispositivo físico/Safari.

Driver `scripts/qa-mobile-vitrina.cjs`: SHA256 `22956007fefd79e1f5733bd476e65d337d57a9e31a7f66f12d718ce2711e4da3`. Misma medición/umbrales que el baseline; los gestos nativos CDP usan extremos interiores de 64 px para evitar la navegación Atrás del navegador demostrada en la prueba de diagnóstico. No se cambiaron asserts para el resultado.

Criterios fijados antes del CSS: Canvas ≥45%; ROI de bagels/schmears ≥90% y todos los 8/5 centros; demás estados ≥60% ROI y ≥75% centros. Targets efectivos ≥44×44 CSS px tras recortar todos sus ancestros, overflow del documento cero; nombres/notas completos, sin ellipsis ni solape del menos; foco visible y texto de CTA/progreso ≥4.5:1. Capacidad 6 y séptima selección, agregar/quitar todos los bagels, toggle de cinco schmears y combos Classic Strawberry/Herb & Roasted Garlic seleccionados comprobados mediante input nativo.

74 GET locales y 2 lecturas del HDR fijado; 0 requests bloqueados, 0 errores HTTP/rutas/cierre. Config de pagos `enabled/configured/intakeEnabled=false`, `mode=disabled`, `visualQaAllowed=true`. No POST, proveedor, pago ni enlace WhatsApp seguido.

| Ancho | Estado | Canvas libre | ROI libre / centros |
| --- | --- | ---: | --- |
| 390 | selector | 73.89% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 390 | pack-size | 70.00% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 390 | pack-qty | 63.61% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 390 | bagels | 60.42% | bagels: 100.00%, 8/8 |
| 390 | schmears | 60.56% | schmears: 100.00%, 5/5 |
| 390 | cashier | 60.42% | cashier: 100.00%, 1/1 |
| 390 | combos | 70.00% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 390 | schmear-size | 70.00% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 320 | selector | 69.86% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 320 | pack-size | 62.92% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 320 | pack-qty | 59.86% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 320 | bagels | 56.81% | bagels: 100.00%, 8/8 |
| 320 | schmears | 57.08% | schmears: 96.67%, 5/5 |
| 320 | cashier | 59.86% | cashier: 100.00%, 1/1 |
| 320 | combos | 62.92% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |
| 320 | schmear-size | 65.97% | bagels: 100.00%, 8/8; schmears: 100.00%, 5/5 |

Límite de la medición: oclusión por DOM opaco sobre anclajes proyectados. El POS azul oculta físicamente parte de un cuenco frontal y el logo puede quedar recortado por la cámara de estación, especialmente en 320-schmears.png; esto se conserva como trabajo visual pendiente y no queda cubierto por el PASS DOM. No se afirma fidelidad fotorealista final.

## Fuentes de la aplicación declarada

- `src/playable/GuidedCommerce.tsx`: `1b74c8e127b99f2788eed8e2e12aa17074e4f88d30f1c9c5ea2c278b7503a5b0`
- `src/playable/guided-commerce.css`: `386f491e27df15ffb211bc425c46f7c8ec084ef6eaf3cc8d32363516b1d5891e`
- `src/playable/PlayableStore.tsx`: `adae043e55aebd8ef9bcd585dcbc7b3cc97cdc612477100c9f10c0ba928ad904`
- `src/playable/playable.css`: `ccc930855ef5ae000a752f45d488522db7463c8d3e605621371af0ce156f4ce6`

## Integridad

`SHA256SUMS` enumera todos los archivos de evidencia de esta carpeta. Cada PNG también conserva el hash en el JSON original.
