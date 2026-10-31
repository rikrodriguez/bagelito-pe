# Diagnóstico diferencial del gesto del runner

Snapshot real67deb30/3204; no cambio de aplicación. El gesto original x37→353 navegó a `about:blank` después de scrollLeft992→691→366→30. El mismo recorrido desde el interior x85→305 llegó al inicio y mantuvo la URL local y el control Everything alcanzable. Los eventos y casos originales se conservan.

`failures:[]` cuenta errores operativos del diagnóstico, no convierte el caso negativo en PASS de aplicación. El resumen original tenía un fallo de bookkeeping: reutilizaba el flag final al terminar el caso interior. `summary-derived.json` explica esa corrección de resumen a partir de casos/eventos inmutados. El runner final sólo cambia el inset horizontal y añade logs; criterios44px/ROI/texto y helpers no cambian.
