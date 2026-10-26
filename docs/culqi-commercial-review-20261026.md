# Candidato de revisión comercial de Culqi — 26 de octubre de 2026

## Alcance y base

Rama aislada `fix/culqi-commercial-gaps-20261026`, basada en `main ca6f5b022864ee2164845f18c1c81f137cf0b108`, con [PR #26](https://github.com/rikrodriguez/bagelito-pe/pull/26) y catálogo de [PR #25](https://github.com/rikrodriguez/bagelito-pe/pull/25) ya incorporados. Se releen main y los PR recientes antes de publicar. El candidato financiero [PR #23](https://github.com/rikrodriguez/bagelito-pe/pull/23) continúa separado; no se importa ni activa.

El usuario autorizó publicar la dirección **Jr. Cruz del Sur 140, Surco**, corregir las brechas restantes y retirar completo de la portada el bloque «Próximo batch». La retirada es sólo de UI: se conservan la tanda interna, su configuración, capacidad y pedidos históricos. El reporte del otro chat sobre tanda hasta octubre de 2027 y pedidos preservados no se presenta como comprobación propia de base de datos.

Este trabajo prepara código, pruebas y borrador para revisión. No fusiona, despliega, solicita activación a Culqi, envía correos, acepta acuerdos, configura credenciales ni modifica datos alojados. `vercel.json` excluye **sólo esta rama** de autodeploy.

## Checklist de los seis requisitos

La [guía oficial de Culqi](https://ayuda.culqi.com/portal/es/kb/articles/cuales-son-los-requisitos-para-que-la-web-o-app-de-mi-comercio-no-sea-observado-al-momento-de-integrar-la-pasarela) pide cinco productos como mínimo con imagen, descripción y precio, contacto completo, redes correctas, información legal, Libro integrado, flujo de compra y SSL en todas las rutas.

| Requisito | Evidencia y resultado del candidato |
| --- | --- |
| Imágenes | Diez sabores existentes y diez WebP locales. Se corrige `images.qualities` para admitir 75: el catálogo la solicitaba pero sólo se permitían `[70,72,74,76]`. El optimizador real reproducía rechazo de `q=75`. Las pruebas del candidato aceptan 75 y las calidades previas. Chromium móvil local cargó **10/10** fotos en home y **10/10** en checkout. |
| Precios | Cuatro packs reales: S/50, S/60, S/100 y S/115. Las diez variantes muestran precio del pack de seis desde S/50 derivado del catálogo, con cantidad del pack indicada. No se inventan precios unitarios de compra ni suplementos. Delivery y total siguen visibles en checkout. |
| Descripciones | Diez descripciones en español e inglés, conservadas. No se crean sabores ni productos nuevos. |
| Compra / carrito / pago | Checkout público de cuatro pasos, sin login: pack, sabores, datos/delivery y resumen. En revisión se presenta como demostración sin pedidos ni cobros. La portada, pasos informativos, FAQ y CTA ya usan ese mismo modo explícito. Se retira completo `BatchInfo` de home, junto con la fecha 2027, capacidad y barra del bloque; el componente y la operación interna se conservan. Guardas HTTP503 y lógica financiera del PR26 permanecen intactos. |
| Información básica | Email, WhatsApp e Instagram conservados. Dirección autorizada visible en Footer, resumen/contacto legal, proveedor del Libro, constancia, checkout y JSON-LD. El nombre configurado «Bagelito» y RUC siguen presentes; el nombre exacto del titular del RUC **no está corroborado**. Titularidad y respuesta de los canales tampoco quedan verificadas por consistencia de URLs. |
| Información legal | Se conservan términos, privacidad, delivery y cancelaciones/reembolsos. Se reparan anclas legales entre idiomas y doble envío del Libro. La dirección ahora figura también en formulario/constancia. Sigue pendiente remisión de copia por email y validación alojada del Libro; no se agrega SMTP ni se envían correos. No se inventan políticas de cambios/devoluciones o compromisos ante productos defectuosos. |

**SSL transversal:** los enlaces propios y canonical usan HTTPS. La comprobación local usa HTTP en loopback y **no acredita TLS de producción**; el certificado, redirección HTTP y recursos de todas las rutas corresponden a QA público.

## Cambios concretos

1. Añadir 75 a las calidades permitidas de Next Image. No se sustituyen fotografías. La comprobación pública independiente recibida a las 21:44–21:46 UTC distinguió home **0/10** con `q=75` y selector checkout **10/10** con `q=74`; el valor predeterminado del selector se ajustaba a una calidad admitida. Esta evidencia corresponde a producción anterior al candidato.
2. Pasar un booleano público de presentación `merchantReviewOnly` desde el servidor al contexto de batch. Se conserva separado de las respuestas de `/api/batch`, por lo que una actualización de disponibilidad no puede quitar el modo revisión. No cambia `accepting`, cupos, fechas ni reservas.
3. Copy bilingüe de revisión centralizada: «Revisión abierta — sin pedidos ni cobros», CTA al checkout de demostración, pasos y FAQ coherentes. El modo normal conserva los enlaces de venta/lista de espera. En revisión el banner superior tampoco muestra temporizador o capacidad.
   Los CTA largos de revisión permiten salto de línea en packs y la cabecera móvil usa dos filas para conservar legible el logo.
4. Quitar import y render de `BatchInfo` en homepage por instrucción explícita. No borrar el componente ni alterar la tanda interna.
5. Incorporar únicamente la dirección aprobada, como dato de contacto del proveedor. No cambia tarifas, origen logístico, distritos de reparto ni nombre legal.
6. Conservar las tres correcciones del primer commit: aliases legales en ambos idiomas; bloqueo sincrónico `useRef` contra dos envíos simultáneos del Libro; copy de admin que describe verificación de evidencia Culqi en servidor en vez de atribuirla exclusivamente al webhook.

## Pruebas y revisión

- Node 24.19, instalación desde lockfile sin scripts de instalación.
- `node --test tests/*.test.mjs`: **63/63 PASS**, sin fallos ni omisiones. Incluye optimizador Next real, contexto de modo revisión, home en ambos idiomas con batch interno abierto/cerrado, contactos, formulario/constancia, esquema, servicio y ruta del Libro con límites de I/O simulados.
- `npm run lint`: exit 0, sin errores/advertencias de ESLint.
- `npm run build`: exit 0, Next.js 15.5.23 y tipos aprobados.
- La base pasó 27/27. Antes de corregir se observaron anclas ausentes, dos POST frente a uno, calidad 75 rechazada y datos de contacto ausentes. Los nuevos casos pasan después de las correcciones. Persiste sólo la advertencia previa `MODULE_TYPELESS_PACKAGE_JSON` de una prueba antigua.

**QA responsive del candidato local compilado:** Chromium/Playwright ya instalados, sin instalar herramientas. Viewports **360×844 en inglés** y **390×844 en español**, con touch. Home y los cuatro pasos del checkout no presentan desbordamiento horizontal (`scrollWidth == viewport`). Diez fotos cargadas tanto en home como en selector en ambos escenarios. Bloque «Próximo batch», contador y capacidad ausentes de home; copy de revisión y dirección visibles. Términos permanecieron sin marcar; finalización de demostración deshabilitada y sin inputs de tarjeta. **Cero solicitudes de escritura intentadas**. La tanda fue un fixture de GET `/api/batch` sólo en el navegador; Supabase remoto sin configurar, tráfico externo bloqueado y sin datos alojados.

El intento de QA público desde Chromium local falló con `ERR_TUNNEL_CONNECTION_FAILED`; no se cambió proxy ni se intentó eludir esa restricción. La evidencia responsive corresponde al candidato local, no a producción ni a un dispositivo físico/Safari. Capturas y reporte JSON se entregan junto al resultado final.

Como comprobación del CTA largo en español se repitieron home y los cuatro pasos en **320×844 y 360×844 ES**. Sin desbordamiento, 10/10 fotos en ambos lugares, cuatro CTA de packs contenidos dentro de sus botones y cero escrituras. Se inspeccionaron las capturas de home, sabores, packs y revisión; no sólo las medidas de página.

## Pendientes que requieren evidencia o decisión del negocio

- Corroborar nombre legal exacto del titular del RUC. El campo existe como «Bagelito»; **no es un dato ausente**, sino no acreditado por esta auditoría. La dirección ya fue autorizada y añadida al candidato.
- Confirmar titularidad/operatividad de `contacto@bagelito.pe`, WhatsApp e Instagram publicados. No se enviaron mensajes de prueba.
- Confirmar si la política publicada debe ampliarse con cambios/devoluciones o producto defectuoso, usando texto aprobado. No se agregaron plazos, exclusiones ni promesas por inferencia.
- Libro: validar persistencia y acceso admin en un entorno autorizado, remitir constancia al consumidor y conservar evidencia de atención. El botón actual imprime/PDF; «Enviar evidencia» abre correo hacia Bagelito y no entrega copia al consumidor. No existe recuperación de la copia tras recargar. El bloqueo de doble submit no sustituye idempotencia de servidor ante resultado de red incierto.
- La [guía de Indecopi](https://consumidor.gob.pe/libro-de-reclamaciones/) incluye identificación del proveedor y copia al consumidor. [El Peruano](https://elperuano.pe/noticia/256519-indefension-del-consumidor-proveedores-virtuales-sin-libro-de-reclamaciones-enfrentan-sanciones) describe impresión y remisión automática de la hoja virtual. La UI y los fixtures no acreditan cumplimiento legal integral ni entrega real de correo.
- Repetir QA público tras la publicación aprobada de este candidato: fotos, mobile, retirada del bloque, contacto, checkout de revisión y SSL. Este trabajo no realiza ese despliegue.

La habilitación comercial de Culqi sigue siendo externa. Este candidato no acredita aprobación del comercio ni pago real. El fallo histórico de webhook carece de logs vigentes y no demuestra un bloqueo universal; no se recrea mediante cargos o reenvíos. El candidato financiero QA conserva su propia validación y proceso de activación, separado de este PR.
