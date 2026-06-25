# Runbook operativo Bagelito.pe

Documento interno para operar cada batch mensual de Bagelito: abrir/cerrar pedidos, confirmar pagos, producir, exportar delivery, marcar recibido y archivar o borrar clientes.

## Accesos

- Web publica: `https://bagelito.pe`
- Panel admin: `https://bagelito.pe/admin`
- Detalle de pedido: `https://bagelito.pe/admin/orders/{CODIGO_PEDIDO}`
- El password de admin no debe guardarse en este documento. Pedirlo al owner cuando sea necesario.

## Reglas base

- No producir pedidos sin pago confirmado.
- Exportar CSV antes de cerrar batch, antes de delivery y antes de borrar clientes.
- Usar `Archive` para limpieza diaria. Usar `Delete permanently` solo cuando sea realmente necesario.
- Los vouchers de pago son privados. Verlos solo desde el link firmado del admin.
- `delivered` en el sistema significa recibido por el cliente o dejado en la recepcion autorizada.

## Estados principales

### Batch

- `orders_open`: el batch esta abierto y puede recibir pedidos.
- `waitlist_open`: estado operativo para lista de espera; revisar que el flujo publico este alineado antes de usarlo.
- `closed`: pedidos cerrados. La web ya no debe aceptar nuevas reservas del batch.
- `in_production`: batch cerrado y en produccion.
- `delivered`: batch terminado.

### Pedido

- `payment_pending_review`: pedido nuevo esperando revision de voucher.
- `payment_confirmed`: pago validado; entra a produccion.
- `needs_correction`: falta corregir datos, voucher o pago.
- `in_production`: pedido en horno/preparacion.
- `ready_for_delivery`: pedido empacado y listo para ruta.
- `delivered`: cliente recibio el pedido.
- `cancelled`: pedido cancelado.
- `archived`: no es status del pedido; se registra en historial y oculta el pedido de vistas activas.

## Flujo recomendado por batch

1. Preparar batch
2. Abrir pedidos
3. Revisar pagos
4. Cerrar batch
5. Producir y empacar
6. Preparar ruta
7. Entregar y marcar recibidos
8. Cerrar operacion y archivar

## 1. Preparar y abrir batch

Entra a `/admin` y usa `Batch management`.

Checklist:

- Definir nombre del batch.
- Definir capacidad por packs y/o bagels.
- Definir fecha de cierre de pedidos.
- Definir fecha de delivery.
- Poner status `orders_open`.
- Guardar cambios.
- Revisar la home publica y el formulario de reserva.

Notas:

- Si la fecha de cierre ya paso, el sistema puede bloquear reservas aunque el status acepte pedidos.
- Para cerrar checkout manualmente, usar status `closed`.
- Despues de abrir, hacer un pedido de prueba solo si se necesita verificar el flujo completo.

## 2. Confirmar pagos

Entrar a `/admin` y revisar la lista de clientes.

Para cada pedido nuevo:

- Revisar nombre, WhatsApp, distrito, direccion, pack y sabores.
- Abrir `View private signed proof` si hay voucher.
- Comparar voucher con monto total, metodo de pago, numero de operacion y nombre/pago registrado.
- Si todo esta correcto, presionar `Confirm paid`.
- Si falta algo o el voucher no cuadra, presionar `Needs correction`.
- Si todavia no se puede validar, dejarlo en `Not confirmed`.

Despues de confirmar pago:

- Usar `Msg paid` para abrir/loggear el mensaje de WhatsApp de pago confirmado.
- Verificar que el pedido aparezca como pagado en stats, produccion y delivery.

Regla:

- Solo los pedidos en `payment_confirmed`, `in_production`, `ready_for_delivery` o `delivered` cuentan para produccion.

## 3. Cerrar batch

Antes de cerrar:

- Descargar `Full backup CSV`.
- Revisar `No proof`, `Solo pendientes` y `Needs correction`.
- Decidir que pedidos quedan fuera, se corrigen o se cancelan.
- Avisar por WhatsApp a clientes pendientes si aplica.

Para cerrar:

- Ir a `Batch management`.
- Cambiar status a `closed`.
- Confirmar fecha de delivery.
- Guardar.
- Revisar la web publica para confirmar que ya no se acepten pedidos.

Despues de cerrar:

- Descargar `Production CSV`.
- Revisar packing list por sabor y pack.
- Pasar pedidos confirmados a produccion.

## 4. Producir y empacar

Usar `Production ops` dentro de `/admin`.

Checklist de produccion:

