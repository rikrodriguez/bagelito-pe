# Protección transaccional de reintentos Culqi — 3 de noviembre de 2026

Propuesta de migración para el PR47 en borrador, basada en
`b946d0721e7f7148a3b135427f7ea41d880efbc5`.
La reproducción inicial se realizó sobre `ab0565e4a8209d04b0a241f9203e6249c718da9e`.
El cambio HTTP de `b946d07` se incorporó con fast-forward exclusivamente en el
worktree aislado `/workspace/bagelito-pr47-transaction`. La rama `work` de la
copia original conserva `ca6f5b022864ee2164845f18c1c81f137cf0b108`.

## Reproducción ejecutada

Las siete fuentes SQL del núcleo PR23 se verifican por SHA-256 mediante
`tests/sql/fixtures/financial-core/SOURCE.json`. No se editaron esas fuentes.
Cada fixture usa `new PGlite()` sin directorio, URL, credenciales ni sockets.
La única adaptación del núcleo es la ya existente eliminación de la declaración
`CREATE EXTENSION pgcrypto`; el motor proporciona `gen_random_uuid`.

La prueba `baseline:` crea una reserva sintética y prepara y reclama su primer
intento. Aplica `charge.creation.failed` con evidencia ficticia y comprueba:

- Pedido: `payment_status=failed`, `status=needs_correction`, estado de cobro `idle`.
- Intento: `status=failed`; se conserva la identidad del cargo fallido.
- El SQL original permite preparar la misma sesión y reclamar otro cobro.
- El coordinador real invoca una vez el callback que simula el nuevo proveedor.
- La confirmación rechaza la transición: pedido e intento siguen `failed`,
  se conserva la nueva identidad de cargo y no se crea recibo de confirmación.

Esto prueba la incoherencia de estados con código y SQL ejecutados. Ninguno de
los callbacks llama a Culqi ni representa un cobro real. El guard HTTP nuevo
rechaza un `failed` ya observado, pero una lectura `pending` anterior al evento
no protege la reclamación posterior; el test de lectura obsoleta cubre ese orden.

## Corrección propuesta

`supabase/migrations/20261103003917_culqi_pending_charge_guard.sql` sustituye
solo `prepare_culqi_token_session` y `claim_culqi_charge`:

- Comprueba `pending` en pedido e intento bajo el lock del pedido. Estado de
  reserva, importes, moneda, vencimiento finito e identidades deben concordar.
- Bloquea intentos fallidos, expirados, reembolsados o inconsistentes sin resetear
  evidencia. La preparación idempotente devuelve la sesión original elegible.
- Una sola reclamación autoriza el callback del proveedor. La continuación 3DS
  conserva la vinculación con fuente y dispositivo; entregas simultáneas no
  autorizan operaciones adicionales.
- Mantiene `SECURITY DEFINER` con `search_path` fijado, relaciones calificadas y
  ejecución restringida al servicio. No crea tablas ni cambia RLS.
- Rechaza cuerpos, configuración, firma y permisos desconocidos antes de
  reemplazar funciones. Las huellas admiten el núcleo revisado y esta versión
  exacta; un replay conserva funciones, permisos y datos. No prueban resistencia
  frente a un propietario de base que deliberadamente reescriba el código.

La migración se generó con el CLI, sin conexión a Supabase:

```bash
SUPABASE_HOME=/tmp/bagelito-cli-home SUPABASE_TELEMETRY_DISABLED=true \
  npx --yes --cache /tmp/bagelito-cli-npm-cache supabase@3.0.0 \
  migration new culqi_pending_charge_guard
```

No se ejecutó `supabase db`, un advisor remoto ni una migración externa. Antes
de instalar habrá que verificar el esquema real y revisar el corte operativo,
sin DDL concurrente. Las huellas cubren preparación, claim y confirmación; no
inspeccionan ni certifican las definiciones desplegadas de webhook, expiry,
tablas, triggers o cálculo de capacidad. Estas últimas también requieren
revisión de compatibilidad. Los prerrequisitos desconocidos que sí se comprueban
provocan rechazo, sin sustituciones parciales.

## Cupos y pagos tardíos

Se preservan las funciones de webhook, confirmación, vencimiento y reserva.
No se libera inmediatamente el cupo del pedido fallido:

1. Con el último cupo ocupado por un fallo sin vencer, otra reserva se rechaza
   atómicamente y el pedido original conserva su estado y evidencia.
2. Un éxito verificado de la misma fuente antes del vencimiento confirma la
   reserva retenida; los eventos duplicados no repiten la transición.
3. Si venció la reserva y otro pedido tomó el cupo, el éxito tardío del primero
   queda `paid/cancelled` y exige `payment_after_reservation_release`. Solo el
   reemplazo mantiene capacidad para cumplimiento.

