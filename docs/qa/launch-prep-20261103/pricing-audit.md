# Productos y precios: auditoría de preparación de lanzamiento

Auditoría de lectura sobre PR47 `bbd149019b249edf4243fb4776c6acff944775be`.
Se revisaron componentes, dominio, evidencia y pruebas; no se editaron fuentes,
abrió navegador, consultó una base o proveedor, envió WhatsApp/pedido ni publicó.
Los defectos de esta sección corresponden a ese baseline; su corrección y QA
posterior son trabajo separado del agente principal.

## Defectos reproducidos en el baseline

1. **El encabezado de consulta puede comunicar otro tipo de pack al del contrato
   canónico.** Recorrido real del harness de `GuidedCommerce`: grandes → 6
   mixtos → seis veces Plain → continuar sin extra. El enlace contiene
   `Pack de 6 bagels grandes (mixto)` y `6 × Plain`. En cambio,
   `planGuidedOrder` canonicaliza una única fila de sabor como `single`
   (`src/domain/lib/guided-order-quote.ts:116`), y la regresión existente exige
   S/50 para exactamente esa selección solicitada como mixed
   (`tests/guided-checkout-quote.test.cjs:65`). No se efectuó cobro: la
   incoherencia puede llevar a una cotización manual con el tier equivocado.
   Corrección mínima: que el descriptor del mensaje derive del mismo criterio
   de sabores efectivos, conservando cantidades y sin cambiar precios.
2. **El drawer de carrito pierde la identidad de tamaño del schmear.** Recorrido
   real del mismo harness: standalone 240 g → Whipped Original → cajero → abrir
   carrito. Su texto es `Tu pedido Whipped Original × 1 Precio final por confirmar
   con Bagelito...`, sin `240 g`. El cajero y mensaje sí contienen el tamaño.
   `GuidedCommerce.tsx:811–812` muestra solo nombre y cantidad en el drawer.
   Corrección mínima: añadir el tamaño actual a esa fila, con regresiones para
   120/180/240 y retirada; no cambiar estado ni inventar importes.

La reproducción ejecutó el componente y handlers reales mediante el harness
existente en VM, con `node:test` desactivado para extraer únicamente sus helpers.
El harness impide fetch, storage, SDK y formularios. No se duplicó la lógica de
selección ni se abrió el enlace generado.

## Matriz de evidencia, sin nueva aprobación comercial

| Producto | Base publicada PEN |
|---|---:|
| Grande 6 single / mixed | 50 / 60 |
| Grande 12 single / mixed | 100 / 115 |
| Mini 6 single / mixed | 20 / 25 |
| Mini 12 single / mixed | 35 / 40 |
| Mini 24 single / mixed | 70 / 75 |
| Pote 120 g original / saborizado | 12 / 16 |
| Pote 180 g original / saborizado | 18 / 23 |
| Pote 240 g original / saborizado | 22 / 29 |

Fuente: `src/domain/data/verified-menu-2026-10-21.json`, menú fechado
2026-10-14 e inspección registrada 2026-10-21. La foto suministrada por Ricardo
el 2026-11-02 confirma específicamente todos los pares de precios de potes
(metadata en líneas 226–230; hash
`db730c30cd00acae2f5af50b0684f1ef5f3e4e63068cf02e8c6b33d7489f58f4`).
No revalida el resto del catálogo, stock ni disponibilidad de mañana.

Los **minis sí tienen precios base publicados**; no deben describirse como
enteramente sin precio. Falta resolver compatibilidad/disponibilidad de sabores,
por lo que `quotePublishedPack` los deja `review_required` y el plan no presenta
su base como total final cobrable. La misma precaución existe para premium.

Son distintos y siguen pendientes:

- Combo actual 2 bagels + 1 schmear: no hay precio confirmado; permanece `null`.
- Extras de 2/8 bagels: no hay precio/promoción aprobado para esos journeys.
- Inclusión o recargo premium en packs, especialmente mixtos.
- Upgrade +S/6/+S/13: no está definido si es por pote o bundle.
- Halloween S/48/S/90: oferta separada, no sustituye el precio ordinario.
- Los combos publicados 6+1 S/74, 12+2 S/140 y 6+3 S/99 no son precios del 2+1.

`docs/combo-extra-source-reconciliation-20261102.md:19–23` dice que falta
reconciliar la oferta 2+1 con los bundles comerciales publicados. El comentario
de `approved-shop-contract.ts:102` que afirma que un journey aprobado sustituye
los combos históricos sobrestima esa aprobación; el runtime sí permanece seguro
en `review_required/null`. Es apropiado aclarar ese comentario/documentación sin
alterar composición o precios por inferencia.

## Lo que se muestra realmente

El candidato muestra ocho sabores de bagel: Plain, Everything, Sesame, Classic
Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin y Blueberry. Los dos cheddar
están marcados premium. No añade estacionales o Rainbow al catálogo corriente.
Muestra cinco schmears: Whipped Original, Ají Amarillo, Herb & Roasted Garlic,
Honey Cinnamon y Classic Strawberry.

En `/consulta`:

- Packs grandes 6/12 y minis 6/12/24; la elección de cantidad no muestra un
  importe final. No se detectó un importe de pack inventado en esos botones.
- El paso de tamaño individual muestra los pares confirmados 12/16, 18/23 y
  22/29. El extra opcional de pack muestra 120 g y 12/16 según clase de sabor.
- El combo actual declara `Precio por confirmar`.
- Carrito y cajero no presentan una cotización final del pedido: solicitan
  confirmación de disponibilidad, precio, entrega y fecha a Bagelito.
- El paso Pago se oculta y `manualInquiry` hereda las guardas de review para no
  consultar configuración/precios remotos, reservar ni cargar el SDK.

No se encontró una cifra visible que contradiga la matriz confirmada. La ausencia
de total final en esta ruta es coherente con una consulta humana, no prueba un
checkout disponible ni autoriza agregar precios de productos pendientes.

## Qué falta antes de vender

Para **consulta manual**, hace falta revisión del candidato y autorización
separada de publicación: `/consulta` está cerrada por defecto, requiere flag y
origen HTTPS exactos. `/` y `/playable` siguen montando `reviewOnly`; no se debe
publicitar que sus recorridos cobran o generan pedidos. La auditoría de fuentes
no certifica que `/consulta` esté habilitada en el dominio productivo.

Antes de aceptar una consulta como venta, Ricardo debe confirmar stock real por
sabor y tamaño, formato compatible, precio/composición final, delivery/fecha y
capacidad. El mensaje no reserva stock ni promete fecha. Resolver 2+1,
premium/minis y upgrades exige evidencia comercial adicional, no cálculo por
unidad ni importación de una promoción antigua.

Para **Culqi**, además de esos puntos, siguen pendientes la integración real del
producto completo, compatibilidad del esquema instalado, inventario de potes,
pruebas sandbox de tarjeta/3DS/Yape/webhook/rechazo/expiración/pago tardío y
contención multisesión, y autorización específica de release. La aprobación
comercial del comercio ya recibida no debe pedirse otra vez. Los detalles del
puente sandbox vigente y sus gates están en
`docs/guided-product-checkout-integration-20261102.md:35–50`; live no está
soportado por ese carril. No se rebajaron guardas para producir una venta aparente.
