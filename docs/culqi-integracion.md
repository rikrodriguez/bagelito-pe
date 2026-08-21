# Integración Culqi

La página de checkout muestra el pedido, los datos del comprador y los medios de pago. El formulario real se monta dentro del iframe seguro de Culqi únicamente cuando la integración está habilitada.

## Activación segura

Configurar en Vercel únicamente cuando Culqi haya aprobado el comercio y entregue las llaves:

```env
PAYMENT_PROVIDER=culqi
CULQI_ENABLED=true
NEXT_PUBLIC_CULQI_PUBLIC_KEY=pk_test_... # primero sandbox; luego pk_live_...
NEXT_PUBLIC_CULQI_RSA_ID=...             # ID público RSA de CulqiPanel
NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY=...     # llave pública RSA; nunca una llave privada
CULQI_SECRET_KEY=sk_test_...             # nunca en el cliente
```

No usar valores ficticios como `ABCXXX` y no commitear llaves. Con variables ausentes o `CULQI_ENABLED=false`, las rutas de Culqi responden como deshabilitadas. La página muestra una vista previa no interactiva que nunca captura datos de tarjeta.

## Medios de pago web

CulqiOnline queda configurado para ofrecer, según la habilitación comercial de la cuenta:

- Tarjetas Visa, Mastercard, American Express y Diners.
- Yape.
- Plin y otras billeteras mediante QR.
- PagoEfectivo por banca móvil/internet, agentes y bodegas.
- Cuotéalo BCP.

Apple Pay y Google Pay no se anuncian en el checkout web: la documentación pública de Culqi los ubica en CulqiFull/SuperPOS. Solo deben añadirse si Culqi confirma por escrito su habilitación para CulqiOnline en esta cuenta.

## Supabase

Ejecutar `supabase/add-payment-provider.sql` después del esquema base y de `add-public-api-hardening.sql`. La migración agrega metadatos de proveedor, intentos de pago y eventos webhook sin borrar el historial de pagos manuales.

## Webhook

Registrar en CulqiPanel el endpoint:

```text
https://bagelito.pe/api/webhooks/culqi
```

Habilitar estos eventos:

- `order.status.changed`
- `charge.creation.succeeded`
- `charge.creation.failed`
- `charge.expired`

El backend valida cada evento consultándolo server-to-server con la llave privada, comprueba moneda/monto, procesa el evento una sola vez y actualiza el pedido de Bagelito.

## Flujo implementado

1. Bagelito valida pack, sabores, delivery, total y capacidad en el servidor.
2. Se crea una reserva temporal de 30 minutos con `payment_status=pending`.
3. El backend crea la orden Culqi usando el monto guardado en Supabase.
4. Culqi Custom Checkout se incrusta en la página y tokeniza tarjeta o Yape sin que Bagelito reciba PAN ni CVV.
5. Para tarjeta, Culqi3DS genera el fingerprint del dispositivo; si Culqi responde `REVIEW`, el banco realiza la autenticación 3DS y el backend reintenta el mismo token con `authentication_3DS`.
6. El backend genera el cargo con el token y datos antifraude.
7. La respuesta del navegador nunca marca el pedido como pagado.
8. El webhook verificado cambia el pedido a `payment_confirmed`; el dashboard y tracking leen ese estado.
9. PagoEfectivo, billeteras, agentes y Cuotéalo permanecen pendientes hasta `order.status.changed`.

## Estado actual

El checkout embebido, los métodos CulqiOnline, 3DS, cargos, estado seguro y webhooks están implementados detrás del feature flag. Permanecerán bloqueados hasta que `CULQI_ENABLED=true` y existan todas las llaves sandbox.

Antes de producción falta validar con la cuenta real:

- Carga de `https://js.culqi.com/checkout-js` y `https://3ds.culqi.com`.
- Tarjeta aprobada, rechazada y con autenticación 3DS.
- Yape aprobado y rechazado.
- Orden alternativa pagada y vencida.
- Entrega de los cuatro eventos al webhook.
- Coincidencia de monto, PEN, pedido y estado del dashboard.

La autenticación 3DS y cada medio habilitado en CulqiPanel deben validarse con sandbox antes de habilitar tarjetas live. No se debe activar producción hasta completar los recorridos aprobados, rechazados, vencidos y duplicados.
