# Revisión de conciliación Culqi mediante GET

La revisión de política parte de PR3 `0e308de525a8604b082ef7a5d2629b66ceeba2b1`, sin cambiar ese SHA durante su revisión independiente. Ambas ramas conservan despliegues Git deshabilitados. El motor administrativo de tres pedidos y su adaptador HTTP de pruebas permanecen desconectados. PR4 añade por separado la recuperación normal desde status, con bandera privada y policy SQL independientes deshabilitadas por defecto. Sin despliegue, instalación SQL o conciliación real.

## Qué significó el diagnóstico existente

Los tres GET de cargos concordaron con los vínculos persistidos, `6600/PEN`, metadata y fuente test. `captureFlagTrue` y `captureDatePresent` fueron verdaderos. Eso no ejecutó una confirmación financiera. Los siguientes valores falsos eran barreras constantes del diseño, no resultados negativos del proveedor:

| Campo | Incógnita conservada |
|---|---|
| `scanComplete` | Dos primeras páginas no acreditan una búsqueda exhaustiva de eventos |
| `merchantAssociationVerified` | El recurso accesible con la clave no acredita por sí solo la correspondencia independiente con el comercio/panel pretendido |
| `captureSemanticsVerified` | Constante del diagnóstico original; la investigación posterior acredita `capture` y la política mínima de recuperación, sin modificar el informe ya emitido |

Cada listado pidió un tipo: `charge.creation.succeeded` y `charge.creation.failed`, `limit=100`, una sola página, `creation_date_from=1792009200` y `creation_date_to=1792011300`: **2026-10-14 20:20:00–20:55:00 UTC**. No hubo paginación. Que ambas páginas no contuvieran candidatos sólo describe esas páginas y esa ventana.

Los GET `/v2/charges/{cargo persistido}` no tuvieron filtro temporal: incluyeron los tres cargos independientemente de su fecha. La fecha de captura del cargo tampoco garantiza la fecha de creación del evento. La hora 3DS comunicada, `20:51:32.944 UTC`, cae dentro de la ventana; si deriva de interpretar `capture_date` como milisegundos, esa conversión sigue siendo una inferencia, no un contrato acreditado. Los otros dos timestamps no figuran en el informe booleano, por lo que ese informe no permite confirmar si también caen dentro. No se deducen de la expiración de reservas.

## Contrato acreditado y aprobación operativa pendiente

