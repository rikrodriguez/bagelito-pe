# Recuperación del reintento tras un fallo verificado

Base revisada: PR13 `b0eb307af5760cbe486565fcef8fa8d1bd8b10ca`. Esta entrega
prepara una migración forward y pruebas locales. No instala SQL remoto ni
despliega, habilita pagos o crea transacciones en Culqi. La exclusión de
despliegue Git de la rama de PR13 se conserva.

## Fallo reproducido

Un webhook de fallo verificado que llega mientras el cargo está `submitting`,
`requires_3ds` o `uncertain` libera el claim anterior según el contrato existente.
El pedido pasa a `failed`/`needs_correction` y la sesión de pago también a
`failed`. El servidor ya permite preparar esa misma sesión y reclamar un nuevo
token dentro del plazo original.

El nuevo claim sólo actualizaba su identidad y `payment_charge_state`. Por ello,
la lectura autoritativa seguía devolviendo `paymentStatus: failed` y
`reconciliationRequired: false` durante el nuevo cargo. La política real del
navegador interpreta ese resultado como `released`, elimina la protección de
recuperación y permite empezar otro pedido. Si el nuevo cargo llegaba a
`submitted` y se perdía su webhook, la recuperación GET tampoco lo consideraba
elegible: pedido e intento seguían en `failed`.

La prueba SQL nueva falla contra el core anterior con:

```text
Active retry incorrectly exposed previous failure:
{"expired":false,"orderStatus":"needs_correction","paymentStatus":"failed","reconciliationRequired":false}
```

La prueba HTTP nativa falla en la misma frontera: recibe `failed` donde exige
`pending` después de aceptar el segundo claim. Usa Next compilado, el endpoint
real, PostgreSQL 17.11 aislado y la política de recuperación del navegador.

## Corrección y revisión del esquema

`supabase/add-culqi-retry-pending-state.sql` reemplaza el RPC de claim después
de los scripts core. Los archivos históricos de checkout y expiración conservan
sus bytes. No contiene backfill ni ejecuta claims durante la instalación.

Al aceptar un reintento coherente de un fallo verificado temprano, la misma
transacción restaura pedido y sesión a `pending`, registra el paso de
`needs_correction` a `payment_pending_review` y retira el vínculo del cargo
fallido de la sesión reutilizada. Los eventos procesados conservan la evidencia
del fallo anterior. El nuevo token debe ser distinto del fallido. Los claims
inciertos, enviados, pagados, vencidos o que requieren reconciliación mantienen
su bloqueo; no se renueva el vencimiento original.

La migración debe revisarse e instalarse en el destino autorizado antes de
usar esta corrección allí. Publicar el PR no corrige por sí mismo una base
existente. El orden de instalación y el límite de los módulos exclusivos de QA
se mantienen en [el manifiesto core](culqi-core-migrations-and-compatible-rollback.md).

## Cobertura reproducible

- SQL: los tres estados iniciales, nueva identidad, estado pendiente antes y
  después de `finish`, sesión/plazo originales, historial y evento conservados,
  respuestas/eventos del intento anterior y casos bloqueados. El runner ejecuta
  también la migración y la regresión por segunda vez.
- HTTP nativo: el segundo claim permanece bloqueado para el navegador mientras
  está `submitting`; después de persistir el cargo, el parser real y la RPC de
  recuperación confirman una sola vez una observación sintética. Otra consulta
  conserva recibo, historial, estado y capacidad sin otro GET del proveedor.
- Los fixtures administrativos y de restauración/operador instalan la misma
  migración. CI mantiene perfiles SQL `core-only` y `full` y la suite completa
  de aplicación.

```bash
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 CULQI_ENABLED=false npm run build
PG_BIN=/ruta/local/postgresql/17/bin bash tests/run-sql-tests.sh --core-only
PG_BIN=/ruta/local/postgresql/17/bin bash tests/run-sql-tests.sh
node tests/culqi-status-recovery-http.mjs
```

Validación local del 18 de octubre de 2026: 573/573 pruebas Node; lint sin
errores, con la advertencia anterior de `no-unused-expressions` en
`culqi-readonly-adapter.test.mjs:99`; build/tipos correctos; ambos perfiles SQL,
HTTP nativo de status/webhook y administración, y restauración/recorrido de
operador correctos. La CI y el SHA publicado se registran en el PR por separado.

Estas pruebas simulan el proveedor y usan exclusivamente datos ficticios. La
prueba HTTP reemplaza sólo transportes y bloquea destinos inesperados; SQL corre
en un contenedor sin red. No acreditan entrega de un webhook Culqi ni desafío
bancario 3DS reales. El acceso al evento sandbox legítimo y la validación real
del proveedor siguen pendientes según [los límites existentes](culqi-validation-and-release-gates.md).