Un claim ya confirmado antes de que llegue el fallo no puede retirar una
operación externa autorizada. La respuesta posterior no rearma la reserva
fallida y se bloquean nuevas continuaciones. No se mantiene una transacción SQL
abierta durante una llamada de red.

## Verificación y límites

- **40/40 pruebas SQL nuevas**: reproducción baseline, fallos/reintentos,
  intercalaciones de operaciones, idempotencia, continuaciones 3DS, último cupo,
  pagos tardíos y rechazo transaccional de prerrequisitos desconocidos.
- **43/43 pruebas SQL existentes** ejecutadas con la propuesta instalada en los
  fixtures nuevos mediante el preload `with-pending-charge-guard.cjs`.
- **327/327 pruebas de aplicación** sobre `b946d07`, sin modificaciones de código
  de aplicación en esta propuesta. Log real: `application-tests.log`.
- Los tres archivos `qa-guided-driver`, `qa-loopback-guard` y `qa-world-driver`
  quedaron excluidos de esa última ejecución: falta su HDR aprobado y el GET
  del recurso fijado respondió HTTP 403. No se sustituyó por otro recurso.
- **Build y TypeScript aprobados** para esta propuesta: `npm run build`, exit 0,
  sin alterar fuentes ni descargar un HDR alternativo. Incluye QA estructural
  11/11, fallback manual 4/4 y movimiento 14/14; esos subconjuntos no se suman de
  nuevo a los totales. Comando, límite de memoria y salida en `build-result.json`
  y `build.log`. Se instalaron dependencias temporales respetando el manifiesto,
  sin modificar manifiestos ni lockfiles versionados.
- **Dos revisiones independientes favorables para actualizar el borrador**:
  `independent-financial-review.json` e `independent-lock-review.json`. Ningún
  hallazgo bloqueante; la primera volvió a ejecutar 40/40 pruebas y la segunda
  ejecutó un subconjunto de 5/5. No se cuentan como casos adicionales.
- La evaluación adicional del artefacto inmutable con `assess-patch-risk`
  recomienda `hold_for_evidence` para fusionar o instalar: faltan contención
  entre sesiones y compatibilidad del esquema real. No identificó un defecto
  que impida publicar el borrador. Su evaluación formal quedó incompleta porque
  no estuvieron disponibles los recursos compartidos de almacenamiento/esquema
  JSON ni el helper de validación; no se presenta como JSON validado.

El log de build conserva la salida original, incluidos ANSI y espacios finales
del empaquetador. La comprobación de whitespace de fuentes y pruebas pasa; el
log bruto no se reescribió para hacer pasar esa comprobación de formato.

Comandos SQL ejecutados:

```bash
node --test --test-name-pattern='baseline:' tests/sql/culqi-failed-retry.test.cjs
node --test --test-concurrency=1 \
  tests/sql/culqi-guard-prerequisites.test.cjs \
  tests/sql/culqi-failed-capacity.test.cjs tests/sql/culqi-failed-retry.test.cjs
node --require ./tests/sql/with-pending-charge-guard.cjs --test --test-concurrency=1 \
  tests/sql/product-lines.test.cjs tests/sql/product-checkout-route.test.cjs
```

PGlite `0.5.12` usa un solo backend que serializa sentencias. Las llamadas
`Promise.all` comprueban reclamaciones competidoras y órdenes de llegada entre
transacciones, **no demuestran contención real entre sesiones, esperas de locks,
aislamiento MVCC concurrente ni ausencia de deadlocks**. Esas comprobaciones
siguen pendientes en un entorno autorizado. No se inició PostgreSQL nativo ni
se usó como alternativa a restricciones de sockets.

La corrección bloquea el reintento inseguro; no implementa recuperación comercial
inmediata del último cupo. El usuario sigue necesitando esperar el vencimiento o
una reconciliación explícita. No se relajó la regla de confirmación para hacer
pasar un cobro fallido como pendiente.

La entrega de código al PR en borrador no instala la migración ni activa cobros.
No hubo fusión, despliegue, cambio de credenciales, consulta a bases externas ni
cobro. `vercel.json` conserva `git.deploymentEnabled=false`. La instalación y la
aceptación real de Culqi quedan pendientes de revisión del responsable.

El HEAD remoto y la rama `feat/rebuilt-storefront-20261101` se comprobaron antes
de preparar la entrega. El conector GitHub no respondió y `gh pr view` recibió
`Forbidden` de la API; no se eludió ese bloqueo. La evidencia se entrega en este
directorio del repositorio; no se afirma haber modificado la descripción,
el título ni el estado de borrador mediante la API.
