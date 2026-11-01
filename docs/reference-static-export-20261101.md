# Exportación estática aislada de Bagelito

La tienda usa la misma imagen, HTML, componentes, catálogo y bundle cliente que la preview de revisión de PR45. Esta exportación agrega archivos HTML para `/`, `/legal` y `/playable`, conservando el bootstrap de hidratación de React/TanStack. No implementa un flujo alternativo ni fabrica datos comerciales.

- Aplicación: `6f765cee68f4c4d2f013a1082b497a73b5191bd7`.
- Entrega original de PR45: `d43cc5f77df6ccea7161ecb190d91631108f9d02`, conservada sin cambios.
- Exporter: `f2cc618ecfeaa52807cd8a1b3ee77121c972f94a`, en rama `preview/reference-static-export-20261101`.
- Imagen aprobada intacta: SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`,1536×1024. No se afirma identidad de bytes con el JPEG del hilo padre.

## Qué contiene y qué cambia

Se copia exclusivamente el directorio público del build ya verificado y se capturan tres respuestas HTML del servidor local de revisión. La única transformación del HTML inserta una política CSP y una política de referrer; conserva marcado, comentarios React, estado de hidratación, scripts y URLs originales. Los hashes de origen/exportación y de cada asset quedan en `static-export-manifest.json`.

El ZIP estático no contiene Nitro, archivos de servidor, `node_modules`, credenciales, variables de entorno ni endpoints de DB/pagos. El bundle cliente compartido aún contiene referencias a handlers inactivos de otras modalidades; no se reescribe para aparentar que esas cadenas no existen. `reviewOnly` y `referenceMode` siguen activos, y la CSP del artefacto bloquea conexiones (`connect-src 'none'`), formularios, frames, workers y objetos. Los scripts propios sólo se permiten desde el mismo origen o por los hashes exactos de los bootstrap inline. Estilos inline siguen permitidos para el posicionamiento existente.

La CSP no reemplaza acceso privado del hosting ni convierte la preview en un checkout. El artefacto no se ha alojado ni publicado como sitio. El padre decidirá el hosting y sus controles de acceso; no se cambia la visibilidad del repositorio ni se crean servicios.

Se conservan selección, cantidades, upsells de catálogo declinables, campos de entrega y consentimiento, menú, carrito, progreso, zoom y texto final de fidelidad. El pago sigue desactivado. Seguimiento interno y canje del programa10pedidos→2bagels+1schmear están pendientes; sin Wallet ni nueva integración GHL. Ninguna transición de UI confirma un pedido o pago.

## Cómo servirlo

El ZIP debe descomprimirse en la **raíz de un origen HTTP/HTTPS**. No funciona mediante `file://` ni montado sin ajustes bajo un subdirectorio: las URLs `/assets`, `/images`, `/legal` y la vuelta a `/` son absolutas en la aplicación original. El host debe servir JS/CSS con sus MIME correctos y conservar los bootstrap inline permitidos por sus hashes; una CSP externa incompatible puede impedir la hidratación. No minificar ni alterar los bootstrap inline después de exportar sin recalcular sus hashes CSP.

Incluye `legal/index.html` y `playable/index.html`. Un host de archivos puede usar índices de directorio o mapeos estáticos para esas rutas; no debe devolver el HTML de inicio como fallback para todas las rutas, porque las páginas conservan estados de hidratación distintos. No se requiere un backend de aplicación.

Servidor de archivos local usado en QA:

```sh
python -m http.server 3212 --bind 127.0.0.1 --directory /tmp/bagelito-reference-static-f2cc618
```

Este servidor sólo sirve archivos; `/api/batch` no existe y devuelve404. Los navegadores de QA bloquean egress y llamadas de negocio independientemente de la CSP. El servidor de archivos no recibe formularios ni procesa pedidos.

## Reproducir la captura desde el build congelado

Se utiliza el ZIP Node original como fuente del build exacto, sin instalar dependencias ni reconstruir desde versiones flotantes. El servidor Node sólo se usa localmente para obtener los tres HTML durante la exportación; después basta el servidor estático.

```sh
unzip docs/previews/reference-storefront-20261101/bagelito-reference-review-6f765ce.zip -d /tmp/bagelito-static-source
PORT=4173 node /tmp/bagelito-static-source/bagelito-reference-review/start-review.mjs
```

En otra terminal del checkout de esta rama:

```sh
node scripts/export-reference-static.cjs --build /tmp/bagelito-static-source/bagelito-reference-review --origin http://127.0.0.1:4173/ --source-sha 6f765cee68f4c4d2f013a1082b497a73b5191bd7 --output /tmp/bagelito-static-fresh
python -m http.server 4174 --bind 127.0.0.1 --directory /tmp/bagelito-static-fresh
```

El exporter exige origen loopback, imagen aprobada y árbol de aplicación igual al SHA declarado; no sobrescribe una salida existente. Cada nueva captura conserva los timestamps internos SSR de esa ejecución y genera sus propios hashes de HTML/CSP. Los assets compilados permanecen byte idénticos. Los comandos no despliegan ni habilitan cobros.

## Validación

| Etapa | Resultado y alcance |
| --- | --- |
| Archivos/CSP | PASS:83archivos,82hashes;79assets públicos incluidos6JS+2CSS byte idénticos. Los3HTML sólo agregan CSP+referrer, con hashes inline exactos. [Auditoría](qa/reference-static-export-20261101/source-audit-f2cc618/README.md). |
| ZIP servido | PASS tras descomprimir: HTML/JS/imagen200, bytes iguales y API404 con servidor estático simple. [Probe](qa/reference-static-export-20261101/artifact-probe-f2cc618/results.json). |
| Hidratación y legal | PASS focal390: selección real, entrega/consentimiento, pago desactivado, términos en pestaña nueva; `/legal` redirige al directorio `/legal/` y mantiene su contenido real. Sin errores de hidratación/CSP. |
| Recorrido estático | PASS: cinco casos completos adicionales al foco, con Packs/Combos/Schmears390, upsells12/16 en390/320 y declinar pack en1280; mismos asserts que Node y edición/carrito/progreso/menú. |
| Entrada y zoom | PASS:320/390/1280, nueve callbacks de categoría, zoom/pan/retorno320/390. Misma espera de scroll estable del driverNode. |
| Comparación visual | Entrada390 idéntica píxel por píxel. En el foco,7/11PNG RGB idénticos;4 difieren hasta1–3/255 sin cambiar dimensiones. Se conserva FAIL del criterio estricto de igualdad total, sin máscaras ni cambio de umbral. |
| Comparación DOM | Par Node/estático autorizado en ejecución; no se infiere igualdad de todos los datos sólo de capturas. |
| Seguridad de navegador | CeroAPI/fetch/XHR/POST/egress/escrituras. Una lectura interna TanStack por documento registrada; no se afirma cero lecturas. No hay endpoints de comercio. |
| Hosting/iPhone físico | No ejecutado. No se creó sitio ni se cambió privacidad, permisos, producción o autodeploy. |

La evidencia estática se registra separada del PASS anterior de Node. Los resultados conservan SHA de aplicación y exporter.

No se certifica Safari ni un iPhone físico por ejecutar emulación Chromium. La publicación del artefacto en GitHub no constituye un enlace web alojado para iPhone.
