# Bagelito Store — diseño aprobado para el recorrido guiado y 3D

**Referencia:** definición visual confirmada el 28 de octubre de 2026: tienda blanca, azul Bagelito, vitrinas de producto real, tarjetas simples de bordes redondeados, menú circular, holder de pedido y progreso en píldora.

## Lenguaje de marca

- Azul principal: `#004AAD`; texto sobre ese azul: **blanco `#FFFFFF`**.
- Fondo de interfaz: blanco `#FFFFFF`; azul hielo `#EDF5FF` solo para contraste sutil.
- No incorporar verde como color de interfaz principal ni paletas ajenas.
- Superficies: tarjetas grandes con esquinas redondeadas, micro-sombras y fotografía de producto sin recortes.
- Títulos y CTAs: tipografía de alta legibilidad en azul; texto secundario corto.
- Menú arriba a la izquierda: botón blanco circular con icono azul. Pedido arriba a la derecha: pill blanco con icono de bolsa azul y cantidad real.
- Holder de progreso: píldora blanca con paso activo azul; en escritorio **inferior**. En móvil, puede situarse arriba u ocultarse durante las vitrinas para evitar cubrir selección/CTA.

## Vitrina de bagels — regla no negociable

Los **ocho rótulos** de las bandejas deben ser idénticos:
**fondo azul `#004AAD`, palabras blancas `#FFFFFF`, mayúsculas, sin inventar precios.**

Orden físico exacto de izquierda a derecha, de arriba hacia abajo:

1. Plain
2. Everything
3. Sesame
4. Classic Onion
5. Jalapeño Cheddar
6. Cheddar
7. Cinnamon Raisin
8. Blueberry

La imagen limpia `/images/bagel-vitrina-photo.webp` contiene rótulos antiguos blancos. La UI del guided commerce **los tapa mediante placas azules de DOM** sobre la foto. En el mundo 3D, **son placas físicas con texto blanco que permanecen en la vitrina al caminar y mover la cámara**, no una imagen estática de otra interfaz.

Las áreas clicables siguen el **orden espacial de la foto**, no el orden del JSON del catálogo. Los ocho productos también se presentan en cards táctiles en móvil con el mismo rótulo azul.

Los carteles de schmears son otra familia de producto; no invertir su color por error al tocar los bagels.

## Movimiento y funnel

- Trayecto comercial: **Elige → Bagels → Schmears → Caja → Pago**, con la bifurcación Packs → Grandes/Minis → cantidad/sabores; Combos → 2 bagels + 1 schmear.
- Transiciones entre escenas suaves, sin sacrificar contraste, funcionalidad o accesibilidad. Respetar `prefers-reduced-motion`.
- NPCs/Rappi recorren rutas laterales y nunca deben tapar vitrina, totem o caja.
- Menú y holder de pedido accesibles a lo largo de la experiencia; el pedido debe reflejar la selección real y **no mostrar precios inventados**.
- La tienda 3D debe mantener iluminación cálida, arquitectura blanca, señalización azul y vitrinas de producto.

## Restricciones comerciales y QA

- Este documento **define apariencia**, no autoriza precios ni activa Culqi.
- Solo el servidor puede validar precios, stock y batch. Combos y productos con reglas pendientes siguen fail-closed para cobro real.
- No dar por aprobado pixel a pixel un nuevo build sin screenshots desktop/móvil y comparativa con referencias.
- QA automatizado: `npm run qa:guided` comprueba etiquetas, productos, colores y navegación; también hace falta revisión visual humana del 3D en movimiento.
