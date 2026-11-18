# Delivery V2 — contrato de procedencia del origen (18-11-2026, 04:47 Lima)

**Estado: REVISIÓN ÚNICAMENTE / NO-GO comercial.** Auditoría de evidencia, no despliegue ni cambio de política. Destino de producto visual: **GHL AI Studio Vibe `1794259044802846738`**, subcuenta Bagelito `AO82PQzM13CKpSZO2hER`. Este PR no sustituye ese proyecto.

## Evidencia leída (18-11-2026)

1. API oficial GHL, `get-store-settings` de Bagelito: `shippingOrigin` corresponde a **Surco**, `blockShipping=false`, `storeOrderNotification.enabled=true`. El campo `state` contiene `lmia` (aparente error de calidad de datos). **No demuestra** que Vibe consulte esos valores ni que haya envíos/notificaciones reales. No se copiaron dirección privada ni teléfono al reporte.
2. `src/lib/reservations/delivery-v2/approved-policy-v2.json` (HEAD anterior `e27e8f0`): `public_dispatch_area="Lince, Lima"`, `private_origin="NOT_RECORDED_OR_REQUIRED"`; tarifas S/8, S/10, S/15, S/20 con escalones de distancia.
3. `destination-evidence-gate.mjs`: `measureTrustedRoute` recibe solamente `{destinationId,addressRevision,verificationId}`. La prueba de ruta aceptada contiene `destinationId`, revisión, verificación, hora, kilómetros y estado; **no hay identificador explícito del origen físico aprobado**. Esto NO prueba que la ruta se haya medido desde Surco, desde Lince ni desde un punto concreto.
4. `review-only-quote-adapter.mjs` y `review-only-draft-link.mjs`: una cotización candidata está marcada `payable:false`; los enlaces son de revisión humana. El hard stop comercial debe mantenerse.

## Riesgo / interpretación precisa

Existe un **vacío de procedencia del origen**, no un cálculo incorrecto demostrado. No se puede certificar una tarifa de delivery vinculada a una ruta usando únicamente la prueba de destino. Es indispensable resolver la procedencia del punto de salida real **antes de considerar la cotización comercialmente válida**, sin bloquear el trabajo visual S01–S04.

## Criterios de aceptación para integrar, no para alterar la tarifa

- Confirmar dentro del **Vibe original** si utiliza o ignora `shippingOrigin` de la tienda nativa GHL; adjuntar ID/build y evidencia reproducible.
- Confirmar con el propietario el origen logístico correcto; no reemplazar Surco por Lince por inferencia ni registrar la dirección privada en interfaces públicas.
- El cálculo de ruta del backend debe asociar la medida a un **origen autenticado/configurado en servidor**, a destino y a versión de dirección; la interfaz no puede suministrar el origen.
- Mantener cotizaciones `review-only` y `payable:false` hasta comprobar persistencia segura, pedido/idempotencia, webhooks y checkout real.
- Probar cambio de origen servidor, uso de origen obsoleto, discrepancia origen GHL/origen backend, revisión de destino y reintentos; todos deben fallar cerrados o disparar revisión, sin activar cobro.

## Restricciones observadas

No se inspeccionó el build del Vibe (navegador conectado sin contexto y URL pública no accesible desde herramientas de QA). No se editaron Golden, GHL, agentes, pedidos, cobros, checkout ni política. Esta evidencia no da permiso de merge/deploy.
