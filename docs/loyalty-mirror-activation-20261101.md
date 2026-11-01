# Espejo de fidelidad: requisitos de activación

Fecha: 1 de noviembre de 2026. Base auditada: PR46, `edc74dda059837070381bdb3b528f1852d0630eb`. Este documento distingue fuentes públicas, metadatos comunicados y conclusiones de arquitectura. No activa una integración ni modifica el núcleo, el ledger, los canjes, la UI o la preview.

## Observaciones de documentación oficial

**Update Contact.** La página consultada muestra `PUT /contacts/:contactId`, el header obligatorio `Version` con opción `v3` y un cuerpo que admite `customFields`. En los parámetros consultados no se documentan `If-Match`, ETag, revisión esperada ni una comparación y actualización atómica del contacto (CAS). Esto delimita la evidencia revisada; no demuestra que GHL nunca ofrezca CAS por otro mecanismo o versión. [Fuente oficial consultada](https://marketplace.gohighlevel.com/docs/ghl/contacts/update-contact/index.html).

**Upsert Contact.** La documentación indica que la configuración de duplicados de la location determina la prioridad de búsqueda por email y teléfono. Si ya hay contactos separados que coinciden con esos dos campos, puede actualizarse el contacto del primer campo prioritario e ignorarse el segundo. Por tanto, un resultado de upsert no acredita por sí mismo la identidad del sujeto de fidelidad. [Fuente oficial consultada](https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html).

No se consultó una cuenta GHL, un contacto ni datos de clientes para verificar esas páginas. No se asignaron IDs de campos personalizados ni se definió un payload comercial para GHL. Los nombres del protocolo del [espejo local](loyalty-mirror-local-20261101.md) siguen siendo internos.

## Metadatos comunicados por el coordinador

El coordinador reportó que el **1 de noviembre de 2026 a las 02:55 UTC** una llamada `list_locations` con búsqueda `Bagelito`, mediante el conector identificado como Gourmet, devolvió `items: []`.

Esta observación no fue repetida independientemente en esta revisión. Describe esa búsqueda y ese contexto; no prueba inexistencia global de una location Bagelito, no autoriza a usar una location Gourmet y no acredita permisos sobre un tenant. La tarea documental no inspeccionó clientes ni contactos.

La presencia de un parámetro `idempotencyKey` en un conector tampoco demuestra que GHL haga una escritura condicional por revisión. El contrato del conector y el comportamiento atómico del destino son evidencias distintas.

## Conclusiones de arquitectura

La auditoría de la base indicada no encontró una guardia de activación existente que verifique tenant, sujeto, contacto, location y capacidad condicional antes de cada envío. La nueva guardia local está en [`loyalty-mirror-activation.server.ts`](../src/server/loyalty/loyalty-mirror-activation.server.ts). La evidencia final se cierra después de probar el commit exacto.

El [núcleo de fidelidad](../src/server/loyalty/loyalty.server.ts) continúa siendo autoridad de conteo, derechos y canjes. El [coordinador del espejo](../src/server/loyalty/loyalty-mirror.server.ts) sólo captura y entrega una proyección derivada. Una indisponibilidad del espejo no puede revertir una operación económica ya confirmada.

La frontera mínima es un puerto confiable del servidor que entregue hechos verificables para la decisión de envío. Una cadena, un booleano o un objeto recibido del navegador no constituye ese contexto. Email, teléfono, sesión de checkout y coincidencia de upsert no sustituyen un vínculo de identidad verificado.

| Comprobación local requerida | Motivo |
| --- | --- |
| Autorización del tenant para el destino | Una conexión disponible o una búsqueda vacía no concede permiso sobre una cuenta. |
| Binding verificado de sujeto, contacto y location | Evitar que el progreso de un cliente termine en el contacto o tenant de otro. |
| Contacto observado y consistente con ese binding/location | Una referencia opaca guardada no demuestra la pertenencia actual del contacto. |
| Capacidades del destino | Requerir evidencia explícita de la condición por versión e idempotencia necesarias. |
| Modo de ejecución explícito | Permitir el modo de fixture local con transporte inyectado por código confiable; las pruebas usan el receptor SQL FAKE. |

Las comprobaciones deben repetirse **en cada envío**, no quedar aprobadas por una configuración antigua o por una captura previa. Un valor de capacidad `unknown` o `unsupported` bloquea la entrega. Los IDs y las pruebas de autorización usados en fixtures sólo describen sujetos, contactos y locations ficticios.

Incluso una declaración local de capacidad remota verificada no activa el envío remoto: **el adaptador real sigue ausente**. El modo local explícito delega a un transporte inyectado por código confiable; las pruebas suministran únicamente el receptor SQL FAKE. No se incorpora un transporte HTTP, credenciales, rutas productivas ni acceso a una cuenta GHL.

Esta guardia no añade política de identidad, fusión de contactos, caducidad, devoluciones, elegibilidad o cumplimiento del regalo. Esas decisiones continúan pendientes según la [arquitectura local](loyalty-local-architecture-20261101.md).

## Por qué leer y después escribir no basta

La prueba [`loyalty-blind-write-counterexample.test.cjs`](../tests/loyalty-blind-write-counterexample.test.cjs) reproduce un contraejemplo con SQLite, dos workers reales y escrituras incondicionales. Su secuencia usa dos emisores y un destino simulado, sin una petición a GHL:

1. A lee un destino sin estado (revisión `null`) y queda pausado antes de escribir su snapshot de revisión 1.
2. B lee el mismo destino sin estado (revisión `null`) y escribe el snapshot nuevo de revisión 2.
3. A reanuda y escribe revisión 1 sin condición: el destino retrocede de 2 a 1.

Claves idempotentes distintas para A y B no impiden esa regresión: la escritura antigua es una solicitud única. La idempotencia de repeticiones de una misma solicitud no ordena todas las solicitudes distintas. El backend autoritativo permanece intacto en el contraejemplo; lo que retrocede es la copia.

El [receptor SQL FAKE con condición de versión](../tests/support/fake-loyalty-mirror-transport.cjs) permite contrastar ese resultado con el rechazo de revisiones antiguas. Es una prueba del contrato local, no una certificación de la API GHL. La comprobación local previa y un posterior PUT tampoco forman por sí solos una operación atómica en otro sistema.

## Evidencia y estado de cierre

Esta redacción no asigna resultados de pruebas nuevas ni un SHA final a código que el responsable aún está implementando. La evidencia previa del espejo no certifica la nueva guardia.

| Elemento | Estado para completar por el responsable |
| --- | --- |
| SHA exacto del módulo de guardia y sus puertos | Pendiente de cierre. |
| Pruebas de tenant/binding/contacto/capacidades y reevaluación por envío | Pendiente de ejecución y evidencia final. |
| Contraejemplo de escrituras incondicionales y contraste condicional FAKE | Reportado por el agente; anexar script, resultado y hashes exactos. |
| Suite completa, tipos/build y revisión independiente | Pendiente para el nuevo código; no heredar resultados anteriores. |
| Conservación del núcleo, UI/preview y ausencia de consumidores remotos | Pendiente de auditoría del diff final. |
| GHL real, autorización de cuenta y capacidades condicionales reales | No verificados ni activados por esta entrega. |

El responsable incorporará las rutas de scripts, logs, resumen y manifiesto al cerrar la evidencia. Esta tarea sólo escribe este documento; no realiza llamadas GHL, búsquedas de cuenta, operaciones con credenciales o DB remota, commits ni activación.
