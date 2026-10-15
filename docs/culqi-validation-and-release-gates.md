# Validación pendiente y condiciones para producción

Revisión del 15 de octubre de 2026, a partir de PR4 y del commit
`c462ec864a8cbecf23fe552045678788a9f80afc`. El Preview conocido
`dpl_3iJJG6T6y6dEfJ6oFJ19EqjsAVv9` sirve ese commit. La corrección del plazo de
status descrita aquí pertenece a la rama de PR4; no se ha desplegado en ese Preview.
PR4 continúa en borrador. Las pruebas siguientes usan datos ficticios y mocks,
sin CulqiPanel, llamadas reales al proveedor, reenvíos ni escrituras remotas.

## Cobertura existente y ampliación

La CI exacta de c462 pasó: [ejecución 38671628037](https://github.com/rikrodriguez/bagelito-pe/actions/runs/38671628037).
Incluye 493 pruebas Node, lint/build/types, límites HTTP locales y transacciones
PostgreSQL aisladas. Ya estaban cubiertos recarga con recuperación pendiente,
persistencia mínima sin tokens/datos del cliente, bloqueo de otro cobro,
deadline de charge, respuestas tardías, callbacks obsoletos, continuidad 3DS,
capacidad, pagos tardíos cancelados y migraciones/replay. Las pruebas HTTP/SQL
locales y los mocks no certifican entrega de callbacks ni comportamiento del banco.

La ampliación ejecuta los callbacks reales de ReservationFlow con hooks, SDK,
storage, reloj y fetch ficticios en `tests/payments/checkout-review.test.mjs`:

- Cuatro regresiones de status automático/manual con cabeceras o cuerpo que
  ignoran AbortSignal. Reprodujeron el fallo en c462: la espera no terminaba por
  sí misma. Ahora cabeceras y JSON comparten un plazo máximo de 20 segundos.
  El caso del cuerpo consume primero 12 segundos en cabeceras y conserva sólo
  ocho para JSON; no reinicia el plazo.
- Una regresión del presupuesto de 60 segundos del sondeo automático: después
  de tres lecturas pendientes de 19 segundos, la cuarta dispone de tres segundos.
- Doce casos de error automático/manual: transporte, JSON inválido, HTTP 429/503
  con un body que afirma paid, JSON null y flags con tipos incorrectos. Ninguno
  libera la referencia pendiente, permite otro checkout, filtra el error crudo
  o crea otra reserva/cobro simulado al recargar.

Al vencer el plazo automático se conserva el mismo pedido en revisión. La
consulta manual vuelve a estar disponible tras su propio timeout, sin liberar
el bloqueo. Una respuesta paid que llegue tarde se ignora; una consulta nueva
verificada del mismo pedido puede resolverlo. No se altera el plazo de charge,
la RPC, el modelo financiero, la política QA GET ni la configuración de hosting.

Validación local de esta ampliación: **48/48** pruebas dirigidas de recuperación,
**510/510** en la suite completa, build con comprobación de tipos exitoso y lint
sin errores. Lint conserva un aviso anterior de no-unused-expressions en
`tests/payments/culqi-readonly-adapter.test.mjs:99`; ese archivo no se modificó.
Las cuatro regresiones de timeout fallaron antes de la corrección y pasaron
después. Se reutilizaron las dependencias ya instaladas del mismo lockfile, sin
instalar paquetes nuevos. La CI del nuevo SHA debe comprobarse por separado.

## Evidencia todavía necesaria

| Condición | Evidencia existente | Qué falta exactamente |
| --- | --- | --- |
| Webhook sandbox real | GET recovery confirmó cargos QA; diagnósticos acotados y mocks pasan | Una entrega real de un evento existente al callback canónico, verificado contra el comercio/cargo QA, que termine en stage=transaction, eventVerified=true, transactionAttempted=true, httpStatus=200 y reason=applied/duplicate; invariantes agregados antes/después. |
| Salud HTTP en hosting | Vercel reportó c462 READY; el build pasó | Una respuesta real de health y comprobaciones del deployment por acceso permitido. CONNECT403/ERR_BLOCKED_BY_CLIENT anteriores no son respuestas de la app. READY y ausencia de logs no prueban salud funcional. |
| Tarjeta/3DS y rechazo reales | SDK/mount, callbacks, interrupciones, errores y SQL probados con fixtures; control QA requires_3ds pendiente | Completar y registrar la autenticación bancaria y los escenarios de rechazo/expiración pertinentes mediante un plan sandbox separado. No se generan cargos para esta revisión. |
| Commit completo de release | PR4 conserva dependencias/core y protección de checkout/replay | Elegir y revisar un SHA de release con esta corrección, dependencias y módulos QA cerrados en producción; CI terminal del SHA exacto para el destino de release/main. El workflow actual sigue limitado a ramas draft. |
| Esquema de producción | Ensayo core-only y rollback DDL/SQL aislados; QA recibió sólo el guard forward | Inventario autorizado del esquema instalado, contratos/ACL/propietarios, colisiones y backfills, manifiesto de migración y respaldo/reversión del delta real. No se ha leído ni modificado la BD de producción aquí. |
| Configuración live y admin | Inventario histórico de presencia de nombres; gates sandbox cerrados fuera de QA | Validación segura del proyecto/origen, secretos admin, asociación comercio/modo de claves y RSA, coherencia build/runtime y configuración live en hosting. Las ausencias del inventario anterior no se han revalidado en esta revisión. |
| Rollback operativo | Core retenido permite cerrar intake y confirmar pagos en vuelo; main antiguo es incompatible | Seleccionar y certificar el binario concreto y su ruta HTTP con el esquema de destino; revisión y autorización del procedimiento operativo. No restaurar snapshots financieros ni liberar intentos inciertos para volver atrás. |

La política GET de recuperación QA y sus migraciones no se promueven a live.
`CULQI_STATUS_RECOVERY_APPROVED` debe permanecer ausente/false en Production.
La preparación del core se guía por
[el procedimiento de migraciones y rollback](culqi-core-migrations-and-compatible-rollback.md):
preflight para primera instalación; migración forward si el core existe.
No se reaplican los backfills históricos sobre una instalación existente.
Deshabilitar CULQI_ENABLED también corta status/webhook y no es por sí solo un
procedimiento para confirmar pagos ya iniciados.

## Próximo bloqueo mínimo

CulqiPanel muestra pantalla blanca en cloud y Safari; soporte del proveedor
debe recuperar ese acceso. No se reintenta desde esta revisión. Después deberá
comprobarse en el registro del evento que el único reenvío autorizado no ocurrió
ya ni dejó un resultado incierto antes de ejecutarlo. No se conoce todavía un
ID legítimo de evento seleccionado; no se fabrica ni se sustituye por un cargo nuevo.

Destino fijo aprobado, sin cambiar la configuración del proveedor:
`https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/api/webhooks/culqi`.
El primer procesamiento puede insertar el marcador del evento, por lo que ese
paso futuro no es de sólo lectura. La revisión actual no reenvía nada. La activación
live requiere cerrar todas las condiciones anteriores y una decisión separada.
