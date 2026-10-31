# PR45 — entradas entre frames y QA sobre build estable

Continuación autorizada el 31 de octubre de 2026. No es un despliegue.

Código de aplicación final candidato: `df504aa1f605bd620bf36be9c28963b0401a95d6`. El artefacto de prueba es una copia independiente de `.output` bajo `/tmp/bagelito-artifact-final-3197`, servida sólo por loopback con pagos, configuración del proveedor e intake desactivados. No se reconstruye ese directorio durante pruebas.

## Causas demostradas

1. El handoff anterior recibió tres chunks JavaScript HTTP500 porque se reconstruyó `.output` mientras otro proceso seguía sirviendo su manifiesto anterior. Se conserva la prueba HTTP y se usa una copia fija por build; los runners ahora registran errores de documento/chunks.
2. En el navegador real con SwiftShader, keydown y keyup de un hold programado de480ms ocurrieron sin un frame intermedio: desplazamiento cero. El estado booleano finalfalse borraba toda la pulsación. Se conservan intervalos monotónicos de entrada por fuente; se consumen una sola vez, con buffer máximo1s y pasos de colisión<=50ms. Blur, visibilidad, cleanup y modo guiado descartan activos y pendientes. Se publica la posición real al cambiar, sin esperar ocho frames inmóviles.
3. La telemetría volvía a renderizar el componente de sombras. Drei guarda el contador finito de bake como variable local; el render lo reiniciaba. El baseline siguió renderizando los dos targets512² después del presupuesto8. Aislar el componente conserva exactamente sus parámetros y evita reinicios. Regresión browser: baselineFAIL (frames17–24:40clears/4048draws); memoPASS (0/0). La versión portable aprobó24frames y exactamente8bakes iniciales.
4. Un primer rerun con14capturas terminó por una promesa de route.fulfill rechazada al cerrar el contexto. Se preserva como incompleto. Los runners drenan los handlers antes de disponer respuestas, conservan el firewall durante el cierre, registran errores reales y guardan checkpoints/JSON aun si el navegador falla. Ni el strafe ni la readiness fueron relajados.

## Contratos conservados

Comparación AST contra925c050: treinta helpers visuales sin cambios; sólo cambian PlayableStore, CameraController y MobilePad por la entrada/cámara. StoreArchitectureVisual, GuidedCommerce, CSS, referencia aprobada y vercel.json son idénticos. Catálogo, handlers comerciales, servidor, APIs, pagos y dominio no se modifican. El mundo sigue siendo WebGL visible durante compra sana; los controles comerciales DOM se reconocen como tales.

## Verificación al cierre

Checkpoint de diagnóstico y evidencia preservada; la QA3D completa y los eventos reales siguen en curso.

| Comprobación | Estado acreditado en este checkpoint |
| --- | --- |
| Suite guiada, escritorio1280 y viewport390 | **32/32 PASS**, cero fallos; incluye minis/un sabor, restauración, categorías, caja y cierre QA |
| Readiness original, QA3D | **PASS ambos viewports**, ocho frames dentro del presupuesto30s |
| Strafe original, QA3D | **PASS**, hold programado480ms, X0→1.18, umbral>0.12 sin cambios |
| Resto de QA3D | **18/20**, faltan ambos handoffs de schmears tras reiniciar el viaje; hay dos timeouts y no se declara suitePASS |
| Sombras finitas en navegador | **PASS**, ocho bakes iniciales, cero actividad tardía de sus targets512² |
| Entrada nativa/RAF gate | En curso; no sustituye el runneroriginal |

[Guiada completa y32capturas con hashes](qa/pr45-runtime-input-20261031/guided/results.json). [QA3D18/20 con fallos conservados](qa/pr45-runtime-input-20261031/qa3d-before-one-shot/tour-results.json). [Causas y experimentos](qa/pr45-runtime-input-20261031/diagnosis/).

El nuevo timeout de reinicio ocurre en un artefacto sin cambios y sin HTTPfallidos; es distinto del primer problema de chunks500. Se investiga una escritura tardía del borrador entre su borrado en el documento viejo y la navegación. La persistencia comercial no se altera para resolver un reinicio del driver.

Build/tipos y contratos estructural11/11, fuentevisual7/7, manual4/4 PASS. Pruebas movimiento14/14 PASS con Three real y seams offline; no sustituyen eventos de un dispositivo. Driver3D11/11 offline PASS; driverguided6/6 offline PASS. El recorrido QA usa la simulación explícita existente de pago/recibo en modoQA, sin crear pedidos o cargos reales.

La reducción de drawcalls se midió en un experimento aislado de sombras, no es una certificación de FPS. SwiftShader sigue lento; no acredita móvil físico, Safari, fluidez de hardware ni fotorrealismo final. Las tarjetas aún cubren parte de la vitrina desktop. Sigue DRAFT/no merge/no deploy; git.deploymentEnabled:false.


Las capturas móviles confirman un límite visual material: los paneles blancos de compra cubren gran parte de la vitrina física y el Canvas queda visible sobre todo en los márgenes. Este PASS funcional no resuelve esa composición ni acredita que la vitrina siga siendo protagonista como en la referencia. No se sustituyó el mundo por una imagen de fondo.
