# Culqi → Bagelito: último control de entrega externa (26-oct-2026)

## Estado confirmado

- La corrección para eventos Culqi que omiten `currency_code` se integró exclusivamente a la rama QA (PR #20).
- Se probaron con un evento de Culqi test auténtico las dos invocaciones secuenciales del POST compilado de Next.js: primera `HTTP 200` aplicada, segunda `HTTP 200` con `duplicate=true`.
- Supabase QA, consulta independiente: un evento procesado, ningún evento pendiente, un recibo original, un intento de pago, un pedido pagado sin alteración de estado, ninguna transición extra.
- No se realizaron POST de cargo ni pagos reales. El mecanismo temporal de compilación se eliminó y el Preview limpio se publicó con SHA `a362e3a17d7a2c4665785fb325e704fa778cdefb`.
- `main` sigue sin esta integración. Producción no tiene variables Culqi activas; solo QA cuenta con las 11 variables preview sandbox específicas de la rama.

## Qué NO se ha demostrado

**El ensayo se hizo invocando el handler POST dentro del entorno QA**. Falta una solicitud HTTP que se origine de verdad en los servidores de Culqi y supere la protección del deployment de Vercel. No interpretar un GET autenticado del evento como prueba de entrega automática de webhooks.

El proyecto Vercel `bagelito-pe` tiene Vercel Authentication/SSO habilitada para sus Previews (`all_except_custom_domains`). La URL protegida de prueba actual es:

`https://bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app/api/webhooks/culqi`

Se recomienda usar siempre ese alias de rama, no una URL efímera por commit. El handler exige que el origen y el entorno concuerden con la configuración sandbox.

## Paso externo (CulqiPanel + Vercel)

1. En **CulqiPanel → Desarrollo → Webhooks → Configuración** (el menú puede variar por versión), inspeccionar el registro del comercio y **entorno test**. Verificar que el evento `charge.creation.succeeded` envíe su POST al endpoint QA correcto. Revisar también `charge.creation.failed`, si corresponde, y la pestaña **Historial** para identificar solicitudes HTTP 401/403/400/500 y reintentos.
2. Confirmar la política de acceso de Vercel. Una Preview protegida normalmente exige **Protection Bypass for Automation**. Vercel admite la cabecera `x-vercel-protection-bypass`; cuando el proveedor no admite cabeceras adicionales, usa el parámetro URL `x-vercel-protection-bypass`. **Este secreto de Vercel es global al proyecto y puede saltar la protección de otros deployments**. Su inclusión en un panel/URL de tercero crea riesgo de exposición en registros. No generar, leer ni copiar este secreto sin revisión/aprobación explícita. Preferir un entorno QA aislado con dominio propio y políticas de seguridad separadas si será una integración permanente.
3. No deshabilitar SSO en todos los previews ni redirigir el webhook de sandbox hacia `bagelito.pe`. No copiar claves test al navegador ni claves live a QA.
4. Una vez que el proveedor pueda alcanzar QA, ejecutar una **entrega auténtica** de `charge.creation.succeeded` mediante el mecanismo seguro habilitado por CulqiPanel. No reutilizar un cobro real; usar solo sandbox. Revisar en Vercel el HTTP de la solicitud y el diagnóstico saneado del handler, y en Supabase que el evento se procesa exactamente una vez.
5. Probar un segundo envío/reintento de ese evento para constatar HTTP 200 y duplicado, sin generar nuevo cargo, nuevo recibo ni segundo intento. Documentar solamente códigos/estados, sin copiar IDs, tokens, datos de clientes o llaves.
6. Antes de habilitar producción, validar también tarjeta con rechazo, 3DS, Yape, sesión vencida, concurrencia último cupo, reversos y soporte. Revisar los cambios de PR #15 y migraciones de DB, y desplegar solo un commit aprobado. Nunca afirmar pagos productivos habilitados basándose únicamente en este QA.

## Evidencia y fuentes oficiales

- Documentación de webhooks de Culqi: https://docs.culqi.com/es/documentacion/pagos-online/webhooks/
- API de Culqi: https://apidocs.culqi.com/
- Vercel, métodos para eludir protección: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
- Vercel, Protection Bypass for Automation: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- QA interna: docs/culqi-qa-event-findings-20261026.md y docs/culqi-event-currency-evidence.md.

No hay ninguna acción que habilite cobros live en este documento.
