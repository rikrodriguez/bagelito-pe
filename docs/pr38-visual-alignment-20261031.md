# PR38: alineación visual de la tienda real — trabajo en curso

Fecha: 31 de octubre de 2026. Base de comparación: `52fa55cb223e587b7619a4161b8cb263bfa61a3f`, corrección de fiabilidad publicada en el PR44 en borrador sobre PR38. Rama de trabajo: `feat/guided-store-visual-alignment-20261031`.

Esta revisión acerca la aplicación real a la referencia aprobada mediante geometría, iluminación y composición. **Es una aproximación visual en curso; no acredita paridad final ni una tienda fotorrealista terminada.** El checkpoint público es `a84b4af85177cb3acf52e2a695064c70efb13247`; el árbol local incorpora ajustes posteriores de navegación, capas y recuperación. La captura de ese checkpoint no representa automáticamente el resultado final de esos ajustes.

## Referencia y procedencia de las imágenes

La referencia exacta es [`public/images/store-reference-approved.webp`](../public/images/store-reference-approved.webp), de 1536 × 1024 píxeles, SHA-256:

```text
0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9
```

La habitación no utiliza la referencia completa como panorama o fondo de la tienda. `StoreArchitectureVisual.tsx` construye paredes, azulejos, suelo, vigas, lámparas y detalles metálicos mediante geometría y texturas procedurales. El logo de la pared utiliza únicamente el recorte `{ x: 485, y: 56, width: 730, height: 206 }`; conserva sus proporciones, metadatos y fórmula UV. Las tarjetas DOM de Packs, Combos y Schmears muestran ventanas acotadas de las fotografías de producto de esa misma referencia, sin incorporar sus botones, precios, personas o habitación. En móvil existe también una presentación acotada del mismo recorte del logo.

