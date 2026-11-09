# Bagelito Delivery V2 — port canónico para Next.js (Draft, sin despliegue)

## Origen
Copiado sin cambios del contrato aprobado el **2026-11-06** en `rikrodriguez/bagelito-cleanroom`, rama `feat/immersive-storefront-mvp-2026-11-08`:

- `src/lib/delivery-v2/delivery-metropolitan.ts` ↔ Git blob `9c4fbec40da87d3e9fa5978f2971ce40e2eeceeb`.
- `src/lib/delivery-v2/delivery-private-tiers.ts` ↔ Git blob `e3d6a80ced387f9c7c7de9a8b45989a484649bce`.
- `src/lib/delivery-v2/delivery-tiers-public-v2.json` ↔ Git blob `1f3f6f2c831d75926096bb546de23d5223234862`.
- `tests/delivery-v2-canonical.test.ts` porta los 25 casos originales, ajustando **solo rutas de importación**.
- `src/lib/delivery-v2/review-only.ts` y `tests/delivery-v2-review.test.ts` son código nuevo que permite mostrar una tarifa orientativa **sin pago**.

## Reglas inmutables
Delivery V2 conserva tarifas S/8, S/10, S/15, S/20 y revisión manual según distrito y sector, incluida la excepción de La Molina. No requiere ni expone la dirección real de cocina.

Una tarifa por distrito **nunca** equivale a cotización cobrable: se necesita verificación independiente de la dirección del **cliente** y origen confiable de dicha verificación en backend. No aceptar evidencia de geocodificación del navegador ni reutilizar los valores por kilómetro del módulo V1. No aprobar pagos automáticos ni publicar.

## Bloqueadores conocidos del flujo actual
`src/lib/reservations/service.ts` del commit base `ca6f5b022864ee2164845f18c1c81f137cf0b108` utiliza actualmente `getDeliveryDistanceKm` y `getDeliveryFee` desde el módulo anterior en **dos caminos de pedidos**:
- `createReservation` (aprox. líneas 495-497, más notas de envío).
- `createCulqiReservation` (aprox. líneas 603-607, más notas y creación de sesión).

**Este PR todavía no modifica esos dos caminos.** No permitir merge ni habilitar Culqi sobre V1. El futuro reemplazo debe recibir `quoteDeliveryTier` solo desde la función de verificación interna y mantener `payment=not_requested` hasta aprobación humana.

## QA y paso siguiente
Se han incorporado 25 casos canónicos y 8 casos de wrapper, pero **no se han ejecutado sobre el código de este branch**. Se deben compilar y ejecutar desde un entorno Next.js completo y registrar resultado exacto. Las pruebas históricas reportadas en Cleanroom no certifican este port.

Posteriormente: diseñar un verificador server-side del destino real, conectar ambas rutas **en Draft**, añadir pruebas end-to-end, revisar precios SKU y presupuesto de infraestructura. No tocar producción, GHL, Supabase, escenas Golden, pagos, ni mensajes públicos sin autorización.
