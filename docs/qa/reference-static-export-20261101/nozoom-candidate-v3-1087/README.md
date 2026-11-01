# Candidato v3: entrada sin zoom, tres viewports PASS

En 320 y 390 px no hay botón Ampliar/Ver imagen ni rango horizontal. Las tres tarjetas nativas tienen títulos de 16 px, contexto de 12 px, fotos recortadas del WebP exacto y controles de 44 px. Los recortes SVG de logo y vitrina excluyen las tarjetas pintadas originales. Pasan los tres callbacks de cada viewport: nueve en total.

En 1280 px se conserva la imagen completa `0df3c229…`. La comparación RGB contra la captura original de 6f PASS: cero píxeles diferentes y delta cero, sin máscaras ni resize. El reporte está en `desktop-entry-vs-6f-pixels.json`.

Provenancia: base `bb482eece1126cfd51949e1cc5bfa28cee8332b0` más CSS sin commit `10877671b42927f6ad1bbb855ee7b769ffa9fddb41b4419739832d2986d0f160`; ReferenceScene `723ca7bad1c9cbf466fb0c8ef60145f79c9df727d29d2a9a3fc92928c8be9d93`. Snapshot Node inmutable en 3218. No se afirma un commit servido para este candidato; `QA_CODE_SHA=null` y `candidate-provenance.json` lo explicitan.

Safety: cero APIs, fetch/XHR, POST, proveedores, escrituras u otras lecturas; se documenta la lectura interna exacta de TanStack por documento. Sin 3D, zoom anterior, Safari, hosting ni sitios de privacidad. El export estático final debe validar CSP. JSON, PNG y stdout no se modifican; `SHA256SUMS` cubre las fuentes y toda la evidencia.
