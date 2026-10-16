# Recuperación mínima Culqi conectada a status

PR4 conecta la ruta existente `POST /api/payments/culqi/status` con `createCulqiStatusRecovery`, el parser real y una confirmación SQL genérica para futuros pedidos QA. No añade worker, cron ni otra ruta. PR3 sigue congelado en `0e308de525a8604b082ef7a5d2629b66ceeba2b1`; su adaptador administrativo de tres pedidos permanece desconectado y con APPLICATION false.

El GO coordinado posterior autorizó e instaló esta migración en QA, trasladó `8bac3922ea937443bd7c1433ec3dbf2b497864e8` al Preview original y activó allí la bandera y policy independientes. Las consultas de los tres cargos existentes quedaron pendientes porque el checkout no conservaba sus referencias en el navegador disponible. El ajuste de UI admin descrito abajo está implementado y probado para revisión; **su nuevo commit no se despliega antes de revisar diff/SHA/CI**. No crea ni repite cargos ni cambia credenciales o permisos persistentes.

## Contrato de captura

[Objeto cargo](https://apidocs.culqi.com/#tag/Cargos/Objeto-cargo) documenta `capture`, `amount_refunded`, `current_amount` y `dispute`. El parser exige captura true, importe original y actual iguales al persistido, devuelto cero y disputa false, además de cargo, fuente, metadata de pedido y moneda concordantes. Acepta `paid:false`. No interpreta unidades de `capture_date`, exige `operations` vacío ni escanea refunds del comercio.

Información crítica ausente, null, incorrecta o contradictoria bloquea ese caso. Una devolución pendiente/completada/desconocida conocida del cargo requiere revisión. Una devolución rechazada no equivale a dinero devuelto. La ruta reconoce observaciones persistidas mediante los motivos cerrados `known_pending_refund`, `known_completed_refund` y `known_refund_unknown`; no crea un sistema de observación de refunds. Sin una observación persistida no afirma una búsqueda exhaustiva.

La instantánea de captura no garantiza ausencia de reversos futuros. Refunds webhook siguen respondiendo 501; `charge.expired` después del pago conserva la captura original y marca `paid_charge_reversed`. Los pedidos ya pagados conservan fulfillment y fechas, sin otro GET de recuperación.

## Recorrido ejecutable desde hosting

1. La creación existente persiste cargo, fuente y claim mediante `finish_culqi_charge`. La recuperación sólo puede consultar ese cargo; nunca crea, captura, devuelve o repite un cobro.
2. El checkout llama a la ruta habitual con JSON de máximo 2 KiB y exclusivamente `orderCode + checkoutSessionId`. La coincidencia con la fila es la capacidad de acceso; el cliente no envía cargo, fuente, importe, evidencia, aprobación ni IDs internos.
3. Cuando la bandera privada `CULQI_STATUS_RECOVERY_APPROVED` es exactamente `true`, la ruta exige scope QA y URL/Origin/Host/forwarded host/HTTPS/Fetch-Site/Referer concordantes antes de leer claves o base. Con la bandera ausente/false conserva la consulta de estado anterior y hace cero llamadas del nuevo helper.
4. El RPC existente `expire_culqi_token_session` lee/expira bajo locks. Después el helper obtiene una proyección sin personas, valida pedido/token attempt/claim actuales y acepta únicamente pending/pending elegible. `needs_correction` requiere required true y reason `charge_result_uncertain`; paid coherente se conserva.
5. Antes del proveedor, llama directamente a `consume_api_rate_limit`: scope fijo `culqi_status_charge_get`, SHA-256 de la tupla pedido/checkout/token attempt/claim/cargo, límite 1 por 15 segundos. Función ausente, error o respuesta inválida producen cero GET; no usa el helper antiguo que permite continuar ante errores.
6. Hace un único GET fijo `https://api.culqi.com/v2/charges/{cargo persistido}`: sin cookies, redirects, caché ni reintentos; cinco segundos incluyendo lectura y máximo 256 KiB. El helper tiene presupuesto absoluto de nueve segundos y sus pasos DB tienen timeout de dos segundos. No mantiene locks durante HTTP.
7. Relee los vínculos tras el GET. Si un webhook ganó, conserva el pago autoritativo. Si cambió el claim u otra identidad, difiere sin confirmar. Con evidencia válida llama a `confirm_culqi_status_charge_get` con siete argumentos: pedido, checkout, token attempt, claim, marcador, hora de observación del servidor y nueve campos financieros normalizados.
8. La RPC bloquea batch → pedido → todos sus intentos Culqi, revalida identidades/importes/estado y exige observación de máximo treinta segundos **después de adquirir los locks**. Receipt único, pago, intento e historial se confirman juntos o se revierten juntos. No fabrica eventos ni llama a `apply_culqi_payment_event` para un GET.
9. La ruta vuelve a ejecutar la lectura de estado bajo locks y responde desde la base. `recoveryState` nunca convierte una respuesta de transporte en pago. Repeticiones no duplican historial ni fechas; el webhook existente conserva su comportamiento.

## Gates y conservación de capacidad

| Gate | Valor exigido |
|---|---|
| Hosting | Preview, proyecto `prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0` |
| Git | `rikrodriguez/bagelito-pe`, rama `fix/culqi-payment-coordination-20261012` |
| Origen | `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app` y URLs configuradas concordantes |
| Base | `https://qaahskendqdkynwtylho.supabase.co` |
| Pagos | Sandbox, flags existentes válidos, claves/cargo/fuente test |
| Runtime | Bandera privada `CULQI_STATUS_RECOVERY_APPROVED=true`, ausente por defecto |
| SQL | Policy independiente `culqi_status_charge_recovery_policy`, QA exacto, marcador `culqi_charge_get_reviewed_net_v1`, enabled false por defecto |

La policy y receipts tienen RLS y carecen de acceso directo para PUBLIC/anon/authenticated/service_role. Sólo service_role tiene EXECUTE de la RPC; sólo un propietario confiable puede aprobar la policy. No se abre ni reutiliza la policy administrativa de tres pins. El marcador enviado no concede aprobación.

La RPC coteja total original en céntimos, importe del pedido/intento y moneda PEN; no fija 6600 ni los tres pedidos anteriores. Vuelve a rechazar bajo lock una devolución conocida, aunque se haya persistido después del último SELECT del helper, sin receipt ni pago. Cancelación, vencimiento del pedido o del **intento original**, motivo de liberación persistido o historial de cancelación producen paid+cancelled+revisión `payment_after_reservation_release`. Una extensión posterior o borrar el motivo no reactiva capacidad. Otro pedido que reutilizó ese cupo se conserva.

## UI, respuesta y límites

La respuesta conserva los campos de estado anteriores y añade sólo `recoveryState` cerrado (`skipped`, `deferred`, `review_required`, `confirmed`, `already_paid`, `unavailable`) y hint acotado cuando se activa la recuperación. No devuelve cargo/fuente/payload/IDs internos/claves/errores crudos/personas. Todas las respuestas explícitas de POST usan private no-store, incluidas denegaciones. No se añaden logs o alertas externas.

`ReservationFlow` hace hasta seis consultas secuenciales dentro de sesenta segundos, con timeout por solicitud y respetando el cooldown recibido. Pago autoritativo y revisión false permite terminar; captura tardía o evidencia crítica adversa mantiene el bloqueo. Si se agota el presupuesto, conserva la referencia del mismo checkout y el panel de revisión con su botón actual de estado. Reabrir con storage conserva esa referencia y permite consulta manual, sin otra creación.

No hay conciliación eventual garantizada si se borra storage, cambia de dispositivo o se cierra el navegador y no vuelve a consultarse. Tampoco se inventa un cargo cuando una creación incierta no dejó ID persistido: queda en revisión. No se infiere rechazo de la ausencia de eventos.

## Consulta admin de los tres pedidos existentes

La página `/admin/orders/{orderCode}` añade **Consultar estado Culqi** en Payment únicamente para BAG-000001, BAG-000002 y BAG-000004 y el scope QA aprobado. Es un botón hidratado con resultado local; no refresca el dashboard, modifica fulfillment ni abre checkout.

`runCulqiExistingOrderStatus` autentica con `requireAdmin()` antes de headers/config/DB. Comprueba las cabeceras reales de la Server Action y conserva CSRF nativo de Next; no completa Origin/Host ausentes ni normaliza valores inválidos. Repite scope/bandera/prefijos test y rechaza códigos o campos adicionales. Sólo entonces SELECT de `order_code,checkout_session_id` con límite absoluto de dos segundos; la referencia permanece en servidor y no aparece en HTML/RSC/props/inputs/DTO.

La acción invoca **localmente el mismo handler POST existente** con URL canónica, JSON mínimo y whitelist de headers originales ya validados. No usa fetch contra el hosting, copia cookies/Authorization, llama una RPC financiera directamente ni añade una API de confirmación. Toda decisión financiera, limitador, GET/parser, locks y lectura final sigue en el recorrido status ya revisado. El resultado sólo incluye estados cerrados y booleanos; `ok` no implica pago.

Sin sesión admin, CSRF/origen/scope/bandera/config válidos o código autorizado hay cero consulta de pares y cero llamadas a status. BAG-000003 y cualquier otro pedido quedan excluidos. El parser, SQL, grants, policy y flags no cambian con esta UI.

## Pruebas y GO pendiente

`tests/culqi-status-recovery-http.mjs` levanta Next compilado y ejecuta la ruta real, helper y parser sin sustituciones positivas. Un bridge local limita fetch a la proyección PostgREST/RPC y el GET fixture; las RPC se ejecutan con service_role sobre PostgreSQL 17 efímero, sin red ni puertos publicados. No llama Culqi ni Supabase reales. La policy se abre únicamente en fixtures sintéticos; cada otro destino falla cerrado.

La suite cubre pago normal, repetición y solapamiento real con throttle, scope/origen/capacidad inválidos, cuerpo limitado, campos financieros adversos, devolución conocida justo antes de confirmar, RPC de rate ausente, gates cerrados, webhook durante GET, fulfillment conservado, captura tardía/capacidad reutilizada y rollback del historial. La suite SQL añade carreras bloqueadas de confirmación duplicada, vencimiento posterior al lock, capacidad, claim cambiado, plazo original del intento y devolución persistida antes del lock; prueba importes dinámicos, roles y tipos/null.

La instalación/Preview/activación de `8bac392` ya recibió GO y se ejecutó sólo en QA. El nuevo delta admin se entrega en draft PR con diff/SHA/CI antes de trasladarlo al Preview de la **rama sandbox original**. Tras revisión coordinada, el navegador cloud autorizado podrá pulsar el botón en las tres páginas, observar pago cancelado en revisión y repetir; verificar receipts/historial/fechas y capacidad mediante la lectura QA existente. No desplegar directamente PR3/PR4 ni usar una ruta alternativa. `CULQI_ENABLED` por sí solo no abre esta recuperación.

La suite `tests/culqi-admin-status-http.mjs` ejecuta la Server Action compilada, auth real sintética, el POST/helper/parser intactos y PostgreSQL aislado real. Comprueba HTML/RSC/DTO sin capacidades, los tres pagos vencidos, repetición idéntica de todas las filas/fechas, veintiséis gates de solicitud y veinte de configuración sin transportes/efectos. Sólo sustituye transportes de Supabase/proveedor; no modifica positivamente fuente, parser o SQL.
