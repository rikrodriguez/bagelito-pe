# Tienda sobre la imagen aprobada — revisión del 1 de noviembre

Ricardo reemplazó el objetivo 3D por «Ya olvidate del juego etc. Quiero esa misma imagen». Las rutas `/` y `/playable` ahora presentan el WebP aprobado como imagen real, con botones nativos transparentes sobre Packs, Combos, Schmears, menú, carrito y progreso. No cargan Canvas ni avatar. Los controles de selección existentes se abren debajo de la imagen, usando el catálogo y los callbacks del flujo anterior.

## Código e imagen

- Aplicación actual: `6f765cee68f4c4d2f013a1082b497a73b5191bd7`. La primera evidencia de entrada conserva su SHA anterior `fe4c3ec460a9fb7bdd33cd2e6ebaec8156db9ecc`.
- Entrada visual: `public/images/store-reference-approved.webp`,1536×1024, SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`. El asset no fue modificado. No se afirma identidad de bytes con el JPEG del hilo padre.
- Trabajo 3D preservado en `archive/pr45-guided-3d-20261101`, commit `6513faf82420bea0fb1952185615fa5ab1493301`; no se siguió refinando.
- Adaptación desarrollada en `feat/reference-image-storefront-20261101`, descendiente de `a47c65f0f1c92edf23fed4d48db17d8c6cf7b37a`. Se mantiene el mismo PR45 en borrador; no hay un nuevo PR ni despliegue.

En escritorio la imagen se ajusta completa con proporción3:2. En móvil se muestra completa por defecto, con una opción explícita para ampliar a720px y recorrer horizontalmente. No se promete que todo el texto de1536px resulte legible reducido a320px. Los hotspots tienen área efectiva mínima44×44 y foco nativo visible. Sólo el carrito/progreso cambian de presentación al haber selección para reflejar datos reales sin duplicar los controles dibujados.

## Flujo comercial y límites

La imagen y los storyboards contienen cifras y productos distintos del catálogo. La [matriz de fuentes](reference-source-matrix-20261101.md) conserva esas discrepancias y la autorización posterior: sin bebidas ni sándwiches, upsell de catálogo declinable, fidelidad al final cada10pedidos→2bagels+1schmear gratis. El upsell opcional de packs ofrece120g de Original S/12 o saborizado S/16, desde los campos del catálogo; no inventa dos bagels porS/12 ni descuentos.

El programa de fidelidad se presenta como pendiente. Seguimiento interno, idempotencia, verificación de pedidos/pagos y canje no están implementados por esta adaptación. No hay saldos, puntos, regalos ganados ni confirmación ficticia. No se ofrecen Apple/Google Wallet; GHL está en evaluación, sin nueva dependencia o promesa de integración.

Esta aplicación está fijada a `reviewOnly`: conserva campos de cliente, entrega y consentimiento para revisar el flujo, pero no monta Culqi, no consulta config/cotización ni escribe drafts de comercio. El botón de pago permanece desactivado. El precio final queda por confirmar, sin convertir precios pintados en importes cobrables. La confirmación real sigue requiriendo una fuente verificada postpago fuera de esta revisión.

## Evidencia ejecutada

| Etapa | Resultado y alcance |
| --- | --- |
| Build local | PASS: bundle Vite/Nitro, TypeScript, estructural11/11, fallback manual4/4, movimiento14/14. [Log](qa/reference-image-storefront-20261101/build-6f765ce/README.md). Los casos heredados no acreditan Canvas en las rutas nuevas. |
| Imagen/hotspots 390px focal | PASS: imagen exacta, tres callbacks comerciales, controles44px, focoTab, ceroCanvas. [Resultados](qa/reference-image-storefront-20261101/focal-390-fe4c3ec/README.md). |
| Imagen/hotspots 320/390/1280px | PASS: tres vistas completas, nueve callbacks de categoría, sin overflow del documento ni recorte de imagen. [Capturas y driver](qa/reference-image-storefront-20261101/all-viewports-fe4c3ec/README.md). |
| Recorrido móvil Packs→caja→entrega | PASS focal en6f765ce: upsell120g seleccionar/quitar, declinar, resumen6Plain, campos y consentimiento, pago desactivado y fidelidad pendiente. La ejecución de otros caminos continúa por separado. [Capturas/medidas](qa/reference-image-storefront-20261101/e2e-layout-6f765ce/README.md). No se atribuye la suite guiada histórica32/32 al código nuevo. |
| Suite Node y guardAPI | Node58/58 PASS en6f765ce, cero skips. [Guard y fixture Nitro](qa/reference-image-storefront-20261101/api-guard-fe4c3ec/README.md) conservan SHAfe4c3ec: seis pruebas del guard, flag falso sólo en downstream ficticio, API real GET503 con flag true. |
| Safari/dispositivos físicos | No ejecutado. |
| Pagos reales, creación de pedidos, canje o seguimiento de fidelidad | No ejecutado ni activado. |
| CI remoto/despliegue | No certificado; sin despliegue. |

Las pruebas de navegador permiten exclusivamente GETs locales de archivos de la aplicación. Registran y rechazan APIs, fetch/XHR, proveedores, POSTs, escrituras de almacenamiento o lecturas de drafts comerciales. TanStack realiza una lectura interna por documento de `sessionStorage.getItem('tsr-scroll-restoration-v1_3')` al importar su módulo; se conserva su stack y no se afirma cero lecturas. La restauración de scroll está desactivada para eliminar sus escrituras. El epoch inicial que exigía cero lecturas conserva su [FAIL literal](qa/reference-image-storefront-20261101/focal-390-4f5e568/README.md); el criterio posterior acepta únicamente esa lectura interna, sin relajar la prohibición de escrituras o acceso a comercio/proveedores.

## Preview descargable y local sin servicios

[ZIP listo para descomprimir y ejecutar](previews/reference-storefront-20261101/README.md). Incluye todos los assets y dependencias del build, sin instalación.113 hashes internos verificados y probe real del ZIP en carpeta separada: HTML/imagen/assets200, API503/no-store; entrypoint directo conserva el bloqueo aun al recibir flag falso y host externo. No es un despliegue público.

El foco E2E detectó una superposición real del botón Volver sobre caja y alturas fijas heredadas en el formulario.6f765ce corrige la prioridad de estilos del modo referencia y deja paneles/resumen/CTA en el flujo natural; conserva el antes y después con rectángulos computados. También alinea los cinco nombres de progreso con categoría, selección, revisión y pago, preservando el mapping del modo anterior.

Compilar con `npm run build`. Iniciar una copia inmutable de `.output` con:

```sh
BAGELITO_REFERENCE_REVIEW_ONLY=true BAGELITO_MERCHANT_REVIEW_ONLY=true NITRO_HOST=127.0.0.1 NITRO_PORT=3208 node .output/server/index.mjs
```

Usar un puerto libre. No incorporar credenciales. Con `BAGELITO_REFERENCE_REVIEW_ONLY=true`, el middleware global responde503/no-store en `/api` antes de handlers de DB/proveedores; sin esa variable el guard no altera los handlers existentes. Las pruebas de integración del guard usan downstreams ficticios; no se abre la API financiera real para demostrar su funcionamiento. La evidencia inicial usa el snapshot3208/fe4c3ec. La aplicación actual6f765ce usa `/tmp/bagelito-reference-image-3209`, en `http://127.0.0.1:3209/`. El ZIP descomprimido se probó en loopback3210 y su entrypoint directo en3211.

`vercel.json` conserva `git.deploymentEnabled:false`. No se fusiona, despliega, cobra ni cambia producción, migraciones, campañas, credenciales, permisos o presupuestos.
