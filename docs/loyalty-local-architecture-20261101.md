# Fidelidad: arquitectura local y de prueba

Fecha: 1 de noviembre de 2026. Base de la entrega: PR45, commit `9a94e4cfc5a043726f643d3a9c546f096007bd94`. Este trabajo mantiene la UI y la preview de referencia sin cambios. No activa pagos, endpoints, credenciales, migraciones remotas, canjes comerciales ni conexiones con GHL.

## Regla autorizada y alcance

Cada pedido único cuyo pago confirme el backend cuenta una vez. Cada bloque de diez pedidos acreditados genera un derecho a **2 bagels + 1 schmear gratis**. Cada derecho se puede canjear una sola vez. Veinte pedidos acreditados generan dos derechos; canjear uno no borra el historial de pedidos ni vuelve a generar ese derecho.

La regla no especifica tamaño, sabores, entrega, disponibilidad, caducidad, devoluciones ni elegibilidad de pedidos históricos, manuales o de prueba. Esta arquitectura no añade esas condiciones. Tampoco crea puntos, saldo monetario, Wallet ni una recompensa ya ganada en la preview.

El núcleo reside en [`src/server/loyalty/loyalty.server.ts`](../src/server/loyalty/loyalty.server.ts). Expone un servicio y puertos de persistencia/autorización; no debe tener consumidores en rutas, componentes, checkout o pagos durante esta entrega local. El adaptador SQLite pertenece exclusivamente a `tests/support`; no es un adaptador de producción ni una segunda base comercial.

## Arquitectura existente y elementos que se reutilizarían

La confirmación directa valida evidencia del proveedor y llama a `confirm_culqi_charge_result` en [`charge-coordinator.server.ts`](../src/server/charge-coordinator.server.ts). El validador de [`culqi-charge-evidence.server.ts`](../src/server/culqi-charge-evidence.server.ts) vincula cargo, origen, código de pedido, importe, PEN y captura. El webhook de [`routes/api/webhooks/culqi.ts`](../src/routes/api/webhooks/culqi.ts) vuelve a consultar el evento al proveedor antes de llamar a `apply_culqi_payment_event`; no acepta el cuerpo entrante como prueba de pago.

Esas dos vías pueden observar el mismo pedido. La futura acreditación debe converger en una operación idempotente por ID interno de pedido, no incrementar por evento, intento de cargo, reintento HTTP, lectura de estado o callback `onPaid` del navegador. [`payments/culqi/status.ts`](../src/routes/api/payments/culqi/status.ts) recupera estado; no es una fuente nueva de pedidos pagados.

La persistencia actual no está completamente descrita en el árbol versionado. El único SQL presente en la base es [`supabase/add-checkout-legal-evidence.sql`](../supabase/add-checkout-legal-evidence.sql), que añade evidencia legal. Los RPC financieros y sus restricciones requeridas figuran en [`guided-commerce-release-gates-20261028.md`](guided-commerce-release-gates-20261028.md), pero no están sus definiciones vigentes. Su instalación y atomicidad reales no se han consultado ni certificado.

El historial local conserva el esquema anterior en el commit `f19f8b02310ad7b02d64b902059046ef67b9ec2e`:

