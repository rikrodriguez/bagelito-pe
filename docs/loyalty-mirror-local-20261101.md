# Espejo de fidelidad: contrato exclusivamente local

Base: PR46, `96f1f5a23dd087ad4ebfcf36b73f8f01b46ac0af`. Trabajo autorizado de contrato y pruebas; sin GHL HTTP, credenciales, rutas, migraciones, UI, preview, pagos o activación productiva.

## Decisión y frontera

La auditoría no encontró un cliente GHL ni outbox reutilizable. El núcleo `loyalty.server.ts` ya deriva progreso y revisión desde el ledger dentro de una transacción. Se conserva sin cambios. No se reutiliza email/teléfono o el identificador de rate-limit como identidad de cliente.

Se evaluaron una notificación dentro de la transacción económica, un outbox insertado por cada mutación y una captura independiente del último estado. Se elige la tercera para este alcance local: no acopla disponibilidad del espejo al crédito/canje ni modifica la transacción del núcleo. Es decisión técnica de esta implementación, no una política comercial aprobada.

Cada captura interna recibe sólo el sujeto del backend; relee progreso autoritativo, binding local y versión anterior en UNA transacción serializada. Si el resumen no cambia conserva la versión y el estado pendiente. Si cambia, incrementa la revisión persistida del sujeto y sustituye el pendiente con un snapshot completo. Un aviso duplicado o antiguo sólo provoca otra lectura actual; no aporta un saldo ni un delta.

La entrega se hace fuera de esa transacción. El mensaje estable y su resumen/hash se reintentan; una confirmación sólo limpia el pendiente si siguen coincidiendo sujeto, destino, ID, revisión y hash. Una respuesta vieja no puede borrar un snapshot nuevo. No se guarda texto de excepciones del transporte como dato comercial.

Una captura fallida puede no dejar fila pendiente. `reconcile()` recorre sujetos autoritativos y vuelve a capturar; no se limita al outbox. Recupera el último estado, no cada transición intermedia. No se instala un scheduler ni se promete que esa reconciliación ya corra en producción.

## Contrato del destino, no API de GHL

Los nombres `schema`, `messageId`, `subjectId`, `destinationRef`, `revision`, `payloadHash` y `summary` son de un protocolo interno nuevo. No son endpoints, campos personalizados ni respuestas documentadas de GHL. El binding de fixtures es opaco, explícito e inmutable; no decide cómo identificar, fusionar o reasignar contactos reales.

El resumen contiene sólo agregados del progreso y la regla autorizada diez pedidos→2bagels+1schmear. No envía pedidos, evidencia de pago, nombres, email, teléfono, tokens, IDs de derechos o solicitudes de canje. `unredeemedRewards` no otorga autorización de canje y `requiresReview` debe conservarse; no se decide una devolución o reversión desde el espejo.

El puerto de transporte exige que el destino aplique una revisión nueva, reconozca el mismo contenido repetido y rechace el retroceso de versión. El receptor SQLite **FAKE** lo simula con persistencia real local. No está verificado que GHL permita ese contrato condicional. Un adaptador real permanece ausente: antes de implementarlo se deben verificar documentación/capacidades, binding/tenancy, autenticación, permisos, aislamiento, garantías de orden, límites y reconciliación. Si el destino no ofrece control de versión suficiente habrá que rediseñar esa frontera; un GET seguido de PATCH no demuestra atomicidad.

Los reintentos pueden producir múltiples entregas físicas. No se promete exactamente-una-vez distribuido, latencia, entrega eventual sin worker/rescan activo ni ausencia de regresión en GHL real. La idempotencia y el rechazo de versiones viejas sólo se comprueban en el contrato y receptor locales.

## Validación

Pendiente: TDD, suite local completa, tipos/build, revisión independiente y manifiesto con SHA del código final. No se atribuyen los107 tests históricos a código posterior sin repetirlos.
