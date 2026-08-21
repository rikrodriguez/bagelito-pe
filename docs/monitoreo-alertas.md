# Monitoreo y alertas

Bagelito ahora tiene una capa de monitoreo operativo basada en:

- logs estructurados del backend
- alertas deduplicadas guardadas en Supabase
- envío opcional a webhook para Slack, Discord o Make
- despacho en background con `after()` dentro de requests y server actions
- endpoint de health para uptime checks
- captura de `uncaughtException` y `unhandledRejection`

## Comportamiento del runtime

- Los `logWarn(...)` y `logError(...)` siguen escribiendo logs estructurados al instante.
- Las alertas externas se programan con `after()` para que no bloqueen la respuesta y tengan más probabilidad de completarse en Vercel.
- Si ocurre un `uncaughtException` o `unhandledRejection`, Bagelito intenta mandar la alerta de forma inmediata y luego fuerza salida del proceso. No intenta seguir operando en un estado incierto.

## Variables de entorno

Configura estas variables en Vercel:

- `MONITORING_ALERT_WEBHOOK_URL`
  - Webhook de Slack, Discord, Make, Zapier u otro receptor JSON.
- `MONITORING_ALERT_COOLDOWN_MINUTES`
  - Cooldown por fingerprint de alerta. Recomendado: `15`.

## SQL requerida

Ejecuta esta migración en Supabase:

- `supabase/add-monitoring-alerts.sql`

La tabla `monitoring_alert_events` guarda:

- fingerprint del incidente
- nivel (`warn` o `error`)
- resumen
- contexto
- número de ocurrencias
- primera vez visto
- última vez visto
- última vez enviado

## Endpoint de health

Usa:

- `/api/health`

Respuesta esperada:

- `200` cuando Supabase responde bien
- `503` cuando faltan variables críticas o Supabase falla

Úsalo con:

- UptimeRobot
- Better Stack
- Cronitor
- Vercel checks externos

## Qué dispara alertas

Hoy se alertan:

- todos los `logError(...)`
- algunos `logWarn(...)` operativos importantes, como:
  - rate limit RPC faltante
  - cleanup de voucher fallido
  - analytics server fallido
  - configuración crítica faltante

## Recomendación operativa

1. Correr la migración SQL.
2. Poner `MONITORING_ALERT_WEBHOOK_URL` en Vercel.
3. Probar con un error controlado en staging.
4. Conectar `/api/health` a un uptime monitor con chequeo cada 5 minutos.
