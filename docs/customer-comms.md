# Customer comms

Mensajes operativos para acompanar cada reserva de Bagelito sin automatizacion pesada.

## Objetivo

- Reducir trabajo manual repetitivo.
- Mantener al cliente informado desde compra hasta feedback.
- Dejar historial interno de mensajes enviados en `order_status_history`.
- Evitar duplicados visibles en admin.

## Flujo

1. `Msg order`
   - Momento: reserva nueva con pago pendiente o correccion.
   - Objetivo: confirmar que Bagelito recibio la reserva.
   - Evento loggeado: `whatsapp_order_received_sent`.

2. `Msg paid`
   - Momento: pago confirmado.
   - Objetivo: decir que el pack queda separado para el batch.
   - Evento loggeado: `whatsapp_payment_confirmed_sent`.

3. `Msg delivery`
   - Momento: pedido en `ready_for_delivery`.
   - Objetivo: recordar direccion, telefono disponible y notas de entrega.
   - Evento loggeado: `whatsapp_delivery_reminder_sent`.

4. `Msg received`
   - Momento: cliente ya recibio el pedido.
   - Objetivo: cerrar el handoff y agradecer.
   - Evento loggeado: `whatsapp_delivered_sent`.

5. `Msg feedback`
   - Momento: despues de `Msg received`.
   - Objetivo: pedir testimonio, foto, nota de voz o feedback corto.
   - Evento loggeado: `whatsapp_feedback_request_sent`.

## Uso en admin

- `/admin` muestra la cola `Customer comms`.
- La cola propone el siguiente mensaje pendiente segun el status del pedido.
- El detalle `/admin/orders/{CODIGO}` muestra todos los mensajes disponibles para ese cliente.
- Cada boton abre WhatsApp con texto prellenado y registra el evento al enviar el formulario.

## Reglas

- No enviar `Msg paid` sin pago validado.
- No enviar `Msg delivery` hasta que el pedido este listo para salir.
- No enviar `Msg feedback` antes de confirmar recibido.
- Si hubo problema de direccion, producto o pago, registrar contexto en `Admin notes`.
- Antes de automatizar envio real, validar consentimiento y politicas de WhatsApp Business.
