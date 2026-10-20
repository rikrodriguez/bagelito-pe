# Diagnóstico Culqi de sólo lectura desde el admin

Este adaptador está preparado en PR2 para revisión. No está desplegado ni se ha ejecutado contra QA o Culqi durante su desarrollo. El mecanismo previsto es `runCulqiReadonlyDiagnostic()` en el módulo administrativo existente, invocado mediante el botón del admin autenticado. No añade una ruta HTTP ni depende de una sesión shell en Vercel.

## Publicación y alcance

La rama de PR2, `fix/culqi-expiry-quarantine-20261014`, conserva sus despliegues Git automáticos deshabilitados. Publicar código en el PR no instala SQL, concede permisos ni despliega el adaptador. Un despliegue futuro necesita autorización y coordinación independientes; su destino autorizado tendría que ser el Preview de la rama existente `fix/culqi-payment-coordination-20261012`.

El diagnóstico sólo usa el SELECT administrativo ya disponible y GET autenticados al proveedor. No añade variables, credenciales, paquetes, permisos, migraciones o dependencias de una RPC nueva. PR2 también contiene una corrección separada de la ruta de estado que sí requiere revisar e instalar previamente `supabase/add-culqi-session-expiry.sql` antes de desplegar esa versión combinada. Esa instalación no está autorizada por el trabajo del diagnóstico. Ver [vencimiento y recuperación](culqi-expiry-and-recovery-review.md).

El servidor vuelve a comprobar este alcance en cada invocación:

| Control | Condición requerida |
|---|---|
| Autenticación | `requireAdmin()` dentro de la acción, antes de configuración Culqi/Supabase o consultas |
| Solicitud | Origin y Host exactos del alias canónico; X-Forwarded-Host exacto si existe; Sec-Fetch-Site y Referer, cuando estén presentes, del mismo origen |
| Hosting | Vercel Preview y proyecto fijado en el código |
| Git | Repositorio `rikrodriguez/bagelito-pe` y rama anterior exacta |
| Origen | Alias canónico, `VERCEL_BRANCH_URL` y `NEXT_PUBLIC_SITE_URL` concordantes |
| Base de datos | URL exacta `https://qaahskendqdkynwtylho.supabase.co` |
| Pagos | `PAYMENT_PROVIDER=culqi`, `CULQI_MODE=sandbox`, `CULQI_ENABLED=true`, `CULQI_LIVE_APPROVED=false` |
| Claves | Prefijos test estrictos, comprobados en memoria sólo después de los controles anteriores |

Alias canónico:

`https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app`

