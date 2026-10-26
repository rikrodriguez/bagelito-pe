# Candidato mínimo de diagnóstico para el Preview existente

Preparado desde `d45c71cf9e242469c7171debdb756c1c527b63b9`, la versión READY observada del Preview. Rama de revisión `test/culqi-webhook-diagnostic-preview-20261020`; no es PR13 completo. No hay despliegue, reenvío, cargo, cambio de credenciales, permisos o instalación de SQL.

## Destino y base observados

- Proyecto Vercel `prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0`, equipo `team_EWhRYzkxyiCVNnh43fCf4Dcb`.
- Origen canónico existente: `https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app`; ruta `/api/webhooks/culqi`.
- Alias asignado a `dpl_9RoAm1RKYe364jSV1iGbrwQf4MZS`, URL inmutable observada `https://bagelito-n7azs33aq-ricardo-rodriguezs-projects-487b7b64.vercel.app`, estado READY.
- Fuente de ese despliegue: Git, `rikrodriguez/bagelito-pe`, rama `fix/culqi-payment-coordination-20261012`, SHA `d45c71cf9e242469c7171debdb756c1c527b63b9`. La lectura del ref remoto también devolvió ese SHA.

El origen se verifica por la API de alias/deployment de Vercel. El GET HTTP desde cloud no estuvo disponible; la herramienta de navegación tampoco abrió ese origen. El árbol de archivos del despliegue actual devolvió 404, sin identificadores de archivos. No se usó autenticación alternativa ni bypass. Estos metadatos no son una prueba de respuesta HTTP actual ni una huella del binario descargado.

## Diff permitido

Sólo tres archivos de aplicación/configuración de build:

1. `src/app/api/webhooks/culqi/route.ts`: instrumentación privada preparada en PR13, categorías exteriores y correlación aleatoria; logger aislado. Conserva gate, body/evt válidos, lookup autenticado, identidad, respuestas y RPC.
2. `next.config.ts`: snapshot compilado del SHA y digest de cinco fuentes fijas; ausencias explícitas y comprobación de coincidencia con Git. No lee dotenv ni claves. Es una huella de fuentes seleccionadas, no del binario entero.
3. `src/lib/payments/culqi.ts`: conserva la corrección del deadline monotónico de Eventos ya verificada; diez segundos, URL, headers y contratos financieros iguales. Rechaza continuaciones vencidas antes de identidad/DB.

Pruebas de instrumentación/webhook/lookup y únicamente las trece líneas de identidad compilada sobre el fixture HTTP de la base. No se copia el fixture completo de PR13: aquél requiere el SQL de reintento pendiente. Todos los archivos `supabase/`, el runner SQL y los fixtures de administración/operación permanecen en la base observada. No se añaden recuperación financiera, nuevas escrituras, precios, catálogo, cambios visuales ni correcciones ajenas al diagnóstico/deadline.

## Publicación sin despliegue automático

