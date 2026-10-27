# Bagelito · Spatial Store V3 — verificaciones (27-10-2026)

## Base y seguridad
Rama `feat/bagelito-spatial-v3-20261027`, derivada del PR #28 (que depende del PR #27). No se fusionó con `main` ni se activó Culqi Live. Flag aislado en Vercel Preview: `BAGELITO_MERCHANT_REVIEW_ONLY`. Los pedidos y la base de datos existentes no fueron modificados por esta rama.

## Cambios implementados
- **Entrada:** animación verdadera de paneles de puerta, acercamiento, enfoque de cámara y parallax CSS conectado al elemento correcto; alternativa con movimiento reducido.
- **Mostrador:** carril horizontal de las diez fotos reales de producto, flechas y desplazamiento; un producto grande protagonista con detalles y zoom accesible.
- **Armado:** caja de 6/12 bagels usando packs/precios existentes; cada bagel se añade y se elimina al tocar su espacio, sin exceder el cupo. La animación se dirige a la ranura vacía cuando el usuario está en el armado.
- **Caja/checkout:** conserva el flujo original de `ReservationFlow`, el cálculo de delivery y Culqi sin modificar endpoints ni contratos de pagos; reskin acotado a `/checkout` para mantener azul y blanco.
- **Accesibilidad/móvil:** escenas con altura natural, menos controles flotantes, texto con contraste corregido, estados de teclado/foco, prefers-reduced-motion.
- **Mantenimiento:** se retira `ShopVisit.tsx` (V1) y su hoja completa; se conservan en `store-foundation.css` exclusivamente los fundamentos visuales compartidos. No se modificó `globals.css` financiero ni lógica de pagos.

## Evidencia de pruebas (sandbox Next.js compilado con NODE_ENV=production, no pagos)
- SHA de prueba: `bf53425668953e05c263014b743bfd73d820a092`
- `npm ci`, `node --test tests/*.test.mjs`: **77/77 PASS**.
- `npm run lint`: PASS. `npm run build`: PASS, TypeScript PASS.
- Chromium escritorio 1440×900: puerta y parallax funcionales, navegación del carril horizontal, **10/10 imágenes**, zoom + Escape, seleccionar, retirar unidad tocando la caja, completar 12/12 y bloqueo de sobrellenado, precio pack S/115, Lince delivery S/8 y total S/123, checkout `/checkout?pack=12-mixed` restauró Lince, color de CTA `rgb(7,81,174)`, atrás navegador devuelve a escena «caja». Axe WCAG en checkout: ninguna infracción de las reglas evaluadas.
- Chromium 320×700, 390×844 y 768×900: cuatro escenas navegables, sin desbordamiento horizontal, **0 controles recortados y 0 contenido recortado después de la transición**, 10/10 imágenes del carril, zoom + Escape, agregar bagels. Axe WCAG A/AA evaluado desde la escena de caja: **0 infracciones** en cada tamaño. No hay errores JavaScript.
- Las pruebas se ejecutaron con `BAGELITO_MERCHANT_REVIEW_ONLY=true`, `CULQI_ENABLED=false`, `PAYMENT_PROVIDER=manual`; no se enviaron pagos ni pedidos.

## Limitaciones / no aprobado para producción
- Render Chromium automatizado no sustituye revisión táctil en iPhone Safari ni estudios de usabilidad y Core Web Vitals en conexiones reales. No se infieren puntuaciones Lighthouse.
- El recorrido sigue siendo una experiencia 2.5D ligera e ilustrativa, **no un local fotográfico real** ni navegación WebGL.
- Fotos reales del catálogo; las escenas son ilustraciones estilizadas. El logo deriva del JPG adjunto y conviene sustituir la vectorización por arte original cuando esté disponible.
- No hay evidencia de aprobación Culqi Live, webhook en producción, conciliación real ni cobros habilitados. PR #23 se gestiona por separado. No cambiar claves LIVE ni activar producción sin autorización.

## Gate de release
1. Revisión visual y comercial del enlace Vercel Preview por titular en 320/390/1440.
2. Validación adicional Safari/iOS físico, teclado, 12 sabores combinados, recarga y estados de error.
3. Reconciliar PR #23 y PR #27; mantener los registros financieros y pedidos históricos.
4. Pedir aprobación antes de merge a main o deploy de `bagelito.pe`.
