# Imagen de referencia y contrato comercial

Fecha: 1 de noviembre de 2026. Alcance: landing basada en la imagen exacta aprobada y flujo de selección en modo revisión. Esta matriz distingue las referencias históricas de la autorización comercial posterior de Ricardo. Documentar esa autorización no activa cambios de catálogo, precios, stock, promociones, pagos o fidelización.

La petición de reproducir una imagen autoriza su presentación visual. Los números, productos y mensajes dibujados en ella o en otros storyboards no pasan por ello a ser reglas comerciales ejecutables.

## Fuentes y autoridad

- **Contenido visual:** transcripción de los storyboards proporcionada en la delegación del hilo padre. Las expresiones de la columna visual conservan sus cantidades y cifras; cuando faltan unidades o contexto se señala la ambigüedad. No se atribuyen esos textos a un archivo concreto sin una correspondencia verificada.
- **Referencia comercial publicada:** [`verified-menu-2026-10-21.json`](../src/domain/data/verified-menu-2026-10-21.json), con `source_date: 2026-10-14` y `verified_at: 2026-10-21T04:05:00Z`. Es evidencia histórica del menú publicado, no prueba de disponibilidad o precio vigente al 1 de noviembre.
- **Contrato de selección actual:** [`approved-shop-contract.ts`](../src/domain/lib/approved-shop-contract.ts). Conserva el recorrido aprobado posterior de combo de dos bagels y un schmear, cuyo precio permanece sin confirmar. El módulo exige revisión en los casos ambiguos y no autoriza por sí solo reservas ni cobros.
- **Autorización comercial posterior de Ricardo, comunicada en el hilo padre el 1 de noviembre:** sin bebidas ni sándwiches; upsells contextuales del catálogo y sus precios reales, que se puedan declinar; fidelidad presentada al final, con la regla **cada 10 pedidos → 2 bagels + 1 schmear gratis**. Esta instrucción es una fuente comercial explícita distinta de las imágenes. Su autorización y su implementación se separan en el apartado posterior.
- **Asset local de la landing:** [`store-reference-approved.webp`](../public/images/store-reference-approved.webp). Reproducir este WebP no acredita identidad de bytes con el JPEG aportado al hilo padre; no se afirma esa equivalencia.

## Matriz de discrepancias

| Texto o cifra visual aportada | Comparación con la fuente comercial actual | Tratamiento en la preview |
| --- | --- | --- |
| `Perfect Pair`, `6 + 1`, `S/74` | Coincide con el registro histórico `perfect-pair`: seis bagels mixtos y un schmear de 120 g, precio publicado 74 PEN. `getVerifiedDisplayMenu()` lo entrega como `historicalPublishedCombos`. | Mantenerlo como referencia histórica cuando corresponda. No convertirlo en una oferta vigente ni reemplazar automáticamente el recorrido actual de dos bagels. |
| `Brunch`, `12 + 2`, `S/140` | Coincide numéricamente con `brunch-pack` / **Brunch Pack**: doce bagels mixtos y dos schmears de 120 g cada uno, precio publicado 140 PEN. | Conservar nombre y composición verificados si se cita el menú histórico; sin activar compra o sumar bebidas a partir del dibujo. |
| `Schmear Lover`, `6 + 3`, `S/99` | Coincide con `schmear-lover`: seis bagels mixtos y tres schmears de 120 g cada uno, precio publicado 99 PEN. | Referencia histórica; no deducir reglas de upgrades, disponibilidad o un descuento adicional. |
| `tamaños 18 / 25 / 32` | No coincide con los tamaños verificados, que son **120, 180 y 240 g**. Si las cifras fueran precios, tampoco forman la tabla publicada: Original 12/18/22 PEN y saborizados 16/23/29 PEN. La cifra 18 aislada coincide con un precio de Original de 180 g, sin validar la serie completa. | No convertir 18 en 180 g ni asignar moneda, volumen, etiquetas o precios a toda la serie. Mostrar los tamaños y referencias del catálogo verificado; conservar el texto de la imagen como contenido visual. |
| `regalo 6 + 2` | No hay una regla de regalo 6+2 en el JSON. Tampoco se explicitan aquí las unidades ni los productos. Los combos históricos 6+1, 12+2 y 6+3 no prueban esta promoción. | No añadir unidades gratuitas, un cupón, un SKU ni capacidad extra. Esta cifra visual tampoco equivale a la nueva recompensa autorizada de diez pedidos → dos bagels y un schmear. |
| `2 bagels + schmear` | Difiere de las tres composiciones históricas del JSON, pero coincide con el recorrido de selección aprobado posteriormente en `quoteTwoBagelCombo()`. Esa función devuelve `review_required` y precio `null`: no hay precio confirmado ni reglas de upgrade. | Conservar el recorrido actual de dos bagels y un schmear como selección para revisión. No tomar 74, 99, 140 u otra cifra de otro storyboard como su precio. |
| `bebida / sandwich / café / yogurt` | No hay SKU de esos productos ni reglas de inclusión en el JSON o en `getVerifiedDisplayMenu()`. Los combos publicados especifican bagels y schmears. La autorización posterior también excluye bebidas y sándwiches. | No crear categorías vendibles, extras, ingredientes, alérgenos, inclusiones o precios. Su aparición visual no amplía el catálogo ni el upsell autorizado. |
| `upsell 2 S/12` | No existe una oferta verificada de dos unidades por 12 PEN. El JSON contiene una referencia de **unidad premium/estacional a 12 PEN**, con una nota que impide inferir mínimos o reglas de packs; no es el precio de dos unidades. | No crear un pack de dos a S/12, un descuento ni una regla de cobro. Los grandes mantienen tamaños 6/12 y los minis 6/12/24. Una interacción de revisión no autoriza esa oferta. |
| `6 schmears` | El catálogo contiene **cinco sabores**. Si la cifra describe seis recipientes o seis unidades, tampoco acredita un pack de seis ni seis sabores distintos. Los combos históricos contienen uno, dos o tres recipientes. | Conservar cinco SKU. No separar **Herb & Roasted Garlic** para inventar un sexto sabor “Roasted Garlic”, ni deducir stock o un pack nuevo del número de recipientes dibujados. |
| `total 30` | No tiene una orden, desglose, moneda ni cálculo comercial verificable asociado. El contrato calcula referencias según selección y mantiene los casos ambiguos en revisión. | No fijar el total en 30, reutilizarlo en otra selección ni presentarlo como importe validado o cobrado. |
| `puntos 320` | El JSON y el contrato no definen programa de puntos, saldo, conversión, elegibilidad ni reglas de Wallet. La autorización posterior se expresa en pedidos y recompensa, no en puntos. | No otorgar saldo, generar un pass, descontar dinero ni registrar 320 puntos. Es una cifra visual, sin efecto comercial. |

