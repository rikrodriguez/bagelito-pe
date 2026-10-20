# Culqi: aceptación del evento dentro de su presupuesto

Base local: `b21e8217b7379c70bb86621f918f9fb936376ce3` (PR13). Corrección registrada en el commit local `4102a1d1fedb78f09ea16ebb01bb5367d9bc05e3`, rama separada `local/culqi-event-deadline-review`, worktree `/workspace/bagelito-culqi-deadline-review`. El worktree del PR13 permanece intacto. No explica ni corrige el HTTP 400 histórico de Culqi.

## Defecto local reproducido

`fetchCulqiEvent` tenía un temporizador de diez segundos y `Promise.race`, pero no comprobaba el tiempo transcurrido al aceptar cabeceras o JSON. Si el callback del temporizador quedaba demorado y la respuesta se resolvía antes de ejecutarlo, el cliente aceptaba un resultado cuyo presupuesto había vencido.

Cuatro regresiones ejecutan el cliente y el handler reales con transporte, configuración, reloj y RPC sintéticos: cabeceras y cuerpo que llegan a los 10.000 o 10.001 ms, manteniendo pendiente el callback del timer. Antes del cambio devolvían HTTP 200 donde se esperaba el fallo acotado HTTP 500. Los controles a 9.999 ms verifican que una respuesta aún vigente sigue siendo aceptada.

Una quinta regresión reproduce la espera de continuaciones encoladas después de resolver el cuerpo: el tiempo vence antes de aceptar el resultado. No cuenta llamadas internas al reloj ni copia la lógica del cliente. El reloj monotónico del fixture avanza por separado del scheduler de timers.

La corrección comprueba el mismo presupuesto con `performance.now()` antes del transporte, tras cabeceras/JSON y antes de devolver el resultado. Al vencer aborta la señal propia y conserva `TimeoutError`; el handler responde con su diagnóstico de timeout existente antes de verificar identidad o abrir DB/RPC. El timer se limpia también cuando la comprobación detecta el vencimiento. Esto impide aceptar resultados tardíos; no promete devolver una respuesta mientras el event loop esté bloqueado.

Se conservan los diez segundos, headers, URL, mapeo sandbox→test, errores HTTP normales y contratos de cargos. El callback interno de presupuesto sólo se suministra en la lectura del evento. No se modifican checkout, 3DS, coordinador, políticas financieras, RPC, SQL, credenciales, flags o despliegues.

## Validación local

Se ejecutaron pruebas con `env -i`, valores sintéticos y guard de red; no se cargaron secretos del proceso ni dotenv. Se reutilizó exclusivamente `/tmp/bagelito-pr13-check-37hz8hfi/node_modules` mediante un directorio local de enlaces, ignorado por Git, tras cotejar el SHA-256 del lockfile: `d6829f902e695d2434e92198f413d41200a8ec8b3a44021c8826e1ab473471f5`. No hubo instalaciones.

Validación final del reloj monotónico: **597/597** pruebas Node y **129/129** dirigidas, sin fallos ni omisiones; tipos correctos; lint sin errores y con la advertencia previa de `culqi-readonly-adapter.test.mjs:99`. El guard de red registró 82 cargas y cero intentos bloqueados durante los comandos de esta auditoría. No se ejecutó build ni PostgreSQL.

Los comandos, hashes, RED/GREEN y logs se conservan en [implementation-validation.json](evidence/culqi-event-elapsed-deadline/implementation-validation.json) y sus artefactos; la [revisión independiente](evidence/culqi-event-elapsed-deadline/independent-review.md) no encontró bloqueos. La copia completa de trabajo permanece fuera del repositorio en `/workspace/bagelito-pending-audit/culqi-followup-20261020/independent-review/`. Las pruebas sustituyen transporte y DB; no acreditan aceptación del proveedor, entrega real, locks de PostgreSQL ni ejecución remota.

## El HTTP 400 histórico sigue sin causa probada

