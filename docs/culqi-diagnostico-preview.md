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

Ante incumplimiento responde `404 {"ok":false}`, sin leer claves ni emitir resultados. Si las variables de sistema no están expuestas, también falla cerrado: coordinar con el responsable del proyecto, sin cambiar su configuración desde este diagnóstico. `GET` autenticado sirve únicamente un formulario HTML estático tras los mismos controles de Preview/proyecto/rama/origen/base/flags; no lee claves ni ejecuta diagnóstico. La navegación GET puede omitir `Origin`, pero la URL debe ser canónica; si hay `Origin`, debe coincidir, y `Sec-Fetch-Site` solo permite `none`, `same-origin` o ausencia. El POST exige siempre `Origin` canónico. Fallos inesperados responden `503 {"ok":false}`, sin mensajes de excepción.

## Ejecutar desde hosting

Primero coordinar la publicación del commit con el responsable del Preview: el push de PR1 puede iniciar un deployment Git automáticamente. No hacer deploy manual concurrente, promover a producción ni hacer merge. El responsable del hilo principal mantiene `CULQI_ENABLED=false` y coordina el webhook; este diagnóstico no configura ese webhook.

Después de que el Preview muestre el commit nuevo:

1. Abrir **solo** `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/admin/login` en el navegador habitual. Usar el acceso administrativo existente y la excepción de dominio de rama ya coordinada. No exportar la sesión.
2. Abrir `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app/admin/diagnostics/culqi` en ese mismo navegador y pulsar **Ejecutar diagnóstico**. La acción del formulario es esa misma URL HTTPS absoluta y fija; hace un POST normal al mismo origen y ruta sin depender de resolución relativa. No necesita JavaScript, tokens, campos de configuración ni datos personales. La cookie administrativa permanece dentro del navegador. Si el navegador rechaza el envío por su política de URL, detenerlo y reportar el bloqueo; no enviar el POST por otra vía.
3. `200 {"ok":true}` significa que el diagnóstico se ejecutó. Sus resultados **no** están en la respuesta. En Vercel → proyecto `bagelito-pe` → deployment Preview del commit → Runtime Logs, filtrar `/admin/diagnostics/culqi` o `culqi_configuration_diagnostic`. Leer los booleanos dentro del hosting privado. No compartir el registro general de la petición: la plataforma puede añadir metadatos propios. El código solo emite booleanos con nombres constantes; no emite cookies, IDs de sesión, claves, hashes, huellas, excepciones o datos de usuarios.

Las respuestas usan `private, no-store, max-age=0`, `Vercel-CDN-Cache-Control: no-store`, `CDN-Cache-Control: no-store`, `Vary: Cookie, Origin` y ejecución dinámica. El formulario agrega `Sec-Fetch-Site` a `Vary`, CSP con `form-action 'self'`, bloqueo de scripts/recursos externos y de frames, y `Referrer-Policy: same-origin`, que preserva el encabezado `Origin` del POST normal sin enviar referrer a otros orígenes. El HTML no contiene resultados, valores de configuración ni secretos. Una sesión Vercel o un bypass de protección de deployment **no** sustituye `requireAdmin()`.

## Interpretación de los booleanos privados

Los indicadores de alcance deben ser `true` antes de inspeccionar configuración. Los demás comprueban proveedor Culqi; formatos `pk_test_…`/`sk_test_…`; ID RSA presente; PEM pública RSA parseable (saltos reales o `\\n` como en el checkout); y correspondencia de llave pública, ID RSA, PEM RSA, origen y URL sandbox entre runtime y valores públicos compilados por Next.js. `next.config.ts` incluye siempre un snapshot de esos cinco valores públicos, incluso vacío cuando faltan al compilar: así su ausencia en build nunca se sustituye por claves de runtime. No incluye `CULQI_SECRET_KEY`, secretos de administración ni service role. PEM privada, certificados, claves EC o material mal formado se rechazan, aunque Node pueda convertir alguno de esos formatos a clave pública.