La visibilidad del botón sólo depende de metadatos del alcance. No lee claves ni inicia el diagnóstico al renderizar. Ocultar el botón no sustituye la autorización de la acción. Next permite invocar una Server Action mediante POST directamente; por eso la acción mantiene su propio control de sesión y de cabeceras, además del control CSRF nativo del framework. No se amplía `serverActions.allowedOrigins`. [Seguridad de Server Actions](https://nextjs.org/docs/app/guides/data-security).

## Ejecución después de un despliegue autorizado

1. Confirmar en Vercel que el despliegue revisado está sirviendo el alias anterior y el SHA aprobado. Abrir sus Runtime Logs privados; no consultar ni exportar valores de entorno.
2. Abrir `/admin` en ese mismo origen y usar la sesión administrativa normal del navegador. No copiar cookies, claves o tokens a herramientas, scripts o terminales.
3. Tras cargar el cliente, pulsar una vez **Diagnóstico Culqi de solo lectura**. Requiere JavaScript e hidratación; no dispone de un formulario HTML alternativo. La invocación usa la acción nativa de la aplicación en ese mismo navegador, sin introducir IDs, fechas o destinos. No construir POST alternativos ni reutilizar `/status` o el webhook para ejecutarla.
4. Esperar su estado final y localizar `culqi_readonly_dryrun` en los Runtime Logs del mismo despliegue y momento. El valor devuelto por la acción al navegador es únicamente `{ok: boolean}`; los cotejos permanecen en el informe privado.
5. Si falla la política del navegador, el alcance, la autenticación o el hosting, detener el envío y revisar esa causa. No modificar flags, ampliar orígenes, extraer credenciales ni repetir cobros para obtener un resultado favorable.

La acción no revalida ni redirige el admin después del diagnóstico. La activación del botón debe evitar un submit nativo anterior a la hidratación: el render administrativo existente puede ejecutar otros helpers, por lo que el diagnóstico se invoca desde el cliente sin refrescar el dashboard.

`ok=true` indica que el recorrido terminó en `complete_partial`; puede coexistir con cotejos falsos, eventos rechazados o ningún candidato. No equivale a `paid`, a captura confirmada, a conciliación aplicada o a una comprobación exhaustiva. Un fallo no debe provocar reintentos automáticos. La ausencia del botón indica que no se presentó esa acción en la página actual; no prueba ausencia de claves ni permite ampliar el alcance.

## Lecturas y límites

Los tres pares de pedido/cargo QA están fijados exclusivamente en el código del servidor y se identifican en el informe por `qa_yape`, `qa_visa` y `qa_3ds`. El navegador no elige objetivos. Un SELECT acotado lee sólo identidad y vínculos de pago necesarios; no nombres, email, teléfonos, direcciones, tarjetas o payloads. Devuelve como máximo cuatro filas para detectar discrepancias y tiene un timeout de diez segundos. Deben recibirse exactamente las tres filas previstas, concordantes con la allowlist, el carril token, la fuente test persistida y `6600/PEN`. Una discrepancia detiene la lectura del proveedor y no se reemplaza con un valor del plan.

El transporte llama exclusivamente a `https://api.culqi.com` mediante GET, con la clave existente mantenida dentro del proceso del servidor. Omite cookies de navegador, rechaza redirecciones y usa `cache: no-store`. No crea, captura, devuelve o modifica cargos y no ejecuta RPC, INSERT, UPDATE, DELETE, reconciliación, webhooks o alertas externas.

El recorrido del proveedor se limita a 25 GET: tres cargos, dos listados y hasta veinte detalles de evento. Su presupuesto global es de 90 segundos, con un máximo de 10 segundos por solicitud y lectura del cuerpo limitada en tamaño y tiempo. Esos 90 segundos empiezan después del SELECT y no son un deadline de toda la acción. El límite por respuesta es 256 KiB para cargos/detalles y 2 MiB por listado. No hay reintentos automáticos.

Las esperas de cabeceras y fragmentos de cuerpo se cierran al abortar la señal, incluso si el transporte ignora la cancelación. Un reloj monotónico comprueba el presupuesto restante antes del GET, después de las cabeceras y después del JSON; una respuesta tardía no se acepta aunque el callback del timer esté demorado. Estos límites no garantizan ejecutar JavaScript mientras el event loop esté bloqueado ni cambian el plazo de una reserva/pago. Ver [evidencia manual del evento existente](culqi-existing-event-evidence.md): el diagnóstico conserva sus objetivos y ventana, no identifica el parámetro del HTTP400 histórico ni certifica al proveedor.

Los listados consideran sólo `charge.creation.succeeded` y `charge.creation.failed`, una página de hasta cien elementos por tipo, en la ventana UTC fija del 14 de octubre de 2026, de 20:20 a 20:55. No amplían fechas ni paginan. El listado sólo descubre candidatos; cada candidato autorizado necesita su GET individual y cotejo de ID, tipo, fecha, cargo, importe, moneda, metadata y fuente con la fila persistida. El diagnóstico no inventa un evento ni usa los datos del cliente como evidencia.

La respuesta puede contener cuerpos personales del proveedor; éstos se procesan transitoriamente para los cotejos y no se imprimen, almacenan ni devuelven. El informe contiene sólo etiquetas QA fijas, booleanos y etapas de una lista cerrada. No incluye IDs, payloads, claves, RSA, cookies, mensajes o stacks del proveedor, datos personales ni fingerprints. Usa un log privado directo, sin los helpers de monitorización que puedan enviar alertas o escribir contadores.

## Interpretación del informe

Leer `stage`, las consultas y los cotejos por separado. En `eventListQueries`, la clave `succeeded` identifica el listado de `charge.creation.succeeded` y la clave `failed` identifica el de `charge.creation.failed`. Dentro de cada uno, `attempted`, `succeeded` y `failed` describen **la consulta**, no el estado del cargo:

| `attempted` | `succeeded` | `failed` | Lectura permitida |
|---|---|---|---|
| false | false | false | Ese listado no se intentó; su contenido es desconocido |
| true | false | true | Falló la consulta, su lectura, su deadline o su envelope; no equivale a un cargo rechazado ni a cero eventos |
| true | true | false | Se leyó una página con envelope válido; sus candidatos aún necesitan clasificación y verificación individual |

Los campos de `results.qa_yape`, `results.qa_visa` y `results.qa_3ds` describen cada objetivo fijo:

| Campo | Interpretación permitida |
|---|---|
| `chargeQueryAttempted` / `chargeQueryFailed` | Se intentó consultar el cargo / ese intento no completó una respuesta legible dentro de los límites. `attempted=false` deja la consulta desconocida |
| `chargeFetched` | Se obtuvo un objeto JSON del GET del cargo; no acredita identidad, importe, moneda, metadata o fuente por sí solo |
| `candidatesFound` | Un elemento del listado apuntó al cargo previsto; todavía puede tener ID, tipo, fecha o vínculos inválidos |
| `eventDetailQueryAttempted` / `eventDetailQueryFailed` | Se intentó algún GET individual de candidato / alguno no pudo completarse. No son resultados de pago |
| `candidateRejected` | Un candidato identificable de ese objetivo incumplió la validación del listado o del detalle. Un error de consulta no se convierte en este rechazo |
| `noCandidatesInScannedPages=true` | Ambas páginas se leyeron con envelope válido, se procesaron completamente y fueron clasificables, sin candidatos para ese objetivo dentro de ellas |
| `noCandidatesInScannedPages=false` | Puede haber candidatos o faltar una página, una consulta o clasificación suficiente. Leer los otros campos; false no demuestra que exista un evento |

Los indicadores de detalle y rechazo acumulan observaciones de candidatos: un evento puede haber sido verificado antes de que una consulta posterior falle. `rejectedCandidatePresent` también puede indicar un elemento ilegible que no fue posible asociar a un objetivo; en ese caso la ausencia de candidatos permanece desconocida. Los límites o una terminación temprana conservan `noCandidatesInScannedPages=false`. Ninguno de estos campos acredita exhaustividad: `scanComplete` permanece false incluso cuando `noCandidatesInScannedPages` es true.

| Observación | Interpretación permitida |
|---|---|
| Cotejos de cargo y pedido verdaderos | El recurso consultado concordó con ese vínculo persistido y esos campos; no acredita el panel/comercio esperado de forma independiente |
| `captureFlagTrue` o `captureDatePresent` | Presencia de campos observados; su semántica contractual de captura permanece sin verificar |
| Evento exitoso/fallido verificado | Su GET individual y los cotejos pasaron; el diagnóstico no lo aplica a la base de datos |
| Ningún evento verificado o límites alcanzados | Evidencia parcial: puede haber consultas fallidas, candidatos rechazados o páginas sin candidatos; no prueba ausencia de eventos |
| Eventos incompatibles o conflictivos | Requieren revisión; no resolver el estado de pago desde el navegador |
| `scanComplete=false` | La exploración no acredita exhaustividad, incluso con páginas vacías |
| `merchantAssociationVerified=false` | La asociación independiente con el comercio/panel esperado no está acreditada; no prueba que sea incorrecta |
| `captureDateContractVerified=false`, `capturedPaymentConfirmed=false`, `paidConfirmed=false` | Captura/pago desconocidos o no acreditados por este diagnóstico; no inferir rechazo del cargo |

La asociación independiente con el comercio/panel, el contrato de `capture_date` y la semántica de cursores permanecen sin verificar. `AUT0000`, `paid=false`, un flag de captura o la ausencia de webhooks por separado no resuelven esas incógnitas. No confirmar pago ni habilitar pagos live a partir del informe.

Un informe ausente tampoco prueba configuración ausente, falta de eventos o fallo del proveedor. Puede deberse a auth, CSRF, rechazo de alcance, interrupción del navegador, límites o terminación de la Function. El presupuesto interno de 90 segundos no acredita la duración efectiva del hosting: Vercel puede terminar la invocación al alcanzar su límite, antes de emitir el informe final. Revisar únicamente el estado del despliegue y sus logs saneados. [Duración de Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration).

La recuperación de pagos, la aplicación de eventos auténticos, cualquier migración o permiso y una nueva prueba de cobro son pasos separados que requieren su autorización correspondiente. El diagnóstico no cambia reservas ni sus estados.
