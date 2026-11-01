# Candidato v3: auditoría secundaria 36/36 PASS

Los mismos 36 estados se verificaron en 320, 390 y 1280 px, con cero hallazgos: fuentes de al menos 12 px, controles habilitados de 44 px, sin clipping, solapes de Range ni overflow horizontal. Everything y Cinnamon Raisin ya caben en 320 px con y sin selección; Plain usa 13 px en el resumen.

La cobertura incluye formatos, cantidades de minis y grandes, bagels, schmear opcional, combos y su título generado, tamaños individuales, caja, formulario y fidelidad. Se inspeccionaron los píxeles de las capturas largas de 320 px: bagels seleccionados, formulario de una columna y los cinco schmears.

Los helpers primario `47afa5fb…` y secundario `9bef826c…` conservan sus mediciones y criterios. No se repitieron los 18 estados de schmears en Node porque sus reglas no cambiaron; el último PASS de 18 estados permanece en la evidencia de bb482ee y el export estático final debe cubrir ambos grupos.

Provenancia: base `bb482eece1126cfd51949e1cc5bfa28cee8332b0` más CSS sin commit `10877671b42927f6ad1bbb855ee7b769ffa9fddb41b4419739832d2986d0f160`; ReferenceScene conserva `723ca7bad1c9cbf466fb0c8ef60145f79c9df727d29d2a9a3fc92928c8be9d93`. Snapshot Node inmutable en 3218. `QA_CODE_SHA=null` evita atribuir al candidato un commit servido inexistente; `candidate-provenance.json` registra los hashes de los bundles CSS.

Safety: cero APIs, fetch/XHR, POST, proveedores, escrituras u otras lecturas. Se registra únicamente la lectura interna exacta de TanStack por documento. Este candidato Node no aplica CSP; el export final debe validarla. Sin 3D, zoom anterior, Safari, hosting ni sitios de privacidad. JSON, PNG y stdout permanecen intactos; las fuentes y `SHA256SUMS` permiten auditoría.
