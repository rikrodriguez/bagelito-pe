# zoom-first-6f765ce

FAIL conservado:390pan/revertPASS,320panPASS pero el primer tap de colapsar no activó el botón; timeout10s. Desktopfoto/callbacksPASS. No se presenta como aceptación final.

Aplicación inmutable `6f765cee68f4c4d2f013a1082b497a73b5191bd7`,3209. Resultado original `failed` y1fallos, conservado sin modificar. Source exacto en driver-frozen.cjs/zoom-helper-frozen.cjs; cada PNG tiene hash enJSON ymanifiesto.

Criterios constantes: foto1536×1024debytesexactosSHA0df3c229…, ampliar a≥720px, panCDPInput.dispatchTouchEvent en ambasdirecciones con≥64pxde margen interior ydelta>20px, mismaURL/escena, sin overflowdocumento; revertir exige offset0, foto completa3:2 y3hotspots44pxcompletos/hittables. Enmodoampliado no se exige ver3tarjetassimultáneamente porque su span supera320px.

El primer epoch usaba una pausa fija180ms despuésdelpan. El diagnóstico registra que seguía habiendo inercia y añade espera de8framesestables antes del único tapdecolapso; conserva todos los asserts originales yregistra eventos nativos trusted. Esto es compatible con supresión nativa deltapduranteinercia; no se modificó la aplicación ni se atribuye al código una corrección inexistente.

La repetición final comprueba además imagen exacta completa,44px/focoTab ylos3callbacks comerciales porviewport; el E2E de selección/consentimiento/pago desactivado queda separado en e2e-final-6f765ce yelfocal e2e-layout-6f765ce. No denominar estas comprobaciones suiteguiada32.

Safety: ceroAPI/fetch/XHR/POST/proveedores/escrituras y ninguna lectura de aplicación. Sólo se permite el par interno sessionStorage/getItem exacto tsr-scroll-restoration-v1_3, máximo1pordocumento, con stacks. Se informa esa lectura yno se afirma cerolecturas. Canvas0, sinWebGL/HDR niGPUacelerada ni deploy/pago. EmulaciónChromium151, no validación física/Safari.

JSON/stdout/PNG se copian sin alterar; SHA256SUMS incluye todos los archivos.
