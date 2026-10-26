# Culqi webhook: completar moneda ausente con evidencia autenticada

## Incidente confirmado (26-oct-2026)

En Supabase QA, el pedido de sandbox BAG-000013 está pagado por un cargo verificado. Culqi devuelve un evento auténtico charge.creation.succeeded con ID, cargo, importe, metadata y source correctos, pero **sin** currency_code ni currency dentro de data. Al consultar ese cargo por GET autenticado, el propio Culqi devuelve currency_code=PEN, capture=true, source e importe coincidentes. El campo paid del cargo puede ser false incluso en esa respuesta, así que no debe sustituir la comprobación de captura neta.

El RPC de Bagelito exige moneda PEN y por ello rechazaba correctamente el evento incompleto. Los 400 antiguos en otras consultas son otro incidente y no quedan demostrados como resueltos por esta corrección.

## Política

Después de verificar el ID/tipo mediante GET autenticado del evento:
- Sólo para charge.creation.succeeded cuando faltan **ambos** campos currency_code y currency, consultar el cargo por GET en el mismo entorno y con la llave secreta del servidor.
- Rechazar si no coinciden ID, tipo de fuente, entorno test/live, importe, metadata del pedido y source.
- Exigir currency_code=PEN, capture=true, current_amount igual al importe, amount_refunded=0 y dispute=false en el cargo consultado. paid=false no invalida por sí solo los otros campos.
- Completar exclusivamente currency_code=PEN en el recurso que se transmite al RPC. El evento original permanece intacto en p_verified_payload. SQL sigue validando el importe/moneda frente al pedido persistido y opera bajo bloqueo transaccional.
- Una moneda explícita incorrecta (también null), GET fallido, fuente distinta, cargo distinto, devolución, disputa y evento fallido no permiten completar la moneda. No hay rutas de escritura alternativas ni POST de cargo.
- Registrar únicamente la etapa y motivo cerrado charge_evidence_invalid; nunca volcar payloads, IDs, secretos o información personal en runtime logs.

## Validación necesaria

1. Suite de pruebas de pago, lint, build y SQL en entornos aislados.
2. En QA, verificar evento auténtico, con ejecución única del webhook y respuesta de duplicado en el segundo intento. Comparar el pedido, la tabla payment_webhook_events y los recibos de cargo antes/después, sin nuevos cargos.
3. Confirmar por separado en CulqiPanel que la URL y eventos de webhook están configurados y que una entrega HTTP real llega correctamente. Validar Yape, 3DS y vencimientos.
4. Sin verificación de entregas reales y aprobación de despliegue no habilitar live ni fusionar con main.

Esta rama procede del trabajo Culqi QA, no de producción; no contiene cambios a la home, diseño ni productos.
