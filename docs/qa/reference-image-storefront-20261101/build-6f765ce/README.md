# Build final y pruebas Node

Aplicación `6f765cee68f4c4d2f013a1082b497a73b5191bd7`. `npm run build` PASS/exit0: Vite/Nitro, TypeScript, estructural11/11, manual4/4 y movimiento14/14. [Log literal](build.log).

`QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs`: **58/58 PASS, cero fallos/skips**. [Log](node-tests.log). Incluye seis pruebas del guard de revisión. Los casos heredados de movimiento/drivers siguen siendo pruebas de sus módulos; no acreditan un juego o un Canvas en las rutas nuevas.

Se conserva también un [intento con entorno incompleto](node-tests-missing-fixture-env.log), exit1: los tres archivos de drivers exigieron `QA_HDR_FIXTURE_PATH`, que no se había pasado. No se modificaron sus asserts; se repitió con el HDR local previamente aprobado y su SHA esperado. No hubo browser, descargas, solicitudes a proveedores ni ejecución de pagos en estas pruebas Node.

Resultados locales; no certifican CI remoto ni un despliegue.
