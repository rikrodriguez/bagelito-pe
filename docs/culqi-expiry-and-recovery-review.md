# Vencimiento Culqi y recuperación verificada

Esta corrección está preparada para revisión. No aplica SQL al hosting ni confirma pagos desde el reloj, el navegador o un código de autorización.

## Vencimiento

La ruta de estado consulta `expire_culqi_token_session` después de comprobar el código de pedido y la sesión. La función relee la fila bajo bloqueos de batch, pedido e intentos. Una sesión pendiente vencida sólo pasa a `expired/cancelled` si está en `idle` y no conserva evidencia de cargo, intento o revisión. La cancelación, el intento y su historial se actualizan en la misma transacción.

Si existe evidencia de un cargo enviado o incierto, conserva sus identificadores y estados y marca `payment_reconciliation_required=true`. No libera el intento para otro cobro. La capacidad sigue respetando el vencimiento de la reserva; la revisión financiera no extiende ese plazo. Un evento auténtico posterior conserva la transición existente `paid + cancelled` y su revisión cuando la capacidad ya se liberó.

Antes de desplegar la nueva ruta se necesita revisar e instalar `supabase/add-culqi-session-expiry.sql`, después del esquema de checkout existente. Su aplicación crea la función y sus permisos; no invoca la función ni actualiza pedidos. Sólo `service_role` puede ejecutarla. Si falta la función, la ruta falla con un error constante y no realiza una cancelación alternativa.

El alcance de permisos propuesto es únicamente `public.expire_culqi_token_session(uuid, uuid)`: `REVOKE ALL` para `PUBLIC`, `anon` y `authenticated`, y `GRANT EXECUTE` para `service_role`. No concede permisos sobre tablas, esquemas u otras funciones ni cambia RLS. El propietario de la función conserva sus privilegios propios de PostgreSQL. La versión anterior no llama a esta función y sigue siendo compatible con su instalación aditiva.

## Checkout pendiente o en revisión

Antes de enviar un cargo, el navegador guarda únicamente versión, código de pedido, UUID de checkout y estado pendiente/revisión. No guarda datos del cliente, tokens, dispositivo o parámetros 3DS. Si no puede guardar esa referencia, no envía el cargo. La revisión tiene un estado explícito y conserva el pedido para consultar su estado; no ofrece reintento de pago, edición o upsell que produzcan otro UUID/pedido.

La recarga y la navegación recuperan esa referencia en el mismo almacenamiento del navegador y permiten únicamente consultar el estado. Un error HTTP, una respuesta incompleta o `reconciliationRequired=true` mantienen el bloqueo. Sólo un estado terminal del servidor sin revisión pendiente libera la referencia correspondiente; una respuesta tardía de otro pedido no puede borrarla. Después de un resultado fallido confirmado, crear otro pedido requiere una acción explícita del usuario.

La continuación 3DS sólo funciona con el contexto original todavía en memoria: mismo checkout, pedido, token y dispositivo. No se reconstruye desde almacenamiento tras recargar. Los callbacks de un SDK desmontado se invalidan antes de enviar un cargo. Esta protección local no identifica al cliente entre dispositivos/perfiles, no reconstruye intentos anteriores sin referencia y no garantiza exclusión atómica entre pestañas ni resistencia al borrado del almacenamiento. Los límites transaccionales del servidor siguen protegiendo el pedido y sesión correspondientes.

## Diagnóstico del webhook

Cada respuesta emite una línea privada `culqi_webhook_diagnostic` con exactamente siete campos: `stage`, `reason`, `httpStatus`, `eventVerified`, `transactionAttempted`, `eventPaymentState` y `duplicate`. El estado describe el resultado del evento, no el estado efectivo guardado del pedido. Las etapas, causas y estados son valores de una lista fija. Los errores desconocidos se convierten en una causa genérica.

No registra identificadores, payloads, cabeceras, mensajes del proveedor, datos personales, tarjetas o claves. Tampoco llama al sistema de alertas externas. Conserva la consulta autenticada del evento, su identidad, la validación transaccional y los errores HTTP reintentables.

## Evidencia de lectura y propuesta de recuperación

El [adaptador administrativo de sólo lectura](./culqi-readonly-diagnostic.md) está implementado para una ejecución posterior aprobada con la configuración ya presente en el servidor. Consulta tres cargos persistidos fijados y un listado de eventos acotado por tipo y fechas; coteja `data` como objeto o JSON serializado y verifica cada candidato mediante `GET /v2/events/{id}`. No se ejecutó contra Culqi. Las unidades de fecha y la semántica de cursores deben seguir su contrato: no asumir `has_more` ni que `paid=false` contradiga una captura. La presencia de `capture` y `capture_date` se registra como observación, sin confirmar pago; `AUT0000` por sí solo tampoco confirma captura.

Después de revisar el dry-run, la recuperación puede usar eventos reales verificados con la transacción existente, o una RPC separada para una consulta autenticada del cargo. Esa RPC debe validar cargo, cuenta/modo conforme al contrato del proveedor, importe entero, moneda, pedido, fuente e intento; releer bajo los mismos bloqueos y rechazar observaciones de intentos antiguos. Mantener idempotencia, historial atómico, pagos confirmados sin regresión y pagos tardíos en revisión. No fabricar IDs de evento, reenviar webhooks, aceptar estados del cliente ni iniciar cargos nuevos.

Referencia del proveedor: [API Culqi](https://apidocs.culqi.com/).

## Publicación y validación

`vercel.json` desactiva únicamente los despliegues Git automáticos de `fix/culqi-expiry-quarantine-20261014`, rama del PR draft apilado sobre PR1. PR1 y las demás ramas conservan el comportamiento predeterminado. La [configuración Git de Vercel](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled) evita que los commits de esa rama disparen un despliegue; no autoriza despliegues por CLI ni redeploys manuales. La instalación SQL y un despliegue posterior requieren coordinación; este cambio no modifica el Preview que ya está sirviendo tráfico.

GitHub Actions verifica el SHA solicitado con tests, lint, build y PostgreSQL 17 en un contenedor sin red, sin credenciales de aplicación y con fixtures ficticios. La prueba SQL incluye vencimientos sin cargo, cuarentena, permisos, rollback, carreras con webhook y capacidad liberada.
