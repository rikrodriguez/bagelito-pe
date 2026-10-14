# Conexión mínima de recuperación Culqi al estado existente

Diseño para revisión; no es una implementación conectada. El código de PR3 permanece en `0e308de525a8604b082ef7a5d2629b66ceeba2b1`. La rama de política añade el parser documentado y un adaptador HTTP administrativo desconectado para probarlo; no añade una entrada al hosting ni aplica SQL. La aprobación de aplicación permanece false.

## Criterio de captura y evolución posterior

[Objeto cargo](https://apidocs.culqi.com/) documenta `capture`, `amount_refunded`, `current_amount` y `dispute`. Para recuperar un pedido financiero pendiente, la instantánea aceptada debe tener `capture===true`, importe original y actual iguales al importe persistido, devuelto cero y disputa falsa. También deben concordar cargo, metadata de pedido, fuente, moneda y vínculos de sesión/intento/claim. El parser acepta `paid:false`, no interpreta la unidad de `capture_date` y no exige `operations` vacío ni listar todos los refunds del comercio.

Una devolución pendiente conocida de ese cargo bloquea sólo ese caso. Una devolución rechazada no equivale a dinero devuelto, aunque no invalida los cotejos adversos que ya declare el cargo. Información crítica ausente o de tipo incorrecto no se convierte en cero/false. Una devolución parcial/total o disputa observada requiere revisión; no se etiqueta automáticamente como fallo de creación ni se abre otro cobro.

Captura original y devolución/reverso posterior son hechos diferentes. El webhook actual aplica `charge.creation.succeeded` como pago original; un `charge.expired` posterior conserva el pago y marca `paid_charge_reversed`. Los refunds todavía responden 501. La recuperación tampoco promete ausencia de reversos futuros ni añade reconciliación de refunds. Los pedidos ya pagados conservan estados y fulfillment; este mecanismo no los reconsulta para reescribir su historia. [Devoluciones](https://docs.culqi.com/es/documentacion/pagos-online/operaciones/devoluciones), [riesgos](https://docs.culqi.com/es/documentacion/pagos-online/fraude/riesgos/).

## Camino concreto para el próximo pago QA

1. El cobro actual continúa por `coordinateCulqiCharge`: `claim_culqi_charge` → creación actual → `finish_culqi_charge`. El resultado persiste ID de cargo, fuente y claim y responde `awaiting_webhook`. La recuperación nunca llama a creación, captura, devolución o a otro token.
2. La consulta existente `POST /api/payments/culqi/status` recibe únicamente el par `orderCode + checkoutSessionId`. Comprueba método, tamaño/forma del JSON, Origin/Host/forwarded host exactos y Fetch-Site/Referer concordantes. Antes de acceder a claves, exige el alcance QA definido debajo. El par debe coincidir con la fila: es una capacidad de checkout, no una sesión administrativa. Un UUID válido sin esa fila no autoriza nada.
3. La ruta conserva `expire_culqi_token_session` bajo sus locks. Su resultado aún no se devuelve: si el pago sigue pendiente y hay cargo persistido elegible, llama al nuevo helper `recoverCulqiStatusCharge(...)`. Expirar una reserva no demuestra que no se cobró y no impide detectar captura tardía.
4. El helper obtiene una proyección mínima de pedido e intento token, con timeout de dos segundos, sin datos personales. Obtiene todos los IDs y valores esperados de esa proyección; el cliente no elige cargo, fuente, importe, moneda, claim, aprobación o evidencia de refund.
5. Antes del proveedor, llama directamente al RPC existente `consume_api_rate_limit`: scope fijo `culqi_status_charge_get`, SHA-256 de una tupla canónica `[orderUUID, checkoutUUID, tokenAttemptUUID, claimUUID, chargeId]`, límite 1 por 15 segundos y timeout de dos segundos. Sólo `allowed===true` permite GET. Error, función ausente, INSERT concurrente conflictivo o envelope inválido implica cero GET. No usar `consumeRateLimit` de `public-api-security.ts`: actualmente permite continuar si falta el RPC y puede enviar monitorización externa.
6. Después de que termine ese RPC, hace un solo GET de `https://api.culqi.com/v2/charges/{ID persistido}`: timeout total de cinco segundos incluyendo lectura, cuerpo máximo 256 KiB, sin cookies, redirects, caché o reintento dentro de la solicitud. No mantiene ningún bloqueo SQL durante HTTP. No consulta listados de eventos ni de refunds.
7. Ejecuta `validateCulqiCapturedCharge` con las expectativas persistidas. Si la evidencia pasa, llama a una RPC nueva **genérica para este alcance QA**, `confirm_culqi_status_charge_get(orderUUID, checkoutUUID, tokenAttemptUUID, claimUUID, marker, observedAt, observation)`. No reutiliza la policy de tres pins ni elimina sus restricciones.
8. La RPC vuelve a validar bajo locks batch → pedido → intento, registra procedencia `culqi_charge_get` y aplica receipt/pago/intento/historial atómicamente. A continuación la ruta relee el estado autoritativo con el mismo par de checkout y responde. Si un webhook ganó mientras se hacía GET, devuelve el pago ya confirmado; una discrepancia de recuperación no oculta ese resultado.
9. `ReservationFlow.waitForVerifiedPayment` ve `paid` y revisión false y termina como hoy. Si termina paid+cancelled+revisión, conserva el bloqueo y muestra revisión, nunca éxito de reserva ni un cobro nuevo.

El throttle controla coste normal y múltiples pestañas; no es la garantía financiera. El RPC existente utiliza `now()` antes de su lock y el primer INSERT concurrente puede fallar. El wrapper nuevo debe fallar cerrado. Un GET redundante excepcional sigue siendo inocuo porque la RPC final revalida el estado y el receipt es único por proveedor/cargo. No hacen falta columnas de lease ni un worker persistente para este MVP.

## Alcance y transición que se deben preservar

| Control | Condición |
|---|---|
| Hosting | Preview, proyecto `prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0` |
| Git | Repositorio `rikrodriguez/bagelito-pe`, rama `fix/culqi-payment-coordination-20261012` |
| Origen | Alias canónico `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app`, URLs de rama/sitio concordantes |
| BD | `https://qaahskendqdkynwtylho.supabase.co` |
| Pagos | Culqi sandbox, prefijos test de claves/cargo/fuente y flags existentes válidos; aprobación independiente de recuperación |
| Pedido | Provider Culqi, token lane, sin orden alternativa, checkout coincidente, cargo/fuente/claim actuales no null |
| Importe | Entero positivo persistido, igual en pedido/intento y al total original en céntimos; moneda PEN concordante |
| Estados | pending/pending con pending-review o cancelado; `needs_correction` sólo con required true y reason `charge_result_uncertain`; paid coherente se conserva; otros estados financieros requieren revisión |

La RPC genérica requiere policy QA deshabilitada por defecto, propiedad de un rol de migración confiable y tablas de procedencia sin acceso directo para anon/authenticated/service_role. Sólo service_role recibe EXECUTE; no se acepta un boolean de aprobación del cliente. Debe cotejar los campos normalizados del GET y su observación reciente —máximo treinta segundos al adquirir los locks—, además de identidades actuales.

La confirmación nueva no actualiza plazos. Cancelación, deadline vencido, deadline original de `payment_attempts.expires_at` vencido o motivo persistido de liberación significan captura tardía: paid+cancelled+revisión por `payment_after_reservation_release`. Mantener también el vencimiento original impide reactivar un cupo por una extensión posterior. Si otro pedido reutilizó la capacidad, conserva ese pedido y ese cupo. Receipt duplicado no duplica historia ni cambia fechas; fallo de historia revierte todo. No se fabrican eventos ni se llama a `apply_culqi_payment_event` para un GET.

## Respuesta, reintentos y límites del MVP

La respuesta conserva `paymentStatus`, `orderStatus`, `reconciliationRequired`, `orderCode` y `expiresAt`. Puede añadir `recoveryState` cerrado (`checking`, `deferred`, `review_required`, `confirmed`) y `retryAfterSeconds` acotado; no devuelve cargo, fuente, payload, IDs internos, claves, errores crudos o datos de personas. Todas las respuestas llevan no-store, también auth, scope y validación. Logs privados: etiquetas finitas y booleanos, sin helpers de alertas.

La UI actual hace seis consultas separadas 1.5 segundos y después retorna pending; eso puede agotar el recorrido antes del cooldown siguiente. El cambio mínimo debe dar hasta sesenta segundos de consultas secuenciales, respetando el hint de quince segundos, con timeout por solicitud y sin solaparlas. Al agotar el presupuesto, mostrar revisión/confirmación pendiente visible, conservar el mismo checkout y ofrecer el botón actual de estado. Un fallo de GET nunca significa autorización para pagar otra vez.

Al reabrir `/checkout` con la referencia local, disparar una consulta inicial de estado y permitir el botón manual; no preparar una nueva sesión. Si se permite navegar a success antes de resolver, esa pantalla debe consultar el mismo estado o volver al panel de recuperación. Si se borra storage, cambia de dispositivo o se cierra la pestaña y nunca se vuelve, el MVP no garantiza conciliación automática eventual. Esa limitación es explícita; un worker sólo sería una ampliación posterior si se requiere resolver sin ninguna nueva consulta del cliente o administrador.

La falta de ID de cargo persistido tras una respuesta de creación perdida tampoco se resuelve inventando uno o consultando por token. Ese caso queda bloqueado/revisión y requiere evidencia adicional. No hay garantía oficial de que sandbox excluya eventos; su ausencia no se interpreta como rechazo ni como imposibilidad estructural de recibirlos.

## Archivos y autorizaciones exactas

| Cambio siguiente | Archivo/punto | Estado de autorización |
|---|---|---|
| Parser documentado, alineación needs_correction y HTTP aislado | `culqi-capture-evidence.ts`, `culqi-charge-reconciliation.ts`, `culqi-reconciliation-http-adapter.ts` y tests | Autorizado en esta fase; aplicación false y sin endpoint |
| Orquestación de recuperación normal y respuesta final autoritativa | `src/lib/payments/culqi-status-recovery.ts`, `src/app/api/payments/culqi/status/route.ts` | Requiere aprobar implementación/runtime nuevo; este documento sólo lo diseña |
| RPC/policy genéricas y procedencia para futuros pedidos | Nuevo SQL separado de `add-culqi-charge-get-reconciliation.sql` | Requiere revisión e instalación QA autorizada; no aplicadas |
| Espera/resumen/reapertura del mismo checkout | `ReservationFlow.tsx`, success/recovery y pruebas de flujo | Parte de la implementación futura de conexión, sin cobrar nuevamente |
| Hosting | Llevar código revisado a la rama sandbox original y desplegar su Preview exacto | GO coordinado independiente; no desplegar directamente PR3 o la rama de política |
| Aplicación | Activar gate privado de recuperación y policy QA tras pruebas/revisión | Aprobación explícita de escrituras financieras desde status; `CULQI_ENABLED` por sí solo no la concede |
| Prueba real | Un próximo cargo ficticio autorizado y consultas de estado previstas | Autorización separada para ese cargo/ejecución; esta fase no consulta ni confirma cargos reales |

Pruebas de conexión requeridas antes de ese GO: HTTP real de la ruta nueva con capacidad válida/inválida, CSRF/origen y scope; parser real con paid=false, refunds/dispute/null; varios status simultáneos y limitador ausente; webhook durante GET; rollback SQL; claim cambiado; falta de cargo persistido; expiración con capacidad reutilizada; reabrir checkout sin otra creación. Afirmar conexión al producto requiere estas pruebas de la ruta y flujo reales. El HTTP administrativo aislado de esta fase acredita la cadena adapter → core → parser, no la futura ruta de estado o el despliegue.
