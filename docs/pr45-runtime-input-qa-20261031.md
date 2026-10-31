# PR45: entrada fiable y recorrido de compra verificado

La continuación corrige pulsaciones perdidas entre frames, cálculos repetidos de sombras y un botón de categoría que no recibía clics al explorar libre. La tienda mantiene el Canvas real y el catálogo y los handlers comerciales existentes. **La fidelidad visual sigue en curso; este informe no acredita una tienda fotorrealista terminada.**

Código final de aplicación: `1816079a8e20b572bce14d9e832b2f99aff2c5c6`. Las pruebas finales usan una copia de build servida por loopback, sin reconstruirla durante la ejecución. [Metadata y hashes del artefacto](qa/pr45-runtime-input-20261031/qa3d-final/metadata.json).

| Verificación | Resultado y código probado |
| --- | --- |
| Build Vite, TypeScript, estructural y fallback manual | PASS; estructural11/11, manual4/4; build incluye movimiento14/14 |
| Suite Node completa, incluyendo drivers y gate QA | **40/40 PASS**, cero omitidos; [log](qa/pr45-runtime-input-20261031/diagnosis/all-node-final.log) |
| Contrato visual de fuente y assets | PASS7/7; no certifica apariencia |
| QA3D completa | **20/20 PASS**, exit0 en1816079; [resultados](qa/pr45-runtime-input-20261031/qa3d-final/tour-results.json), [log](qa/pr45-runtime-input-20261031/qa3d-final/stdout.log) |
| Readiness original | PASS desktop y viewport390: ocho frames dentro del presupuesto30s, sin ampliarlo |
| Strafe original | PASS: hold programado480ms, X0→1.18, umbral>0.12 y espera10s conservados |
| Handoffs 3D | Los seis PASS; siete paradas por viewport y14capturas reales |
| Eventos de movimiento en navegador | **9/9 PASS** en1816079; [resultados](qa/pr45-runtime-input-20261031/movement-events/movement-events-results.json) |
| Botón de categoría, clic nativo sin gate | [Antes FAIL](qa/pr45-runtime-input-20261031/header-before/header-hit-results.json) / [después PASS](qa/pr45-runtime-input-20261031/header-after/header-hit-results.json), mismo probe y criterios |
| Suite guiada completa | **32/32 PASS** en`df504aa1f605bd620bf36be9c28963b0401a95d6`; [resultados y32PNG](qa/pr45-runtime-input-20261031/guided/results.json) |
| Sombras finitas, regresión de framebuffer | PASS: ocho bakes iniciales y cero actividad de contacto en frames17–24; [resultado portable](qa/pr45-runtime-input-20261031/diagnosis/contact-portable-final.json) |
| Capturas adicionales de entrada y nueva recuperación HDR | **No ejecutadas** en1816079: se cancelaron antes de abrir navegador para cerrar la entrega; las14capturas QA3D identifican el código final. El5/5 de recuperación anterior pertenece a20296a6, no se reasigna al código final. |
| Hardware GPU, Safari/iPhone físico y proveedor/pagos reales | No ejecutados |

La guiada32 se ejecutó en1280×800 y390×844 usando clics de mouse. Tras esa corrida, el único cambio de aplicación fueron tres líneas CSS que habilitan `pointer-events:auto` en `.brand-pill` **sólo fuera de `.guided-mode`**. El funnel, sus handlers, arquitectura, catálogo, dominio, servidor y rutas permanecen idénticos. No se atribuye la corrida32 al código posterior: la regla nueva fue cubierta por la comparación de clics y por las transiciones reales de los9casos posteriores. [Diff y alcance exactos](qa/pr45-runtime-input-20261031/final-source-scope.json).

## Causas y correcciones

Una pulsación programada de480ms podía comenzar y terminar entre frames de SwiftShader; el booleano finalfalse eliminaba todo el movimiento. El navegador baseline observó cero frames durante el hold y desplazamiento cero. Ahora se conservan intervalos monotónicos por fuente, se consumen una sola vez y se aplican con las colisiones existentes en subpasos de hasta50ms. El buffer pendiente se limita a un segundo. Blur, visibilidad, cleanup y modo guiado descartan entradas activas y pendientes. La posición publicada corresponde a la cámara real y se actualiza al cambiar.

Las14pruebas de movimiento incluyen reloj simulado de cinco minutos, alias, repeats, keyup, foco editable, colisiones, deslizamiento y límites. El probe de navegador conserva el reloj real y pausa sólo callbacksRAF mediante un gate de QA sin hooks en producción: comprueba pulsaciones nativas, repeats, ausencia de replay, entrada/salida de comercio y tour, y dos gestos táctiles CDP en contexto móvil. Blur y visibilitychange son eventos **sintéticos de wiring**, no prueba de backgrounding del sistema operativo. [Runner](../scripts/qa-movement-events.cjs).

