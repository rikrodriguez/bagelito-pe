# Build y Node de la fuente final

BuildVite/Nitro/TypeScript PASS, con estructural11/11, manual4/4 y movimiento heredado14/14. Node completo58/58PASS,0fallos/skips. Se conservan los stdout originales.

El build se ejecutó antes de confirmar el commit, sobre `ReferenceScene.tsx` SHA256723ca7bad1c9cbf466fb0c8ef60145f79c9df727d29d2a9a3fc92928c8be9d93 y CSS10877671b42927f6ad1bbb855ee7b769ffa9fddb41b4419739832d2986d0f160; esos bytes coinciden con9a94e4c. No se cambia la metadata de las capturas intermedias: las finales del export identifican9a94e4c y base3216. La auditoría de assets vincula el export al snapshot de este build.

Los portables conservan geometría/umbrales; la comparación de fuentes registra sólo adaptación de paths y del contrato de entrada pedido expresamente por Ricardo. El resto de pruebas/assercts de texto se conserva. Sin CI remoto ni instalación nueva.