## Datos que se conservan

| Categoría | Datos verificados que no deben sustituirse con el storyboard |
| --- | --- |
| Bagels | Ocho: Everything, Sesame, Plain, Classic Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin y Blueberry. Que dos sean premium no define su inclusión o suplemento dentro de un pack; el contrato mantiene ese caso en revisión. |
| Packs grandes | 6 mixtos: S/60; 6 de un sabor: S/50; 12 mixtos: S/115; 12 de un sabor: S/100. No hay tamaño grande de 24 en este contrato. |
| Packs minis | 6: S/25 mixtos / S/20 un sabor; 12: S/40 / S/35; 24: S/75 / S/70. El contrato mantiene la compatibilidad/disponibilidad de sabores minis en revisión. |
| Schmears | Whipped Original, Ají Amarillo, Herb & Roasted Garlic, Honey Cinnamon y Classic Strawberry. No se incorpora un sexto SKU. |
| Tamaños y precios publicados de schmears | 120 g: Original S/12 / saborizado S/16; 180 g: S/18 / S/23; 240 g: S/22 / S/29. Son referencias publicadas, no una confirmación de precio o stock actual. |
| Upgrades históricos | `180 g +S/6` y `240 g +S/13` aparecen en el JSON, pero su granularidad por recipiente o por combo no está explícita. No se automatiza ese suplemento. |

## Autorización posterior e implementación pendiente

La instrucción posterior de Ricardo autoriza estas reglas; no se deriva de los storyboards ni valida sus promociones discrepantes.

| Regla autorizada | Alcance y tratamiento |
| --- | --- |
| Sin bebidas ni sándwiches | Mantener el catálogo de bagels y schmears. Café, yogurt y otros productos dibujados no se incorporan como extras o inclusiones. |
| Upsells contextuales, del catálogo existente y declinables | La opción admitida para packs es un schmear de **120 g**: **Whipped Original S/12** o un sabor de clase `flavoured` **S/16**, según `schmear_sizes` del JSON. `quotePublishedSchmear()` selecciona exactamente esos campos por clase y tamaño. No es una oferta de dos bagels por S/12 ni un regalo. Al declinar se debe conservar el callback original y continuar sin añadir productos ni modificar la selección o el importe. Esta matriz no cambia los handlers. |
| Fidelidad al final: cada 10 pedidos → 2 bagels + 1 schmear gratis | Regla comercial autorizada expresamente. El tracking será **interno** y su implementación está pendiente. La autorización no especifica elegibilidad, tamaño, sabores, calendario ni otras condiciones; esta matriz no las inventa. No autoriza el regalo visual 6+2, puntos 320 ni un saldo ficticio. |
| Confirmación real sólo desde fuente verificada postpago | Una pantalla de revisión o una transición de UI no acredita un pago ni un pedido real. Las confirmaciones reales necesitarán una fuente verificada posterior al pago. |

**Pendiente de implementación, no activado:** persistencia del conteo interno, DB, idempotencia de pedidos y recompensas, verificación de pagos, generación de la recompensa y su canje. La preview no incrementa un contador de pedidos reales, no acredita regalos y no emite saldo ni puntos. Este documento no implementa ni certifica ninguno de esos mecanismos.

En la UI de revisión, la fidelidad sólo puede aparecer como texto con estado **Pendiente** al final, en pago/fin; no como saldo, progreso inventado o confirmación. Un texto fiel a la autorización es: «Fidelidad pendiente de implementación: cada 10 pedidos, 2 bagels + 1 schmear gratis». Mostrar esa regla no significa que una recompensa esté ganada o se pueda canjear en la preview.

**Sin Wallet ahora:** no se integra ni promete Apple Wallet o Google Wallet. **Arquitectura aprobada posteriormente por Ricardo:** el backend será la fuente de verdad y GHL reflejará el progreso. La implementación, auditoría, credenciales, dependencias e integración siguen pendientes; esta entrega de UI no las activa. La regla de fidelidad no requiere mostrar un pass ni un saldo ficticio.

## Aplicación al modo revisión

Los hotspots identifican categorías y abren los controles existentes; no interpretan los precios o cantidades de los píxeles como datos de pedido. La selección usa los identificadores y límites del contrato actual. Las discrepancias quedan visibles en esta matriz y no se resuelven inventando una regla.

El flujo de revisión no confirma stock, fecha de entrega, reserva ni pago, y no acredita regalos por pedidos reales ni emite puntos. La regla posterior de fidelidad se documenta con estado pendiente, sin confirmación ficticia. Ninguna cifra de esta matriz sustituye la validación comercial necesaria para una venta real. La preservación de la imagen tampoco requiere alterar las funciones financieras existentes.
