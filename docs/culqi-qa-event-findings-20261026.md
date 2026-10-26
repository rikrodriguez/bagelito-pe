# Culqi QA: diagnóstico de eventos, 26-oct-2026

## Alcance
Pruebas con la Preview de Vercel en la rama \`codex/culqi-payment-split-20261021\`, con credenciales **sandbox existentes**, sin transacciones nuevas ni cambios de estado. No se consultó un entorno live. Los datos del proveedor se procesaron temporalmente en memoria; el log almacena únicamente campos categóricos, conteos y HTTP.

## Evidencia

- \`GET /v2/events?type=charge.creation.succeeded&creation_date_from=1792540800&creation_date_to=1792800000&limit=100\`: HTTP 200, lista válida, 0 registros. Vercel: \`dpl_FBESAyU12pu3oX3T2HATEhvXzP2d\` (SHA \`d763c784\`).
- \`GET /v2/events?limit=30\`: HTTP 200, 27 registros en página.
- \`GET /v2/events?type=charge.creation.succeeded&limit=30\`: HTTP 200, 21 registros.
- \`GET /v2/events?creation_date_from=1792540800&creation_date_to=1792800000&limit=30\`: HTTP 200, 0 registros.
- Ninguna de las tres páginas de este segundo diagnóstico contenía un evento con metadata del pedido sandbox \`BAG-000013\`. No se consultó \`GET /events/{id}\` en el segundo diagnóstico, porque no había candidato validado. Vercel: \`dpl_A1nBETaq6gzqNxxe9dV5kwcTnMw9\` (SHA \`a9cd96cb\`).
- Consulta de lectura de Supabase QA: \`BAG-000013\` creado el 22-oct; \`payment_status=paid\`, \`status=payment_confirmed\`, posee ID de cargo y timestamp de pago, \`payment_reconciliation_required=false\`. La confirmación provino de evidencia de cargo, no de evento procesado.
- Estado de QA consultado: **1 recibo de confirmación de cargo, 0 eventos webhook procesados, 6 órdenes Culqi pendientes**. Son fixtures y registros QA, no estadísticas productivas.
- Durante las pruebas de sandbox no se enviaron POST de cargo, solicitudes webhook, ni escrituras a la base de datos.
- Diagnóstico original del 22-oct: Culqi \`GET /v2/events/{id}\` devolvió HTTP 400 \`parameter_error\` tras 3 webhooks sandbox auténticos; no se logró un evento verificado/confirmado. El parche de GET fallback es una mitigación condicional de solo lectura, no un arreglo verificado contra un ID real.
- Pruebas unitarias del script amplio: 10/10 específicas aprobadas en Node 24. La ejecución del conjunto completo en esa nueva sandbox quedó bloqueada por \`EAI_AGAIN registry.npmjs.org\` (no por fallos de test). En la rama original del PR 17 hubo 720/720 tests y lint/build exitosos previamente.

## Diagnóstico y siguientes verificaciones

1. **No concluir ausencia de eventos:** el listado general devolvió 27. El filtro de fecha parece responsable de producir una página vacía, pero no sabemos si se debe al formato, los rangos, la data disponible o reglas del proveedor.
2. En CulqiPanel **sandbox**, comprobar identidad del comercio/API key, que \`https://.../api/webhooks/culqi\` sea la URL registrada para el evento, sus entregas y los IDs de 25 caracteres efectivamente enviados; confirmar si la fecha y el evento pertenecen al mismo comercio/ambiente que los cargos.
3. Revisar el \`param\` categorizado en el error HTTP 400 de \`GET /v2/events/{id}\` con un ID auténtico presente en el panel. No inventar ni reutilizar IDs no verificados.
4. Verificar un webhook válido en QA; esperar una única inserción idempotente en \`payment_webhook_events\` con los datos de estado correctos, y rechazo de duplicados, fuentes y monedas discordantes.
5. Validar flujo de tarjeta, Yape, vencimientos, 3DS y errores sin doble cargo. Mantener Culqi live deshabilitado hasta contar con la evidencia.

## Limpieza
El script temporal, los tests auxiliares y el hook de \`npm run build\` usados para consultar eventos se retiraron tras registrar estos resultados. Ninguna de estas comprobaciones se introdujo en \`main\`; el parche de consulta de Culqi permanece solo en QA y en su revisión previa.

## Confirmación adicional sobre eventos y moneda (26-oct-2026)
- Consulta real con `sk_test` a Culqi: lista de `charge.creation.succeeded` HTTP 200, 21 eventos test con ID de longitud documentada; tres se relacionan por cargo y metadata con `BAG-000013`. Un evento verificado por GET individual respondió HTTP 200 con cabeceras SDK y también con Authorization solamente; identidad, tipo y cargo coinciden.
- El `data` del evento verificado está en forma de objeto, **sin** `currency_code` **ni** `currency`. El cargo independiente obtenido mediante `GET /v2/charges/{id}` sí devuelve `currency_code=PEN`, ID/importe/origen coincidentes y `capture=true`, aunque también muestra `paid=false`. Por diseño, `paid` aislado no prueba ni invalida la captura: la evidencia financiera requiere monto, moneda, capture, current_amount, amount_refunded y dispute.
- La prueba de aplicar el evento detuvo la ejecución **antes del webhook** por dato de moneda ausente. Por tanto, cero mutaciones y ninguna notificación reconocida a partir de estos diagnósticos.
- La mitigación segura es verificar un segundo GET autenticado del cargo y completar **solo la moneda ausente** del evento cuando exista evidencia vinculante completa; jamás completar una moneda explícita contradictoria, ni suponer PEN, ni aceptar datos del navegador.
- Los dos scripts de diagnóstico y el runner transitorio quedan eliminados del hook de build al concluir las observaciones. Mantener `main` y cobros reales sin modificaciones hasta probar RPC e idempotencia en QA.
