# QA del export estático f2cc618

Aplicación original inmutable `6f765cee68f4c4d2f013a1082b497a73b5191bd7`, exporter `f2cc618ecfeaa52807cd8a1b3ee77121c972f94a`. Origen estático real `http://127.0.0.1:3212/`, servidor Python de archivos simples, sin API ni SSR en ejecución. Original Node usado para la pareja de datos: `http://127.0.0.1:3210/`. No se cambió código de aplicación.

**Funcional PASS**: los mismos seis recorridos que Node (focal390 + cinco E2E), zoom/pan/revert nativo320/390, imagen completa y nueve callbacks entre320/390/1280. E2E incluye Packs con extra120gS/12/S/16 aceptado o declinado, Combo2bagels+1schmear requerido, Schmear180g, edición/carrito/progreso/menú, datos ficticios, consentimiento, botón de pago desactivado y fidelidad pendiente sin Wallet.

| Etapa | Resultado | Capturas | Lecturas internas |
| --- | --- | ---: | ---: |
| focal-390 | PASS | 12 | 2 |
| e2e/combo-390 | PASS | 9 | 1 |
| e2e/schmear-390 | PASS | 9 | 1 |
| e2e/pack-original-390 | PASS | 15 | 1 |
| e2e/pack-flavoured-320 | PASS | 15 | 1 |
| e2e/pack-decline-1280 | PASS | 13 | 1 |
| zoom-final | PASS | 11 | 9 |
| dom-parity/node-3210 | PASS | 12 | 2 |
| dom-parity/static-3212 | PASS | 12 | 2 |

## Legal real y seguridad

El enlace original `términos vigentes`, target_blank yrel=noreferrer, abrió una pestaña real. El servidor estático respondió301 a `/legal` y el navegador siguió `/legal/`,200, con encabezado y ocho secciones legales reales; ventanaopenernull. La excepción del guard se limita al redirectGETmismo origen `/legal`→`/legal/` con destino exacto. No se simularon navegación, contenido ni controles.

CeroAPI/fetch/XHR/POST/proveedores/escrituras, errores de página/hidratación o intentos CSP. Sólo se registra el getItem interno TanStack exacto `tsr-scroll-restoration-v1_3`, máximo uno por documento; no se afirma cerolecturas. La instrumentación del focal y la parejaDOM incluye la nueva pestaña, y se drena su descarga antes de cerrar. Canvas0, sinWebGL/HDR/GPUacelerada, sinSafari/install ni credenciales.

## Datos y píxeles: resultados distintos

**Datos observados PASS**: una única pareja serial Node3210/estático3212 con la misma función captura cinco snapshotsDOM. Selección/contador/precios opcionales/resumen/campos/consentimiento/pagodisabled/fidelidad coinciden; texto legal completo, ocho secciones yopenernull coinciden. Ver dom-parity/observed-data-parity.json. Estas dos ejecuciones adicionales son comparación de datos, no se suman a los seis recorridos de regresión.

**Identidad base PASS**: el GET realmente pintado conserva SHA256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`; las nueve capturas de entrada comparadas tienen cero píxeles RGB distintos.

**Igualdad RGB estricta de todos los estados FAIL, conservado**:83 pares,67idénticos y16con diferencias; cero dimensiones distintas. Delta máximo no-pan32/255. Una captura de pan320 difiere en la posición de la imagen desplazada y alcanza255/255; los reportes conservan bbox yconteos, sin realinear, máscaras, resize ni cambiar umbrales. No se promete identidad pixelperfect de todos los estados UI ni se sustituye este FAIL por el PASS funcional/DOM. El primer reporte focal se enlaza desde artifact-probe-f2cc618 para no duplicarlo.

Los datos y el píxel se distinguen expresamente; estas pruebas Chromium151 no constituyen validación física en iPhone/Safari. La funcionalidad demostrada es un export servido por HTTP estático; no se afirma que el gestorArchivosde iOS ejecute JavaScript al abrir unHTMLdescargado.

## Reproducción e integridad

sources/ conserva exactamente los drivers yhelpers usados, sin nuevas dependencias. BASE_URL cambia únicamente el origen; QA_CODE_SHA declara la app6f y QA_EXPORT_SHA el exportf2cc. JSON,PNG ystdout se copian sin modificar. SHA256SUMS cubre todos los archivos de esta carpeta. La vista original Node y su evidencia permanecen en reference-image-storefront-20261101.
