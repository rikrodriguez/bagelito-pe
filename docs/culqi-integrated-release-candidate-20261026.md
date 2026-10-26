# Bagelito — candidato integral de checkout Culqi (26-oct-2026)

**Estado: CANDIDATE / NO-GO para cobros live.** Rama integration/culqi-release-candidate-20261026, generada por merge de dos padres:

- main: b69114e1af4cd107235bf9eb799decbc863fbc9a (limitador productivo + fechas/FAQ correctos)
- QA: 158d9c4bb49aeada6fe90b9c2673271a2cd3202f (Culqi core y consentimiento/confirmación)
- Merge inicial: afbf98286421c3df884a4a372d120e848057e638

El conflicto de código src/app/reserve/ReservationFlow.tsx fue resuelto conservando los locks de checkout y consentimiento QA junto con las reglas de fechas/cupos de la web pública.

## Evidencia verificada

- Sandbox Node24 aislado del merge inicial: **756/756 pruebas Node aprobadas**, cero fallos/omisiones; ESLint cero errores (una advertencia preexistente); Next.js build/tipos correcto.
- La web pública de main ya es operativa en sus mensajes de tanda cerrada; el checkout no permite cobros live.
- QA de proveedor en rama de origen: un evento sandbox genuino aplicado por el handler POST compilado, segundo procesamiento idéntico identificado como duplicado, sin cargo ni recibo nuevo. **Eso NO demuestra entrega HTTP originada en servidores Culqi**.
- PR #21 protege la aceptación voluntaria (distinta del marketing), la versión legal, y la confirmación de pago desde el servidor, no desde una URL editable.

## Estado productivo y de QA

**Supabase producción:** proyecto enqpahoanbthnkrxfnxf; 2 pedidos históricos, 1 batch. El rate limiter standalone ya fue instalado y probado el 26-oct (RLS, service_role-only, carrera atomic UPSERT); no existen payment_attempts, payment_webhook_events ni apply_culqi_payment_event en producción. No están instalados los campos financieros core requeridos. No hay variables Culqi live en Vercel producción.

**Supabase QA:** proyecto qaahskendqdkynwtylho; core financiero presente, un evento test confirmado y deduplicado y registros QA de pagos pendientes/tardíos. Los secretos sandbox están limitados a la rama codex/culqi-payment-split-20261021, **no** a esta rama de integración.

## Bloqueos críticos antes de publicar/activar pagos

1. **Fundación productiva:** revisar el esquema/backup y un ensayo transaccional de supabase/add-payment-provider.sql sobre dos pedidos históricos antes de instalarlo. Solo después ejecutar supabase/preflight-culqi-checkout-core.sql; el preflight requiere esa fundación.
2. **Forward core:** revisar el orden, contratos y colisiones de supabase/add-checkout-safety.sql, add-culqi-session-expiry.sql, add-culqi-checkout-replay-guard.sql y add-culqi-charge-confirmation.sql. Probar PostgreSQL 17 core-only y full en base clonada; no ejecutar archivos a ciegas.
3. **No sobrescribir el rate limiter:** el SQL histórico supabase/add-public-api-hardening.sql modifica create_reservation_order y reemplaza consume_api_rate_limit. **NO** aplicarlo para reinstalar el limitador ni usarlo como dependencia sin reconciliar su contenido.
4. **Consentimiento real:** revisar la política legal vigente y coordinar el checkout nuevo con supabase/add-checkout-legal-evidence.sql. No instalar el trigger mientras el frontend antiguo todavía autoenvíe termsAccepted=true: falsificaría aceptación. Jamás backfillear retroactivamente la evidencia.
5. **Admin:** producción requiere un ADMIN_SESSION_SECRET fuerte y QA del nuevo login/sesiones. Sin transferir claves por chat.
6. **Webhook externo:** confirmar en CulqiPanel test la URL de callback y eventos del comercio. Las previews tienen SSO; una invocación interna del handler no prueba que un servidor Culqi alcance la URL. No desactivar SSO global ni filtrar un bypass compartido en una URL pública.
7. **Matriz Culqi real:** tarjeta aceptada/rechazada, Yape, 3DS, vencimiento, devolución/disputa, pago tardío, último cupo, doble clic y pérdida de webhook. CULQI_STATUS_RECOVERY_APPROVED debe seguir deshabilitado en live.
8. **CI:** confirmar un SHA final con Node, lint/build, suite SQL y GitHub Actions con runner asignado. Ejecuciones que fallan antes de iniciar pasos no cuentan como cobertura. Probar un entorno staging con configuración correcta y sin activar cobros reales.
9. **Rollback:** la versión main antigua no es financieramente compatible después de la captura de cargos token. En una incidencia, detener ingreso nuevo de reservas bajo lock pero conservar conciliación de cargos en vuelo y el core de base. No restaurar snapshots que borren evidencia ni reabrir cupos tras pagos tardíos.

**NO realizados:** no se instaló core Culqi en producción, no se hicieron nuevos cargos ni reembolsos, no se activaron claves live, no se desprotegió Vercel, no se mezcló esta rama de lanzamiento a main.

Referencias: docs/culqi-core-migrations-and-compatible-rollback.md, docs/checkout-trust-release-gates-20261026.md, docs/culqi-provider-http-delivery-runbook.md.
