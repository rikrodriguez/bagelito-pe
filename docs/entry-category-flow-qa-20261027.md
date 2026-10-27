# Bagelito · Entrada → Categoría → Packs → Grandes/Minis · QA 27 Oct 2026

## Alcance implementado
- Entrada fullscreen a Bagelito con escena exterior separada de la vitrina interior.
- Transición de entrada y cambio a la escena del mostrador.
- Decisión principal exacta: Packs / Combos / Schmears.
- Combos se presenta genéricamente como Bagels + schmears; no sandwich, bebida ni cantidad fija inventada.
- Packs continúa a Grandes / Minis.
- Grandes anticipa 6 o 12 bagels; Minis anticipa 6, 12 o 24 mini bagels.
- La implementación termina ahí: no sabores, delivery, checkout ni pago.
- Barra inferior: Entrada / Categoría / Selecciona / Revisa / Pago.

## Seguridad
- Sin fetch POST/PUT/PATCH/DELETE durante la prueba de navegador.
- Sin llamadas a APIs de pago o reservas desde StoreEntryFlow.
- Sandbox ejecutado con BAGELITO_MERCHANT_REVIEW_ONLY=true, CULQI_ENABLED=false y PAYMENT_PROVIDER=manual.
- No se modificó bagelito.pe ni se fusionó esta rama.

## Verificación
Último commit verificado: 343d5a24f1fdbe802d4ab59bbb7cd4da0bf32be6.

- node --test tests/*.test.mjs: 87/87 PASS.
- npm run lint: PASS.
- npm run build: PASS.
- Chromium 390×844: entry → categories (3 opciones) → pack-size (2 opciones), overflow 0, 0 errores JS, 0 requests mutantes.
- Chromium 320×700: mismo recorrido, overflow 0, 0 errores JS, 0 requests mutantes.
- Chromium 1440×900: mismo recorrido, overflow 0, 0 errores JS, 0 requests mutantes.
- Móvil usa fachada completa en entrada y la vitrina interior se conserva visible detrás del panel de decisión.

## Preview
Vercel API rechazó un deployment adicional por límite diario del plan free: api-deployments-free-per-day (>100). No se cambió plan ni billing. El sandbox de QA es temporal y no equivale a un preview persistente.