La [evidencia anterior](culqi-webhook-confirmation-checkpoint.md) registra tres ejecuciones del 16 de octubre a las 03:50:11.104, 03:50:12.485 y 03:50:13.865 UTC: `event_lookup`, upstream `400/parameter_error`, respuesta local 500, `eventVerified=false`, `transactionAttempted=false`. Los registros omiten IDs y payloads deliberadamente. No permiten determinar qué evento, cargo, comercio o parámetro causó el rechazo.

El cliente actual ya envía GET `/v2/events/{id}` con Bearer, JSON, `x-api-version: 2` y entorno test/live. Los casos que fabrican HTTP 400 al omitir headers son fixtures, no observaciones del servidor de Culqi. `eventModeMatchesConfig` sólo compara prefijo del ID y modo configurado; no verifica el comercio, la clave ni la existencia del evento.

La lectura de metadata realizada por root el 20 de octubre identificó el Preview canónico en `dpl_9RoAm1RKYe364jSV1iGbrwQf4MZS`, READY, SHA `d45c71cf9e242469c7171debdb756c1c527b63b9`, en proyecto y rama originales. Identifica el destino existente; no demuestra que este parche o PR13 estén desplegados ni acredita entrega del webhook.

La consulta autorizada de Runtime Logs, proyecto `prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0`, team `team_EWhRYzkxyiCVNnh43fCf4Dcb`, Preview, ventana `2026-10-16T03:49:30Z`–`03:51:00Z`, query `culqi_webhook_diagnostic`, devolvió **Vercel HTTP 400 bad_request** por retención del plan Hobby. Ese rechazo de la API de logs es distinto del 400 de Culqi y no aportó nuevos registros. No se ampliaron ventana, permisos o plan ni se consultaron valores de entorno.

Falta evidencia legítima del mismo comercio sandbox: ID/tipo del evento existente, vínculo con el cargo/fecha esperado, asociación merchant/test, destino exacto e historial de entregas, y parámetro o contrato rechazado por el GET. La [ruta canónica documentada](culqi-validation-and-release-gates.md) termina en `/api/webhooks/culqi`. Una lectura normal de Eventos/Webhooks en la cuenta ya autorizada puede aportar esa trazabilidad si el panel vuelve a estar disponible; no exige generar otro cargo ni nuevas claves. Si sigue en blanco y no existe una exportación previa autorizada, ese acceso continúa pendiente. No se contacta a terceros ni se reenvían eventos en esta revisión.

No se ha comprobado una ausencia actual de credenciales. Los diagnósticos privados existentes `culqi_readonly_dryrun`, si fueron guardados, pueden acotar alcance y cotejos, pero omiten los IDs y el parámetro rechazado y no acreditan exhaustividad ni asociación merchant independiente. Esta revisión no pulsa acciones administrativas ni hace POST de negocio para generar registros nuevos.

## Fuentes oficiales revisadas

- [Culqi: webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/): eventos del comercio y acceso normal a Eventos/Webhooks.
- [Culqi: integración frente a producción](https://docs.culqi.com/es/documentacion/pagos-online/integracion-vs-produccion/): ambientes separados y uso de tarjetas de prueba.
- SDK oficial actual: [cliente Python](https://raw.githubusercontent.com/culqi/culqi-python/master/culqi/client.py), [recurso base](https://raw.githubusercontent.com/culqi/culqi-python/master/culqi/resources/base.py), [eventos](https://raw.githubusercontent.com/culqi/culqi-python/master/culqi/resources/event.py) y [constantes](https://raw.githubusercontent.com/culqi/culqi-python/master/culqi/utils/constants.py). Corroboran el patrón GET y headers relevantes; no prueban qué contrato rechazó la cuenta concreta. No se imitan identificadores de cliente o User-Agent para intentar resolver el 400.
- La [referencia API pública](https://apidocs.culqi.com/) sigue devolviendo una carcasa que requiere JavaScript en el lector disponible. No se intentó un acceso alternativo ni una llamada autenticada al proveedor.
