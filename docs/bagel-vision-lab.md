# Bagel Vision Lab — prototipo aislado

Ruta experimental: /experiments/bagel-vision. No enlazada en la navegación pública. Tiene robots noindex y debe probarse en un Preview antes de habilitar distribución. Checkout, Culqi, Supabase, inventario, pagos y el flujo /reserve no se importan ni modifican.

## Funciones

- Subida LOCAL de video MP4/WebM/MOV, máximo 100 MB, sujeta al códec soportado por el navegador.
- Análisis local de bordes, contraste, luminosidad y movimiento para generar overlays gráficos procedimentales.
- Cuatro presets, sensibilidad, intensidad, paleta de marca, encuadre y visibilidad de la capa.
- Exportación de un clip de cinco segundos sin audio con MediaRecorder. Formato final según navegador.
- Sin servidor de subida, sin API, sin envío de videos a Supabase. Blob URLs revocadas tras reemplazo o desmontaje.
- No hay reconocimiento de productos ni medición de calidad de alimentos.

## Integridad

No importar la Content Security Policy restrictiva de la app original: su política para frames/conexiones rompería Culqi. Mantener el componente fuera del homepage público salvo que se pruebe su rendimiento. Antes de publicar, revisar Chrome Android, Safari iOS, compatibilidad de exportación, accesibilidad, INP y costo móvil. Para marketing, usar clips pre-renderizados en vez de un canvas ejecutándose continuamente en el hero.

Fuente adaptada: https://github.com/amirmushichge/machine-vision, licencia MIT © 2026 Amir Mushich. La licencia original se incluye íntegra en src/features/bagel-vision/LICENSE.MIT.
