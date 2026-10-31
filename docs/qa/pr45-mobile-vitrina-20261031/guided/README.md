Aplicación y build probados: `a1fce7227d15482b8636b69fdbddd6d3274383bc`. Snapshot inmutable `http://127.0.0.1:3203`; ejecución serial en Chromium headless con SwiftShader solicitado, pagos e intake desactivados y HDR aprobado servido desde fixture local. No hubo despliegue.

**PASS: 32/32 escenas, cero fallos, exit 0.** Ambos modos finalizaron sus 16 escenas y las comprobaciones auxiliares originales de packs de un sabor/minis, restauración del borrador y privacidad. El contrato original de ocho placas claras con letras azules se conservó y pasó en ambos viewports.

| Modo | Viewport | Escenas | GET locales registrados | Lecturas HDR | HTTP >=400 | Bloqueos | Errores de rutas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Escritorio | 1280 × 800 | 16 | 144 | 5 | 0 | 0 | 0 |
| Móvil | 390 × 844 | 16 | 141 | 5 | 0 | 0 | 0 |

El firewall sólo permitió GET del origen loopback y la URL exacta del HDR, satisfecha con bytes locales fijados por SHA-256. Tampoco registró errores o abortos de rutas durante el cierre. Los GET de preflight de configuración de pagos se realizaron directamente contra loopback con redirects bloqueados.

El [resultado completo](results.json), el [log](stdout.log) y los [hashes de las 32 capturas, fuente y artefacto](artifact-metadata.json) conservan la procedencia exacta. Los hashes de fuente y snapshot permanecieron sin cambios durante la corrida. El runner fue `331d31b1064104e57853c9a207cb7d0aa17284dbedd57210b4d722b582d6948f`; el árbol del artefacto fue `4ebc40b045c806b1dccd253e1c24935a03baec830c4315514ccbbe9b51080553`.

Esta suite funcional no acredita paridad fotorrealista final ni pruebas de Safari, iPhone físico o rendimiento en GPU de hardware.
