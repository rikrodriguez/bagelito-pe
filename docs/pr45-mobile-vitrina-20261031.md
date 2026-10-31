# Vitrina 3D visible durante la compra móvil

Aplicación: `0381000a91fc8eebe235c8ebf9c034def9dc64b6`. La validación móvil está completa; la repetición del recorrido guiado completo sobre este mismo código está en curso.

El catálogo anterior cubría logo y vitrinas. La composición nueva deja el mundo 3D a la vista y sitúa selección, resumen y continuación en una bandeja inferior. Los ocho bagels y cinco schmears siguen accesibles mediante scroll nativo. Formato, cantidad, tamaños, combos y caja conservan todos sus controles en paneles compactos con scroll propio.

La composición sólo cambia CSS móvil con `data-live-world=true`. Un helper de interfaz revela la tarjeta completa al recibir foco de teclado: usa alineación inicial, comprueba overflow horizontal y `:focus-visible`, y conserva el foco. La guardia evita mover un producto entre pointerdown y click. Los estados, efectos, 20 funciones internas, 54 callbacks `onClick`/`onChange`, checkout, catálogo, cantidades, precios y consentimiento se conservan; [la revisión AST y cinco probes offline](qa/pr45-mobile-vitrina-20261031/focus-fix/offline-review-0381000/review-results.json) registra los hashes exactos y sus seams.

El Canvas real permanece montado y visible. No se añadió una fotografía de la habitación como fondo ni se cambió la geometría. `vercel.json` conserva `git.deploymentEnabled:false`; no hubo despliegue, pagos reales, pedidos, cambios de producción, credenciales, permisos ni gastos.

## Resultado por etapa

| Comprobación | Resultado | Código / alcance |
| --- | --- | --- |
| Build y TypeScript | PASS | 0381000; incluye estructural 11/11, manual 4/4 y movimiento 14/14 |
| Contrato visual de fuente/activos | PASS 7/7 | 0381000 |
| Node completo | PASS 52/52, cero skips | 0381000, con driver QA 2612563 |
| Móvil: ocho escenas × dos tamaños | PASS 16/16 | 0381000, exit 0; fuente sin cambios durante el run |
| Catálogo con input táctil nativo | PASS 30/30 | Ocho bagels, cinco schmears y dos variantes de combo por tamaño |
| Foco con Tab nativo | PASS 26/26 nombres | Ocho bagels y cinco schmears en cada tamaño; nombres/notas completos |
| Recorrido guiado completo | En curso sobre 0381000 | El PASS anterior 32/32 de a1fce72 conserva su procedencia, sin reasignarlo |
| Baseline comparable | FAIL conservado | 1816079: dos capturas, 12 fallos bajo los mismos criterios nuevos; no es una suite de 16 estados |

[Resultados móviles, 22 PNG, hashes y reproducción](qa/pr45-mobile-vitrina-20261031/mobile-final-0381000/README.md). El run verifica añadir/quitar todos los bagels, capacidad seis y séptima selección, toggle de los cinco schmears, combos con Classic Strawberry/Herb & Roasted Garlic, targets efectivos de 44×44 px, foco visible, texto de CTA/progreso con contraste ≥4.5:1 y cero overflow de documento. Los gestos y taps son eventos nativos de Chromium; no equivalen a un móvil físico.

Tráfico móvil registrado: 74 GET locales y dos lecturas del HDR aprobado; cero errores HTTP, bloqueos o errores de rutas/cierre. Se inspecciona el enlace de consulta sin abrir WhatsApp. Pagos `enabled/configured/intakeEnabled=false`, modo `disabled`. El recorrido guiado usa únicamente la simulación QA existente en sus estados de pago y recibo.

## Comparación equivalente

Mismo medidor, viewports y estado bagels sin selección; antes `1816079`, después `0381000`.

| Viewport | Viewport sin superficies DOM opacas | ROI bagels sin paneles | Centros libres |
| --- | --- | --- | --- |
| 390×844 | 22.78% → 60.42% | 0% → 100% | 0/8 → 8/8 |
| 320×700 | 36.25% → 56.81% | 0% → 100% | 0/8 → 8/8 |

