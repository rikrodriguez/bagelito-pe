# QA visual real de Bagelito — Visita V1 (27 oct 2026)

Todas las imágenes de esta carpeta son capturas de Chromium headless hechas sobre la compilación de Next.js de la rama de esta PR, con modo comercial de demostración activado (sin cargos ni pedidos). **No son renders promocionales ni fotos de un local real.** Los JPEG se han reducido para revisión rápida; se documenta resolución de prueba abajo.

## Capturas
- desktop-entrada.jpg: entrada, logotipo, mostrador digital (viewport 1440×900; imagen reducida)
- desktop-caja-completa.jpg: caja de 6 mixtos con 6 unidades elegidas, S/60.
- desktop-checkout-revision.jpg: checkout existente en modo demostración, subtotal S/60 + Lince S/8 = S/68.
- mobile-entrada-390.jpg: entrada móvil y acceso a la caja.
- mobile-caja-390.jpg: caja parcialmente ocupada tras agregar un bagel.
- mobile-entrada-320.jpg: encabezado móvil con marca legible, icono directo a checkout y selector bilingüe.

## QA automatizado realizado
- Node 22 aislado, npm ci; Node tests de base 71/71 PASS.
- Lint 0 errores en último head y Next build/types PASS.
- Navegador Chromium 153 en Next start local, modo merchant-review-only.
- HTTP 200 en home desktop 1440×900 y móvil 390×844 y 320×700.
- 10/10 imágenes de producto cargadas en escritorio y móvil 390.
- 4/4 opciones de pack renderizadas; popup zoom + Escape correcto.
- Pack de 6 lleno visualmente, 6/6 y bloqueo de exceso.
- Pack completo transfiere selección al checkout existente; paso de entrega y resumen financiero local correctos (S/60 + S/8 = S/68).
- 0 JS page errors, 0 solicitudes POST/PUT/PATCH/DELETE observadas en el recorrido de revisión.
- 0 horizontal overflow en 1440, 390 y 320; el logo no se comprime más en 320.
- Peticiones canceladas de analytics de Vercel y prefetch de rutas en sandbox se consideran infra y no demuestran un error UX en producción.

## Limitaciones
Estos resultados **no prueban** que Culqi LIVE esté autorizado, recibido webhook real, Safari/iOS real, velocidad Lighthouse, ni que la rama esté publicada en bagelito.pe. Se mantienen aislados CRM/pedidos históricos. El PR #23 permanece independiente para el release financiero. No fusionar/publicar sin aprobación.
