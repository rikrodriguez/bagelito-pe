# Reconciliación local Culqi — 12 octubre 2026

Estado: candidato local EN REVISIÓN. No publicado, no desplegado, ninguna migración remota ejecutada. Pendiente de sandbox antes de activar pagos. La presencia de una UI o pruebas verdes no acredita ventas operativas.

## Procedencia preservada

Base Git: `1e6e2a6ff5270cb1221dcb8a6c25f87e4e1e3335`.
Paquete recuperado: `Bagelito_checkout_reconciled_local_2026-10-04.zip`; corroborado por `BAGELITO_CULQI_G2_followup_candidate_2026-10-04.zip`.
Patch original SHA-256: `fd2e94e8c4de59beb7b35260fd8c801e7c7d4bd068d30c7eee947d510c7b113f`.
El paquete histórico declaraba 42 pruebas; se reprodujeron 42/42 antes de reconciliar. Sus resultados históricos de PostgreSQL y auditoría no se presentan como actuales.
PR1: https://github.com/rikrodriguez/bagelito-pe/pull/1, head `36215af2319b655aa71efc3362bd7474609f2cfd`. Sus 22 pruebas pertenecen a ese commit, no a este candidato.

## Matriz de divergencias

| Área | Paquete 4 octubre | PR1 | Candidato actual |
|---|---|---|---|
| Configuración | modo, prefijos, origen sandbox, aprobación live | configuración base más permisiva | conserva guardas del paquete |
| Demo | elimina formulario PAN/CVV y éxito ficticio | permanecía en base | conserva eliminación |
| Preparar pago | orden Culqi con claim previo | orden Culqi sin claim previo | sesión local tokenizada atómica, sin orden Culqi |
| Cargos | claim en payment_attempts, bool | claim order-level JSON + 3DS | contrato JSON único; legacy cerrado; incertidumbre no expira |
| Webhook | varias escrituras no atómicas | una RPC transaccional | transacción completa + source.id exacto + JSON serializado |
| Identidad | fallback source.id | fallback débil | source.id obligatorio en fallback metadata |
| Capacidad | apertura programada y conteo consistente | base | conserva, agrega lock batch→order y reloj posterior al lock |
| Carreras | cobertura claims | fixtures sin PG | PG real: claims y webhook duplicado; nuevas regresiones adversarias en revisión |
| Reembolsos | 501 hasta contrato definido | sin ciclo completo | conserva 501, conciliación manual |
| Dependencias | Next15.5.27/sharp0.35.4 | base | Next15.5.27 + sharp0.35.5 + source-map-js1.2.2; auditoría completa no concluida |
| Medios alternativos | habilitados junto con tarjeta | habilitados | eliminados frontend/backend; tarjeta + Yape tokenizado, sin órdenes alternativas |

## Separación de carriles

La revisión identificó que una orden Culqi emitida puede confirmarse con llave pública. Se eliminó la emisión de órdenes del código servidor y `settings.order` del Checkout. `/api/payments/culqi/order` conserva la URL, pero únicamente llama a `prepare_culqi_token_session`: crea/reutiliza un intento local con `provider_order_id NULL` y devuelve `sessionId`, nunca una orden Culqi. Una fila nueva usa `payment_lane=token`; las existentes conservan `legacy` y no pueden preparar ni reclamar un cargo tokenizado. También se rechaza un ID de orden alternativa inyectado en una fila token. Los antiguos RPC de preparación/attach están cerrados.

Checkout habilita tarjeta y Yape tokenizado. El backend y SQL aceptan fuentes `tkn_` y `ype_`; billeteras alternativas, banca, agente y cuotealo están deshabilitados. Yape comparte el mismo claim de la reserva con tarjeta, exige PEN y máximo S/2000, y no admite autenticación 3DS de tarjeta. El código de aprobación Yape se introduce únicamente en Checkout de Culqi; Bagelito recibe el token. Una respuesta alternativa inesperada se rechaza y no muestra éxito. Los eventos de órdenes alternativas/legacy quedan para conciliación manual; no se convierten automáticamente en pagos tokenizados.

