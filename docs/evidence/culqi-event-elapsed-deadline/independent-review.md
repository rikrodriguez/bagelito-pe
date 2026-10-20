Alcance: revisión independiente exclusivamente de lectura, realizada el 20 de octubre de 2026. No se ejecutaron pruebas, navegador, llamadas remotas ni tareas de CPU intensivas. Este documento es el único archivo escrito por esta tarea; no se modificaron fuentes, tests, secretos ni otros worktrees, y no hubo commit ni upload.

Se revisó el diff contra `b21e8217b7379c70bb86621f918f9fb936376ce3` en `/workspace/bagelito-culqi-deadline-review`. Conclusión: **apruebo el fix mínimo; no encontré hallazgos bloqueantes. Las dos actualizaciones cierran las observaciones revisadas.**

`src/lib/payments/culqi.ts:228–235` calcula y comprueba el vencimiento con `performance.now()`. La comprobación del tiempo transcurrido ya no depende de ajustes del reloj civil. Tanto el plazo absoluto como el timer conservan el presupuesto de 10 000 ms y el límite inclusivo de rechazo (`>=`). Las guardas antes de fetch, después de headers, después de JSON y antes de devolver el evento permanecen presentes (`:107`, `:118`, `:120`, `:256`). La expiración aborta con el mismo `TimeoutError`; el `finally` conserva `clearTimeout(timer)` (`:267–268`).

El nuevo caso `tests/payments/culqi-event-lookup.test.mjs:162–178` cubre el hueco señalado en la revisión anterior: el cuerpo devuelve el evento dentro del presupuesto, pero tres microtasks encoladas consumen el tiempo antes de aceptar el resultado de las continuaciones. La prueba modifica el reloj inyectado por orden de la cola de promesas, sin contar llamadas al reloj ni sustituir las funciones de producción. Por la secuencia de `json().catch`, sus continuaciones y `Promise.race`, el avance a 10 001 ms sucede después de la continuación de JSON y antes del retorno final. El caso exige respuesta segura 500, clasificación de timeout, señal abortada y cero accesos de cliente DB/RPC mediante `assertSafeFailure`. Así ejercita la guarda final que los casos de headers y cuerpo tardíos no aislaban.

Las regresiones de headers/cuerpo a 10 000 y 10 001 ms y sus controles a 9999 ms siguen presentes, al igual que los casos de transporte estancado y limpieza del timer. Las pruebas nuevas mantienen la prohibición de leer el cuerpo cuando los headers ya llegaron vencidos y de continuar a SQL tras el resultado rechazado. El coordinador comunicó **129 pruebas dirigidas PASS** para esta versión. Esta revisión no repitió esa ejecución; su evidencia propia es la inspección del diff y de las fuentes.

El callback de presupuesto sólo se proporciona desde `fetchCulqiEvent`. Se compararon los bytes de la sección `createCulqiCharge` y de los headers compartidos de fetch contra la base: permanecen idénticos. Los únicos archivos versionados modificados son el cliente Culqi y su test de lookup. La configuración de entornos, headers del contrato SDK, validación de identidad, handler/RPC, SQL, catálogo y precios no cambian. Este defecto de aceptación tardía no demuestra ni explica la causa del 400 histórico del proveedor.

Vinculación de fuentes revisadas:

| Archivo | SHA256 |
| --- | --- |
| `src/lib/payments/culqi.ts` | `644a1ee1df7a6b94750772eddb250e1b041297ec6ae1437b39cc9bb7ed762dc3` |
| `tests/payments/culqi-event-lookup.test.mjs` | `65ef6f0072ea079e5c004b6d7e2d898ba176a386ebc88b4aa0b689880487bbb3` |

La cobertura examinada usa transporte, reloj y DB simulados con las funciones reales del cliente y handler; no constituye una llamada al proveedor ni una ejecución de SQL real. No quedan observaciones bloqueantes dentro del alcance del parche.
