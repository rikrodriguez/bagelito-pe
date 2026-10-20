# Evidencia de un evento Culqi ya existente

Esta lectura manual permite investigar el HTTP400 histórico sin crear otro cargo, reenviar eventos ni modificar configuración. Se realiza en la cuenta de Culqi ya autorizada, en modo pruebas/integración. No necesita que un agente opere la laptop, copie una sesión o lea claves.

## Qué ocurrió y qué buscar

La evidencia guardada registra tres ejecuciones del callback de Bagelito el **16 de octubre de 2026 a las 03:50:11.104, 03:50:12.485 y 03:50:13.865 UTC**. Equivalen al **15 de octubre, 22:50:11–13, hora de Lima (UTC−5)**. Son horas de ejecución del callback; el evento y su cargo pudieron crearse antes.

En las tres, Bagelito intentó consultar `GET /v2/events/{id}` y recibió `400/parameter_error` de Culqi. Bagelito respondió HTTP500, sin verificar el evento ni intentar la transacción SQL. Los logs omiten IDs y texto del proveedor. Esto **no demuestra un fallo al crear un cargo**, ni permite asegurar que el panel muestre ese GET o su HTTP400. Un HTTP500 en el historial de entrega sería la respuesta del callback, no el HTTP400 interno de Culqi.

## Lectura manual mínima

1. Abrir la cuenta/comercio de prueba ya utilizada y confirmar visualmente el modo pruebas/integración. No abrir ni exportar llaves, RSA, cookies o tokens.
2. En **Eventos**, consultar los registros existentes relacionados con el cargo de prueba que se quiere cotejar. La sección **Webhooks** permite identificar la configuración existente. No usar Añadir, Guardar, Reenviar ni Crear cargo. La [guía oficial](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/) documenta Eventos/Webhooks; no garantiza que el panel muestre el detalle del error interno de un GET.
3. Si hay un evento pertinente, conservar sólo los campos siguientes que el panel muestre realmente. Si permite consultar el historial de entrega, leerlo sin ejecutar un reenvío.
4. Si el panel queda en blanco, no hay evento correlacionable o un campo no está disponible, registrar esa limitación y la hora de la observación. No sustituir el registro ausente por un nuevo pago o un ID supuesto.

| Campo necesario | Para qué sirve |
| --- | --- |
| Cuenta/comercio y modo pruebas visibles, sin secretos | Correlacionar el registro con el comercio sandbox correcto; un prefijo test no prueba esa asociación por sí solo. |
| ID real y tipo del evento existente | Identificar el objeto que debe leerse y su clase; no basta el ID de un cargo. |
| Fecha/hora del evento y zona horaria mostrada | Distinguir creación del evento de sus posteriores entregas. |
| Cargo asociado y referencia del pedido, si constan | Vincular el evento con el intento esperado. No hacen falta datos personales ni tokens de tarjeta/Yape. |
| URL exacta de destino configurada para ese evento | Cotejar el callback ya previsto, sin editarlo. |
| Historial de entregas, si está disponible: fecha/zona, estado y respuesta saneada | Correlacionar las ejecuciones y comprobar si ya hubo una entrega o reenvío; un estado incierto no autoriza repetirlo. |
| Parámetro rechazado o explicación contractual del GET, sólo si existe en el registro | Investigar por qué Culqi devolvió parameter_error. Si no figura, la causa del 400 sigue pendiente. |

Destino documentado para cotejar, sin cambiarlo:

`https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/api/webhooks/culqi`

Puede compartirse una captura recortada o una transcripción de esos campos. Ocultar nombres, correos, teléfonos, direcciones, tarjetas, códigos de aprobación y cualquier clave/token; no adjuntar un HAR o payload completo. No hace falta exponer el contenido de Authorization ni generar nuevas credenciales.

## Límites de lo que se puede concluir

Un ID de evento permite correlacionar; no demuestra por sí solo que se verificó o aplicó. El diagnóstico de solo lectura existente está limitado a tres objetivos fijados, una ventana del 14 de octubre, dos páginas y hasta veinte detalles; sus booleanos no revelan el ID ni el parámetro rechazado y no constituyen una búsqueda exhaustiva de los eventos del 16.

El HTTP400 de la consulta de Runtime Logs de Vercel por retención es otro error y no aporta la respuesta de Culqi. Las pruebas sintéticas de PR13 tampoco sustituyen una entrega real. Este documento no autoriza desplegar, instalar SQL remoto, reenviar eventos, hacer cobros ni contactar a terceros.

Para certificar posteriormente una entrega real todavía harían falta el SHA y destino autorizados, el evento legítimo, su verificación y un resultado aplicado/duplicado coherente con los invariantes de pedido, historial y capacidad. La ausencia actual de ese conjunto se conserva como bloqueo; no se declara aceptación real del proveedor.
