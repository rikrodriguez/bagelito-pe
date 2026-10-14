# Revisión de conciliación Culqi mediante GET

Propuesta separada basada en `4e095d78357e33b9616131b48d02d1843dbb16bf`, sin despliegue, instalación SQL ni conciliación real. La rama `fix/culqi-charge-reconciliation-20261014` deshabilita su despliegue Git automático. El motor no está conectado a una ruta, Server Action, botón, cron, webhook o continuación del diagnóstico. No crea ni captura cargos.

## Qué significó el diagnóstico existente

Los tres GET de cargos concordaron con los vínculos persistidos, `6600/PEN`, metadata y fuente test. `captureFlagTrue` y `captureDatePresent` fueron verdaderos. Eso no ejecutó una confirmación financiera. Los siguientes valores falsos eran barreras constantes del diseño, no resultados negativos del proveedor:

| Campo | Incógnita conservada |
|---|---|
| `scanComplete` | Dos primeras páginas no acreditan una búsqueda exhaustiva de eventos |
| `merchantAssociationVerified` | El recurso accesible con la clave no acredita por sí solo la correspondencia independiente con el comercio/panel pretendido |
| `captureSemanticsVerified` | El diagnóstico original no había acreditado el contrato de captura; la investigación posterior sí acredita el boolean `capture`, aunque todavía no acredita toda la política automática |

Cada listado pidió un tipo: `charge.creation.succeeded` y `charge.creation.failed`, `limit=100`, una sola página, `creation_date_from=1792009200` y `creation_date_to=1792011300`: **2026-10-14 20:20:00–20:55:00 UTC**. No hubo paginación. Que ambas páginas no contuvieran candidatos sólo describe esas páginas y esa ventana.

Los GET `/v2/charges/{cargo persistido}` no tuvieron filtro temporal: incluyeron los tres cargos independientemente de su fecha. La fecha de captura del cargo tampoco garantiza la fecha de creación del evento. La hora 3DS comunicada, `20:51:32.944 UTC`, cae dentro de la ventana; si deriva de interpretar `capture_date` como milisegundos, esa conversión sigue siendo una inferencia, no un contrato acreditado. Los otros dos timestamps no figuran en el informe booleano, por lo que ese informe no permite confirmar si también caen dentro. No se deducen de la expiración de reservas.

## Contrato acreditado y bloqueo concreto

