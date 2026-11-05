# Bagelito — GHL verificaciones de integración (2026-11-04)

## Tenancy comprobado

- **GHL Location**: `Bagelito`, ID `AO82PQzM13CKpSZO2hER`.
- **Pipeline comercial existente**: `Bagelito | Ventas y pedidos`, ID `TArtIFN3L4DzET4TtcXY`.
- **14 etapas**, **14 campos de contacto** y **26 campos de oportunidad** actualmente existentes.
- **52/52 referencias configuradas** en `public.instagram_agent_facts.ghl_crm_config` verificadas contra esos objetos reales.
- Versión del mapeo de Supabase: `bagelito-ghl-new-location-v2`.
- 0 IDs de contactos y oportunidades del GHL antiguo conservados en los registros activos de Instagram. 
- Cola CRM al comprobar: 4 trabajos antiguos `dead`, 10 históricos `succeeded`, **0 pendientes**.
- CRM `enabled=false` y `approval=not_production_approved`. No cambiar hasta completar prueba de ida y vuelta segura.

## Datos almacenables

### Contactos

Ya existían: Instagram User ID, Instagram username, idioma preferido, sabores favoritos, tipo de cliente, sellos disponibles, pedidos entregados, consentimiento marketing.

Añadidos y verificados:
- Customer ID canónico: `XPKbLimEx53vQ0LdPYOE`
- Canal preferido: `fns5uWhvSvcavLTlLZp1`
- WhatsApp User ID: `38kccyyCbtiW1ThrjBjH`
- Ingresos verificados (céntimos PEN): `YamHaxEA0yu240i9hPZY`

No poblar el Customer ID canónico con el mero Instagram Contact ID; unificar identidad de cliente al integrar la nueva tienda. Los ingresos deben venir solo de pedidos pagados de forma confirmada. Consentimiento comercial nunca inferido por un DM.

### Oportunidades / pedidos

Ya existían: Draft ID, Conversation ID, Batch ID, pack, unidades, sabores y cantidades, schmears y cantidades, distrito, dirección, total PEN, método y estado de pago, etapa comercial, siguiente acción, motivo de handoff, checkout URL, ventana entrega, referencia de voucher, pedido final ID, canal de origen y estado de entrega.

Añadidos y verificados:
- Subtotal céntimos: `0nPO5N50Eierj5PTAGUh`
- Delivery céntimos: `5Tyov27FIACpCn6mjiwL`
- Total céntimos: `erq8ZnnSDKGcBEKAZgJl`
- Quote ID: `YG0d6bfx20yMPx2xXy2u`
- Event version: `7302eeuoG4yxrHiHWaWB`

En el enriquecimiento Instagram, subtotal/delivery/total en céntimos se generan solo con `quote_verified=true`. No inventar Quote ID hasta existir quote persistida en la tienda. Evitar duplicar ventas por event replay.

## Tests de escritura efectuados, sin datos reales

1. Crear contacto sintético DND y oportunidad de S/ 0 con ID de pipeline, canal, sabores y estado de pago. Ambos creados exitosamente y eliminados.
2. `/contacts/upsert` **dos llamadas independientes** con mismo email sintético: devolvieron mismo contact ID.
3. `/opportunities/upsert` **dos llamadas independientes** al mismo contacto/pipeline: devolvieron mismo opportunity ID.
4. Ambas entidades de la segunda prueba se eliminaron; búsqueda final **0 contactos y 0 oportunidades**.
5. No se enviaron correos ni mensajes a clientes reales.

Estas pruebas NO equivalen a una transacción completa Supabase→GHL ni garantizan idempotencia en todos los casos de concurrencia.

## Código Supabase

- `instagram-ghl-sync` **v5**: `verify_jwt=true`; se corrigió el health check, se exige `GHL_API_TOKEN`, `GHL_LOCATION_ID` coincidente con el destino aprobado, `target_name=Bagelito`, `enabled=true` y `approval=integration_test_approved|production_approved`. No se exponen credenciales en health.
- `instagram-sales-enrich` **v13**: actualiza campos de origen e importes seguros. Mientras `enabled=false` no encola nuevas operaciones ni invoca el worker.
- La fuente de verdad de pagos, pedidos, delivery y sellos es Supabase; GHL es la proyección comercial.

## Única dependencia operativa para sincronización continua

La conexión de GHL en ChatGPT permite operaciones a través del plugin, pero **no instala automáticamente el token dentro del runtime de Supabase**. La integración servidor a servidor utiliza una **Private Integration de GHL** generada en la nueva subcuenta Bagelito y almacenada en Supabase Edge Function Secrets:

- `GHL_API_TOKEN`: token privado de **Bagelito**, nunca de RikMarketing.
- `GHL_LOCATION_ID`: `AO82PQzM13CKpSZO2hER`.
- `GHL_API_VERSION`: `2021-07-28` opcional (el worker usa esa versión por defecto).

Scopes mínimos sugeridos para el worker Instagram: `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`; añadir `locations.readonly` solo si se desea verificar detalles del tenant por API.

**Nunca enviar el token por chat ni registrarlo en GitHub.**

Cuando estén los secretos:
1. Confirmar presencia con endpoint health autenticado de `instagram-ghl-sync` (solo flags booleanos).
2. Crear un evento CRM de prueba mediante Supabase, con destinatario de prueba y estado de cobro `pending`. Establecer temporalmente `enabled=true`, `approval=integration_test_approved`, solo después de confirmar cola vacía.
3. Verificar 1 contacto y 1 oportunidad creados sin duplicados, repetir evento y comprobar mismo ID.
4. Reconciliar `ghl_contact_id`, `ghl_opportunity_id`, colas, retrys y estados.
5. Limpiar QA y dejar `enabled=false` hasta la aprobación final de operación y seguridad.
6. Solo habilitar producción cuando catálogo, batch, pagos y pruebas completas estén aprobados.

## Fuera de alcance de esta verificación

- Nueva web cleanroom v1.3.1 todavía es un proyecto de código aislado: no está desplegada ni conectada a Culqi.
- WhatsApp todavía no tiene un adaptador productivo al backend canónico.
- No están activadas respuestas masivas por IA ni campañas comerciales.
- No se han importado clientes históricos sin reconciliación de identidad y consentimiento.

La configuración dinámica guardada en Supabase manda por encima de esta fotografía documental; verificar ambos lados de nuevo antes de futuras modificaciones.
