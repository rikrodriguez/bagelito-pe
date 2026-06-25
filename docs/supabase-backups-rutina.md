# Rutina de backups y Supabase

Documento interno para proteger datos de Bagelito antes de borrar clientes reales o tocar pedidos sensibles.

## Estado confirmado

Revision hecha el 2026-06-25 en Supabase Dashboard.

- Organizacion visible: `Bagelito`
- Proyecto: `bagelito-pe`
- Project ref: `enqpahoanbthnkrxfnxf`
- Plan observado: `Free`
- Backups programados: no incluidos en Free.
- Pantalla de backups: `Database > Backups > Scheduled backups`
- Mensaje observado: Free Plan no incluye project backups; Pro ofrece hasta 7 dias de scheduled backups.

Referencia oficial:

- Supabase Database Backups: `https://supabase.com/docs/guides/platform/backups`
- Supabase Storage Download Objects: `https://supabase.com/docs/guides/storage/management/download-objects`

Resumen de docs Supabase:

- Pro, Team y Enterprise tienen backups automaticos diarios de base de datos.
- Pro retiene hasta 7 dias de daily backups.
- Team retiene hasta 14 dias.
- Enterprise puede retener hasta 30 dias.
- Free debe exportar data manualmente con CSV/CLI y mantener backups fuera de Supabase.
- Los backups de base de datos no incluyen archivos reales de Supabase Storage; solo metadata.

## Estado de Storage de vouchers

Bucket revisado: `payment-proofs`.

Configuracion observada:

- `is_public`: `false`
- `file_size_limit`: `5242880` bytes, equivalente a 5 MB.
- `allowed_mime_types`: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`
- Objetos observados al momento de revision: `0`
- Tamano observado: `0 bytes`

Esto esta alineado con el SQL del repo en `supabase/setup-bagelito-reservations.sql`.

## Decision operativa

Mientras Bagelito este en Supabase Free:

- No depender de Supabase para recuperar datos borrados.
- No borrar clientes reales sin export manual reciente.
- Mantener backups fuera de Supabase.
- Considerar upgrade a Pro antes de operar batches reales con clientes pagados.

Cuando Bagelito tenga pedidos reales:

- Recomendado: subir a Pro antes de empezar a borrar clientes reales.
- Si no se sube a Pro, borrar solo fake orders o duplicados claramente identificados.
- Para clientes reales, preferir `Archive` sobre delete permanente.

## Rutina semanal CSV

Frecuencia minima:

- Todos los lunes, 10:00 America/Lima.
- Tambien antes de cualquier limpieza, delete permanente o cambio masivo.

Pasos:

1. Entrar a `https://bagelito.pe/admin`.
2. Descargar `Full backup CSV`.
3. Guardarlo fuera del repo, nunca en Git.
4. Usar una carpeta privada con esta estructura:
   - `Bagelito Backups/YYYY-MM-DD/`
   - `orders/bagelito-orders-backup-YYYY-MM-DD.csv`
   - `notes/backup-checklist.md` si hubo incidencias.
5. Abrir el CSV y confirmar que tiene columnas de cliente, pedido, pago, items e historial.
6. Registrar en el checklist:
   - fecha y hora Lima,
   - quien descargo,
   - cantidad aproximada de filas,
   - si habia pedidos pendientes,
   - si habia vouchers en Storage.

Regla:

- El backup CSV tiene datos personales. Guardarlo en una carpeta privada, con acceso limitado a operadores necesarios.
- No enviarlo por chats publicos.
- No subirlo al repo.

## Rutina antes de borrar clientes

Antes de `Delete permanently`:

1. Descargar `Full backup CSV`.
2. Confirmar que el archivo abre correctamente.
3. Revisar el detalle del pedido.
4. Revisar si tiene voucher.
5. Si tiene voucher, revisar `payment-proofs` antes de borrar.
6. Si es cliente real, archivar primero y esperar confirmacion operativa.
7. Borrar solo si:
   - es fake order,
   - es duplicado,
   - el cliente pidio eliminacion,
   - o ya existe aprobacion explicita del owner.

Despues de borrar:

1. Confirmar que el pedido desaparecio del admin.
2. Descargar otro `Full backup CSV` si fue un cambio importante.
3. Registrar el codigo del pedido borrado en una nota privada, sin incluir datos completos del cliente.

## Rutina Storage de vouchers

Como los backups de DB no restauran archivos de Storage, el bucket `payment-proofs` requiere control separado.

Revision semanal:

1. Entrar a Supabase Dashboard.
2. Abrir `Storage > Files > payment-proofs`.
3. Confirmar:
   - bucket privado,
   - limite 5 MB,
   - MIME types restringidos,
   - cantidad aproximada de archivos/carpetas,
   - si hay archivos inesperados.
4. Registrar el resultado en el checklist semanal.

Si hay vouchers reales:

- Mantener el bucket privado.
- Descargar copia externa antes de borrar clientes reales.
- Para pocos archivos, descargar manualmente desde Dashboard.
- Para muchos archivos, usar S3 compatible/rclone/Cyberduck desde Supabase Storage S3 configuration.
- Guardar vouchers fuera del repo en carpeta privada:
  - `Bagelito Backups/YYYY-MM-DD/payment-proofs/`

Nunca:

- Hacer publico el bucket.
- Compartir signed URLs fuera de operaciones internas.
- Guardar vouchers en GitHub.
- Enviar vouchers por canales no privados.

## Checklist mensual de Supabase

Una vez al mes:

- Revisar `Database > Backups`.
- Revisar si el plan sigue en Free o ya paso a Pro.
- Revisar `Storage > Files > payment-proofs`.
- Revisar `Advisors > Security`.
- Confirmar que `payment-proofs` sigue privado.
- Confirmar que el CSV semanal se esta haciendo.
- Probar que `/admin/export/orders` descarga correctamente.

## Criterio para upgrade a Pro

Subir a Pro cuando ocurra cualquiera de estos:

- Ya hay clientes reales pagados.
- Se van a borrar o limpiar datos reales.
- Se requiere capacidad de restaurar errores operativos.
- Hay mas de una persona operando admin.
- Hay batches recurrentes con pedidos semanales o mensuales.

Pro no reemplaza el CSV semanal ni el backup de Storage. Pro agrega una red de seguridad para la base de datos.

## Consulta SQL de auditoria Storage

Usar en Supabase SQL Editor cuando se quiera revisar el bucket sin exponer datos personales:

```sql
select
  b.id as bucket_id,
  b.public as is_public,
  b.file_size_limit,
  b.allowed_mime_types,
  count(o.id) as object_count,
  coalesce(pg_size_pretty(sum((o.metadata->>'size')::bigint)), '0 bytes') as approx_storage_size
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
where b.id = 'payment-proofs'
group by b.id, b.public, b.file_size_limit, b.allowed_mime_types;
```

Resultado esperado:

- `bucket_id`: `payment-proofs`
- `is_public`: `false`
- `file_size_limit`: `5242880`
- `allowed_mime_types`: imagenes permitidas

## Orden de prioridad

1. Mantener `Archive` como default.
2. Descargar CSV antes de deletes.
3. Descargar vouchers si existen.
4. Considerar Pro antes de borrar clientes reales.
5. Mantener backup externo privado.