La prueba sandbox todavía debe confirmar que Custom Checkout funciona sin settings.order y con RSA token Checkout js + token Yape. No se ha hecho un cobro ni una solicitud de pago externa.

## Migración y concurrencia

`supabase/add-checkout-safety.sql` es la única propuesta consolidada. No ejecutar también `add-culqi-payment-serialization.sql` de PR1. El paquete antiguo tenía la misma firma `claim_culqi_charge(uuid,text,text,boolean)` con retorno boolean; esta versión retorna JSON. Si aquella RPC ya existe, requiere inspección y migración explícita de contrato, no un reemplazo ciego.

Las filas previas sin resultado conocido se conservan bloqueadas. Un timeout/error no libera automáticamente otro cargo. Un fallo verificado de la misma fuente invalida el intento anterior; una respuesta tardía no debe reabrirlo. El webhook escribe pedido, intento, historial y marcador dentro de una transacción. La confirmación toma el lock de batch antes del pedido, al igual que la reserva, para serializar capacidad. Pagos tardíos después de liberar reserva quedan cancelados y requieren conciliación.

## Verificación y límites

58 pruebas unitarias actuales usan fixtures e I/O sustituido; no prueban Culqi real. PostgreSQL 17.11 se ejecuta en un clúster temporal local en 127.0.0.1 con datos sintéticos y limpieza al finalizar. No usa Supabase remoto. El runner rechaza fixtures fuera de bagelito_test/setting de pruebas. Ver logs entregados para el número y salida final actuales.

Build/lint/types se ejecutan sobre el diff final; consultar logs para resultado. Auditoría npm nueva NO confirmada: la revisión automática canceló el sondeo y no se reintentó. No se atribuye el resultado histórico de vulnerabilidades al candidato actual.

Comprobación independiente de versiones: se detectaron sharp0.35.4 y source-map-js1.2.1, afectados por GHSA-wq5f-xc86-pv6w y GHSA-68fv-2mgg-jv7q. Overrides y lock actualizados a sharp0.35.5 y source-map-js1.2.2, las versiones corregidas indicadas por los avisos. `npm ls` verifica el árbol efectivo; no equivale a una auditoría completa.

- https://github.com/advisories/GHSA-wq5f-xc86-pv6w
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q

Pendientes: auditoría de dependencias; validación sandbox de tarjeta + Yape tokenizado; inspección del esquema objetivo; entorno sandbox aislado con datos sintéticos; pruebas Culqi/3DS reales de prueba, webhook público alcanzable, timeout y conciliación; aprobación comercial/live separada. Ninguna credencial en chat o en artefactos.

## Configuración prevista, todavía no habilitada

Variables verificadas: PAYMENT_PROVIDER, CULQI_ENABLED, CULQI_MODE, CULQI_LIVE_APPROVED, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_CULQI_PUBLIC_KEY, NEXT_PUBLIC_CULQI_RSA_ID, NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY, CULQI_SECRET_KEY. Sandbox exige prefijos test coherentes, VERCEL_ENV distinto de production y origen exacto localhost o preview. No usar el proyecto/base de producción para fixtures. Las credenciales las ingresa el titular en el mecanismo seguro del hosting tras verificar aislamiento.

## Fuentes oficiales

- https://docs.culqi.com/es/documentacion/pagos-online/llaves_rsa
- https://docs.culqi.com/es/documentacion/checkout/checkout-custom
- https://docs.culqi.com/es/documentacion/pagos-online/webhooks/
- https://apidocs.culqi.com/ (confirmar orden y eventos)
- https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape
- https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos/

## Dominio estable de sandbox

El origen configurado puede ser VERCEL_URL o VERCEL_BRANCH_URL únicamente dentro de VERCEL_ENV=preview; cada request debe coincidir con el origen exacto de NEXT_PUBLIC_SITE_URL. Otro alias, puerto, esquema, rama o producción falla cerrado. Variables se deben asignar solo a la rama de sandbox en Vercel; esta propuesta no cambia scopes remotos.
Fuente: https://vercel.com/docs/environment-variables/system-environment-variables
