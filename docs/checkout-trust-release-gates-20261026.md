# Bagelito — Checkout Trust release gates (26-oct-2026)

## Alcance exacto

Rama `fix/checkout-proof-consent-rate-limit-20261026` basada en la rama QA `codex/culqi-payment-split-20261021`. Cambios al checkout y visualización del éxito; **ningún despliegue ni migración realizados en producción**.

### 1. Consentimiento explícito

- `ReservationFlow` muestra casilla no marcada, separada de `marketingOptIn`, accesible con teclado y visible antes del widget Culqi.
- El checkout se deshabilita hasta marcar la casilla. Backend Zod exige `termsAccepted=true` y `termsVersion="2026-10-26"` (versión publicada en `/legal`).
- Para pedidos nuevos, el trigger preparado en `supabase/add-checkout-legal-evidence.sql` registra `checkout_legal_version` y `checkout_legal_accepted_at`. Históricos quedan nulos, nunca se recalculan retrospectivamente.
- No hay evidencia criptográfica del clic: la prueba consiste en la aceptación explícita en UX y la validación del input con la marca del servidor al crear el pedido. Si se exige prueba jurídica más estricta, se debe revisar registro y conservación con asesoría local.

### 2. Pantalla de pago

- `/reserve/success?payment=paid` no puede mostrar «Pago confirmado» sin prueba de sesión de checkout almacenada en `sessionStorage`, de ámbito de pestaña y TTL de 30 minutos.
- Con el `orderCode` y el `checkoutSessionId`, el cliente consulta `POST /api/payments/culqi/status`. El servidor devuelve estado persistido; la UI exige `ok=true`, `reconciliationRequired=false`, `orderCode` idéntico y estado de entrega compatible con pago.
- Si falta prueba, el backend falla, se acaba el plazo, el pedido fue cancelado o existe una discrepancia, la UI NO muestra pago confirmado. No guarda datos de tarjeta/3DS ni coloca el UUID en la URL. Tampoco muestra el importe desde URL en pagos Culqi.
- La ausencia de sesión en otra pestaña o después de 30 minutos lleva al seguimiento/soporte sin afirmar pago, aunque un cargo realmente exista. Esta degradación es intencional para impedir falsas confirmaciones.

### 3. Antiabuso

- `src/lib/public-api-security.ts` devuelve 503 cuando falta `consume_api_rate_limit` en Supabase, en lugar de permitir tráfico ilimitado.
- **Producción actualmente NO tiene el RPC**, por lo que el código NO puede desplegarse antes de instalar y validar la migración de `supabase/add-public-api-hardening.sql` y su contrato/ACL. Hacerlo interrumpiría reservas, waitlist y otros formularios. Confirmar rate limits en varios IP/contactos legítimos y errores.
- No se agregan endpoints alternativos, claves, proveedores ni ampliaciones de permisos.

## Validación real obtenida

- Commit revisado `b3395f72a3a5444ef67c82cb7e4df8c8ad76f539`.
- Node 24 en sandbox Vercel sin credenciales financieras: 747 tests Node, 747 aprobados, cero fallos/omisiones.
- `npm run lint` exit 0 con una advertencia preexistente en `culqi-readonly-adapter.test.mjs:99`.
- `npm run build` exit 0 con Next.js y tipos.
- Simulaciones de éxito comprueban que una URL manipulada no genera un badge o importe de pago, que una respuesta asociada a otro pedido no verifica y que el pago cancelado o con reconciliación es revisión.
- SQL migración legal en Supabase QA probado transaccionalmente mediante `BEGIN ... SELECT ... ROLLBACK`. Durante la transacción aparecieron 2 columnas y 1 trigger; después hay **0 nuevas columnas y 0 triggers**; QA conserva su evento y pedido pagado. Sin migración aplicada.

## Pasos previos a publicar

1. Concluir QA de checkout bajo los cuatro estados (sin aceptar términos, aceptado, pendiente de pago, pago confirmado), en desktop y móvil con lectores de pantalla razonables. Probar múltiples pestañas y navegador privado.
2. Confirmar con asesoría comercial/legal que texto publicado y versión de política son apropiados. Incrementar versión si cambia el documento.
3. Instalar, validar y respaldar el **core Culqi** en producción con preflight y contratos según `docs/culqi-core-migrations-and-compatible-rollback.md`. No reejecutar el bootstrap sobre un core existente.
4. Configurar secret `ADMIN_SESSION_SECRET` y políticas de admin de la rama revisada; Vercel producción carece de este secret al momento de auditar.
5. Instalar y probar el RPC rate limit `consume_api_rate_limit` y confirmar en production que no falta antes de liberar nuevo código.
6. Coordinar el despliegue del checkout y el trigger de evidencia legal sin un checkout antiguo atendiendo nuevas reservas durante la instalación. La migración sola sobre el checkout viejo registraría falsas aceptaciones porque antes `termsAccepted` era constante `true`. No aplicar ni backfillear hasta aprobar esa transición.
7. Efectuar pago sandbox nuevo con tarjeta y Yape/3DS pertinente, vencimiento, retorno e idempotencia, simulando eventos 500/timeout y revisión. Verificar la entrega HTTP entrante desde CulqiPanel contra el endpoint accesible de un entorno seguro sin apagar el SSO de todos los previews.
8. Aprobar un SHA de release con CI GitHub Actions ejecutado realmente en runner (no confundirse con errores de scheduling sin steps), y plan de rollback compatible con pagos en vuelo.
9. Mantener Culqi live desactivado y `main` intacto hasta cerrar todos los puntos.

## Fuera de alcance

No se modificó `main`, Supabase producción, las claves de Culqi, el SDK de pagos, su webhook, el batch actual ni el calendario. Las correcciones de fechas históricas del homepage permanecen en PR #19 y el laboratorio visual en PR #18. No hay cobros reales o cambios de cuenta Culqi.
