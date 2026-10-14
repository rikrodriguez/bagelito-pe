# Diagnóstico Culqi de PR1, sin habilitar pagos

Implementado sobre PR1 `31c32a98997e0b9873b8ab4a7359ad65fe33c5aa`. El diagnóstico no importa el cliente de cobros, no llama a Culqi/Supabase, no modifica datos ni variables, no recibe datos personales y no requiere copiar cookies o descargar secretos. No representa una prueba de pago ni autoriza activación.

Se eligió la ruta autorizada porque el proyecto Vercel existente no tenía sesiones Sandbox para ejecutar un script con su configuración. No se crea un entorno adicional ni se exporta configuración de hosting.

## Alcance cerrado

`POST /admin/diagnostics/culqi` ejecuta `requireAdmin()` antes de cualquier lectura de configuración del diagnóstico. Si la sesión no es válida responde `401 {"ok":false}`. Exige después, sin leer las claves:

- Vercel Preview (`VERCEL=1`, `VERCEL_ENV=preview`; si existe `VERCEL_TARGET_ENV`, también `preview`). `NODE_ENV=production` es normal para el build de Preview.
- Proyecto `prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0`, repositorio `rikrodriguez/bagelito-pe` y rama `fix/culqi-payment-coordination-20261012` exactos.
- `VERCEL_BRANCH_URL` y `NEXT_PUBLIC_SITE_URL` corresponden al origen fijo `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app`.
- La URL de la petición y el encabezado `Origin` corresponden al mismo origen. No acepta aliases de deployment, dominio público, HTTP, otro puerto ni cabeceras forwarded como autorización.
- `NEXT_PUBLIC_SUPABASE_URL` corresponde exactamente a `https://qaahskendqdkynwtylho.supabase.co`, sin credenciales, path, query o fragmento. Solo comprueba la URL; no verifica estado, esquema o permisos de la base.
- `CULQI_MODE=sandbox`, `CULQI_ENABLED=false` explícito y `CULQI_LIVE_APPROVED` no activado. Este código no cambia ninguno de estos flags.

Ante incumplimiento responde `404 {"ok":false}`, sin leer claves ni emitir resultados. Si las variables de sistema no están expuestas, también falla cerrado: coordinar con el responsable del proyecto, sin cambiar su configuración desde este diagnóstico. `GET` autenticado responde `405`; no ejecuta diagnóstico. Fallos inesperados responden `503 {"ok":false}`, sin mensajes de excepción.

## Ejecutar desde hosting

Primero coordinar la publicación del commit con el responsable del Preview: el push de PR1 puede iniciar un deployment Git automáticamente. No hacer deploy manual concurrente, promover a producción ni hacer merge. El responsable del hilo principal mantiene `CULQI_ENABLED=false` y coordina el webhook; este diagnóstico no configura ese webhook.

Después de que el Preview muestre el commit nuevo:

1. Abrir **solo** `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/admin/login` en el navegador habitual. Usar el acceso administrativo existente y la excepción de dominio de rama ya coordinada. No exportar la sesión.
2. Desde una página `/admin` de ese mismo origen, ejecutar en la consola del navegador esta petición sin body, tokens ni datos personales:

   ```js
   await fetch('/admin/diagnostics/culqi', {
     method: 'POST',
     credentials: 'same-origin',
     cache: 'no-store',
     redirect: 'error',
   }).then(async response => ({
     status: response.status,
     ...await response.json(),
   }));
   ```

3. `200 {"ok":true}` significa que el diagnóstico se ejecutó. Sus resultados **no** están en la respuesta. En Vercel → proyecto `bagelito-pe` → deployment Preview del commit → Runtime Logs, filtrar `/admin/diagnostics/culqi` o `culqi_configuration_diagnostic`. Leer los booleanos dentro del hosting privado. No compartir el registro general de la petición: la plataforma puede añadir metadatos propios. El código solo emite booleanos con nombres constantes; no emite cookies, IDs de sesión, claves, hashes, huellas, excepciones o datos de usuarios.

Las respuestas usan `private, no-store, max-age=0`, `Vercel-CDN-Cache-Control: no-store`, `CDN-Cache-Control: no-store`, `Vary: Cookie, Origin` y ejecución dinámica. Una sesión Vercel o un bypass de protección de deployment **no** sustituye `requireAdmin()`.

## Interpretación de los booleanos privados

Los indicadores de alcance deben ser `true` antes de inspeccionar configuración. Los demás comprueban proveedor Culqi; formatos `pk_test_…`/`sk_test_…`; ID RSA presente; PEM pública RSA parseable de al menos 2048 bits (saltos reales o `\\n` como en el checkout); y correspondencia de llave pública, ID RSA, PEM RSA, origen y URL sandbox entre runtime y valores públicos compilados por Next.js. `next.config.ts` incluye siempre un snapshot de esos cinco valores públicos, incluso vacío cuando faltan al compilar: así su ausencia en build nunca se sustituye por claves de runtime. No incluye `CULQI_SECRET_KEY`, secretos de administración ni service role. PEM privada, certificados, claves EC o material mal formado se rechazan, aunque Node pueda convertir alguno de esos formatos a clave pública.

`offlineConfigurationValid=true` significa que estos controles locales pasan. No verifica autenticidad, vigencia o asociación de las API keys en Culqi. `rsaAssociationVerified` permanece siempre `false`: un ID opaco y una PEM no permiten comprobar offline que corresponden al mismo registro de CulqiPanel. El titular debe comprobar esa asociación en el panel sin compartir los valores. Una configuración ausente produce booleanos `false`, sin errores crudos.

Mantener pagos deshabilitados hasta que el responsable compruebe los requisitos externos y autorice por separado las siguientes pruebas sandbox. No llamar APIs de cobro para resolver un `false`; este mecanismo únicamente inspecciona configuración en memoria.

## Eventos coordinados por el responsable

El responsable confirmó en CulqiPanel sandbox los eventos `charge.creation.succeeded` y `charge.creation.failed`, versión 2.0, hacia el origen canónico de rama `/api/webhooks/culqi`. Ambos están aceptados por la ruta actual y por la RPC propuesta `apply_culqi_payment_event`; los fixtures verifican datos como objeto o JSON serializado y que con el flag deshabilitado no se consulta Culqi ni se llama a la RPC. Esto demuestra compatibilidad del contrato de código, no entrega real del webhook ni existencia/ejecución de la migración sandbox.

`charge.expired` no existe en el selector observado por el responsable; su presencia en la allowlist del código es opcional y no debe bloquear estas pruebas ni tratarse como evento registrado. Este diagnóstico no registra eventos ni altera la allowlist. Verificar entrega/autenticación real de los dos eventos sigue pendiente de coordinación antes de habilitar pagos.

## Pruebas ficticias

`npm test` incluye controles adversarios de autenticación y orden de lectura; producción; proyecto/rama/origen/flags incorrectos; configuración ausente; prefijos live o mezclados; PEM privada/EC/malformada/débil; diferencias build/runtime; no exposición de valores y caché. Se generan claves ficticias en memoria y se usan sesiones/inyecciones locales. No se ejecutan migraciones ni pruebas SQL contra servicios remotos.

Referencias oficiales: [variables de sistema Vercel](https://vercel.com/docs/environment-variables/system-environment-variables), [variables públicas compiladas Next.js](https://nextjs.org/docs/15/app/guides/environment-variables#bundling-environment-variables-for-the-browser), [parámetros ID y llave RSA documentados por Culqi](https://docs.culqi.com/es/documentacion/checkout/v4).
