# Tienda sobre la imagen aprobada — revisión del 1 de noviembre

Ricardo reemplazó el objetivo 3D por «Ya olvidate del juego etc. Quiero esa misma imagen». Las rutas `/` y `/playable` ahora presentan el WebP aprobado como imagen real, con botones nativos transparentes sobre Packs, Combos, Schmears, menú, carrito y progreso. No cargan Canvas ni avatar. Los controles de selección existentes se abren debajo de la imagen, usando el catálogo y los callbacks del flujo anterior.

## Código e imagen

- Aplicación actual: `6f765cee68f4c4d2f013a1082b497a73b5191bd7`. La primera evidencia de entrada conserva su SHA anterior `fe4c3ec460a9fb7bdd33cd2e6ebaec8156db9ecc`.
- Entrada visual: `public/images/store-reference-approved.webp`,1536 × 1024, SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`. El asset no fue modificado. No se afirma identidad de bytes con el JPEG del hilo padre.
- Trabajo 3D preservado en `archive/pr45-guided-3d-20261101`, commit `6513faf82420bea0fb1952185615fa5ab1493301`; no se siguió refinando.
- Adaptación desarrollada en `feat/reference-image-storefront-20261101`, descendiente de `a47c65f0f1c92edf23fed4d48db17d8c6cf7b37a`. Se mantiene el mismo PR45 en borrador; no hay un nuevo PR ni despliegue.

En escritorio la imagen se ajusta completa con proporción 3:2. En móvil se muestra completa por defecto, con una opción explícita para ampliar a 720 px y recorrer horizontalmente. No se promete que todo el texto de 1536 px resulte legible reducido a 320 px. Los hotspots tienen área efectiva mínima 44 × 44 y foco nativo visible. Sólo el carrito/progreso cambian de presentación al haber selección para reflejar datos reales sin duplicar los controles dibujados.

## Flujo comercial y límites

La imagen y los storyboards contienen cifras y productos distintos del catálogo. La [matriz de fuentes](reference-source-matrix-20261101.md) conserva esas discrepancias y la autorización posterior: sin bebidas ni sándwiches, upsell de catálogo declinable, fidelidad al final cada 10 pedidos → 2 bagels + 1 schmear gratis. El upsell opcional de packs ofrece 120 g de Original S/12 o saborizado S/16, desde los campos del catálogo; no inventa dos bagels por S/12 ni descuentos.

El programa de fidelidad se presenta como pendiente. Seguimiento interno, idempotencia, verificación de pedidos/pagos y canje no están implementados por esta adaptación. No hay saldos, puntos, regalos ganados ni confirmación ficticia. No se ofrecen Apple/Google Wallet; GHL está en evaluación, sin nueva dependencia o promesa de integración.

Esta aplicación está fijada a `reviewOnly`: conserva campos de cliente, entrega y consentimiento para revisar el flujo, pero no monta Culqi, no consulta config/cotización ni escribe drafts de comercio. El botón de pago permanece desactivado. El precio final queda por confirmar, sin convertir precios pintados en importes cobrables. La confirmación real sigue requiriendo una fuente verificada postpago fuera de esta revisión.

## Evidencia ejecutada

| Etapa | Resultado y alcance |
| --- | --- |
| Build local | PASS: bundle Vite/Nitro, TypeScript, estructural 11/11, fallback manual 4/4, movimiento 14/14. [Log](qa/reference-image-storefront-20261101/build-6f765ce/README.md). Los casos heredados no acreditan Canvas en las rutas nuevas. |
| Entrada inicial histórica `fe4c3ec` | PASS focal y tres viewports: [resultados iniciales](qa/reference-image-storefront-20261101/all-viewports-fe4c3ec/README.md). Se conservan con su SHA original. |
| Entrada final `6f765ce`, 320/390/1280 px | PASS: tres vistas completas, nueve callbacks de categoría, objetivos efectivos de44px y focoTab, ceroCanvas, sin overflow del documento ni recorte de imagen. [Capturas y driver](qa/reference-image-storefront-20261101/zoom-final-6f765ce/README.md). |
| Recorrido completo en modo imagen | PASS en `6f765ce`: Packs/Combos/Schmears en 390 px, aceptar Original S/12 en 390 px y saborizado S/16 en 320 px, declinar pack en escritorio 1280 px; seis ejecuciones contando el foco de layout. Campos/consentimiento, pago desactivado, fidelidad pendiente, volver, editar carrito, progreso y menú. [Cinco recorridos completos](qa/reference-image-storefront-20261101/e2e-final-6f765ce/README.md) y [foco de layout](qa/reference-image-storefront-20261101/e2e-layout-6f765ce/README.md). No se atribuye la suite guiada histórica32/32 al código nuevo. |
| Suite Node y guardAPI | Node 58/58 PASS en `6f765ce`, cero skips. [Guard y fixture Nitro](qa/reference-image-storefront-20261101/api-guard-fe4c3ec/README.md) conservan SHA `fe4c3ec`: seis pruebas del guard, flag falso sólo en downstream ficticio, API real GET 503 con flag `true`. |
| Zoom/pan móvil | PASS final en320/390px: ampliar, desplazamiento táctil nativo en ambos sentidos y volver a fit/offset0/tres hotspots completos. La repetición espera ocho frames de scroll estable antes del tap. Se conserva el timeout inicial320 durante inercia y el [diagnóstico trusted pointer/click](qa/reference-image-storefront-20261101/zoom-diagnostic-320-6f765ce/README.md). En escritorio, zoom móvil no aplica. |
| Safari/dispositivos físicos | No ejecutado. |
| Pagos reales, creación de pedidos, canje o seguimiento de fidelidad | No ejecutado ni activado. |
| CI remoto/despliegue | No certificado; sin despliegue. |

Las pruebas de navegador permiten exclusivamente GETs locales de archivos de la aplicación. Registran y rechazan APIs, fetch/XHR, proveedores, POSTs, escrituras de almacenamiento o lecturas de drafts comerciales. TanStack realiza una lectura interna por documento de `sessionStorage.getItem('tsr-scroll-restoration-v1_3')` al importar su módulo; se conserva su stack y no se afirma cero lecturas. La restauración de scroll está desactivada para eliminar sus escrituras. El epoch inicial que exigía cero lecturas conserva su [FAIL literal](qa/reference-image-storefront-20261101/focal-390-4f5e568/README.md); el criterio posterior acepta únicamente esa lectura interna, sin relajar la prohibición de escrituras o acceso a comercio/proveedores.

## Preview descargable y local sin servicios

[ZIP listo para descomprimir y ejecutar](previews/reference-storefront-20261101/README.md). Incluye todos los assets y dependencias del build, sin instalación. 113 hashes internos verificados y probe real del ZIP en carpeta separada: HTML/imagen/assets 200, API 503/no-store; entrypoint directo conserva el bloqueo aun al recibir flag falso y host externo. No es un despliegue público.

El foco E2E detectó una superposición real del botón Volver sobre caja y alturas fijas heredadas en el formulario. `6f765ce` corrige la prioridad de estilos del modo referencia y deja paneles/resumen/CTA en el flujo natural; conserva el antes y después con rectángulos computados. También alinea los cinco nombres de progreso con categoría, selección, revisión y pago, preservando el mapping del modo anterior.

Compilar con `npm run build`. Iniciar una copia inmutable de `.output` con:

```sh
BAGELITO_REFERENCE_REVIEW_ONLY=true BAGELITO_MERCHANT_REVIEW_ONLY=true NITRO_HOST=127.0.0.1 NITRO_PORT=3208 node .output/server/index.mjs
```

Usar un puerto libre. No incorporar credenciales. Con `BAGELITO_REFERENCE_REVIEW_ONLY=true`, el middleware global responde 503/no-store en `/api` antes de handlers de DB/proveedores; sin esa variable el guard no altera los handlers existentes. Las pruebas de integración del guard usan downstreams ficticios; no se abre la API financiera real para demostrar su funcionamiento. La evidencia inicial usa el snapshot 3208/fe4c3ec. La aplicación actual `6f765ce` usa `/tmp/bagelito-reference-image-3209`, en `http://127.0.0.1:3209/`. El ZIP descomprimido se probó en loopback 3210 y su entrypoint directo en 3211.

`vercel.json` conserva `git.deploymentEnabled:false`. No se fusiona, despliega, cobra ni cambia producción, migraciones, campañas, credenciales, permisos o presupuestos.

El [manifiesto global](qa/reference-image-storefront-20261101/manifest.json) registra los hashes de capturas, JSON, drivers, logs, ZIP y fuentes, junto con el SHA de cada epoch. [Resumen legible por máquina](qa/reference-image-storefront-20261101/final-summary.json).
