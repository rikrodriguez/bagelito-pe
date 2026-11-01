# Controles móviles con vitrina visible

Objetivo autorizado: mantener logo y productos 3D visibles mientras se selecciona, con todos los controles, cantidades y reglas comerciales existentes. La referencia aprobada muestra los mostradores como protagonistas; las capturas anteriores los cubren con un panel desde y118 hasta574 y otro resumen de106px.

Decisión de implementación del agente dentro del alcance: bandeja inferior CSS, carril horizontal de catálogo y fila compacta de resumen/continuación. No se añade otro estado de compra ni un disclosure nuevo; el carrito existente conserva el detalle completo. La alternativa de un panel plegable requería estado y más transiciones; una cuadrícula vertical pequeña seguía desplazando la vitrina.

Sólo móvil y `data-live-world=true`. Mantener los ocho/cinco artículos en DOM, nombres completos, foco visible, desplazamiento nativo y targets de al menos44px. Conservar handlers y campos de pago/consentimiento. El recuperador sin WebGL y escritorio mantienen su composición.

Validación fijada antes de medir: viewport320×700 y390×844, cero overflow, catálogo completo accesible por scroll/tap, Canvas real y porcentaje libre medido. En bagels/schmears: al menos90% de ROI física sin superficies DOM opacas y todos los centros de sus8/5rótulos libres. Otras escenas de selección/revisión: ROI60% y centros75%. Los bloqueos físicos por POS/modelos se registran aparte, no se confunden con overlays DOM. Comparar píxeles antes/después con SHA y conservar las pruebas funcionales existentes.
