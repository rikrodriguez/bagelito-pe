# Espejo de fidelidad: requisitos de activación

Fecha: 1 de noviembre de 2026. Base auditada: PR46, `edc74dda059837070381bdb3b528f1852d0630eb`. Código final probado: **`36e636cd12e5f6b65709dc774314793f5c20316d`**. Este documento distingue fuentes públicas, metadatos comunicados y conclusiones de arquitectura. No activa una integración ni modifica el núcleo, el ledger, los canjes, la UI o la preview.

## Observaciones de documentación oficial

**Update Contact.** La página consultada muestra `PUT /contacts/:contactId`, el header obligatorio `Version` con opción `v3` y un cuerpo que admite `customFields`. En los parámetros consultados no se documentan `If-Match`, ETag, revisión esperada ni una comparación y actualización atómica del contacto (CAS). Esto delimita la evidencia revisada; no demuestra que GHL nunca ofrezca CAS por otro mecanismo o versión. [Fuente oficial consultada](https://marketplace.gohighlevel.com/docs/ghl/contacts/update-contact/index.html).

**Upsert Contact.** La documentación indica que la configuración de duplicados de la location determina la prioridad de búsqueda por email y teléfono. Si ya hay contactos separados que coinciden con esos dos campos, puede actualizarse el contacto del primer campo prioritario e ignorarse el segundo. Por tanto, un resultado de upsert no acredita por sí mismo la identidad del sujeto de fidelidad. [Fuente oficial consultada](https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html).

No se consultó una cuenta GHL, un contacto ni datos de clientes para verificar esas páginas. No se asignaron IDs de campos personalizados ni se definió un payload comercial para GHL. Los nombres del protocolo del [espejo local](loyalty-mirror-local-20261101.md) siguen siendo internos.

## Metadatos comunicados por el coordinador

El coordinador reportó que el **1 de noviembre de 2026 a las 02:55 UTC** una llamada `list_locations` con búsqueda `Bagelito`, mediante el conector identificado como Gourmet, devolvió `items: []`.

Esta observación no fue repetida independientemente en esta revisión. Describe esa búsqueda y ese contexto; no prueba inexistencia global de una location Bagelito, no autoriza a usar una location Gourmet y no acredita permisos sobre un tenant. La tarea documental no inspeccionó clientes ni contactos.

La presencia de un parámetro `idempotencyKey` en un conector tampoco demuestra que GHL haga una escritura condicional por revisión. El contrato del conector y el comportamiento atómico del destino son evidencias distintas.

## Conclusiones de arquitectura

La auditoría de la base indicada no encontró una guardia de activación existente que verifique tenant, sujeto, contacto, location y capacidad condicional antes de cada envío. La nueva guardia local está en [`loyalty-mirror-activation.server.ts`](../src/server/loyalty/loyalty-mirror-activation.server.ts): `assessMirrorActivation(store, scope, targetDescriptor)` emite una decisión y `createGuardedMirrorTransport(store, scope, target)` reevalúa los hechos antes de delegar. No se instala un adaptador real ni un consumidor de aplicación.

El [núcleo de fidelidad](../src/server/loyalty/loyalty.server.ts) continúa siendo autoridad de conteo, derechos y canjes. El [coordinador del espejo](../src/server/loyalty/loyalty-mirror.server.ts) sólo captura y entrega una proyección derivada. Una indisponibilidad del espejo no puede revertir una operación económica ya confirmada.

La frontera mínima es un puerto confiable del servidor que entregue hechos verificables para la decisión de envío. Una cadena, un booleano o un objeto recibido del navegador no constituye ese contexto. Email, teléfono, sesión de checkout y coincidencia de upsert no sustituyen un vínculo de identidad verificado.

El contrato implementado lee `getTenant`, `getBinding`, `getContact` y `getCapabilities` dentro de `ActivationStore.transaction`. [`loyalty-mirror-activation-store.cjs`](../tests/support/loyalty-mirror-activation-store.cjs) proporciona esos hechos desde SQLite de fixtures. `VerificationEvidence` contiene estado `verified/unverified/revoked`, ámbito `local-fixture/remote` y referencia opaca; es un registro interno confiado, no autenticación criptográfica ni un verificador de identidad de producción. Observar que el contacto pertenece a una location no demuestra quién es la persona; el binding sujeto/contacto requiere su propia evidencia confiable.

| Comprobación local requerida | Motivo |
| --- | --- |
| Autorización del tenant para el destino | Una conexión disponible o una búsqueda vacía no concede permiso sobre una cuenta. |
| Binding verificado de sujeto, contacto y location | Evitar que el progreso de un cliente termine en el contacto o tenant de otro. |
| Contacto observado y consistente con ese binding/location | Una referencia opaca guardada no demuestra la pertenencia actual del contacto. |
| Capacidades del destino | Requerir evidencia explícita de la condición por versión e idempotencia necesarias. |
| Modo de ejecución explícito | Permitir el modo de fixture local con transporte inyectado por código confiable; las pruebas usan el receptor SQL FAKE. |

Las comprobaciones deben repetirse **en cada envío**, no quedar aprobadas por una configuración antigua o por una captura previa. Un valor de capacidad `unknown` o `unsupported` bloquea la entrega. Los IDs y las pruebas de autorización usados en fixtures sólo describen sujetos, contactos y locations ficticios.

Incluso una declaración local de capacidad remota verificada no activa el envío remoto: **el adaptador real sigue ausente**. Todos los modos remotos terminan bloqueados; las capacidades desconocidas o no soportadas producen motivos específicos. El modo local explícito delega a un callback de transporte inyectado por código confiable; las pruebas suministran el receptor SQL FAKE. **La guardia decide y valida hechos locales; no es un sandbox de I/O para una función arbitraria.** No se incorpora un transporte HTTP, credenciales, rutas productivas ni acceso a una cuenta GHL.

Esta guardia no añade política de identidad, fusión de contactos, caducidad, devoluciones, elegibilidad o cumplimiento del regalo. Esas decisiones continúan pendientes según la [arquitectura local](loyalty-local-architecture-20261101.md).

## Por qué leer y después escribir no basta

La prueba [`loyalty-blind-write-counterexample.test.cjs`](../tests/loyalty-blind-write-counterexample.test.cjs) reproduce un contraejemplo con SQLite, dos workers reales y escrituras incondicionales. Su secuencia usa dos emisores y un destino simulado, sin una petición a GHL:

1. A lee un destino sin estado (revisión `null`) y queda pausado antes de escribir su snapshot de revisión 1.
2. B lee el mismo destino sin estado (revisión `null`) y escribe el snapshot nuevo de revisión 2.
3. A reanuda y escribe revisión 1 sin condición: el destino retrocede de 2 a 1.

Claves idempotentes distintas para A y B no impiden esa regresión: la escritura antigua es una solicitud única. La idempotencia de repeticiones de una misma solicitud no ordena todas las solicitudes distintas. El backend autoritativo permanece intacto con **10 créditos, 1 derecho ganado y 0 canjes**; lo que retrocede es la copia, de revisión 2/10 pedidos a revisión 1/9 pedidos.

El [receptor SQL FAKE con condición de versión](../tests/support/fake-loyalty-mirror-transport.cjs) permite contrastar ese resultado con el rechazo de revisiones antiguas. Es una prueba del contrato local, no una certificación de la API GHL. La comprobación local previa y un posterior PUT tampoco forman por sí solos una operación atómica en otro sistema.

## Evidencia y estado de cierre

Resultados del código **`36e636cd12e5f6b65709dc774314793f5c20316d`**: Node `v24.19.0` y SQLite local `3.53.3`. Los logs finales y los códigos terminales observados por el responsable confirman las cifras siguientes. Las pruebas usan sujetos, tenants, contactos y locations sintéticos, sin acceso a una cuenta GHL.

| Elemento | Resultado y límite |
| --- | --- |
| TDD de la guardia | 30 pruebas RED contra el scaffold sin implementar → 30 GREEN. [RED, exit 1](qa/loyalty-mirror-activation-20261101/red-guard-scaffold-uncommitted.log): estado diagnóstico sin commit, no atribuido al SHA final. |
| Guardias de activación | 30/30 PASS en [`loyalty-mirror-activation.test.cjs`](../tests/loyalty-mirror-activation.test.cjs): tenant, binding, contacto, capacidades, bloqueos remotos, revocación entre envíos, aislamiento y configuración mutable. |
| Contraejemplo local | 1/1 PASS con dos workers reales y dos conexiones: ambos leen `null`, el receptor incondicional retrocede 2→1 y el condicional FAKE conserva 2. Ledger y proyección autoritativa intactos. |
| Suite Node completa final | **167/167 PASS**, 0 FAIL, 0 skipped, exit 0: 136 existentes repetidas + 30 guardias + 1 contraejemplo. [Log final](qa/loyalty-mirror-activation-20261101/node-full-36e636c.log). |
| Build final | **Exit 0**: Vite, tipos y comprobaciones encadenadas; movimiento termina 14 PASS/0 FAIL. [Log final](qa/loyalty-mirror-activation-20261101/build-36e636c.log). No se suman otra vez al total Node las pruebas repetidas en build. |
| Candidato anterior `0826357` | 167/167 y build exit 0, conservados en [suite](qa/loyalty-mirror-activation-20261101/node-full-0826357.log) y [build](qa/loyalty-mirror-activation-20261101/build-0826357.log); el SHA final se volvió a ejecutar tras precisar el límite del callback. |
| Revisión independiente | 0 Critical/Important. Precisión menor de documentación/nombre de prueba: el callback se confía, no se aísla; corregida y verificada en el SHA final. |
| Conservación | 151 archivos protegidos existentes, 0 cambios y 0 consumidores runtime de activación. Núcleo económico y espejo previo sin cambios; UI/preview preservadas y autodeploy desactivado. No se repitió browser QA ni se atribuye un nuevo PASS visual. |
| GHL real, autorización de cuenta y capacidades condicionales reales | No verificados ni activados por esta entrega. |

Reproducción local de las pruebas nuevas y de la suite completa:

```sh
node --test tests/loyalty-mirror-activation.test.cjs tests/loyalty-blind-write-counterexample.test.cjs
QA_HDR_FIXTURE_PATH=/ruta/local/lebombo_1k.hdr node --test tests/*.test.cjs
npm run build
```

La ruta HDR es un marcador para el fixture local aprobado; [`qa-loopback-guard.cjs`](../scripts/lib/qa-loopback-guard.cjs) exige SHA-256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`. La suite completa comprueba drivers offline; no ejecuta una nueva sesión visual de navegador.

Evidencia separada de [fuentes y observaciones](qa/loyalty-mirror-activation-20261101/research-observations.json), [resultados](qa/loyalty-mirror-activation-20261101/summary.json), [traza del contraejemplo](qa/loyalty-mirror-activation-20261101/counterexample-trace.json) y [manifiesto SHA-256](qa/loyalty-mirror-activation-20261101/manifest.json). Los `.log` legibles normalizan ANSI y espacios finales; los `.log.gz` conservan stdout/stderr exactos. Los artefactos distinguen consulta pública, reporte del coordinador y prueba local; no certifican capacidades de GHL. Esta entrega no consulta cuentas ni contactos GHL, no incorpora credenciales o DB remota y no activa el espejo real.
