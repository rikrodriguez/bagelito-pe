# Baseline de legibilidad y solapes — FAIL real

Aplicación6f765cee68f4c4d2f013a1082b497a73b5191bd7/exportf2cc618ecfeaa52807cd8a1b3ee77121c972f94a, servidor estático3212 sin modificar. Procesoexit1,18estados y336hallazgos repetidos (no336bugs distintos).39PNGconservados: entrada yrecorte/fullstage de seis estados porancho.

| Viewport | Estados | Hallazgos repetidos | Tipos |
| --- | ---: | ---: | --- |
| 390×844 | 6 | 102 | {'font': 48, 'text-overlap': 54} |
| 320×700 | 6 | 120 | {'font': 48, 'text-overlap': 72} |
| 1280×800 | 6 | 114 | {'clipping': 114} |

Criterios fijados antes de CSS: nombres/notas/precios≥12CSSpx; todos los Rangeglyphrects positivos dentro del recorte efectivo de sus ancestros/tarjeta; pares de campos no se solapan másde0.5px por eje; targets habilitados≥44×44 efectivos yoverflowdocumento≤1px. Se excluye el viewport del clipping global de tarjetas para permitir scrollvertical normal; se conservan clips reales de overflowhidden/auto ytodos los padres computados. No resize, máscaras ni umbrales adaptados al resultado.

Primer caso390 sinselección: AjíAmarillo nota «con cebolla y sal» yprecio «120g·S/16» solapan sus Rangeglyphs en x256..305.7,y150..163; ambosfont9px. HoneyCinnamon/ClassicStrawberry presentan la misma causa. Desktop también registra tipografía/clipping aunque no superpone esos pares. Cada sabor tiene estado seleccionado y una captura global inicial sinselecciones; se comprueba que seleccionar/quitar siga funcionando.

El source de driver/helper está congelado en esta carpeta y sus hashes figuran enJSON/manifiesto. Los precios yhandlers son los mismos del catálogo verificado; no se editaron. El diagnóstico usa DOM real yRange, sin hooks ni modificación de aplicación.

SafetyPASS: ceroAPI/fetch/XHR/proveedores/POST/escrituras/CSP/hidrataciónerrores. Una lectura internaTanStack exacta por documento yningunaotra; stacks preservados. NoCanvas/WebGL/HDR, Safari físico nihosting. Los fallos visuales son independientes del PASS funcional anterior y permanecen visibles.

JSON/PNG/stdout se copian sin modificar. SHA256SUMS enumera todos los archivos.
