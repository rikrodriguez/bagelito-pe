# Bagelito PR #52 — Replay + flujo de revisión humana · QA 2026-11-09

## Trabajo realmente ejecutado
- Lectura de proyecto Supabase `bagelito-pe` mediante SQL **solo SELECT**: `public.orders` y `public.consume_api_rate_limit(text,text,integer,integer)` existen. `public.order_intents` y `public.order_intent_review_history` **NO existen**. No se aplicó DDL ni se consultó PII.
- Corregido `src/lib/order-intents/repository.ts`: reintento con la misma clave y payload devuelve estado vigente `reviewing`, `approved_for_followup`, `rejected` o `expired`; falla ante estado almacenado desconocido y rechaza cambio de payload. No se crea una segunda solicitud ni se altera estado de pago.
- Corregidos los mensajes de `src/app/request/OrderRequestForm.tsx` y `src/app/api/order-intents/route.ts`: un reintento después de revisión ya no dice falsamente que se trata de una solicitud nueva pendiente.
- Añadidas dos pruebas: `tests/order-intents-replay.test.mjs` (6 casos) y `tests/order-intents-flow.integration.test.mjs` (4 casos). La suite `test:order-intents` en `package.json` incluye ambas.

## Evidencia de ejecución local
- Ejecutados realmente `node --experimental-strip-types --test tests/order-intents-replay.test.mjs tests/order-intents-flow.integration.test.mjs` con Node 22.16.0 en entorno aislado.
- Resultado: **10/10 PASS, 0 FAIL, 0 SKIP**. Mock de base de datos, sin Next.js, sin sesión de navegador ni Supabase real.
- Hashes Git SHA comparados con las fuentes en el PR:
  - `repository.ts`: `fff9f9d1448783144285b6b56019692359321f30`
  - `review-state.ts`: `298ba2b946de2ea533fbd386796cfed9b41c00ff`
  - `order-intents-replay.test.mjs`: `9781b160f6db975aad0de6ea624b77232209009c`
  - `order-intents-flow.integration.test.mjs`: `8beb066afd34b002cfe2f84fb9d09952b367edb8`
- La compilación completa de Next.js, la suite completa de `package.json`, SQL RLS y QA móvil **NO** se ejecutaron.

## Evidencia de visuales
- Cleanroom PR #27 tiene `storefront-mvp/immersive/s01` y `s02a`, no carpetas S03 ni S04.
- Dropbox `/BAGELITO — MASTER VISUAL APROBADO/S03 — PACKS Y BAGELS`: solo `S03_DESKTOP_FINAL_CON_BOTONES.png` y `S03_MOBILE_FINAL_CON_BOTONES.png`.
- Dropbox `/BAGELITO — MASTER VISUAL APROBADO/S04 — SCHMEARS`: referencias `S04_DESKTOP_REFERENCIA_APROBADA.png`, `S04_MOBILE_REFERENCIA_APROBADA.png`.
- Dropbox `99 — EN REVISIÓN`: S02A fondos limpios **candidatos**, sin constancia de aprobación definitiva. No se copió ni cambió ninguna imagen Golden.
- No certificar como interactivos fondos con botones incrustados; se requiere aprobación de fondos limpios/asset hashes antes de S03/S04 final.

## Bloqueadores para uso real
1. Autorización explícita para aplicar y probar `supabase/add-order-intents.sql` y configurar claves/flags; **producción intacta** hasta entonces.
2. Ejecutar pruebas HTTP, Next.js y RLS/auth en un entorno adecuado; verificar que el dashboard muestre solicitudes reales con staff.
3. Integración de escenas aprobadas y catálogo final de schmears; no sustituir los Golden sin aprobación.
4. Verificación de domicilio, stock y proveedor de pago en sandbox antes de permitir un checkout pagable.

**No merge, no deploy, no gasto, no emails/WhatsApp/Instagram, no Dawn, no transacciones.**
