Aplicación y build probados: `0381000a91fc8eebe235c8ebf9c034def9dc64b6`. Snapshot inmutable `http://127.0.0.1:3205`, Chromium headless con SwiftShader solicitado y GPU en uso exclusivo durante la corrida. Pagos e intake desactivados; HDR aprobado servido desde fixture local.

**PASS: 32/32 escenas, cero fallos, exit 0.** Ambos modos finalizaron sus 16 escenas y las comprobaciones auxiliares originales de packs de un sabor/minis, restauración del borrador y privacidad. El driver y sus asserts permanecieron intactos.

| Modo | Viewport | Escenas | GET locales registrados | Lecturas HDR | HTTP >=400 | Bloqueos | Errores de rutas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Escritorio | 1280 × 800 | 16 | 148 | 5 | 0 | 0 | 0 |
| Móvil | 390 × 844 | 16 | 141 | 5 | 0 | 0 | 0 |

El firewall sólo permitió GET del origen loopback y la URL exacta del HDR, satisfecha con bytes locales fijados por SHA-256. Los preflight GET de configuración de pagos se realizaron directamente contra loopback con redirects bloqueados.

[Resultado completo](results.json), [log](stdout.log) y [metadata con los hashes de las 32 capturas, fuente y artefacto](artifact-metadata.json). Fuente y snapshot no cambiaron durante la ejecución. El runner fue `331d31b1064104e57853c9a207cb7d0aa17284dbedd57210b4d722b582d6948f`; el árbol del artefacto fue `187582470b95d64d5ab09f5e4fad768f2919932e5eed601f4df1e409838c01b6`. La evidencia anterior de A1 se conserva en su carpeta propia.

Esta suite funcional no acredita paridad fotorrealista final ni pruebas de Safari, iPhone físico o rendimiento en GPU de hardware.