[Objeto cargo](https://apidocs.culqi.com/#tag/Cargos/Objeto-cargo) define `capture` como indicador booleano de captura; `amount`, `amount_refunded` y `current_amount` son importes en céntimos. [Captura](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/captura) distingue captura de autorización. Los ejemplos oficiales permiten `capture:true` junto con `paid:false`; **no se exige `paid===true`**.

`capture_date` en la respuesta no tiene unidad documentada en la tabla del objeto. Un ejemplo de trece dígitos sugiere milisegundos, pero es una inferencia. Se observa solamente su presencia y nunca se convierte a `paid_at`.

[Devoluciones](https://apidocs.culqi.com/#tag/Devoluciones/Objeto-devolucion) incluye estados pendientes, sin establecer cuándo afectan los importes del cargo. [Riesgos](https://docs.culqi.com/es/documentacion/pagos-online/fraude/riesgos/) contempla descuentos sin disputa previa, sin definir su representación en todos los campos del cargo. El esquema y los ejemplos de `operations` tampoco acreditan exhaustividad. Falta confirmar cómo una devolución pendiente, descuento o reverso existente modifica `current_amount`, `amount_refunded`, `dispute` y `operations`. Un array vacío no resuelve esa falta de contrato.

Por ello, la definición de captura está verificada, pero la política de confirmación automática íntegra permanece **sin aprobar**. La instantánea `capture:true/current_amount:6600/amount_refunded:0/dispute:false` es un requisito previo, no una garantía de ausencia de operaciones adversas en curso. No hay código real habilitado para convertir esta evidencia parcial en pago confirmado.

## Mecanismo preparado

`createCulqiChargeReconciliation(dependencies)` es una rutina de servidor con capacidades inyectadas. Autentica antes de leer configuración; exige CSRF/origen exactos, Preview, repositorio/rama/proyecto Vercel originales, URL QA exacta, modo sandbox y prefijos test. Fija los tres pares QA en código privado; el navegador no elige IDs, fechas, destinos o aprobación.

Lee el pedido y su token attempt persistidos, valida el claim actual y consulta exclusivamente el cargo ya persistido. Vuelve a leer las identidades después del GET. El cargo debe concordar con ID, fuente, metadata, importe y moneda. Campos ausentes, null o de tipo incorrecto no equivalen a importe devuelto cero ni a disputa falsa. Omite cookies, rechaza redirects, no usa caché ni reintentos y limita cuerpos a 256 KiB y cada GET a diez segundos, dentro de un presupuesto de treinta segundos del recorrido del proveedor. Un futuro adaptador debe acotar también sus lecturas de base.

El contrato y la aprobación operativa son dos barreras privadas, inmutables y cerradas en el código. Ninguna variable de entorno, parámetro del navegador o dependencia inyectada las abre. En esta versión el motor ejecuta **cero RPC**, incluso cuando la evidencia financiera aparente es íntegra.

La RPC futura `confirm_culqi_charge_get(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)` recibe pedido, checkout, token attempt, claim, marcador revisado, tiempo de observación del servidor y nueve campos normalizados: `chargeId`, `sourceId`, `amountMinor`, `currencyCode`, `capture`, `currentAmountMinor`, `amountRefundedMinor`, `dispute`, `captureDatePresent`. No recibe payload completo, claves, datos de personas, `paid`, una fecha de captura interpretada ni un evento inventado.

La migración propuesta crea una política deshabilitada de los tres objetivos y recibos con procedencia explícita `culqi_charge_get`. Sólo la RPC tiene EXECUTE para `service_role`; las tablas no permiten lectura o modificación directa a ese rol. La política requiere una aprobación del propietario posterior, independiente del marcador que envíe el llamador. La migración no aprueba nada por defecto.

La transacción bloquea batch → pedido → token attempt; vuelve a comprobar las identidades y el importe y sólo entonces registra el recibo único por proveedor/cargo. Recibo, pago, intento e historial se confirman juntos o se revierten juntos. El token attempt y el claim son IDs semánticamente distintos; no se exige que sus valores sean diferentes. Una repetición conserva la procedencia y no duplica historial. Un pago existente conserva fulfillment y fechas, sin atribuir su origen a un webhook que no se comprobó.

Una nueva confirmación de captura tardía conserva o establece el pedido cancelado y exige revisión por `payment_after_reservation_release`; no reactiva la reserva ni recupera capacidad ya liberada. Estados financieros o de fulfillment incompatibles requieren revisión sin efectos. No se escriben eventos webhook ni se invoca `apply_culqi_payment_event` con evidencia GET.

## Alcance administrativo y recuperación futura del producto

Esta entrega prepara **una recuperación administrativa acotada a los tres pedidos fijados**. Ni siquiera esa recuperación está ejecutada o expuesta: los pedidos actuales no cambian. No es una solución automática para los futuros cargos que no reciban webhook; la allowlist fija, el motor desconectado y las barreras cerradas lo impiden deliberadamente.

Para cerrar el problema del producto hace falta otra implementación revisada, después de acreditar el contrato anterior:

1. **Trabajo persistente por cargo.** Cuando el servidor persista el resultado de creación bajo el claim, registrar atómicamente un trabajo único por proveedor/cargo/claim. Un fallo de red tras crear el cargo no debe provocar otro cobro. Si ni siquiera existe un ID de cargo persistido, no inventarlo ni deducirlo de un token: ese caso requiere evidencia adicional y revisión.
2. **Worker de servidor.** Releer los vínculos actuales y consultar sólo el cargo persistido con las claves existentes. Usar lease, timeout, límites y reintentos acotados con backoff. Un worker independiente evita depender de que el navegador siga abierto o vuelva a consultar estado. Autenticar su invocación interna y mantener separados sandbox y live; este trabajo no autoriza live.
3. **Política generalizada bajo locks.** Sustituir los tres pins por vínculos persistidos y un contrato/política aprobado para el alcance futuro. Revalidar pedido, checkout, token attempt, claim, metadata, fuente, importe y moneda bajo batch → pedido → intento. El webhook y el worker deben compartir la misma transición financiera idempotente y conservar procedencias diferentes; un GET nunca se disfraza de evento.
4. **Salida visible y finita.** Un cargo inequívocamente capturado conforme al contrato debe terminar en pago confirmado; un estado pendiente puede reconsultarse dentro de un presupuesto definido. Evidencia ausente, contradictoria, reversos, error permanente o presupuesto agotado deben terminar en revisión visible, con motivo y tarea administrativa, sin autorizar nuevas sesiones/cobros. La revisión conserva la incertidumbre financiera y exige resolución supervisada: no puede prometerse un estado pagado cuando falta evidencia. Un panel y un procedimiento con responsable/plazo son necesarios para que la revisión tampoco quede abandonada.
5. **Recuperación del navegador y reserva.** El flujo normal debe reflejar el resultado mediante su consulta de estado existente; la recuperación local conserva el mismo checkout y nunca abre otro cobro mientras siga sin resolver. El worker no prorroga reservas. Captura posterior a liberación conserva cancelación/revisión y no consume otra vez capacidad vendida.
6. **Pruebas de extremo a extremo ficticias.** Ausencia de webhook, navegador cerrado, reinicio del worker, lease vencido, reintento duplicado, webhook concurrente, reembolso/disputa, cambio de claim y expiración con capacidad reutilizada. Verificar tanto el estado financiero como la salida que ve el cliente y los jobs; el caso de cargo sin webhook debe cerrar por evidencia válida o revisión explícita, con cero llamadas nuevas de cobro.

No hay outbox, worker, integración con el flujo normal o política generalizada en este commit. Los casos actuales siguen pendientes de la autorización y evidencia enumeradas debajo. Las pruebas positivas de esta propuesta verifican un contrato hipotético y no permiten afirmar que el problema del producto ya esté resuelto.

## Pruebas y futura autorización

Las pruebas de motor usan exclusivamente mocks y bloquean la red real. Las aplicaciones positivas cargan una copia sintética del contrato en memoria: verifican el mecanismo futuro, sin acreditar el contrato Culqi. Las pruebas SQL instalan la migración sólo en PostgreSQL 17 efímero, sin red ni credenciales de aplicación; activan la política únicamente dentro de fixtures sintéticos.

Antes de cualquier operación real hace falta:

1. Obtener y revisar la evidencia contractual que falta y el vínculo independiente con la cuenta sandbox.
2. Revisar el commit exacto y aprobar expresamente la instalación QA, permisos y política para los tres objetivos. La migración por sí sola deja esa política cerrada.
3. Aprobar un adaptador administrativo de servidor con `requireAdmin`, CSRF, selección mínima, timeout y retorno booleano; aprobar su despliegue Preview coordinado. Esta rama no lo expone.
4. Aprobar separadamente una ejecución que haga GET nuevos y, sólo si cumplen todos los requisitos, aplique la RPC. Mantener cargos, cancelaciones y capacidad conforme a los locks; no repetir cobros ni fabricar eventos.

Hasta completar esos pasos, el mecanismo queda disponible para revisión y pruebas ficticias. No cambia producción, claves, flags, cookies, pagos, pedidos, base QA o el despliegue vigente.