[390 antes](qa/pr45-mobile-vitrina-20261031/baseline-1816079/390-bagels.png) / [390 después](qa/pr45-mobile-vitrina-20261031/mobile-final-0381000/390-bagels.png). [320 antes](qa/pr45-mobile-vitrina-20261031/baseline-1816079/320-bagels.png) / [320 después](qa/pr45-mobile-vitrina-20261031/mobile-final-0381000/320-bagels.png).

En schmears, la ROI libre de DOM es 100% en 390×844 y 96.67% en 320×700, con 5/5 centros libres en ambos. La medición usa una ROI proyectada desde los rótulos, muestreada frente a superficies DOM opacas y recortada por todos sus ancestros; no mide oclusión entre meshes.

Los criterios se fijaron antes de medir: viewport libre ≥45%; bagels/schmears ≥90% de ROI y todos los centros; otras escenas ≥60% de ROI y ≥75% de centros. Hay guardas contra anclajes ausentes, rectángulos vacíos/no finitos, muestras fuera del viewport y clipping real de targets. Se permiten previews parciales mientras se desplaza el carril; cada producto se revela completamente antes de validar sus controles.

## Fallos e iteraciones conservados

- El primer medidor que recortaba por un BODY de altura cero dio una muestra vacía. Se invalidó; su salida raw permanece en `iterations/invalid-first-measurement` y no respalda ningún PASS. Las pruebas offline cubren esa regresión.
- Dos botones de progreso tenían anchos de 25.55 y 33.72 px. Se ampliaron a 44 px.
- En 320×700, una tarjeta de 104 px recortaba el botón de retirada a 42 px efectivos. Se mantuvieron tarjetas de 120 px. El probe combo inicial sólo recortaba por el grid; su corrección con todos los ancestros confirmó el mismo fallo, sin modificar el raw.
- El foco azul sobre CTA azul perdió contraste. El inset azul quedó limitado a tarjetas claras; CTA y caja conservan el contorno coral.
- Se restauró el fondo de placa `#fffaf4` exigido por el assert original. El run b903 se interrumpió tras seis escenas desktop antes de llegar a móvil: no fue una suite completa ni un FAIL móvil ejecutado.
- a1fce72 y 67deb30 conservaron fallos reales de Tab. Esperar un segundo o cambiar snap no los resolvió; `nearest` aún recortaba un nombre en 320. El código final alinea la tarjeta al inicio sin mover el foco. Se conservan diagnóstico, experimentos temporales y fuentes exactas en `focus-fix`.
- Un gesto del runner desde el borde activaba Atrás hasta `about:blank`. [El diagnóstico diferencial](qa/pr45-mobile-vitrina-20261031/iterations/browser-back-diagnosis/README.md) reproduce el fallo y el recorrido interior correcto. El driver sólo cambia los extremos horizontales y registra URL/scroll; no cambia asserts ni umbrales. La función original está congelada con hash verificado para reproducirla.

La captura WIP inicial permanece en el commit `695598821fa023ccad3458c8e38ef298f3a7779b`, código b903413. No sustituye las capturas finales de 0381000.

## Procedencia y límites

[Scope de fuente](qa/pr45-mobile-vitrina-20261031/source-scope.json) y [manifiesto SHA256](qa/pr45-mobile-vitrina-20261031/manifest.json). Los snapshots compilados se sirven desde copias inmutables, con HDR local de hash fijado y firewall de GET loopback. Cambios de fuente o errores tardíos de rutas hacen fallar el runner. Las capturas finales se guardan sin editar.

Las pruebas QA3D 20/20 y eventos 9/9 del [informe de runtime](pr45-runtime-input-qa-20261031.md) retienen su SHA `1816079`; no son ejecuciones nuevas de este cambio. Sus asserts de readiness y strafe permanecen intactos.

El POS azul todavía oculta físicamente parte de un cuenco y la cámara de estación puede recortar el logo, especialmente en schmears móvil. Es trabajo visual pendiente separado del PASS de oclusión DOM. La geometría/materiales aún no tienen la fidelidad fotográfica final de la referencia. Chromium/SwiftShader y estos dos viewports no certifican fluidez de hardware móvil, Safari ni backgrounding del sistema.
