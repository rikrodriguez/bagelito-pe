# Tienda móvil directa y arreglo de legibilidad

Aplicación verificada: `9a94e4cfc5a043726f643d3a9c546f096007bd94`. Se eliminó el control y estado de ampliar la imagen. En320/390px, el logo y la vitrina usan recortes del mismo WebP aprobado y las tres categorías son tarjetas nativas con fotos, títulos16px, contexto12px y objetivos44px. No hay pan horizontal ni textos pintados de categoría duplicados. Escritorio conserva la entrada completa:0 diferencias RGB y el mismo hash PNG que la entrada anterior6f.

[Descargar ZIP estático verificado](previews/reference-static-export-20261101/bagelito-reference-static-direct-9a94e4c.zip) —8.513.042bytes. SHA256: `262b55db494a615299ad9123ac2b82a69b79950f318281d8b5652abe45de5ed6`.

[Captura390](qa/reference-static-export-20261101/final-direct-9a94e4c/entry/390-nozoom-presentation.png) · [captura320](qa/reference-static-export-20261101/final-direct-9a94e4c/entry/320-nozoom-presentation.png) · [informe terminal de navegador](qa/reference-static-export-20261101/final-direct-9a94e4c/README.md) · [resumen JSON](qa/reference-static-export-20261101/direct-final-summary.json) · [manifiesto global](qa/reference-static-export-20261101/direct-manifest.json).

## Causa y corrección

El upsell añadía nota y precio como dos elementos `small`, pero el CSS heredado les asignaba la misma fila/columna. En escritorio heredaba una fila horizontal estrecha. Las tarjetas de referencia ahora usan flujo vertical y altura natural: nombre14px, nota12px y precio13px en espacios separados. Se preserva la elección opcional y la posibilidad de retirarla.

La revisión de los demás estados encontró el título de combos encima de su tarjeta, fuentes6.5–11px, controles36px y nombres de bagels recortados a320px. El título pasa a flujo normal; los formularios móviles usan una columna, etiquetas12px, campos16px y controles44px. Los nombres de bagels tienen el ancho de su tarjeta y el contador ocupa otra fila. El nombre del resumen usa13px.

Dentro de `src` sólo cambian `ReferenceScene.tsx` y `reference-storefront.css`.125archivos protegidos —catálogo, precios, callbacks, checkout, consentimiento y servidor— conservan sus bytes. La firma de props, las tres categorías y los cinco destinos de navegación se mantienen. La arquitectura aprobada de backend como fuente de verdad y GHL como reflejo futuro sólo se documenta; no activa integración ni tracking.

## Resultado terminal

