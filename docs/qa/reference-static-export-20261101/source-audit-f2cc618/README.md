# Auditoría de fuente y export estático

Aplicación registrada: `6f765cee68f4c4d2f013a1082b497a73b5191bd7`. Exportador: `f2cc618ecfeaa52807cd8a1b3ee77121c972f94a`. Paquete auditado sin modificar: `/tmp/bagelito-reference-static-f2cc618`. No se ejecutó navegador ni build en esta auditoría.

**PASS de fuente, CSP y HTTP estático.** El inventario contiene 83 archivos: 82 archivos declarados más el propio manifiesto. Los 82 tamaños/hashes coinciden. Los 79 assets públicos copiados, incluidos seis JS y dos CSS, coinciden byte por byte con el artefacto de aplicación conservado. No se encontraron carpetas/archivos de servidor, API, entorno, DB, TypeScript, node_modules ni symlinks.

La imagen aprobada conserva SHA-256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`. Se conserva el WebP local; esto no acredita identidad de bytes con otro JPEG.

## CSP y HTML

- Las tres páginas tienen CSP como primer nodo de head, antes de los recursos. Cada página permite sus dos scripts inline mediante hashes SHA-256 que coinciden exactamente con su texto.
- JavaScript permite self y esos hashes: no usa unsafe-inline ni unsafe-eval. connect-src, form-action, frame-src, object-src, worker-src, base-uri y script-src-attr están en none.
- style-src conserva unsafe-inline, necesario para los estilos/porcentajes existentes; esta auditoría no lo presenta como una política sin estilos inline.
- Retirar únicamente los metadatos CSP y referrer reconstruye el hash de HTML SSR original registrado en las tres páginas. No se modificaron markup, scripts, hidratación, JS o CSS.

## GET loopback comprobados

| Ruta solicitada | Resultado | Evidencia |
| --- | --- | --- |
| `/` | 200 | Bytes iguales a `index.html` exportado |
| `/legal` | 301 → `/legal/` → 200 | Bytes iguales a `legal/index.html` |
| `/playable` | 301 → `/playable/` → 200 | Bytes iguales a `playable/index.html` |
| `/api/batch` | 404 | Archivo ausente; no endpoint API en el servidor Python |

Las solicitudes fueron exclusivamente GET a 127.0.0.1:3212. Los redirects se comprobaron manualmente y sólo dentro del mismo origen. No hubo Set-Cookie, POST ni llamadas externas.

## Dependencias y límites de la evidencia

El paquete requiere un servidor HTTP/HTTPS de archivos en la raíz del origen, MIME correcto para módulos y soporte de índices de directorio. No requiere Nitro, Node, variables de entorno, DB ni proveedor para servir estas páginas de revisión. No se afirma compatibilidad con file:// o con montaje bajo un subpath sin adaptar las rutas absolutas.

Los JS sí conservan strings y funciones dormantes de Culqi, APIs y WhatsApp por imports estáticos del código original. La ruta activa fuerza reviewOnly/referenceMode y omite sus efectos/transacciones; el export además aplica connect-src none y no contiene endpoints. Esto no equivale a «cero código de pagos» ni a habilitar pagos, reservas, Wallet o fidelización real.

La CSP debe conservarse y los scripts inline no deben ser reescritos/minificados sin recalcular sus hashes. La auditoría no cubre transformaciones, scripts o medición que un hosting pudiera añadir. No se accedió a hosting ni se publicó el paquete.

Esta revisión de archivos y GET no ejecuta la hidratación ni los botones. La validación interactiva de navegador se realiza por separado en el hilo padre.

## Archivos de evidencia

- [Inventario y hashes](file-inventory.json) y [notas de inventario](inventory-notes.md).
- [CSP y GET con hashes](csp-http-audit.json), [script de auditoría](audit-static.cjs) y [log](audit-static.log).
- [Manifiesto original byte idéntico](static-export-manifest.original.json).
- `http-index.body`, `http-legal.body`, `http-playable.body` y `http-api-batch.body` preservan los cuerpos HTTP observados.
