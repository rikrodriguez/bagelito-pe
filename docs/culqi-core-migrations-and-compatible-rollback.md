# Migraciones core y cierre compatible de reservas Culqi

Este cambio prepara protección y pruebas; no instala SQL ni ejecuta el cierre en un proyecto remoto. El checkpoint anterior es `55994415ffdfca1b81a5b88831eca8489d4b1953`. La rama del PR4 conserva su exclusión de despliegue automático.

## Por qué se añade una corrección

El historial Git sitúa `add-checkout-safety.sql` en `8d925ee5bb2a09499b8a951b10e9321d7165c551` y `add-culqi-session-expiry.sql` en `d2c9cad3b91b7408b9e74531d892749c4e1102b5`. Sus bytes se conservan: SHA256 `f5fc23551be00ac1eb869e8997e33df9ea7dadc34821cbcc87ed1fbfba1e2292` y `40e87814e92edc5f5e199202ee827692fafab99140fb3cd266c265486e378dee`, respectivamente.

La evidencia guardada de QA registra los prerrequisitos core instalados y la migración posterior `add_culqi_status_charge_recovery_8bac392`, versión `20261014232708`, aplicada una vez. No se consultó ahora el esquema remoto ni se infiere el estado instalado en producción. Reescribir los archivos anteriores dejaría una misma migración con contenido distinto en instalaciones existentes.

El ensayo previo en PostgreSQL 17.11 reprodujo el defecto: repetir el primer archivo reemplaza dos motivos `charge_result_uncertain` por `legacy_payment_outcome_unknown` y convierte un resultado incierto con ID de cargo en `submitted`. También puede reemplazar definiciones de RPC posteriores aunque no existan filas afectadas.

Por ello se añade `supabase/add-culqi-checkout-replay-guard.sql`, sin backfill de pagos ni cambios de credenciales. Su trigger aborta las dos transiciones destructivas reproducidas con SQLSTATE `23514`. Ejecutar el archivo antiguo completo sobre esos fixtures falla y revierte tanto datos como DDL. Las transiciones verificadas a pagado, fallo y expiración siguen los RPC existentes. No se reconstruyen motivos que ya se hubieran perdido.

## Preflight y orden de instalación propuesto

Los archivos de este repositorio son scripts SQL explícitos; no constituyen un historial generado por Supabase CLI. No se crea ni modifica un ledger remoto en esta entrega.

1. Inventariar por un canal ya autorizado el esquema y el historial del destino, y revisar las filas del backfill antes de una instalación inicial. Este paso no se ejecutó en entornos reales.
2. Para una primera instalación, ejecutar `supabase/preflight-culqi-checkout-core.sql` con parada en el primer error. Es de solo lectura: rechaza core ya presente, un contrato boolean incompatible y colisiones de identidades. Sus mensajes son constantes y no enumeran pedidos ni identidades.
3. Sólo si ese preflight y la revisión del destino pasan, aplicar una vez `add-checkout-safety.sql`, después `add-culqi-session-expiry.sql` y después la nueva protección. No ejecutar los scripts siguientes si falla alguno.
4. Si el core ya está instalado, verificar sus contratos y aplicar sólo la nueva protección como cambio forward revisado. El preflight de primera instalación debe rechazar este destino; no se sortea su error repitiendo el core.

El preflight y el trigger cumplen funciones distintas. El primero bloquea el replay de la instalación incluso sin datos inciertos; el segundo protege las escrituras destructivas observadas si alguien omite ese procedimiento. El trigger no identifica cualquier posible ejecución de DDL ni convierte el archivo histórico en una migración universalmente idempotente. La nueva protección sí se prueba al repetir su propio archivo.

Las migraciones `add-culqi-charge-get-reconciliation.sql` y `add-culqi-status-charge-recovery.sql` siguen siendo exclusivas de QA y se excluyen del perfil core. Ningún paso de este documento autoriza su instalación ni habilitación live.

