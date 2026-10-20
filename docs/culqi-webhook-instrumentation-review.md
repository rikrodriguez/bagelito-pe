# Diagnóstico privado del webhook Culqi

Preparado sobre PR13 en `dcf6cc39518969033d6028bfb9a21e7902b6872b`, rama local `local/culqi-webhook-instrumentation-20261020`. Amplía el diagnóstico existente para distinguir lectura/validación del body, cliente de Eventos, identidad verificada, inicialización de DB y RPC. No identifica la causa del HTTP 500 histórico ni convierte el supuesto upstream 400 en evidencia primaria. No se desplegó ni se contactó al proveedor.

## Código y observaciones

`src/app/api/webhooks/culqi/route.ts` conserva el gate, una única lectura JSON, validación del evt, consulta independiente al proveedor, verificación de identidad, parsing del recurso autenticado y transacción atómica existentes. No acepta cargos directos ni confía en afirmaciones de pago entrantes. Las respuestas públicas, headers, parámetros RPC, tiempos e idempotencia permanecen iguales.

El único registro final local `culqi_webhook_diagnostic`, versión 2, añade:

| Campos | Alcance |
| --- | --- |
| `invocationId` | UUID aleatorio del servidor por invocación; nulo si falla RNG. No deriva de IDs o headers entrantes, no se devuelve ni se pasa a DB |
| `requestParse` | `not_read`, `parsed` o `read_or_parse_failed`; no confunde un fallo de lectura con prueba de JSON inválido |
| `bodyKind`, `bodyObject`, `bodyIdKind` | Categorías fijas del objeto exterior; ninguna identidad real se registra |
| `bodyHasData`, `bodyDataKind` | Presencia/tipo exterior de data, sin leer su contenido ni parsear strings |
| `bodyHasCamelFields`, `bodyHasSnakeFields` | Booleanos de presencia de cinco nombres conocidos por variante, sólo al nivel superior |
| `lookupResource`, `lookupIdKind`, `lookupState` | Cliente de Eventos invocado y resultado de esa llamada; no acreditan HTTP emitido por sí solos |
| `buildCommit`, `buildSourceDigest`, `buildSourceMatchesCommit` | Snapshot compilado, con valores hex validados o nulos y coincidencia de fuentes true/false/null |

Se conservan stage, reason, estado de verificación, intento de transacción y clasificación upstream existentes. No se añaden mensajes crudos, payload, URL/IDs de proveedor, headers, claves, cookies, tarjetas, contactos ni hashes estables de IDs. Los campos observados se leen mediante descriptores propios conocidos, sin coerciones nuevas. El diagnóstico no usa alertas externas ni añade escrituras. Si `console.info` lanza, se intenta una sola vez y se conserva el resultado del handler.

`next.config.ts` calcula el snapshot durante configuración/build con Node nativo y Git local, sin nuevas dependencias ni configuración externa. El SHA proviene de `git rev-parse HEAD`; nunca de una rama, alias o variable de runtime. El digest SHA-256 combina path, separador NUL, bytes y separador NUL de estos archivos, en este orden:

1. `src/app/api/webhooks/culqi/route.ts`
2. `src/lib/payments/culqi.ts`
3. `src/lib/payments/verification.ts`
4. `src/lib/payments/config.ts`
5. `next.config.ts`

Se compara cada fuente seleccionada con `git show SHA:path`. Fuentes modificadas producen `false`; falta de Git/comprobación produce SHA y coincidencia nulos, conservando el digest si pudo calcularse. Una fuente ilegible deja toda la identidad nula. Los errores no se vuelcan ni cambian pagos. Los comandos tienen timeout y no usan shell. Esta huella identifica fuentes seleccionadas embebidas en el artefacto: no es una huella del binario completo, del árbol entero ni una atestación firmada. Tampoco acredita cambios posteriores mediante HMR en desarrollo.

## Pruebas y límites

Doce pruebas nuevas fallaron antes de implementar los campos, la huella y el aislamiento del logger; las doce pasaron después. Una regresión adicional pasa por el cliente real con modo inválido o clave ausente: el log dice cliente invocado/fallido, con cero transporte y cero RPC. El conjunto dirigido final pasa **96/96**, sin fallos ni omisiones, con guard de red y transportes/DB sustituidos.

La suite completa local se intentó y quedó en **487 aprobadas y 10 fallos de carga** por paquetes temporales ausentes (`typescript` o `react`); no es una validación completa aprobada. Archivos afectados: `capacity.test.mjs`, `checkout-render.test.mjs`, `operator-regressions.test.mjs`, `payments/checkout-review.test.mjs`, `payments/culqi-3ds-ui.test.mjs`, `payments/culqi-admin-status-button.test.mjs`, `payments/success-confirmation.test.mjs`, `reservation-waitlist-attribution.test.mjs`, `waitlist-attribution.test.mjs` y `waitlist-flow.test.mjs`.

CI verifica el SHA exacto publicado: suite completa, lint, build/tipos y fixtures HTTP/SQL aislados. El fixture HTTP nativo exige que el build coincida con el commit y comprueba que un snapshot falsificado en el entorno del proceso no sustituya SHA/digest compilados; también conserva sus pruebas de autenticidad, fail-closed, liquidación atómica y duplicados. Los enlaces/resultados de esa ejecución se registran en el PR. Ninguna prueba simulada certifica aceptación real de Culqi.

## Acciones futuras separadas

El [plan de validación](culqi-webhook-future-validation-plan.md) mantiene dos aprobaciones operativas independientes:

1. **Despliegue sandbox:** aprobar el SHA final de un candidato mínimo compatible con el Preview existente y su origen exacto, limitado al diagnóstico del handler y snapshot de build. No desplegar PR13 completo para obtener logs; no instalar su SQL pendiente, cambiar claves, permisos, flags o live. Revisar primero diferencias y compatibilidad de esquema/ACL/RPC. Este PR no ejecuta ese despliegue.
2. **Un reenvío existente:** sólo tras verificar ese despliegue y el estado/historial actuales, aprobar un único registro legítimo ya existente de `charge.creation.succeeded`, con cargo/pedido, destino y SHA identificados. Las tres entregas históricas del 15 de octubre a las 22:50:11–13 Lima son evidencia previa, no autorización para repetirlas. No exigir ni inventar evt; no usar POST manual, otro cargo o token/OTP. Registrar invariantes antes/después y detenerse ante entrega incierta o verificación insuficiente.

La instrumentación puede publicarse en el borrador dentro del desarrollo autorizado. No concede ninguna de esas dos aprobaciones ni supone que deba obtenerse HTTP 200.
