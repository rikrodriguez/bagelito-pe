# Reconstrucción nativa de la tienda Bagelito

Fecha: 1 de noviembre de 2026. Rama aislada `feat/rebuilt-storefront-20261101`, base `9a94e4cfc5a043726f643d3a9c546f096007bd94`. PR46 y su backend de fidelidad permanecen fuera de este cambio. Este documento recoge inspección de archivos y píxeles; la validación de la nueva implementación se completa al cerrar QA.

## Dirección visual

Se inspeccionaron los píxeles de la referencia aprobada: azulejos cálidos con juntas visibles; lámparas negras y globos blancos; gran rótulo azul con borde coral; pregunta principal en blanco; tres tarjetas pastel; vitrinas metálicas con producto en primer plano. Esa estructura, jerarquía, profundidad y paleta guían la identidad. El resultado nuevo debe construirse con DOM/CSS y controles reales, sin usar la imagen original como fondo, recorte o sustituto de una aplicación.

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

## Assets de producto independientes

Las ocho fotos `/images/bagel-{id}.webp` proceden del sitio Bagelito y están documentadas como `website_image` en [`verified-menu-2026-10-21.json`](../src/domain/data/verified-menu-2026-10-21.json). Son las fotos individuales de Everything, Sesame, Plain, Classic Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin y Blueberry. La base ya las usa en las tarjetas DOM de bagels; se mantienen esas fuentes, sin extraer producto del mockup. La foto Plain inspeccionada mide 900×900 y tiene transparencia.

El nuevo [`rebuilt-schmear-bowl.png`](../public/images/rebuilt-schmear-bowl.png) es un concepto sintético independiente generado para esta reconstrucción: **1536×1024, RGBA**, SHA-256 **`d1d1f83351a6ca376370edb524c04de3d57c7297fc43cdd96f7d704893d6c7ca`**. Sus píxeles muestran un bowl blanco aislado con crema rosada y fresas; no es una fotografía de un producto comercial verificado ni evidencia de ingredientes o de todos los sabores. Su función es ilustrativa. No se le atribuye procedencia fotográfica Bagelito ni paridad fotorrealista final con la referencia.

## Contrato comercial preservado

La entrada antes llamada “Combos” se presenta únicamente como **“Bagels + schmears”**. Es un cambio de etiqueta, no de categoría interna, composición, cantidades, handlers o precio. Se conserva la composición existente del recorrido y su precio sin confirmar; no se importa un precio de combo dibujado en la referencia ni se convierte una oferta histórica en una oferta vigente.

[`getVerifiedDisplayMenu()`](../src/domain/lib/approved-shop-contract.ts), selección, cantidades, eliminación, precios de catálogo, carrito, progreso y consentimiento mantienen sus fuentes y callbacks existentes. El upsell opcional de packs sigue siendo declinable; no se añaden bebidas, sándwiches o descuentos. Las limitaciones comerciales y las decisiones del servidor permanecen cerradas ante datos incompletos.

El funnel continúa en `reviewOnly`: sin fetch de config/quote, lecturas/escrituras de storage de aplicación, montaje Culqi, salida WhatsApp, reserva, cobro o confirmación ficticia. La fidelidad sólo muestra su texto pendiente al final; no se añade Wallet ni se conecta el backend de PR46 o GHL. La reconstrucción visual no autoriza activar capacidades financieras.

## Validación por completar

El responsable incorporará SHA exacto, comandos, resultados y capturas del código final. Esta inspección no constituye un PASS de navegador o una aprobación estética de la nueva tienda.

| Comprobación | Estado en esta redacción |
| --- | --- |
| Ninguna petición del nuevo recorrido a original, derivados, placas o atlas heredados | Pendiente de auditoría de red y fuentes finales. |
| Logo, hero, lámparas, azulejos, categorías y vitrinas en desktop/móvil | Pendiente de capturas y comparación visual real. |
| Ocho bagels, cinco schmears, nombres/precios legibles, foco y targets accesibles | Pendiente de QA responsive y teclado. |
| Handlers, catálogo, cantidades, eliminación, carrito, upsell declinable y consentimiento | Pendiente de diff y recorridos completos. |
| Review-only, ausencia de proveedores/API/storage y fidelidad pendiente sin Wallet | Pendiente de verificación del código final y tráfico. |
| Build/tipos y evidencia final recuperable | Pendiente; no se trasladan resultados de otras ramas. |

Los materiales, reflejos y profundidad serán aproximaciones de DOM/CSS y fotografías individuales. No se afirma fotorealismo final ni coincidencia píxel a píxel; cualquier distancia visual restante debe mostrarse en capturas, no ocultarse detrás de un build verde.
