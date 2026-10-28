# Bagelito · Entrada → Categoría → Packs → Grandes/Minis · QA final 27 Oct 2026

## Corrección visual posterior a revisión en iPhone
- Eliminado el hero-card blanco de la entrada.
- Eliminado el panel/modal que duplicaba Packs / Combos / Schmears.
- Categoría se selecciona directamente sobre las tarjetas ya integradas en la escena de la vitrina mediante hit areas transparentes.
- La única corrección sobre el arte de categoría es la línea “Bagels + schmears” para evitar una cantidad de combo fija/inventada.
- Packs → Grandes/Minis usa un selector compacto sobre el mostrador, con fotografías reales ya versionadas; se eliminaron los bagels ilustrados falsos.
- En móvil la tienda usa el viewport completo; ya no se reduce a una miniatura con blur ocupando el resto.
- Barra inferior de progreso permanece visible.

## Alcance
Entrada → Categoría (Packs / Combos / Schmears) → Packs → Grandes / Minis.
El bloque termina ahí. Sin sabores configurables, delivery, checkout o pago.

## Seguridad
- StoreEntryFlow no contiene fetch a APIs de reservas/pagos.
- Browser QA observó 0 POST/PUT/PATCH/DELETE.
- Sandbox en BAGELITO_MERCHANT_REVIEW_ONLY=true, CULQI_ENABLED=false, PAYMENT_PROVIDER=manual.
- No se publicó ni modificó bagelito.pe.

## Verificación del commit 383041103e17939c3ca53cc8044bf9db3b56354d
- node --test tests/*.test.mjs: 90/90 PASS.
- npm run lint: PASS.
- npm run build: PASS.
- Chromium 390×844: overflow 0; 0 hero-card; 0 modal; tres hotspots de categoría transparentes; combo “Bagels + schmears”; Packs muestra 2 opciones; 0 errores JS; 0 requests mutantes.
- Chromium 320×700: mismo resultado, overflow 0.
- Chromium 1440×900: mismo resultado, overflow 0.
- Selector Packs: 390px → 366×291px; 320px → 296×286px; desktop → 760×220px.