Drei reiniciaba el contador de sombras finitas al volver a renderizar su componente. El baseline continuaba dibujando los dos targets512² después del presupuesto8; el experimento aislado observó40clears/4048draws tardíos. Memoizar el componente conserva sus parámetros y produce exactamente ocho bakes, con0clears/0draws tardíos. Se evita además publicar telemetría inmóvil. La reducción de drawcalls no acredita fluidez de hardware: SwiftShader sigue lento. Esta regresión portable se ejecutó sobre el artefacto3b6446d; el componente de sombras no cambió después.

El botón de categoría heredaba `pointer-events:none` del header al entrar en exploración libre. Sin gate ni hooks, el baseline confirmó que el clic llegaba a `DIV.look-surface`. La regla nueva permite que el clic llegue al botón y abra el selector, sin habilitar ese botón durante un tour invisible. El runner portable conserva las mismas condiciones del probe probado; [comparación AST](qa/pr45-runtime-input-20261031/diagnosis/header-portability-ast.json).

## Errores de la infraestructura de QA conservados

El primer handoff falló porque se reconstruyó `.output` mientras un servidor seguía usando su manifiesto anterior: tres chunks dabanHTTP500. Se conservan la evidenciaHTTP y un primer rerun incompleto por `route.fulfill` dispuesto durante el cierre. Ahora se sirve una copia fija y los runners drenan lecturas pendientes sin retirar el firewall, mantienen como FAIL los errores activos y las escrituras/destinos ajenos, y guardan checkpoints/JSON final.

Una corrida posterior estable pasó18/20 y falló al reiniciar el tercer viaje. El driver borraba el borrador en el documento viejo, antes de una posible escritura tardía. El caso se reprodujo determinísticamente: antes12/13 y después13/13. En tres intentos de navegador instrumentados no se reprodujo la carrera antigua, límite que se conserva. El reset nuevo consume un marcador QA una sola vez en el documento nuevo, antes de React, sólo en loopback. Las recargas sin marcador siguen restaurando el borrador; el probe real confirmó tres viajes y tres handoffs por viewport y dos restauraciones. La aplicación y su persistencia no se modifican para hacer pasar el test. [Probe](qa/pr45-runtime-input-20261031/fresh-reset/results.json), [corrida18/20 preservada](qa/pr45-runtime-input-20261031/qa3d-before-one-shot/tour-results.json).

## Red, procedencia y límites

QA3D final:124GET locales y seis fixtures; eventos:40GET y dos fixtures; guiada:287GET y diez fixtures. Cero solicitudes de escritura, destinos adicionales o errores de rutas. La fixture HDR tiene SHA-256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`. Los drivers bloquean redirects y toda solicitud ajena. El borrador se escribe únicamente en los contextos temporales de navegador para comprobar su restauración. El pago/recibo/wallet de la guiada usan la simulación QA existente: no crean pedidos o cargos reales.

[Manifiesto de archivos, imágenes y SHA](qa/pr45-runtime-input-20261031/manifest.json). Las14capturas finales están en [qa3d-final](qa/pr45-runtime-input-20261031/qa3d-final/); las32guiadas conservan su SHA anterior y sus hashes. No hay una URL nueva de la aplicación desplegada.

La inspección de píxeles mantiene un límite visual material: los paneles blancos móviles cubren buena parte de la vitrina; el Canvas queda visible principalmente en márgenes y suelo. La referencia mantiene logo y vitrinas como protagonistas. El PASS funcional no resuelve esa composición ni acredita fotorealismo. No se sustituyó el mundo por una fotografía.

PR45 sigue **en borrador**. `git.deploymentEnabled:false` se verificó antes de publicar. Sin merge, despliegue, cambios de producción, pagos reales, migraciones, campañas, credenciales, permisos o presupuestos. Estos resultados locales no acreditan CI remota.

Para reproducir, usar un build copiado a un directorio distinto e inalterado durante las pruebas, con `BAGELITO_VISUAL_QA_ENABLED=true`, `BAGELITO_MERCHANT_REVIEW_ONLY=true` e intake/pagos desactivados. Instalar Playwright opcionalmente y proporcionar `BASE_URL` loopback, `QA_HDR_FIXTURE_PATH` y, si hace falta, `QA_CHROMIUM_EXECUTABLE_PATH`. Comandos: `npm run build`, `node scripts/qa-visual-contract.cjs`, `QA_HDR_FIXTURE_PATH=/ruta/lebombo_1k.hdr node --test tests/*.test.cjs`, `npm run qa:guided` y `npm run qa:3d`. Ejecutar los navegadores en serie.
