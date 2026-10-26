# Revisión comercial de Culqi — 26 de octubre de 2026

## Alcance y procedencia

Auditoría de código y pruebas locales con datos sintéticos. Rama aislada `fix/culqi-commercial-gaps-20261026`, basada en `main ca6f5b022864ee2164845f18c1c81f137cf0b108`. No es certificación de Culqi ni aprobación legal, visual de QA o comprobación de producción.

Se revisaron las ramas y PR recientes antes de modificar:

- [PR #26](https://github.com/rikrodriguez/bagelito-pe/pull/26), ya fusionado como `ca6f5b0`: fotos compartidas, acceso al checkout de revisión, consentimiento separado y bloqueo de reservas con `BAGELITO_MERCHANT_REVIEW_ONLY`. Otro chat gestiona fotos, batch de un año y acceso público. Este PR conserva su trabajo y no modifica esos archivos ni datos.
- [PR #25](https://github.com/rikrodriguez/bagelito-pe/pull/25), catálogo de diez sabores, ya incluido en main.
- [PR #23](https://github.com/rikrodriguez/bagelito-pe/pull/23), borrador en `085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca`: confirmación autenticada directa mediante `confirm_culqi_charge_result`. Main conserva el flujo antiguo que espera webhook. No se importa ni activa el candidato financiero.

No se modifican credenciales, flags remotos, permisos, pagos, pedidos ni bases alojadas. No se crean cargos, reenvían eventos, aceptan acuerdos ni envían correos. `vercel.json` excluye **sólo esta rama** de despliegues automáticos; no altera el comportamiento de otras ramas.

## Checklist de los seis requisitos del correo

La [guía oficial de Culqi](https://ayuda.culqi.com/portal/es/kb/articles/cuales-son-los-requisitos-para-que-la-web-o-app-de-mi-comercio-no-sea-observado-al-momento-de-integrar-la-pasarela) exige al menos cinco productos con imagen, descripción y precio, contacto completo, enlaces sociales correspondientes, términos/cambios/devoluciones, Libro integrado y SSL en todas las rutas.

| Requisito | Evidencia de código | Corrección / pendiente |
| --- | --- | --- |
| Imágenes | Diez sabores y diez WebP locales en `src/data/flavor-images.ts` y `public/images/`; `FlavorStrip` y checkout comparten el mapa. | Revisión visual independiente de producción a las 21:31 UTC reportó 10 fotos rotas (`naturalWidth=0`), hero/packs correctos. Otro chat tiene este trabajo. En la base auditada `FlavorStrip` pide `quality={75}` y Next Image usa 75 por defecto, pero `next.config.ts` sólo admite `[70,72,74,76]`; el optimizador local rechaza valores no admitidos. Comunicar este hallazgo y revalidar las imágenes tras la corrección del otro chat. No declarar resuelto por existencia de archivos. |
| Precios | `src/data/packs.ts`: packs de 6 de S/50 y S/60; packs de 12 de S/100 y S/115. Las diez variantes de sabor muestran el precio real del pack de 6, derivado de `6-single`, y el mínimo de seis unidades. | Código presente; visual independiente reportó precios visibles. No se inventan precios unitarios ni nuevos productos. El total y delivery se calculan en el checkout. |
| Descripciones | Diez sabores existentes con descripción en español e inglés en `src/components/FlavorStrip.tsx`. | Código presente; visual independiente reportó descripciones visibles. La aceptación comercial de variantes de pack queda a Culqi. |
| Flujo compra / carrito / pago | `/checkout` público monta `ReservationFlow`: pack, sabores, datos/delivery y total; sin login. PR #26 diferencia la demostración de un pago y bloquea nuevas reservas en modo revisión. | A las 21:31 UTC la revisión independiente llegó a Pack → Flavors, con aviso de batch cerrado y CTA Notify me. Batch/acceso público dependen del otro chat; no se abre ni modifica un batch aquí. La demostración no prueba Culqi real ni cuenta habilitada. |
| Información básica | `src/lib/site.ts`, Footer y JSON-LD publican email, WhatsApp, Instagram, marca y RUC. Enlaces consistentes: `mailto:contacto@bagelito.pe`, WhatsApp `51917547745`, Instagram `https://www.instagram.com/bagelito.pe`. | **Pendiente** domicilio completo aprobado y confirmación del nombre legal exacto del titular del RUC. `Lima, Perú` es zona de servicio. La consistencia de URLs no verifica titularidad ni que los canales respondan. |
| Información legal | `/legal` contiene términos, privacidad, delivery y reembolsos/cancelaciones; Footer enlaza `/libro-de-reclamaciones`. Libro usa formulario y API propios, esquema Zod, tabla privada y admin autenticado. | Se corrigen anclas legales entre idiomas y doble envío del Libro. Siguen pendientes datos legales aprobados, revisión de política explícita de cambios/devoluciones y entrega de copia por email. Las pruebas sintéticas no acreditan persistencia alojada ni cumplimiento integral. |

**SSL (transversal):** `siteUrl`, canonical, sitemap y enlaces propios usan `https://bagelito.pe`. Verificar certificado, redirección HTTP → HTTPS y ausencia de recursos inseguros en `/`, `/checkout`, `/legal` y `/libro-de-reclamaciones` corresponde a la revisión pública. No se inspeccionó TLS de producción en este trabajo.

## Correcciones de este PR

1. `LegalPageContent.tsx`: conserva las anclas de ambos idiomas en cada versión. Antes, el Libro enlazaba `/legal#privacidad` pero una visita nueva en inglés sólo tenía `#privacy`. Cambiar idioma también invalidaba enlaces profundos. No cambia textos ni fechas legales.
2. `ComplaintsBookForm.tsx`: bloqueo sincrónico con `useRef` evita dos POST mientras el primero está pendiente. Antes, deshabilitar el botón por estado React no impedía dos eventos rápidos. No añade almacenamiento de datos personales en el navegador ni reintentos automáticos. Un error de red tras persistencia sigue siendo un resultado incierto; este bloqueo de interfaz no es idempotencia de servidor.
3. `admin/orders/[orderCode]/page.tsx`: elimina dos afirmaciones de exclusividad del webhook y describe verificación de evidencia Culqi en servidor. Es correcto para el main antiguo y el candidato QA con confirmación directa. No cambia estados, permisos ni transiciones. Al incorporar estos archivos a QA, conservar el adaptador de consulta y el flujo financiero de #23; este PR no actualiza esa rama.

## Libro de Reclamaciones: evidencia y límites

`/api/complaints` aplica protección pública y validación, llama a `next_complaint_code`, inserta en `consumer_complaints` y devuelve sólo correlativo/fecha con `Cache-Control: no-store`. La migración fuente habilita RLS, revoca acceso a anon/authenticated y reserva tabla/RPC para service_role. Las páginas, acciones y exportación administrativas requieren autenticación. No se ejecutó esa migración ni se comprobó su instalación alojada.

La constancia se construye desde el payload enviado y correlativo/fecha devueltos. El botón invoca impresión/PDF del navegador. Al recargar se pierde la copia local; no existe recuperación pública ni envío automático de constancia al email del consumidor. El enlace «Enviar evidencia» abre un correo **hacia Bagelito** y no sustituye la entrega de una copia al consumidor. No se envió ni configuró correo por la restricción de esta tarea.

La [guía de Indecopi](https://consumidor.gob.pe/libro-de-reclamaciones/) incluye razón social, RUC y dirección en la identificación del proveedor. El [Diario Oficial El Peruano](https://elperuano.pe/noticia/256519-indefension-del-consumidor-proveedores-virtuales-sin-libro-de-reclamaciones-enfrentan-sanciones) describe la exigencia de impresión y remisión automática de la hoja al email del consumidor en proveedores virtuales. La UI actual no basta para dar este punto por cerrado. El proceso real de atención y evidencia de respuesta tampoco queda acreditado por marcar un estado en admin.

## Datos y decisiones mínimos pendientes

- Nombre legal exacto correspondiente al RUC `10464295874`; `siteLegalName="Bagelito"` sólo acredita el valor configurado. El historial cambió “Bagelito SAC” a “Bagelito”; no restaura ni inventa una forma societaria.
- Domicilio comercial/fiscal completo autorizado para publicarse en información básica, Libro y constancia. Una dirección histórica retirada del texto no es autorización para reutilizarla.
- Confirmación de operatividad/titularidad de email, WhatsApp e Instagram ya publicados; sin mensajes de prueba a terceros desde esta tarea.
- Política aprobada de cambios/devoluciones, incluidos productos defectuosos, si debe ampliarse la actual de cancelaciones/reembolsos. No se agregan excepciones, plazos ni promesas por inferencia.
- Solución aprobada para remitir la constancia al consumidor y conservar evidencia de atención; sin activar SMTP, configurar claves ni enviar mensajes aquí. Requiere validación aislada posterior de persistencia, acceso admin y entrega de copia.
- Revalidación visual pública del trabajo del otro chat: diez fotos cargadas, batch/acceso navegable y SSL de todas las rutas. No confundir con los tests de código de este PR.

La habilitación comercial de Culqi sigue siendo externa. El core financiero y `ADMIN_SESSION_SECRET` ya instalados según el estado verificado no se piden ni cambian. El fallo histórico del webhook es genérico y sus logs expiraron: no acredita un bloqueo universal de Culqi y no se intenta recrear con cargos o reenvíos.

## Reproducción de pruebas locales

Node 24; instalación desde lockfile con `npm ci --ignore-scripts --cache /tmp/bagelito-npm-cache --no-audit --no-fund`.

```sh
node --test tests/*.test.mjs
npm run lint
npm run build
```

La base pasó 27/27 pruebas. Antes de corregir, doble submit reprodujo dos POST frente a uno esperado; las dos pruebas de navegación fallaron por anclas ausentes. Después: suite 45/45, incluidos 16 casos del Libro y dos de navegación legal. Las pruebas ejecutan componentes, esquema, servicio y ruta reales, sustituyendo límites de DB/fetch por fixtures en memoria; cubren normalización, menores, consentimiento, honeypot, límite de solicitudes, error de numeración/persistencia, constancia limitada, snapshot e impresión invocada. No prueban el servicio de Culqi, SMTP, un PDF visual ni la DB de QA/producción.

`npm run lint` terminó con exit 0 y sin errores/advertencias de ESLint. `npm run build` terminó con exit 0: Next.js 15.5.23 compiló, validó tipos y generó las rutas. La suite conserva una advertencia preexistente `MODULE_TYPELESS_PACKAGE_JSON` sobre `public-batch-display.ts`; no hay fallos ni pruebas omitidas.

La relectura de origin/main antes de publicar la rama sigue en `ca6f5b0`, sin deltas concurrentes respecto a la base. El resultado final de publicación se registra en el PR. No se añaden workflows ni se configura facturación de CI para esta corrección.