El umbral de 2048 bits fue añadido como criterio conservador **local** del diagnóstico. No se acreditó como requisito Culqi en las fuentes primarias revisadas: [Checkout v4](https://docs.culqi.com/es/documentacion/checkout/v4), [SDK Python README](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/README.md) y su [encoder](https://github.com/culqi/culqi-python/blob/846c69d410528244282bc2b46d2c7f50e5219a90/culqi/utils/encoder.py). Esta ausencia no demuestra que Culqi acepte cualquier tamaño. API Docs requiere contenido dinámico que no se pudo verificar en esta auditoría.

El diagnóstico ahora contrasta `asymmetricKeyDetails.modulusLength` de Node con un cálculo independiente del módulo RSA exportado como JWK, únicamente en memoria. [Node documenta ese metadato en bits](https://nodejs.org/docs/latest-v24.x/api/crypto.html#keyobjectasymmetrickeydetails). No se registran tamaño numérico, módulo, PEM, hash ni huella. Los resultados distinguen:

| Booleano privado | Interpretación |
| --- | --- |
| `rsaSizeMetadataAvailable` | Node proporcionó un tamaño entero positivo válido. |
| `rsaComputedSizeAvailable` | Se pudo calcular el tamaño desde el módulo público, sin exponerlo. |
| `rsaSizeMetadataMatchesComputed` | Ambos tamaños están disponibles y concuerdan. |
| `rsaBelow2048Bits` | Ambos concuerdan y el tamaño es inferior al umbral local. No afirma incompatibilidad Culqi. |
| `rsaAtLeast2048Bits` | Ambos concuerdan y se cumple el umbral local. |
| `rsaSizeUnverified` | Faltan observaciones o no concuerdan. Ambos indicadores de umbral quedan `false`; desconocido no equivale a tamaño pequeño ni PASS. |
| `rsaCompatibilityUnverified` | Siempre `true`: no se verificó aceptación de esa clave por Culqi. |
| `checkoutBlockedByFeatureFlag` | El flag existente no es `true`; ese flag bloquea actualmente el checkout. El tamaño RSA no es un gate del checkout existente. |

`offlineConfigurationValid=true` significa únicamente que los once controles locales pasan, incluido el umbral conservador con tamaño conocido y concordante. Los indicadores informativos de la tabla no se agregan como condiciones independientes. Un tamaño desconocido, discordante o inferior mantiene la validación local en `false`. No verifica autenticidad, vigencia o asociación de las API keys en Culqi. `rsaAssociationVerified` permanece siempre `false`: un ID opaco y una PEM no permiten comprobar offline que corresponden al mismo registro de CulqiPanel. El titular debe comprobar esa asociación en el panel sin compartir los valores. No rotar credenciales ni bajar el umbral por un booleano aislado. Una configuración ausente produce controles fallidos e indicadores explícitos de incertidumbre, sin errores crudos.

El diagnóstico real comunicado por el responsable a las 20:03:26.220Z del 14 de octubre de 2026 completó correctamente, con parseabilidad RSA y correspondencia build/runtime en `true`; el único control local fallido fue el umbral original. Aquella versión convertía metadatos ausentes en cero y no permitía distinguir ausencia de tamaño inferior. La corrección añade esa distinción sin retirar controles ni modificar claves. No se repitió el POST durante esta auditoría.

Mantener pagos deshabilitados hasta que el responsable compruebe los requisitos externos y autorice por separado las siguientes pruebas sandbox. No llamar APIs de cobro para resolver un `false`; este mecanismo únicamente inspecciona configuración en memoria.

## Eventos coordinados por el responsable

El responsable confirmó en CulqiPanel sandbox los eventos `charge.creation.succeeded` y `charge.creation.failed`, versión 2.0, hacia el origen canónico de rama `/api/webhooks/culqi`. Ambos están aceptados por la ruta actual y por la RPC propuesta `apply_culqi_payment_event`; los fixtures verifican datos como objeto o JSON serializado y que con el flag deshabilitado no se consulta Culqi ni se llama a la RPC. Esto demuestra compatibilidad del contrato de código, no entrega real del webhook ni existencia/ejecución de la migración sandbox.

`charge.expired` no existe en el selector observado por el responsable; su presencia en la allowlist del código es opcional y no debe bloquear estas pruebas ni tratarse como evento registrado. Este diagnóstico no registra eventos ni altera la allowlist. Verificar entrega/autenticación real de los dos eventos sigue pendiente de coordinación antes de habilitar pagos.

## Pruebas ficticias

`npm test` incluye controles adversarios de autenticación y orden de lectura; producción; proyecto/rama/origen/flags incorrectos; configuración ausente; prefijos live o mezclados; PEM privada/EC/malformada/débil; diferencias build/runtime; no exposición de valores y caché. Se generan claves ficticias en memoria y se usan sesiones/inyecciones locales. No se ejecutan migraciones ni pruebas SQL contra servicios remotos.

Referencias oficiales: [variables de sistema Vercel](https://vercel.com/docs/environment-variables/system-environment-variables), [variables públicas compiladas Next.js](https://nextjs.org/docs/15/app/guides/environment-variables#bundling-environment-variables-for-the-browser), [parámetros ID y llave RSA documentados por Culqi](https://docs.culqi.com/es/documentacion/checkout/v4).
