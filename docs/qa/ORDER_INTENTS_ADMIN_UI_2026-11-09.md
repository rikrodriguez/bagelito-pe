# Bagelito — Cola humana y captura sin cobro · QA 9 noviembre 2026

**Estado:** PR #52 Draft, no deploy, ninguna migración ejecutada ni pagos habilitados.

## 1. Cola privada
- `/admin/order-intents` usa el login existente mediante `requireAdmin()`; solo consulta hasta 100 solicitudes, muestra selección y permite revisar estados. Nada se envía al cliente ni se cobra.
- `src/app/admin/order-intents/actions.ts` valida el estado real de la base y actualiza bajo condiciones de concurrencia (`id`, `status`, `store_id`, `source`). Nunca modifica precios o pagos.
- `src/lib/order-intents/review-state.ts` define estados de revisión. `approved_for_followup` es una autorización para contacto humano, NO una compra confirmada.
- `supabase/add-order-intents.sql` — **NO APLICADO**. Propone notas internas, historial transaccional, reglas inmutables y RLS con revocación de acceso público. El login actual usa contraseña compartida, por lo que el historial no identifica a cada operador.
- El enlace desde `/admin` depende de `BAGELITO_ORDER_INTENTS_ADMIN_ENABLED=true`.

## 2. Carrito de consultas
- `/request` permite seleccionar packs, sabores, schmears y combos para revisión, sin tarifas pagables. Se ha implementado una página separada; las escenas Golden S01–S04 no se tocaron.
- `src/lib/order-intents/request-cart.ts` construye líneas de selección y controla cantidad, sabores, minis y duplicados; el servidor repite la validación.
- El formulario muestra solo estimación de delivery V2, acepta nombre, WhatsApp, email, distrito y dirección opcional, consentimiento requerido y marketing opt-in independiente.
- El enlace desde `/reserve`, la página y la API exigen DOS flags: `BAGELITO_ORDER_INTENTS_ENABLED=true` y `BAGELITO_ORDER_INTENTS_ADMIN_ENABLED=true`, ambos apagados por defecto.
- Los 15 SKU individuales de schmears y los combos especiales requieren reconciliación con las seis categorías de precio que utiliza este formulario de prueba.

## 3. Pruebas y evidencia
- **8/8 PASS ejecutadas** con Node 22 sobre la máquina de estados, contra archivos verificados por SHA Git.
- **8/8 PASS ejecutadas** sobre el cart mapper compilado con TypeScript 5.8.3 y las ocho pruebas publicadas. El entorno aislado usó una copia mínima de los identificadores de catálogo.
- **19/19 comprobaciones estáticas PASS** sobre los archivos reales consultados a GitHub: seguridad admin, activación, no pago, RLS, índices, historial y UI. Estas NO son pruebas HTTP.
- `package.json` incorpora `npm run test:order-intents`. El comando combinado, Next.js build, navegador, Supabase real y QA completo siguen **NO EJECUTADOS**.
- Read-only Supabase: proyecto `bagelito-pe` activo; `to_regclass('public.order_intents')` dio `null` y tablas existentes `orders`/`waitlist_signups` sí están presentes. No se leyó PII, no se aplicó SQL.

## Bloqueos para un piloto real
1. Autorizar instalación y verificación de SQL/RLS y una política de retención de datos; hasta entonces la captura sigue desactivada.
2. Verificar en entorno de ensayo la sesión Admin, secreto HMAC, flags, índices, idempotencia y transiciones auditadas.
3. Compilar Next.js y probar `/request` en escritorio/móvil y end-to-end con la API; integrar después con Golden aprobados.
4. Completar 15 SKU de schmear, stock, delivery por domicilio verificado y conciliación del proveedor de pago en sandbox; ninguna activación sin autorización.

Sin merge, deployment, cobros, mensajes de Dawn, servicios pagados ni modificaciones Golden.
