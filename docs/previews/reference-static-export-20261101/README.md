# Tienda de referencia — archivos estáticos

[Descargar ZIP estático](bagelito-reference-static-f2cc618.zip) —8.511.068 bytes,83archivos. La raíz del ZIP contiene `index.html`, `assets/`, imágenes y las páginas `legal/index.html` y `playable/index.html`. No incluye un servidor ni requiere Node para verlo una vez alojado.

SHA256 del ZIP: `7eb870e0630ee3b5fbd904370d554ae55bc8978cd8919b9c44f8c55a2896864d`.

Aplicación original: `6f765cee68f4c4d2f013a1082b497a73b5191bd7`; exporter: `f2cc618ecfeaa52807cd8a1b3ee77121c972f94a`. [Manifiesto de la exportación](static-export-manifest.json) con82hashes de archivos y el antes/después de los3HTML. El asset aprobado y los bundlesJS/CSS siguen byte idénticos al build Node original.

Descomprimir en la raíz de un origen HTTP/HTTPS con MIMEJS/CSS correctos e índices de directorio. Las rutas usan URLs absolutas: no abrir por `file://` ni alojar bajo un subdirectorio sin ajustar el montaje. Para revisar localmente:

```sh
python -m http.server 4174 --bind 127.0.0.1 --directory /ruta/al/zip-descomprimido
```

Abrir `http://127.0.0.1:4174/`. El padre decidirá un alojamiento privado accesible desde iPhone; este trabajo no crea un sitio ni cambia permisos o privacidad. El ZIP no es, por sí solo, un enlace web alojado.

Es la misma selección de catálogo, cantidades, upsells, resumen, entrega/consentimiento y fidelidad pendiente del flujo original. Conserva el pago desactivado. No tiene endpointsserver/DB/pagos; `/api/batch` es404 en el servidor de archivos. CSPbloquea conexiones, formularios yframes; permite los scripts propios y hashes exactos del bootstrap. No ofrecer Wallet ni integraciónGHL, no inventar saldo o pedido confirmado.

[Reporte, comandos reproducibles y límites](../../reference-static-export-20261101.md). No se transfiere un PASS de Chromium a Safari/iPhone físico. El acceso privado y las cabeceras del futuro hosting pertenecen a una etapa posterior.