- Revisar total de packs y total de bagels.
- Revisar `Packing list by flavor`.
- Revisar `Packs by type`.
- Descargar `Production CSV`.
- Imprimir o compartir la lista operativa si se trabaja fuera del admin.

Etapas:

- `Hornear`: pedidos en `payment_confirmed`. Accion: `Start baking`, cambia a `in_production`.
- `Empacar`: pedidos en `in_production`. Accion: `Mark packed`, cambia a `ready_for_delivery`.
- `Entregar`: pedidos en `ready_for_delivery`. Accion: `Mark delivered`, cambia a `delivered`.
- `Recibidos`: pedidos que ya estan en `delivered`.

Reglas:

- No marcar `ready_for_delivery` hasta que el pack este cerrado.
- No marcar `delivered` desde produccion si aun no hubo handoff real. Si se usa como cierre rapido, confirmar primero con delivery.
- Cualquier excepcion debe anotarse en `Admin notes` del pedido.

## 5. Preparar delivery

Usar `Delivery ops` dentro de `/admin`.

Checklist:

- Revisar ruta sugerida por distrito.
- Revisar orden por distancia desde Lince.
- Descargar `Driver CSV` para ruta accionable.
- Descargar `Delivery CSV` para resumen por distrito.
- Confirmar que cada pedido tenga direccion, referencia, WhatsApp y handoff claro.
- Revisar si el pedido es para cliente o porteria.

Durante delivery:

- El driver debe usar el checklist del `Driver CSV`.
- Contactar al cliente por WhatsApp si hay duda de direccion o recepcion.
- Si el cliente no responde, esperar hasta la ventana definida en la politica de delivery.
- Registrar cualquier incidencia en `Admin notes`.

## 6. Marcar recibido

Cuando el cliente recibe el pedido:

- En `/admin`, usar `Mark received` en la tarjeta del cliente, o
- Entrar al detalle del pedido y cambiar status a `delivered`.

Despues de marcar recibido:

- Usar `Msg received` para abrir/loggear el WhatsApp de confirmacion.
- Verificar que el pedido salga de `Paid not received`.
- Revisar el contador `Received by customer`.

## 7. Archivar clientes

Usar `Archive` para limpiar vistas activas sin perder historial.

Cuando archivar:

- Pedido entregado y sin reclamos abiertos.
- Pedido cancelado que ya no requiere seguimiento.
- Pedido de prueba ya revisado.

Como archivar:

- En la lista de clientes, presionar `Archive`, o
- En el detalle del pedido, usar `Archive customer`.

Para recuperar:

- Entrar al tab `Archive`.
- Abrir el pedido.
- Presionar `Restore customer`.

Efecto:

- El pedido queda oculto de vistas activas de CRM, produccion y delivery.
- El historial se conserva.

## 8. Borrar clientes definitivamente

Usar solo para pedidos fake, duplicados o datos que ya no deben existir.

Antes de borrar:

- Descargar `Full backup CSV`.
- Seguir la rutina de backups en `docs/supabase-backups-rutina.md`.
- Confirmar que no sea un cliente real con reclamo, pago, delivery pendiente o necesidad contable.
- Revisar si existe voucher subido.
- Abrir el detalle del pedido.

Para borrar:

- Ir a `/admin/orders/{CODIGO_PEDIDO}`.
- En `Delete customer`, escribir el codigo exacto del pedido cuando el formulario lo pida.
- Confirmar `Delete permanently`.

Efecto:

- Borra el cliente/pedido.
- Borra items del pedido e historial asociado por cascada.
- Borra el voucher de pago del storage si existia.
- No se puede deshacer desde el admin.

## 9. Exports operativos

Desde la parte superior del admin:

- `Full backup CSV`: respaldo completo de pedidos, clientes, pago, items e historial.
- `Production CSV`: packing list, packs por tipo y checklist de produccion.
- `Delivery CSV`: resumen por distrito.
- `Driver CSV`: ruta por distrito, checklist de entrega, datos de contacto y direccion.

Cadencia recomendada:

- Semanalmente: descargar `Full backup CSV` y guardarlo fuera del repo segun `docs/supabase-backups-rutina.md`.
- Antes de cerrar batch: `Full backup CSV`.
- Antes de producir: `Production CSV`.
- Antes de salir a ruta: `Driver CSV` y `Delivery CSV`.
- Despues de terminar delivery: `Full backup CSV`.
- Antes de borrar cualquier cliente real o sensible: `Full backup CSV`.

## 10. Customer comms / WhatsApp operativo

Mensajes desde admin:

