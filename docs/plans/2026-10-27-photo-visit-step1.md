# Bagelito — visita fotográfica, tramo 1

## Alcance aprobado
Una tienda realista ocupa la pantalla. Desde la entrada, un movimiento continuo acerca al usuario a la MISMA vitrina. Al terminar se pregunta «¿Qué te provoca hoy?» y se puede elegir Packs, Combos o Schmears, cambiar de opción o volver a entrar. La barra inferior conserva el progreso.

No se construyen configuradores de sabores, carrito, pedidos, cobros ni integraciones. No se reemplaza el home. Ruta aislada: /visita. Base: PR #29, SHA 6a4a59d97a4b52d0bcd9d742e448a9c14bfc649f. No merge ni producción.

## Dirección visual
Referencia aprobada: wide_interior_scene_of_a_bright_modern_new_york.png. Azulejos blancos pequeños y cuadrados, acero, azul #004aad, coral #fa967f, bagels detrás de vidrio y schmears en cubetas tipo heladería. Los bagels se reducen en el asset de escena. Se limpian los botones y precios incrustados en el render. El logo del usuario se conserva como imagen, nunca se sustituye por texto escrito con otra tipografía.

La escena es una visualización conceptual de diseño, no una fotografía de un local existente ni catálogo comercial. Ningún sabor ni precio dibujado en el render habilita una oferta.

## Implementación elegida
Composición fotográfica 2.5D ligera con una sola imagen de escenario, capa de puerta de vidrio y transformación de cámara. No es un entorno WebGL. Se elige para mantener la apariencia aprobada sin una descarga 3D ni controles de videojuego. La alternativa CSS que dibujaba toda una tienda se descarta por no respetar la referencia; la reconstrucción 3D completa queda fuera de esta etapa.

1. Estado puro validado: entrada, acercamiento, elección. Familias: packs, combos, schmears.
2. UI táctil/teclado, alternativa sin movimiento, botones reales sobre escena, volver/recargar e historial.
3. Fotos servidas desde el propio deploy, no desde Adobe en tiempo de visita. El importador conserva los archivos descargados y exige fuentes de diseño válidas; nunca sustituye la escena por una imagen inventada si falla.
4. QA con Chromium en 1440, 390 y 320 px: imagen, entrada, cambio de cámara, categoría, volver, recarga, reduced-motion, desbordamientos y ausencia de escrituras comerciales.
5. Preview privada y PR en borrador. Aprobación visual antes del tramo 2.

## Criterio de entrega
Se puede entrar, acercarse y elegir cualquiera de las tres categorías. El punto de parada se indica honestamente: «La configuración viene en la siguiente etapa». Ninguna acción vende productos ni genera pagos.
