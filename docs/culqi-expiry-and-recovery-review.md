# Vencimiento Culqi y recuperación verificada

Esta corrección está preparada para revisión. No aplica SQL al hosting ni confirma pagos desde el reloj, el navegador o un código de autorización.

## Vencimiento

La ruta de estado consulta `expire_culqi_token_session` después de comprobar el código de pedido y la sesión. La función relee la fila bajo bloqueos de batch, pedido e intentos. Una sesión pendiente vencida sólo pasa a `expired/cancelled` si está en `idle` y no conserva evidencia de cargo, intento o revisión. La cancelación, el intento y su historial se actualizan en la misma transacción.

Si existe evidencia de un cargo enviado o incierto, conserva sus identificadores y estados y marca `payment_reconciliation_required=true`. No libera el intento para otro cobro. La capacidad sigue respetando el vencimiento de la reserva; la revisión financiera no extiende ese plazo. Un evento auténtico posterior conserva la transición existente `paid + cancelled` y su revisión cuando la capacidad ya se liberó.

Antes de desplegar la nueva ruta se necesita revisar e instalar `supabase/add-culqi-session-expiry.sql`, después del esquema de checkout existente. Su aplicación crea la función y sus permisos; no invoca la función ni actualiza pedidos. Sólo `service_role` puede ejecutarla. Si falta la función, la ruta falla con un error constante y no realiza una cancelación alternativa.

El alcance de permisos propuesto es únicamente `public.expire_culqi_token_session(uuid, uuid)`: `REVOKE ALL` para `PUBLIC`, `anon` y `authenticated`, y `GRANT EXECUTE` para `service_role`. No concede permisos sobre tablas, esquemas u otras funciones ni cambia RLS. El propietario de la función conserva sus privilegios propios de PostgreSQL. La versión anterior no llama a esta función y sigue siendo compatible con su instalación aditiva.

## Diagnóstico del webhook

Cada respuesta emite una línea privada `culqi_webhook_diagnostic` con exactamente siete campos: `stage`, `reason`, `httpStatus`, `eventVerified`, `transactionAttempted`, `paymentState` y `duplicate`. Las etapas, causas y estados son valores de una lista fija. Los errores desconocidos se convierten en una causa genérica.

No registra identificadores, payloads, cabeceras, mensajes del proveedor, datos personales, tarjetas o claves. Tampoco llama al sistema de alertas externas. Conserva la consulta autenticada del evento, su identidad, la validación transaccional y los errores HTTP reintentables.

## Propuesta de recuperación, aún sin implementar

Primero realizar un dry-run de sólo lectura con la configuración ya presente en el servidor: consultar los cargos persistidos y un listado de eventos acotado por tipo y fechas; cotejar `data` como objeto o JSON serializado. Verificar cada candidato mediante `GET /v2/events/{id}`. Acreditar las unidades de fecha y la semántica de cursores; no asumir `has_more` ni que `paid=false` contradiga una captura. La evidencia de captura procede del contrato documentado de `capture` y `capture_date`, no de `AUT0000` por sí solo.

Después de revisar el dry-run, la recuperación puede usar eventos reales verificados con la transacción existente, o una RPC separada para una consulta autenticada del cargo. Esa RPC debe validar cargo, cuenta/modo conforme al contrato del proveedor, importe entero, moneda, pedido, fuente e intento; releer bajo los mismos bloqueos y rechazar observaciones de intentos antiguos. Mantener idempotencia, historial atómico, pagos confirmados sin regresión y pagos tardíos en revisión. No fabricar IDs de evento, reenviar webhooks, aceptar estados del cliente ni iniciar cargos nuevos.

Referencia del proveedor: [API Culqi](https://apidocs.culqi.com/).

## Publicación y validación

`vercel.json` desactiva únicamente los despliegues Git automáticos de `fix/culqi-expiry-quarantine-20261014`, rama del PR draft apilado sobre PR1. PR1 y las demás ramas conservan el comportamiento predeterminado. La [configuración Git de Vercel](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled) evita que los commits de esa rama disparen un despliegue; no autoriza despliegues por CLI ni redeploys manuales. La instalación SQL y un despliegue posterior requieren coordinación; este cambio no modifica el Preview que ya está sirviendo tráfico.

GitHub Actions verifica el SHA solicitado con tests, lint, build y PostgreSQL 17 en un contenedor sin red, sin credenciales de aplicación y con fixtures ficticios. La prueba SQL incluye vencimientos sin cargo, cuarentena, permisos, rollback, carreras con webhook y capacidad liberada.