| Etapa | Resultado |
| --- | --- |
| Build y TypeScript | PASS; estructural11/11, manual4/4 y movimiento heredado14/14. Estos módulos heredados no acreditan un juego en la tienda actual. |
| Node completo |58/58PASS, cero skips. |
| Entrada estática |3viewports320/390/1280 y9callbacksPASS; sinAmpliar, sin pan, tarjetas nativas16/12/44. |
| Tarjetas/upsells |18/18estadosPASS;90tarjetas medidas con Rangerects, sin solapes ni clipping. |
| Resto del flujo |36/36estadosPASS: formatos/cantidades, ocho bagels, combos, tamaños, caja, textos largos y consentimiento. |
| Recorridos completos |6/6PASS: Packs/Combos/Schmears390, extrasOriginalS/12 ySaboresS/16 en390/320, pack sin extra en1280. Volver, editar, menú, progreso, campos, consentimiento, pago desactivado y fidelidad pendiente. No es todos los caminos en todos los anchos. |
| Términos reales |6/6pestañas reales,301→200a `/legal/`, ocho secciones y `opener=null`; sin simular la navegación. |
| Seguridad navegador |0API/fetch/XHR/POST/escrituras/egress/infraccionesCSP/errores de hidratación.27lecturas TanStack exactas, máximo1/documento, registradas; no se afirma cero lecturas. |
| Imagen y escritorio |WebP aprobado intacto SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`; escritorio0RGB frente a6f. No se afirma identidad de bytes con JPEG. |
| Export/CSP |82/82hashes y79assets idénticos al build,83archivos contando manifiesto.3/3políticasCSP/hashes inline y reconstruccionesSSR válidas. Sólo CSP+referrer cambian los HTML. |
| ZIP descomprimido |82hashesPASS y13GETs reales: HTML/JS/CSS/imagen200, API404, MIMEcorrectos y sin cookies. [Probe](qa/reference-static-export-20261101/direct-zip-probe-9a94e4c/results.json). |

La evidencia final tiene212PNG y243entradas de hashes de navegador. Los reportes originales identifican app9a94e4c y origen estático3216. El driver de entrada no serializa exporterSHA: el sidecar conserva esa limitación; la procedencia se vincula al manifiesto estático, que declara exporter `281b85d6bf80eb9f564af987a1fd21b8fbcd1318`. No se modificaron los JSON para completar ese dato.

## Antes y estados intermedios conservados

- [Upsell original](qa/reference-static-export-20261101/text-layout-before-6f-f2cc618):18estados con336hallazgos; nota/precio superpuestos, fuentes pequeñas y cortes.
- [Auditoría restante original](qa/reference-static-export-20261101/secondary-text-before-6f-f2cc618):36estados con239hallazgos.
- [Contrato sin ampliar](qa/reference-static-export-20261101/nozoom-contract-before-6f-f2cc618):24fallos esperados del diseño anterior, por petición explícita posterior de Ricardo. El criterio de imagen completa sigue para escritorio; en móvil se sustituyó por recortes exactos y controles reales legibles. No fue una reducción silenciosa de asserts.
- [Candidato inicial](qa/reference-static-export-20261101/text-layout-bb482ee):18estados de tarjetasPASS y siete fallos restantes en otros estados, posteriormente corregidos. Los snapshots sin commit declaran hashes de fuente y QA_CODE_SHA=null; no se reasignan esos resultados al código final.

El viejo zoom, guided32 yQA3D permanecen históricos; no se atribuyen a la versión nueva ni se rerunearon para esta entrega.

## Uso y reproducción

El ZIP sólo contiene HTML/assets; no incluye Node, Nitro, DB, credenciales ni endpoints de pago. Se puede alojar como archivos estáticos en la **raíz de un origen HTTP/HTTPS**, conservando MIMEJS/CSS e índices de directorio. No abrir mediante `file://`, no montar bajo subdirectorio sin adaptar URLs y no alterar los bootstrap inline sin recalcular sus hashesCSP. El padre actualizará el mismo preview privado con la misma audiencia; esta entrega no aloja un sitio ni cambia privacidad.

```sh
unzip bagelito-reference-static-direct-9a94e4c.zip -d /tmp/bagelito-direct-static
python -m http.server 4174 --bind 127.0.0.1 --directory /tmp/bagelito-direct-static
```

Regresión portable del checkout de esta rama, en un entorno con Playwright y Chromium ya disponibles:

```sh
BASE_URL=http://127.0.0.1:4174 QA_CODE_SHA=9a94e4cfc5a043726f643d3a9c546f096007bd94 QA_OUTPUT=/tmp/direct-entry-replay npm run qa:reference:entry
BASE_URL=http://127.0.0.1:4174 QA_CODE_SHA=9a94e4cfc5a043726f643d3a9c546f096007bd94 QA_OUTPUT=/tmp/direct-card-replay npm run qa:reference:text
BASE_URL=http://127.0.0.1:4174 QA_CODE_SHA=9a94e4cfc5a043726f643d3a9c546f096007bd94 QA_OUTPUT=/tmp/direct-secondary-replay npm run qa:reference:secondary
```

Los drivers guardados junto a la evidencia reproducen los seis recorridos y la navegación legal. El [manifiesto interno](previews/reference-static-export-20261101/static-export-direct-9a94e4c-manifest.json) permite verificar los archivos sin recompilar ni instalar dependencias. El script `package-reference-static.py` vuelve a empaquetar una exportación sin modificar sus archivos; las capturasSSR nuevas cambian timestamps y hashes inline, por lo que se registra cada ejecución.

## Límites

QA en Chromium151 con emulación móvil; Safari/iPhone físico y CI remoto no certificados. No hay cobros, reservas, pedidos, seguimiento/canje de fidelidad ni confirmación real. Sin bebidas/sándwiches, upsells declinables de catálogo, fidelidad10pedidos→2bagels+1schmear presentada como pendiente, sin Wallet ni integración GHL activa. La matriz comercial documenta las discrepancias del arte de referencia.

Aplicación9a94e4c inalterada durante la QA final. Autodeployfalse conservado. PR45 sigue en borrador; no merge, despliegue, producción, credenciales, permisos ni gastos.