- `Msg order`: post-compra. Usar cuando entra una reserva nueva y el pago esta pendiente o necesita correccion.
- `Msg paid`: usar despues de confirmar pago.
- `Msg delivery`: usar cuando el pedido esta en `ready_for_delivery`, antes de salir a ruta o durante la coordinacion con driver.
- `Msg received`: usar despues de marcar recibido.
- `Msg feedback`: usar despues del mensaje de recibido para pedir feedback, foto o testimonio.

Buenas practicas:

- Loggear el mensaje despues de enviarlo.
- No duplicar mensajes si ya aparece como logged.
- Si el boton no aparece, revisar el status del pedido.
- Si hay duda o excepcion, escribirla en `Admin notes`.

Cadencia recomendada:

1. Pedido entra: enviar/loggear `Msg order`.
2. Pago validado: cambiar a `payment_confirmed` y enviar/loggear `Msg paid`.
3. Empaque listo: cambiar a `ready_for_delivery` y enviar/loggear `Msg delivery`.
4. Cliente recibio: cambiar a `delivered` y enviar/loggear `Msg received`.
5. Despues de probar: enviar/loggear `Msg feedback`.

## 11. Customer CRM

Usar `Customer CRM` dentro de `/admin` para revisar:

- Historial por cliente.
- Clientes repetidos.
- Ultima compra.
- Total gastado confirmado.
- Preferencias de sabores.
- Historial de distritos.

Reglas:

- Revisar el detalle del pedido para ver `Customer history` completo de esa persona.
- Usar clientes repetidos para priorizar comunicacion y feedback.
- Si un pedido fue archivado, sigue contando como historial.
- Si un pedido fue borrado, desaparece del historial.
- Para merges manuales o notas permanentes por cliente, evaluar una tabla `customers` mas adelante.

## 12. Finanzas

Usar `Financial snapshot` como lectura rapida:

- Ventas confirmadas.
- Valor pendiente.
- Delivery collected.
- Packs por batch.
- Costos reales editables.
- Margen por pack.
- Utilidad neta por batch.

Antes de cerrar el batch:

- Actualizar `Ingredient / bagel` con el costo promedio real de ingredientes.
- Actualizar `Packaging / pack` con empaque, bolsa, caja o etiqueta.
- Actualizar `Real delivery cost` con lo pagado al driver/courier.
- Usar `Other batch costs` para merma, compras urgentes, comisiones o extras.
- Revisar `Margin by pack` para ver que packs dejan mejor margen.
- Revisar `Net profit` antes de archivar o cerrar la operacion.

Nota:

- El margen sigue siendo operativo, no contabilidad formal. Para cierre contable, comparar con comprobantes reales y extractos de pago.

## 13. Cierre de batch

Checklist final:

- Todos los pedidos pagados estan en `delivered` o tienen nota de incidencia.
- `Paid not received` esta en cero o justificado.
- WhatsApp de recibido enviado/loggeado cuando aplique.
- `Full backup CSV` descargado.
- Pedidos fake borrados.
- Pedidos reales entregados archivados si ya no necesitan seguimiento.
- Finanzas revisadas.
- Batch status cambiado a `delivered`.

## Incidencias comunes

### Voucher no cuadra

- Marcar `Needs correction`.
- Contactar por WhatsApp.
- Anotar detalle en `Admin notes`.
- No producir hasta corregir y confirmar.

### Cliente cambia direccion

- Actualizar nota operativa en `Admin notes`.
- Si cambia distrito/costo, coordinar manualmente antes de delivery.
- Revisar ruta otra vez antes de exportar driver CSV.

### Cliente no recibe

- Mantener pedido sin `delivered`.
- Anotar incidencia.
- Coordinar re-entrega si aplica segun politica.
- Marcar `delivered` solo cuando haya handoff real o autorizacion clara de porteria.

### Pedido duplicado o fake

- Si no tiene utilidad operativa, borrar desde detalle.
- Si podria servir para auditoria temporal, archivar primero.

## Checklist rapido de un dia de delivery

1. Entrar a `/admin`.
2. Descargar `Full backup CSV`.
3. Revisar `Production ops`.
4. Descargar `Production CSV`.
5. Confirmar que todo lo empacado este `ready_for_delivery`.
6. Revisar `Delivery ops`.
7. Descargar `Driver CSV`.
8. Entregar por ruta.
9. Marcar cada pedido como `delivered`.
10. Enviar/loggear `Msg received`.
11. Descargar `Full backup CSV` final.
12. Archivar pedidos completados.
