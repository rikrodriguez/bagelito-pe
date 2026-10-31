# Vitrina 3D visible durante la compra móvil

Estado en curso. Aplicación bajo prueba: `67deb30cc3b3fb30c8bb82d9c2126a565e507988`. Aún no atribuir a este cambio las suites históricas del informe de runtime.

## Cambio

Las capturas anteriores muestran el catálogo móvil desde y118 hasta574, cubriendo logo, productos y cristal. El cambio limita los controles de selección a una bandeja inferior: carril horizontal con todos los productos, resumen compacto y continuación. Selector, formato, cantidad, tamaños y caja usan paneles inferiores con scroll propio. El mundo conserva su Canvas real; no se añadió un fondo fotográfico ni se modificó su geometría.

La composición cambia sólo mediante CSS para móvil y `data-live-world=true`. Se añade además un helper de foco de interfaz y dos bindings `onFocusCapture` en los carriles. Los estados, efectos, funciones comerciales, cantidades, precios, consentimiento y callbacks anteriores conservan sus bytes; la comparación AST confirma73 statements anteriores al render,20 funciones internas y54 callbacks `onClick`/`onChange` sin cambios. Los campos de pago conservan su composición. No hubo despliegue, transacciones, escrituras a proveedores ni cambios de permisos o credenciales. `vercel.json` conserva `git.deploymentEnabled:false`.

## Criterios fijados antes de medir

- Viewports 320×700 y390×844; Canvas vivo, sin contexto perdido y sin overflow de documento.
- Al menos45% del viewport sin superficies DOM opacas.
- Bagels/schmears: al menos90% de la ROI física de productos despejada y centros de los8/5 rótulos libres. Otras escenas: ROI60% y centros75%; en caja se usa el POS por el cambio de cámara.
- Todos los productos accesibles mediante scroll/tap nativos. Targets de44×44 después de recortar por todos los ancestros con overflow; se permite la vista parcial de la siguiente tarjeta durante el scroll.
- Nombres/notas completos y foco visible; selección y retirada mantienen cantidades reales. El enlace de WhatsApp sólo se inspecciona, no se abre.

## Iteraciones conservadas

- V1,390×844: la vitrina quedó despejada, pero dos botones de progreso tenían anchos25.55 y33.72px. Se ampliaron a un mínimo44px.
- V2,390×844: PASS focal, con60.42% del viewport libre y100% de ROI bagels despejada, ocho rótulos libres y retirada táctil44×44.
- V2,320×700: FAIL focal: retirada44×44 nominal, pero44×42 efectiva por el recorte de la tarjeta de104px. Se eliminó la reducción de altura en pantallas bajas.
- La revisión del foco encontró un contorno azul sobre botones azules. El inset azul queda limitado a las tarjetas claras y controles que podrían recortarlo; CTA y caja conservan su contorno coral.
- El resumen inicial del probe combo V2 sólo recortaba por el grid. Una revisión posterior con todos los ancestros confirmó el mismo fallo42px; ese resumen no acredita un PASS de retirada.

## Evidencia WIP publicada

El commit `695598821fa023ccad3458c8e38ef298f3a7779b` publica [captura320×700](qa/pr45-mobile-vitrina-20261031/wip-b903413/mobile-320-bagels-selected.png), [resultado focal](qa/pr45-mobile-vitrina-20261031/wip-b903413/focal-results.json) y [manifiesto](qa/pr45-mobile-vitrina-20261031/wip-b903413/manifest.json), del código `b9034136ca9c8f3f60fb7176e72b93afe8d002e1`. PNG SHA256: `ac1b171523e56041f308b2a95709634c68677f8938e07c75e9f0719521199e5f`. Registra56.81% del viewport libre, ROI bagels100%,8/8centros libres, cero overflow y retirada táctil efectiva44×44. Es evidencia focal, no una suite completa.

Después se restauró únicamente el fondo claro de la placa de nombre (`#fffaf4`) exigido por la aserción original de `qa-guided.cjs`. El run b903 se interrumpió limpiamente con6 escenas desktop y0 fallos antes de llegar al móvil; no se presenta como un FAIL ejecutado del contrato ni como32/32. El runner y sus aserciones permanecen intactos.

## Corrección del foco

El fallo de Tab fue estable durante0/100/500/1000ms; `scroll-snap-type:none` y `mandatory` no lo resolvieron. Se conserva el [diagnóstico](qa/pr45-mobile-vitrina-20261031/focus-fix/diagnosis-a1fce/results.json) como experimento de DOM temporal, no como validación del código final.

La aplicación67deb30 revela la tarjeta completa al recibir `:focus-visible`, sólo si hay overflow horizontal y mundo vivo. Conserva el foco en el botón. La guardia evita mover una tarjeta entre pointerdown y click. El [focal compilado](qa/pr45-mobile-vitrina-20261031/focus-fix/compiled-67deb30/results.json) pasa: ocho nombres visibles desde el primer instante, sin scroll de stage/raíz/ventana. Un tap deliberado sobre una preview de9px incrementó0/6→1/6 sin mover el carril; no se presenta esa preview como target completo44px. El [probe offline](qa/pr45-mobile-vitrina-20261031/focus-fix/offline-review/review-results.json) verifica5 precondiciones y la preservación AST, con seams explícitos.

## Verificación por etapa

| Etapa | Estado | Procedencia |
| --- | --- | --- |
| Build y tipos | PASS | Aplicación67deb30; incluye QA estructural11/11, manual4/4 y movimiento14/14 |
| Contrato visual de fuente | PASS7/7 |67deb30 |
| Node completo | PASS52/52, cero skips |67deb30;40 pruebas conservadas y12 del nuevo medidor/firewall |
| Recorrido guiado completo | PASS32/32, exit0 en a1fce72; repetición67deb30 pendiente |16 escritorio+16 móvil, auxiliares de carrito/draft/privacidad incluidos |
| Medición móvil16 | En curso sobre67deb30 | El FAIL a1fce72 se conserva:8 capturas iniciales pasan, pero Tab oculta Plain en390 y Classic Onion en320. Ese run no es una suite16 completa |
| Comparación equivalente antes/después | Pendiente | Se ejecutará con el mismo medidor y los dos viewports |

El [recorrido guiado](qa/pr45-mobile-vitrina-20261031/guided/README.md) conserva32 PNG y metadatos de fuentes/artefacto sin cambios. Tráfico registrado:285 GET locales+10 lecturas del HDR local, sin errores HTTP, bloqueos ni errores de rutas. El runner original conserva sus aserciones.

El [fallo de Tab](qa/pr45-mobile-vitrina-20261031/iterations/a1fce-mobile-tab-failure/mobile-vitrina-results.json) queda conservado junto con las capturas. La corrección de foco se verifica por separado; no se bajaron los criterios de texto completo ni de44px. Las pruebas QA3D20/20 y eventos9/9 del informe de runtime mantienen su SHA1816079 original; no se presentan como ejecuciones nuevas de este cambio CSS.

## Límites

Las mediciones de oclusión evalúan superficies DOM sobre la proyección de la vitrina; no eliminan oclusiones físicas del mundo. El POS/modelo tapa parcialmente el quinto schmear en algunos encuadres. Chromium con SwiftShader no acredita fluidez de un móvil físico ni Safari. La geometría/materiales aún no equivalen al acabado fotográfico de la referencia.