[Objeto cargo](https://apidocs.culqi.com/#tag/Cargos/Objeto-cargo) define `capture` como indicador booleano de captura; `amount`, `amount_refunded` y `current_amount` son importes en céntimos. [Captura](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/captura) distingue captura de autorización. Los ejemplos oficiales permiten `capture:true` junto con `paid:false`; **no se exige `paid===true`**.

`capture_date` en la respuesta no tiene unidad documentada en la tabla del objeto. Un ejemplo de trece dígitos sugiere milisegundos, pero es una inferencia. Se observa solamente su presencia y nunca se convierte a `paid_at`.

[Devoluciones](https://docs.culqi.com/es/documentacion/pagos-online/operaciones/devoluciones) y [riesgos](https://docs.culqi.com/es/documentacion/pagos-online/fraude/riesgos/) describen hechos posteriores a la captura original. No se exige garantizar ausencia de un reverso futuro, `operations` vacío o un listado exhaustivo de refunds del comercio. El webhook actual tampoco exige esas garantías para registrar un cargo original; refunds aún responden 501 y `charge.expired` posterior marca revisión sin borrar el pago original.

La política mínima revisada para un pedido pendiente exige captura true, monto original y actual iguales al persistido, devuelto cero y disputa false, además de todos los vínculos. Información crítica ausente o contradictoria bloquea sólo ese caso. Una devolución pendiente conocida de ese cargo requiere revisión; rechazada no equivale a dinero devuelto. La política describe la instantánea observada, no el futuro. El parser real implementa estos cotejos. **La aplicación remota sigue sin aprobar y deshabilitada**; sólo fixtures sintéticos ejecutan la RPC local.

## Mecanismo preparado

`createCulqiChargeReconciliation(dependencies)` es una rutina de servidor con capacidades inyectadas. Autentica antes de leer configuración; exige CSRF/origen exactos, Preview, repositorio/rama/proyecto Vercel originales, URL QA exacta, modo sandbox y prefijos test. Fija los tres pares QA en código privado; el navegador no elige IDs, fechas, destinos o aprobación.

Lee el pedido y su token attempt persistidos, valida el claim actual y consulta exclusivamente el cargo ya persistido. Vuelve a leer las identidades después del GET. El cargo debe concordar con ID, fuente, metadata, importe y moneda. Campos ausentes, null o de tipo incorrecto no equivalen a importe devuelto cero ni a disputa falsa. Omite cookies, rechaza redirects, no usa caché ni reintentos y limita cuerpos a 256 KiB y cada GET a diez segundos, dentro de un presupuesto de treinta segundos del recorrido del proveedor. Un futuro adaptador debe acotar también sus lecturas de base.

La política documentada se conecta al motor mediante `validateCulqiCapturedCharge`; la aprobación operativa privada e inmutable permanece false. Ninguna variable de entorno, parámetro del navegador o dependencia inyectada abre esa aprobación. En esta versión el motor ejecuta **cero RPC**, incluso cuando el parser real verifica la evidencia. TS admite `needs_correction` exactamente como SQL: pending/pending, required true y reason `charge_result_uncertain`.

La RPC futura `confirm_culqi_charge_get(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)` recibe pedido, checkout, token attempt, claim, marcador revisado, tiempo de observación del servidor y nueve campos normalizados: `chargeId`, `sourceId`, `amountMinor`, `currencyCode`, `capture`, `currentAmountMinor`, `amountRefundedMinor`, `dispute`, `captureDatePresent`. No recibe payload completo, claves, datos de personas, `paid`, una fecha de captura interpretada ni un evento inventado.

La migración propuesta crea una política deshabilitada de los tres objetivos y recibos con procedencia explícita `culqi_charge_get`. Sólo la RPC tiene EXECUTE para `service_role`; las tablas no permiten lectura o modificación directa a ese rol. La política requiere una aprobación del propietario posterior, independiente del marcador que envíe el llamador. La migración no aprueba nada por defecto.

La transacción bloquea batch → pedido → token attempt; vuelve a comprobar las identidades y el importe y sólo entonces registra el recibo único por proveedor/cargo. Recibo, pago, intento e historial se confirman juntos o se revierten juntos. El token attempt y el claim son IDs semánticamente distintos; no se exige que sus valores sean diferentes. Una repetición conserva la procedencia y no duplica historial. Un pago existente conserva fulfillment y fechas, sin atribuir su origen a un webhook que no se comprobó.

Una nueva confirmación de captura tardía conserva o establece el pedido cancelado y exige revisión por `payment_after_reservation_release`; no reactiva la reserva ni recupera capacidad ya liberada. Estados financieros o de fulfillment incompatibles requieren revisión sin efectos. No se escriben eventos webhook ni se invoca `apply_culqi_payment_event` con evidencia GET.

## Alcance administrativo y recuperación desde status

El motor descrito arriba prepara **una recuperación administrativa acotada a los tres pedidos fijados**. Esa recuperación no está ejecutada o expuesta: los pedidos actuales no cambian.

La [recuperación mínima desde status](culqi-status-recovery-mvp-design.md) implementa por separado la consulta del cargo persistido dentro de la ruta existente, limitador estricto y RPC genérica idempotente bajo locks. Conserva el checkout y puede terminar el próximo pago QA elegible mediante una consulta normal después del GO remoto. No requiere worker ni lease. Su código y pruebas están autorizados; sólo instalación QA, despliegue y activación/aplicación requieren el GO coordinado. Sin nueva consulta después de cerrar el navegador, no garantiza conciliación eventual.

El adaptador HTTP administrativo sigue sirviendo sólo para pruebas aisladas. La conexión de status se verifica mediante otra suite HTTP de Next compilado, parser real y PostgreSQL aislado; usa policy y receipts genéricos independientes y deshabilitados por defecto. No abre la allowlist de tres pedidos.

## Pruebas y futura autorización

Las pruebas usan el parser real, incluidos los positivos HTTP del adaptador nuevo, y bloquean la red real. Las aplicaciones de motor abren sólo la barrera operativa en memoria para adapters simulados; no sustituyen el contrato de captura. El código entregado conserva APPLICATION false. Las pruebas SQL instalan la migración sólo en PostgreSQL 17 efímero, sin red ni credenciales de aplicación; activan la política únicamente dentro de fixtures sintéticos.

Antes de cualquier operación real hace falta:

1. Revisar esta política documentada y el vínculo independiente con la cuenta sandbox; no pedir una garantía imposible sobre futuros reversos.
2. Revisar el commit exacto y aprobar expresamente la instalación QA, permisos y política para los tres objetivos. La migración por sí sola deja esa política cerrada.
3. Aprobar un adaptador administrativo de servidor con `requireAdmin`, CSRF, selección mínima, timeout y retorno booleano; aprobar su despliegue Preview coordinado. Esta rama no lo expone.
4. Aprobar separadamente una ejecución que haga GET nuevos y, sólo si cumplen todos los requisitos, aplique la RPC. Mantener cargos, cancelaciones y capacidad conforme a los locks; no repetir cobros ni fabricar eventos.

Hasta completar esos pasos, el mecanismo queda disponible para revisión y pruebas ficticias. No cambia producción, claves, flags, cookies, pagos, pedidos, base QA o el despliegue vigente.