## Rollback compatible: detener la entrada y conservar la liquidación

El `main` antiguo `1e6e2a6ff5270cb1221dcb8a6c25f87e4e1e3335` **no es un rollback financiero compatible** con pagos token en vuelo. Sus escrituras directas de [status](https://github.com/rikrodriguez/bagelito-pe/blob/1e6e2a6ff5270cb1221dcb8a6c25f87e4e1e3335/src/app/api/payments/culqi/status/route.ts) y [webhook](https://github.com/rikrodriguez/bagelito-pe/blob/1e6e2a6ff5270cb1221dcb8a6c25f87e4e1e3335/src/app/api/webhooks/culqi/route.ts) omiten los RPC nuevos: el ensayo reprodujo cancelación de un cargo en vuelo, reapertura tras pago tardío, modificación de fechas en replay y regresión de un pedido entregado. Conservar únicamente las tablas nuevas no corrige esos handlers.

El procedimiento preparado conserva el binario compatible de checkout/status/webhook y todas las funciones/tablas core. `supabase/operations/close-culqi-intake.sql` cierra únicamente un lote elegido explícitamente, en una sentencia atómica que toma el mismo lock que las reservas. Una reserva confirmada antes de adquirir ese lock sigue siendo válida; las nuevas inserciones posteriores se rechazan. No se usa `CULQI_ENABLED=false` como interruptor de entrada porque también deshabilita status y webhook.

Antes de una ejecución real, el responsable debe elegir el proyecto, el lote y la ventana operativa, y certificar el binario que conservará. El cierre del lote también afecta nuevas reservas manuales. No se ha elegido ni cerrado ningún lote real, y no se ofrece una reapertura automática: esa decisión requiere revisar capacidad y pagos en vuelo.

Para el operador, el contrato del artefacto es una sesión de base ya autenticada y verificada que establezca estos tres parámetros y ejecute el archivo con parada ante cualquier error:

```sql
-- Sustituir el UUID por el lote revisado; no ejecutar esta plantilla sin elegirlo.
set bagelito.intake_close_batch_id = '<UUID_DEL_LOTE_REVISADO>';
set bagelito.intake_close_expected_status = 'orders_open';
set bagelito.intake_close_expected_action = 'close_one_batch_intake_only';
-- En psql, en esta misma sesión:
\i supabase/operations/close-culqi-intake.sql
```

Estos parámetros son guardas de intención, no autorización ni verificación del proyecto. El artefacto comprueba firmas/retornos/permisos core y las definiciones revisadas de expiry y del trigger de ventana. Una definición diferente falla cerrada y requiere revisión; no se reemplaza automáticamente. El lote debe existir y seguir abierto. El archivo no instala objetos ni altera pedidos, intentos, eventos, plazos, capacidad o banderas. No necesita credenciales nuevas.

## Pruebas reproducibles sin destino remoto

Con binarios locales PostgreSQL 17 ya disponibles:

```bash
PG_BIN=/ruta/local/postgresql/17/bin bash tests/run-sql-tests.sh --core-only
PG_BIN=/ruta/local/postgresql/17/bin bash tests/run-sql-tests.sh
```

El runner crea un cluster efímero en loopback, limpia overrides de conexión y usa únicamente fixtures sintéticos en `bagelito_test`. El perfil core ejecuta la protección/replay/cierre antes de cualquier instalación QA. El perfil completo mantiene la batería QA existente y su CI draft, sin modificar el workflow ni habilitar CI de main.

La regresión compara snapshots completos de pedidos, intentos, historial y contratos tras el replay abortado. El cierre prueba parámetros ausentes/incorrectos, lote inexistente o con estado inesperado, bloqueo de nuevas reservas y continuidad de claim/finish/evento/replay para una reserva anterior. Un segundo lote conserva su estado. Estas pruebas no certifican HTTP, SDK, entrega real de callbacks, producción ni un despliegue de rollback; la validación de un binario y esquema de destino sigue pendiente.