- [`setup-bagelito-reservations.sql`](https://github.com/rikrodriguez/bagelito-pe/blob/f19f8b02310ad7b02d64b902059046ef67b9ec2e/supabase/setup-bagelito-reservations.sql): `orders.id` como PK, `order_code` único, líneas de pedido, historial y RLS.
- [`add-payment-provider.sql`](https://github.com/rikrodriguez/bagelito-pe/blob/f19f8b02310ad7b02d64b902059046ef67b9ec2e/supabase/add-payment-provider.sql): unicidad de eventos e identificadores de proveedor, sesión de checkout única, advisory lock por sesión y bloqueo del batch en reserva.

Estos archivos desaparecieron del árbol en `5c315eb8cd9c7f19fca2231ec5c1d1462a5416fe`. No definen todos los RPC actuales ni un sistema de fidelidad. Son evidencia histórica para reconciliar, no una migración vigente que deba reinstalarse ni prueba del esquema remoto actual.

## Identidad y autoridad

[`checkout-session.server.ts`](../src/server/checkout-session.server.ts) recibe email, nombre y WhatsApp; normalizar o validar su formato no acredita propiedad. El UUID generado por [`CulqiBrowserCheckout.tsx`](../src/playable/CulqiBrowserCheckout.tsx) identifica una sesión de checkout, no al titular de una cuenta de fidelidad. No se debe vincular una recompensa por coincidencia de esos campos.

El puerto `authenticatedSubject(context)` debe resolver el sujeto desde un contexto confiable del servidor. El núcleo no interpreta un JWT, un email, un teléfono o un `subjectId` elegido por el cliente como autorización. El adaptador de prueba puede resolver tokens explícitos de fixtures para comprobar aislamiento entre sujetos; ese mecanismo no selecciona ni implementa la identidad de producción. Un consumidor futuro no puede convertir una cadena arbitraria recibida por HTTP en un contexto confiable.

`creditPaidOrder(orderId)` es una operación interna de backend: recibe la clave del pedido y relee su hecho autoritativo dentro de la transacción. No recibe un booleano `paid` del cliente. El hecho incluye propietario, estado de pago, procedencia e identificador de verificación y necesidad de revisión. La procedencia del fixture es evidencia local de prueba; no certifica una consulta real a Culqi. El adaptador de producción deberá enlazar esa evidencia con las transiciones financieras revisadas antes de poder utilizarse.

`getProgress(context)` y `redeem(context, input)` derivan el propietario del puerto de autorización. Un identificador de derecho o una clave de reintento no autoriza a leer o canjear derechos ajenos.

## Modelo y límites de la transacción

El contrato de `LoyaltyStore.transaction` abarca **lectura autoritativa del pedido, autorización y lecturas/escrituras de ledger, derechos y canjes** de cada operación. Separar la lectura del pedido de la escritura del crédito dejaría una carrera con cambios de estado o propietario. Los errores deben revertir todas las escrituras de la operación.

| Registro | Restricción requerida | Finalidad |
| --- | --- | --- |
| Crédito de pedido | PK `orderId` | Un pedido cuenta una vez, aunque lo observen confirmación directa y webhook o se repitan eventos. |
| Derecho ganado | UNIQUE `(subjectId, ruleId, cycle)` | Un solo derecho por cada bloque de diez créditos del propietario. |
| Canje | UNIQUE `entitlementId` | El mismo derecho no se consume dos veces. |
| Solicitud de canje | Clave idempotente ligada al propietario | Repetir la misma solicitud devuelve su resultado; no autoriza otro derecho ni otro propietario. |

La operación de acreditación valida el pedido releído, detecta un crédito previo y, sólo para un pedido nuevo, inserta el crédito y los derechos correspondientes al total acreditado. El recuento proviene del ledger, no de un contador aportado por UI ni del número de bagels o del importe. Las restricciones únicas deben existir en la base además de las comprobaciones del servicio.

El canje comprueba el contexto autorizado, el propietario del derecho y los canjes previos en la misma transacción. La clave idempotente no debe permitir cambiar el derecho asociado en un reintento. El servicio registra un canje local; no asigna tamaños, sabores, stock, envío ni una línea gratuita a un pedido comercial.

Si una nueva lectura contradice la evidencia o el propietario de un pedido ya acreditado, el resultado requiere revisión. No se reasigna silenciosamente el crédito, no se acredita otra vez y no se implementa una reversión, devolución o expiración automática. La decisión comercial y financiera sobre esos casos permanece pendiente.

## Qué demuestra SQLite y qué queda por demostrar

El adaptador de pruebas debe mantener las operaciones dentro de una transacción SQLite real y comprobar rollback, restricciones únicas, persistencia e intercalado de conexiones/procesos. SQLite permite un solo escritor simultáneo; `BEGIN IMMEDIATE` adquiere la transacción de escritura al inicio y puede encontrar `SQLITE_BUSY`. Esto debe manejarse y probarse como comportamiento local, sin presentarlo como un bloqueo de filas PostgreSQL. [Documentación primaria de transacciones SQLite](https://www.sqlite.org/lang_transaction.html).

PostgreSQL tiene reglas de aislamiento y concurrencia diferentes. Su nivel por defecto, Read Committed, puede ofrecer instantáneas diferentes entre sentencias de una misma transacción; un `SELECT` previo por sí solo no serializa el cálculo de derechos. La futura implementación deberá definir locks por propietario/pedido o aislamiento y reintentos adecuados, además de constraints, y comprobarlos con PostgreSQL real. El comportamiento SQLite no prueba ese contrato. [Documentación primaria de aislamiento PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

SQLite tampoco ejecuta las políticas RLS ni los permisos RPC de Supabase. Antes de exponer tablas o funciones deben revisarse grants, RLS y propiedad de filas; el rol de servicio puede omitir RLS y debe permanecer en servidor. No basta con comprobar que existe una sesión autenticada para autorizar filas de un propietario. Esta entrega no crea ni valida esas políticas. [Documentación primaria de RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Integración pendiente y GHL

No se conectará el núcleo a los consumidores existentes hasta resolver y revisar:

1. El vínculo entre identidad autenticada, cuenta interna y propietario de cada pedido.
2. El DDL y los RPC financieros vigentes, su atomicidad, permisos y punto común de confirmación. La futura acreditación debe poder repetirse sin duplicar y recuperarse tras fallos; no basta con una llamada posterior que pueda perderse después de confirmar el pago.
3. La elegibilidad de pedidos históricos, manuales y de prueba, sin inferir una regla a partir de los fixtures.
4. El tratamiento de devoluciones y cambios posteriores de evidencia o propietario.
5. El cumplimiento del regalo: productos, tamaños, sabores, stock y relación entre canje registrado y entrega real.

GHL podrá reflejar en el futuro progreso ya confirmado por el backend. No será autoridad de pago, conteo, emisión o canje, ni podrá escribir un saldo que sustituya al ledger. Esta entrega no incorpora llamadas, credenciales, sincronización ni dependencia de GHL.

La UI continúa mostrando el estado pendiente de [`ReferenceStorefront.tsx`](../src/reference/ReferenceStorefront.tsx). Los consumidores de revisión y el cierre de API de [`reference-review-guard.server.ts`](../src/server/reference-review-guard.server.ts) permanecen sin cambios. Los fixtures no se convierten en pedidos ni recompensas reales y esta arquitectura no activa rutas.

## Validación por completar

Esta sección debe completarse con el commit exacto, comandos, resultados y rutas de evidencia al terminar la implementación. La revisión documental no acredita pruebas de runtime, concurrencia o integración.

| Comprobación | Estado en esta redacción |
| --- | --- |
| Tipos y comportamiento del núcleo | Por completar por el responsable de implementación. |
| Diez pedidos únicos pagados; 9→10 y 19→20 | Por completar con fixtures y resultados reales. |
| Reintentos, doble autoridad, cambios de evidencia/propietario | Por completar con fixtures y resultados reales. |
| Autorización, lectura/canje ajeno y doble canje | Por completar con fixtures y resultados reales. |
| Rollback y concurrencia SQLite entre conexiones/procesos | Por completar con evidencia del adaptador local. |
| Ausencia de consumidores/rutas nuevas y UI preservada | Por completar sobre el diff final. |
| PostgreSQL/Supabase real, RLS y RPC vigentes | No ejecutado ni certificado por esta entrega local. |
| Proveedor de pagos, GHL, producción y cumplimiento del regalo | No ejecutado ni activado. |