La [captura pública del checkpoint a84b4af](https://raw.githubusercontent.com/rikrodriguez/bagelito-pe/a84b4af85177cb3acf52e2a695064c70efb13247/docs/qa/pr38-visual-alignment-20261031/desktop-entry-checkpoint.png) muestra WebGL real, pero **no es una aprobación visual final**. Su SHA-256 es `d83cb605cc0144b4c30e12d9812241e8e53a4c2864753bfff1a5d89c476b25f8`; la procedencia y los hashes del estado capturado están en [`checkpoint.json`](qa/pr38-visual-alignment-20261031/checkpoint.json). Es un archivo publicado en el repositorio, no una nueva URL desplegada de la aplicación.

## Cambios frente a la base

- Las ocho bandejas conservan el orden y los identificadores aprobados: Plain, Everything, Sesame, Classic Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin y Blueberry. Cada bandeja construye seis representaciones pequeñas en un grupo 3 × 2: 48 representaciones decorativas, no una cantidad comercial añadida al carrito. Reutilizan las ocho fotografías originales y añaden anillos de geometría sencilla, variaciones leves de rotación y profundidad, bandejas metálicas y fondos horizontales de porcelana. Los centros, tamaños y callbacks de los hotspots físicos se conservan.
- La estación mantiene exactamente cinco bowls y los cinco sabores del catálogo. No se incorpora un sexto SKU a partir de la referencia. Los bowls, sus bordes y la crema son geometría procedural; los nombres y datos se leen del catálogo verificado.
- El logo queda en `y=5.8`, dentro de paredes de altura 8 y bajo un techo en `y=8.1`. Las vigas y lámparas se elevan de forma coherente; los globos quedan centrados en `y=6.4`. El ajuste superior conserva el suelo, la posición de los mostradores y los detalles inferiores de trabajo. Las placas blancas con letras azules y los tonos cálidos siguen la referencia.
- `/` entra ahora en `PlayableStore` en modo exploración. Las tarjetas iniciales llaman a `enterGuided` para abrir la categoría del funnel existente; no simulan compras ni crean un segundo checkout. La detección del borrador de sesión conserva el acceso al flujo guiado para que su validación y restauración existentes puedan ejecutarse.
- Mientras WebGL funciona, el mismo Canvas sigue montado durante el flujo guiado. `GuidedCommerce` informa la escena al controlador de cámara y presenta controles DOM acotados sobre el mundo real. Las imágenes maestras de escena y sus hotspots fotográficos alternativos se omiten en ese modo; los botones de selección conservan los handlers existentes de añadir, quitar y continuar. Las tarjetas DOM no se describen como objetos WebGL.
- El encuadre adapta el campo de visión y la distancia a la relación de aspecto para mostrar las vitrinas en retrato. El límite frontal de exploración en Z pasa de `8.25` a `21.0`, coherente con una cámara que puede alejarse para ajustar la escena móvil; se conservan la dirección del movimiento y las comprobaciones de colisión.
- `.store-world` crea un contexto de apilamiento propio para contener los labels de Drei y dejar accesibles los controles de comercio. Ante un fallo del mundo, el error boundary ofrece el funnel DOM existente. Sólo esa recuperación explícita puede retirar el Canvas. Reintentar 3D limpia las entradas fallidas del cargador de HDR y de las texturas utilizadas antes de volver a montar el mundo; no se presenta como recuperación garantizada de cualquier fallo de GPU.

## Contrato comercial y publicación

El diff frente a `52fa55c` no modifica `src/server`, `src/domain`, las rutas API, los módulos de pago ni las dependencias. Los cambios de `GuidedCommerce` añaden presentación y sincronización de escena; no cambian sus funciones de selección, cotización, consentimiento, checkout o pago. La comparación local de su estructura conserva las 21 funciones existentes, los ocho efectos originales y el elemento de checkout, distinguiendo los nuevos props, efectos y condiciones de presentación. Esa comprobación de fuente no equivale a aceptar un cobro real.

Se conservan las reglas del borrador de producto en sesión: identificadores y cantidades validados, sin ampliar su contenido a datos de contacto, pago o confirmación. La recuperación del borrador no se sustituye por un reinicio silencioso para facilitar una prueba.

`vercel.json` mantiene `git.deploymentEnabled: false`. El PR44 de la base sigue en borrador; este documento no autoriza merge ni despliegue. No se creó una nueva URL desplegada, no se activaron métodos de pago y no se realizaron migraciones remotas, cambios de permisos o credenciales, gastos ni operaciones sobre datos productivos.

## Evidencia de verificación y trabajo pendiente

Al redactar este documento se dispone de los siguientes resultados locales; **la QA final de navegador está en curso y no se declara aprobada**:

| Verificación | Estado conocido | Alcance |
| --- | --- | --- |
| `npm run build` | PASS | Build Vite, TypeScript y checks incluidos; no certifica apariencia ni FPS |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm run qa:static` | 11/11 PASS | Contratos estructurales del recorrido y handoff |
| `npm run qa:launch` | 4/4 PASS | Casos del fallback manual existente |
| `node scripts/qa-visual-contract.cjs` | 7/7 PASS | Ocho sabores × seis representaciones, cinco bowls, referencia/recorte y Canvas en el flujo sano |
| Recuperación visual desktop/móvil + almacenamiento bloqueado | 5/5 PASS | Fallo HDR provocado, selector DOM y reintento real con fixture; sin egress ni escrituras |
| Navegador final desktop/móvil | En curso | Capturas, navegación, capas, selección, restauración, fallback y reintento; falta registrar resultados del artefacto final |
| QA3D de strafe de 480 ms de la base | FAIL conservado | No se convierte en PASS por los cambios visuales ni por el probe sostenido |

No existe un script de lint en este proyecto; no se informa «lint PASS». Los logs locales de build y pruebas de esta sesión están bajo `/tmp/bagelito-pr38-visual-qa/`, `/tmp/bagelito-visual-static-final.log` y `/tmp/bagelito-visual-contract-final.log`. Son rutas del entorno de trabajo, no artefactos públicos garantizados. Los resultados finales deberán identificar el SHA exacto probado antes de sustituir este estado pendiente.

El fallo anterior de strafe permanece documentado en [`pr38-tour-canvas-reliability-20261031.md`](pr38-tour-canvas-reliability-20261031.md) y [`strafe-summary.json`](qa/pr38-tour-20261031/strafe-summary.json). El hold original programado de 480 ms tuvo cero frames durante la pulsación y desplazamiento cero en Chromium/SwiftShader; el probe sostenido observó movimiento positivo. Esto no acredita el umbral original ni permite prometer respuesta equivalente en hardware, Safari o un móvil físico. El assert original no se elimina ni se rebaja aquí.

Las pruebas de navegador se ejecutan contra loopback, con GET locales, redirects bloqueados y la fixture exacta del HDR aprobado; no requieren cobros, escrituras de backend o conexiones reales a proveedores. La recuperación visual nueva se prueba por separado con `scripts/qa-visual-recovery.cjs`, incluidos fallo inicial de HDR, fallback DOM, reintento y almacenamiento bloqueado. La existencia del script no constituye todavía un resultado final aprobado.

Para reproducir las comprobaciones de fuente y build:

```bash
npm run build
npm run typecheck
node scripts/qa-visual-contract.cjs
```

La QA de navegador requiere la instalación opcional de Playwright y un servidor aislado. El runner de recuperación acepta `BASE_URL` loopback, `QA_HDR_FIXTURE_PATH` y `QA_OUTPUT`; comprueba SHA-256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb` de la fixture. No debe apuntarse a producción para completar esta evidencia.

## Límites visuales y siguiente nivel de fidelidad

Los bagels combinan fotografías planas con volumen de bajo detalle. Las ocho fotos tienen transparencia exterior real, pero conservan halos claros, sombras y partes interiores opacas de su captura; reducirlas y apoyarlas sobre porcelana no las convierte en fotogrametría ni en texturas de un objeto completo. Los bowls, reflejos, iluminación y personajes son aproximaciones procedurales. Más unidades por bandeja aumentan además el trabajo de renderizado: la fidelidad y la fluidez deben evaluarse en capturas y dispositivos, no deducirse del build.

Una paridad fotorrealista requeriría assets que no están disponibles en este alcance: modelos detallados y texturas completas de cada producto, fotogrametría o captura consistente de la tienda y materiales, y personal con modelos y rigs adecuados. No se reemplazan sabores con un GLB de otro producto ni se inventan ingredientes, precios o afirmaciones comerciales para rellenar esos huecos. No se generaron ni compraron assets nuevos, ni se realizaron gastos. La elección y adquisición de ese material sería un trabajo posterior con alcance propio.

## Checkpoint de encuadre corregido

[Escritorio actual](qa/pr38-visual-alignment-20261031/desktop-entry-current.png) y [móvil actual](qa/pr38-visual-alignment-20261031/mobile-entry-current.png) son capturas reales de este código, todavía WIP visual. El probe confirmó trece rótulos dentro del viewport móvil después de corregir el cálculo al plano frontal: la ejecución anterior dejó Herb & Roasted Garlic 4,6 px fuera incluso tras esperar 30 segundos. La QA completa sigue en curso; estas imágenes no autorizan un despliegue ni acreditan paridad con la fotografía.

El panel que interceptaba clics en el driver quedó explicado como una carrera del test: Inicio cambia escena y su efecto existente cierra el menú; el driver no debe volver a pulsar el mismo toggle antes de ese cierre. Se espera el panel oculto, conservando los handlers. La secuencia manual Abrir menú/Inicio/Abrir menú/Cerrar menú/Abrir pedido/Cerrar resumen dejó cero overlays abiertos.