El despliegue actual acredita la integración Git del repositorio. La lectura normalizada del proyecto no expone todos los ajustes del enlace Git ni su ignored-build command. Antes de publicar, este candidato fija `git.deploymentEnabled: false` en su propio `vercel.json`; desactiva todos los despliegues Git automáticos de este candidato, sin tocar configuración externa o la rama canónica. La [documentación oficial](https://vercel.com/docs/project-configuration/git-configuration) distingue esta guardia de un PR en borrador, que por sí solo no impide construir.

El workflow existente admite expresamente la rama de revisión y su PR contra la rama original. Mantiene permisos `contents: read`, checkout del SHA exacto, pagos desactivados y fixtures locales; no añade un paso de despliegue. Los resultados/URL del SHA final se registran en el borrador. Después de publicar se comprueba que no exista deployment para ese SHA y que el alias siga en la versión observada.

## Compatibilidad de base de datos

Se consultó mediante la conexión Bagelito el proyecto conocido `qaahskendqdkynwtylho`, ACTIVE_HEALTHY, PostgreSQL 17.6. Sólo SELECT de catálogo: ninguna fila de pedidos/clientes y ninguna ejecución de funciones de pago. [Resultados saneados](evidence/culqi-preview-diagnostic/compatibility.json).

La RPC instalada `public.apply_culqi_payment_event(text,text,jsonb,jsonb)` tiene los nombres de argumentos esperados, un solo overload, devuelve jsonb sin conjunto, PL/pgSQL, SECURITY DEFINER y `search_path=public`. Su `prosrc` MD5 `78f7976e1f3e592eca179d147506fc6f` coincide exactamente con el cuerpo revisado de la base. Service role tiene USAGE/EXECUTE; PUBLIC, anon y authenticated no tienen EXECUTE.

Existen las cinco tablas utilizadas y todas sus columnas requeridas: orders, batches, payment_webhook_events, payment_attempts y order_status_history. El owner de la función tiene los privilegios necesarios y puede operar bajo sus reglas RLS; RLS está activado y force-RLS no. La clave única de eventos `(provider,provider_event_id)` es válida. No hace falta instalar `add-culqi-retry-pending-state.sql` para este candidato y no se instala ningún SQL.

**Límite restante:** esa compatibilidad se demuestra para el proyecto conocido. No se pudo observar independientemente el `NEXT_PUBLIC_SUPABASE_URL` compilado del deployment actual ni su configuración sandbox vigente. No se leyeron claves, RSA, headers de autorización ni env secretos. Falta un registro no secreto que vincule ese deployment con el proyecto de DB y confirme modo sandbox/gates actuales; la existencia del proyecto y la RPC no demuestra por sí sola ese vínculo ni aceptación del proveedor.

## Diagnóstico retenido, coste y riesgos

Se conserva un registro final privado por invocación: UUID aleatorio del servidor, categorías/booleanos del body exterior, etapa, cliente de Eventos invocado/retornado/fallido, clasificación upstream y resultado acotados, verificación, intento de RPC y SHA/digest compilados. No contiene IDs entrantes o hashes estables de ellos, payload, datos personales, tarjetas, claves, Authorization, cookies o mensajes crudos. No añade endpoint público, base de datos de logs, alerta externa ni otra consulta al proveedor. Una llamada al cliente puede fallar antes del transporte: el campo no acredita HTTP emitido.

El código no configura retención ni amplía el plan: estos registros siguen la política existente de runtime logs. La lectura histórica previa encontró una limitación de retención; no se puede prometer que una nueva observación dure más. Tras una futura prueba aprobada se conserva únicamente el registro saneado necesario en el destino privado acordado. No se creó un drain ni se exportaron logs de usuarios.

No se contrataron recursos, licencias, planes o servicios pagados. CI consume minutos del cupo GitHub existente; un futuro despliegue consumiría un build y las invocaciones/logs correspondientes del proyecto existente. Las lecturas disponibles no expusieron plan/cuota/facturación completos: no se afirma coste incremental cero ni se autoriza un sobrecoste. No hay un gasto de proveedor por un cargo nuevo porque no se crea ninguno.

Riesgos pendientes: vínculo runtime/DB/modo sin observar; disponibilidad/protección HTTP actual sin probar; retención corta; el digest no es atestación binaria. El deadline puede devolver timeout ante una continuación tardía, como exige la corrección ya verificada. Ningún resultado sintético acredita el contrato de entrega real ni resuelve la procedencia del upstream 400 histórico.

## Alcance exacto de aprobación futura y rollback

La preparación/publicación del borrador no autoriza estas acciones:

1. **Deployment sandbox:** aprobar el SHA final del candidato, el proyecto/equipo y el origen canónico indicados. Antes, comprobar el vínculo no secreto DB/modo y que el alias/ref no hayan cambiado. El gate exige que el sitio canónico coincida con VERCEL_URL o VERCEL_BRANCH_URL. Por ello no basta desplegar desde la nueva rama y reasignar un alias: debe aprobarse también una vía legítima de publicación del SHA en la rama original del Preview, sin fingir metadata ni relajar el gate. La rama original todavía no se ha movido. Si requiere merge o actualización de ese ref, debe quedar incluido expresamente en la aprobación; no inferirlo de un permiso genérico. Crear sólo un Preview del SHA aprobado y asignar/verificar el alias canónico, sin producción, live, variables nuevas, claves o SQL. No enviar webhook alguno en esta etapa.
2. **Rollback del código/origen:** la operación propuesta para contingencia es devolver el alias canónico al deployment READY observado `dpl_9RoAm1RKYe364jSV1iGbrwQf4MZS`, tras comprobar que sigue disponible. Incluir esta reasignación en la aprobación de despliegue. No requiere restauración de DB, reset forzado del ref ni SQL, y no revierte efectos financieros de un webhook: por eso no hay reenvío antes de verificar el despliegue.
3. **Reenvío separado, posterior:** tras comprobar SHA/digest, origen, sandbox, estado e historial, pedir autorización para un único registro legítimo existente con cargo/pedido, destino y SHA identificados. No crear cargos, copiar tokens/OTP, inventar evt, usar POST manual ni repetir ante resultado incierto. Esta aprobación sigue pendiente y no forma parte del despliegue.

El candidato permite una aprobación de código concreta. Los datos runtime faltantes y la vía legítima de actualización del origen deben resolverse antes de solicitar autorización operativa completa, sin instalar SQL o configurar credenciales para suplirlos.
