# Reconstrucción nativa de la tienda Bagelito

Fecha: 1 de noviembre de 2026. Rama aislada `feat/rebuilt-storefront-20261101`, base `9a94e4cfc5a043726f643d3a9c546f096007bd94`. Aplicación final examinada: **`79e484ca37ae151781cc647e5d8096ffce67cc89`**. PR46 y su backend de fidelidad permanecen fuera de este cambio. Cierre terminal de la matriz acotada: entrada7/7, recorridos12/12 y galería cargada7/7 PASS.

## Dirección visual

Se inspeccionaron los píxeles de la referencia aprobada: azulejos cálidos con juntas visibles; lámparas negras y globos blancos; gran rótulo azul con borde coral; pregunta principal en blanco; tres tarjetas pastel; vitrinas metálicas con producto en primer plano. Esa estructura, jerarquía y paleta guían la identidad. La implementación es una **interpretación editorial con DOM/CSS**, tipografía vectorial y fotos individuales: no reconstruye una escena fotográfica ni promete coincidencia píxel a píxel. La imagen original no se utiliza como fondo o recorte en el nuevo modo.

La referencia de [Onyx Coffee Lab](https://onyxcoffeelab.com/) fue consultada por raíz para composición editorial y protagonismo del producto. No se copia su paleta, marca o contenido: la referencia Bagelito decide la identidad. Raíz consultó `design-taste-frontend` e `image-to-code` como referencias de diseño; el flujo de hosting de Higgsfield queda excluido del trabajo local.

No se vuelve a la tienda genérica de PR43 ni a navegación de juego/3D. La intención es una panadería reconocible: pared y rótulo dominantes, hero legible, entradas de categoría y vitrinas con fotografías individuales. En móvil los elementos se reorganizan a tamaño nativo, sin ampliar un screenshot para leer texto o tocar productos.

## Auditoría de assets en la base

La base usa piezas raster de la referencia, con detalle limitado por sus recortes y escalas. El problema no se resuelve ampliando esas piezas: textos, producto, decoración y controles necesitan capas independientes. El inventario siguiente distingue referencias realmente alcanzables en `referenceMode` de rutas heredadas ya excluidas por condiciones de render.

| Ruta de presentación en `9a94e4c` | Hallazgo y sustitución mínima |
| --- | --- |
| [`ReferenceScene.tsx`](../src/reference/ReferenceScene.tsx): imagen principal y SVG `image` de hero, categorías y vitrina | Reutiliza `/images/store-reference-approved.webp` entero y por ventanas SVG. Sustituir el interior visual por estructura DOM/CSS, manteniendo los contratos `onCategory`, menú, carrito y progreso. |
| [`reference-storefront.css`](../src/reference/reference-storefront.css): `.reference-mobile-hero`, `.reference-category-art`, `.reference-mobile-vitrine` | Escala los mismos recortes en móvil. Reemplazar sus reglas en el modo reconstruido por disposición nativa; no conservar un `href`, `srcset`, preload o fondo del original. |
| [`GuidedCommerce.tsx`](../src/playable/GuidedCommerce.tsx): `.mobile-schmear-pot` | El fondo inline usa `sceneImage`; en schmears resuelve `/master-scenes-clean/schmears-vitrina.webp`, incluso en `referenceMode`. Sustituir esa presentación por arte independiente, sin cambiar `addSchmear`/`removeSchmear`. |
| `sceneImage` y frames de producto heredados | `/images/bagel-vitrina-photo.webp` es un recorte de 800×300; los frames se excluyen en referencia mediante `!directCatalog`. La precarga legacy ya retorna con `referenceMode`. Conservar esa exclusión y comprobar que el nuevo modo no introduce otra petición. |
| [`guided-commerce.css`](../src/playable/guided-commerce.css): `.selector-product-photo` | Define un fondo del original con ventanas de aproximadamente 240×138. Su selector DOM legacy está excluido por `!referenceMode`; no reutilizar esa clase/imagen en la nueva escena. |
| `.approved-combo-art` y `.approved-schmear` | En esta base la tarjeta usa dos fotos individuales de bagels y un cuenco de gradiente CSS; ese cuenco no es un recorte raster. Puede reemplazarse sólo su presentación por el nuevo bowl ilustrativo. Los recortes del selector/escenas antiguas no deben reaparecer como arte de esta tarjeta. |

`bagel-vitrina-photo.webp` y `schmear-vitrina-photo.webp` se incorporaron como texturas derivadas del mockup en el commit `ebf52cebce9168545e59c78c33c53b94831d0d33`. La segunda es un atlas de 760×380 con ventanas de producto. También quedan excluidos del nuevo modo los atlas `guided-storyboard-atlas*.webp`, las familias `/master-scenes*/`, `/scenes/` y `/store-entry-door.webp`: no reutilizar sus placas o recortes como solución visual.

La imagen original se conserva sólo como referencia archivada para QA, no como asset consumido por la aplicación reconstruida. Que un archivo heredado siga en el repositorio no autoriza una petición de imagen, fondo CSS, precarga o SVG desde el nuevo recorrido.

El mapa anterior describe la base histórica. En `79e484c` la escena y sus vitrinas usan componentes nativos; los bowls del funnel de referencia usan las nuevas ilustraciones independientes. La entrada final pasó la guardia de red sin peticiones a la referencia original, sus recortes o placas heredadas en los siete viewports probados. La auditoría incluye también los doce recorridos completos descritos abajo.

## Assets de producto independientes

Las ocho fotos `/images/bagel-{id}.webp` proceden del sitio Bagelito y están documentadas como `website_image` en [`verified-menu-2026-10-21.json`](../src/domain/data/verified-menu-2026-10-21.json). Son las fotos individuales de Everything, Sesame, Plain, Classic Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin y Blueberry. La base ya las usa en las tarjetas DOM de bagels; se mantienen esas fuentes, sin extraer producto del mockup. La foto Plain inspeccionada mide 900×900 y tiene transparencia.

Se añadieron tres conceptos gastronómicos independientes mediante image_gen nativo, sin usar el mockup como entrada: [`caja de seis bagels`](../public/images/rebuilt-pack-bagels.png), [`bowl neutro`](../public/images/rebuilt-schmear-neutral.png) y [`bowl de fresa`](../public/images/rebuilt-schmear-bowl.png). Son imágenes referenciales sintéticas, **no fotografías verificadas de SKU** ni evidencia de ingredientes. La base neutra evita representar fresas en otros sabores. El bowl de fresa original es RGBA de 1536×1024, SHA-256 `d1d1f83351a6ca376370edb524c04de3d57c7297fc43cdd96f7d704893d6c7ca`; los tres PNG de generación se preservan.

Las tres copias WebP a resolución nativa conservan exactamente los píxeles RGBA decodificados de sus PNG. Además se sirven seis variantes de 480/800 px; su comprobación compara los píxeles RGBA con el redimensionado Lanczos previsto, no con el PNG a otra resolución. Los nueve WebP son lossless. Los componentes declaran dimensiones y `sizes`, usan fallback de 480 px y `srcset` de 480/800/nativo donde corresponde; el funnel usa 480/800. Decodificación asíncrona y carga diferida de bagels en vitrinas reducen trabajo inicial. Estos son cambios y pruebas de assets; no equivalen a un benchmark de transferencia total de la página.

Fredoka se sirve localmente desde [`fredoka-variable.ttf`](../public/fonts/fredoka-variable.ttf), con [`licencia OFL`](../public/fonts/OFL-Fredoka.txt) del repositorio oficial google/fonts (`ofl/fredoka`). No se añadió dependencia de paquetes ni CDN en la página. La tipografía reconstruye el registro redondeado azul/coral sin rasterizar el texto.

## Contrato comercial preservado

“Combos” permanece como nombre de navegación; su descripción comercial es **“Bagels + schmears”**, también usada en la tarjeta del paso correspondiente. No cambia la categoría interna, composición, cantidades, handlers o precio. Se conserva la composición existente del recorrido y su precio sin confirmar; no se importa un precio de combo dibujado en la referencia ni se convierte una oferta histórica en una oferta vigente.

[`getVerifiedDisplayMenu()`](../src/domain/lib/approved-shop-contract.ts), selección, cantidades, eliminación, precios de catálogo, carrito, progreso y consentimiento mantienen sus fuentes y callbacks existentes. El upsell opcional de packs sigue siendo declinable; no se añaden bebidas, sándwiches o descuentos. Las limitaciones comerciales y las decisiones del servidor permanecen cerradas ante datos incompletos.

El funnel continúa en `reviewOnly`: sin fetch de config/quote, lecturas/escrituras de storage de aplicación, montaje Culqi, salida WhatsApp, reserva, cobro o confirmación ficticia. La fidelidad sólo muestra su texto pendiente al final; no se añade Wallet ni se conecta el backend de PR46 o GHL. La reconstrucción visual no autoriza activar capacidades financieras.

La auditoría de fuentes del SHA final registra **124 archivos protegidos sin cambios** y **70 callbacks comerciales idénticos**, además del prefijo de estado/efectos de 27.683 bytes y los subárboles de cliente, consentimiento y `CulqiBrowserCheckout` preservados. El informe [source-review.json](qa/rebuilt-storefront-20261101/final-79e484c/source-review.json) identifica el HEAD exacto y los hashes CSS finales. Los informes anteriores no se reasignan al código nuevo.

## Validación terminal y alcance

La aplicación quedó congelada en `79e484ca37ae151781cc647e5d8096ffce67cc89`; los commits posteriores sólo conservan evidencia y documentación. [PR47 en borrador](https://github.com/rikrodriguez/bagelito-pe/pull/47), sin merge ni despliegue. PR45, PR46 y el preview privado anterior permanecen intactos.

| Comprobación | Resultado y alcance real |
| --- | --- |
| Entrada responsive | **7/7 PASS**, 21 callbacks de categoría y14 de vitrina,168 PNG. Anchos320/390/768/1024/844horizontal/1280/1920. |
| Recorridos completos | **12/12 PASS**: cinco caminos en1280; Combo y Pack con extra de sabor en320/390 (cuatro); Pack sin extra en768/1024/844 (tres). Incluyen selección/cantidades, extras declinables, resumen, datos ficticios de delivery, consentimiento, pago deshabilitado, edición/carrito/progreso/regreso. No se afirma matriz de todos los caminos por cada ancho ni18compras. |
| Términos | **12 pestañas legales reales**, ocho secciones y `opener=null`; checkout preservado. |
| Galería cargada | **7/7 PASS**,18fotos decodificadas por viewport tras scroll nativo y regreso al inicio. No se alteran atributos de carga ni DOM. Cada respuesta de imagen coincide con el SHA de archivo comprometido. |
| Legibilidad/targets | Texto≥12px, títulos≥16px, targets efectivos≥44px, sin flags de solape/recorte/desbordamiento en los estados auditados. Nuevo control de composición exige que cada imagen de Combo quede en su región de arte y fuera de copy/precio. |
| Node | **58/58 PASS**, cero fallos/skips, exit0. No son los167tests de PR46. |
| Build/tipos | **PASS, exit0**; incluye checks heredados estructural11, manual4 y movimiento14. No se suman otra vez a Node y no certifican calidad visual/QA3D. |
| Fuente comercial | **124 archivos protegidos y70callbacks idénticos**, prefijo de estado/efectos y tres subárboles de checkout/consentimiento preservados byte a byte. |
| Sampler/guardias | **8 fixtures geométricos** y19checks offline de guardia PASS, con helpers sin cambios: siguen rechazando fuente11px, target43px, clipping, scroll horizontal y solape real. No son compras adicionales. |

Los cinco runs originales, logs y hashes están en [summary.json](qa/rebuilt-storefront-20261101/final-79e484c/summary.json), [capture-index.json](qa/rebuilt-storefront-20261101/final-79e484c/capture-index.json) y [artifact-manifest.json](qa/rebuilt-storefront-20261101/final-79e484c/artifact-manifest.json). Se publican PNG originales seleccionados; los informes comprimidos conservan todos los hashes generados y el README distingue frames publicados de los preservados sólo en la máquina. El ZIP enlazado en [bundle-79e484c.json](qa/rebuilt-storefront-20261101/bundle-79e484c.json) contiene **evidencia seleccionada, no una aplicación estática**.

La guardia observa cero API/fetch/XHR/proveedores/escrituras/egress de aplicación. Registra lecturas internas conocidas TanStack, máximo una por documento; el total exacto está en el resumen. No se afirma cero lecturas de storage. Los tres conceptos seleccionados suman441.956bytes por viewport en DPR1; es el peso de esos recursos, no de toda la página ni un benchmark móvil.

## Fallos preservados y correcciones

El [candidato b974](qa/rebuilt-storefront-20261101/candidate-b974ddc/candidate-status.json) conserva sus resultados: entrada y galería pasaron, pero la ronda de15recorridos fue FAIL por93flags de fuente y30solapes de escritorio. La inspección de píxeles detectó además bowl sobre copy/precio del Combo móvil; el nuevo control reprodujo13flags con esas mismas fuentes antes de corregirlo. El resultado RED se conserva íntegro en `candidate-b974ddc/raw-results/combo-occlusion-red.json.gz`. En79e las áreas de arte/texto están separadas y esa comprobación pasa en los siete tamaños; los ajustes de escritorio corrigen fuente/altura de línea.

Los [intentos anteriores](qa/rebuilt-storefront-20261101/candidate-b974ddc/prior-results-summary.json) conservan SHA/estado/casos/flags: e27 preflight sin navegador por buffer de hash, e27v2 con899flags, b5 con30fallos de overflow/targets y8f con999flags aunque15recorridos funcionalmente completos. No se renombran resultados históricos como PASS ni se trasladan QA3D/guided anteriores al código nuevo. Los primeros PNG full-page cold mostraban fotos lazy aún no recorridas; los suplementos loaded están identificados por separado y muestran toda la galería.

## Reproducción local aislada

Se usaron dependencias existentes, Node24.19 y Chromium151. Los scripts aceptan sólo HTTP loopback, bloquean proveedores/API y requieren SHA de aplicación. Cada output debe ser nuevo. El HDR aprobado para los tests heredados se suministró mediante `QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr`, SHA256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`; no se necesita para la escena DOM ni se descarga por estos runners.

```sh
npm run build
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs
BAGELITO_REFERENCE_REVIEW_ONLY=true BAGELITO_MERCHANT_REVIEW_ONLY=true NITRO_HOST=127.0.0.1 NITRO_PORT=3237 node .output/server/index.mjs
```

En otra terminal, con Playwright existente disponible en `NODE_PATH` (en este executor: `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules`):

```sh
export QA_CODE_SHA=79e484ca37ae151781cc647e5d8096ffce67cc89
export BASE_URL=http://127.0.0.1:3237
QA_OUTPUT_DIR=/tmp/repro-bagelito/entry QA_SCENARIOS=entry node scripts/qa-rebuilt-storefront.cjs
QA_OUTPUT_DIR=/tmp/repro-bagelito/desktop QA_WIDTHS=1280 QA_SCENARIOS=pack-decline,pack-original,pack-flavoured,combo,schmear node scripts/qa-rebuilt-storefront.cjs
QA_OUTPUT_DIR=/tmp/repro-bagelito/mobile QA_WIDTHS=320,390 QA_SCENARIOS=pack-flavoured,combo node scripts/qa-rebuilt-storefront.cjs
QA_OUTPUT_DIR=/tmp/repro-bagelito/responsive QA_WIDTHS=768,1024,844 QA_SCENARIOS=pack-decline node scripts/qa-rebuilt-storefront.cjs
```

Para `qa-rebuilt-loaded-entry.cjs`, el HEAD debe ser exactamente el código declarado. Se ejecutó desde un worktree detached79 con los mismos assets comprometidos contra el mismo servidor inmutable3237: `QA_OUTPUT_DIR=/tmp/repro-bagelito/loaded node scripts/qa-rebuilt-loaded-entry.cjs`. No se rebajó la comprobación HEAD para acomodar commits de evidencia.

## Límites de esta entrega

Los píxeles se revisaron en entradas completas, siete selectores Combo y estados largos móviles/escritorio. La escena es una interpretación editorial cálida con DOM/CSS; no replica fotográficamente la cocina del mockup. Las fotos originales de bagels mantienen su suavidad; cuatro schmears comparten una imagen conceptual neutra y los tres assets nuevos no son fotografías verificadas de SKU. El build y los asserts no equivalen a aprobación estética final.

Chromium emulado/DPR1; Safari, iPhone/iPad físicos y CI remoto no certificados. Catálogo, precios pendientes, identidad, pagos y fidelidad no se activan por este PR. No hay cambios a producción, preview privado, permisos, credenciales o gastos; `git.deploymentEnabled:false` permanece.
