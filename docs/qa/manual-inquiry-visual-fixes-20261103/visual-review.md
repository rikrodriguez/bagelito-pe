# Revisión visual independiente del candidato de corrección

Inspeccioné ocho PNG existentes del candidato local basado en
`1cbf5162b3e9abc5ddf6a29efc34896bc9feffef`. Las capturas incluyen las correcciones
locales posteriores; no se atribuyen al tree limpio de ese commit base.

Identidad leída y comprobada contra `run-results.json`:

- `src/playable/GuidedCommerce.tsx`, SHA-256
  `de09c687a3749ef7f7913d0b1939094dcfaa53ead7306f1d91076cb3395978f6`.
- `scripts/qa-manual-inquiry.cjs`, SHA-256
  `fc0787a4c7ed1c4ceb4f95a9f7e4ac71bd61e430819bdf112a0a9890d9fa942d`.

La inspección humana cubrió `single-optional120`, `combo2plus1` y `standalone240`
en 390 y 1280 px, además de los dos PNG `closed`. Leí los resúmenes del runner:
**2/2 closed y 20/20 enabled aprobados**, sin errores HTTP, de página o de ruta,
solicitudes bloqueadas ni desbordamiento horizontal. Los 20 casos enabled
registran opacidad del panel igual a 1. No reejecuté navegador o servidor; esos
totales corresponden a la ejecución del coordinador, no a pruebas adicionales
de este revisor.

Las dos observaciones anteriores quedan corregidas en los seis PNG enabled
inspeccionados:

- El pack single y el combo muestran ahora **`Whipped Original · 120 g`** en el
  resumen visible, tanto en 390 como en 1280 px. La etiqueta es legible y no
  queda cortada ni solapada. Standalone conserva **`Whipped Original · 240 g`**.
  El mensaje registrado sigue incluyendo el tamaño correspondiente.
- La acción de WhatsApp muestra una **flecha diagonal visible**, con trazo
  blanco definido, en lugar del pequeño recuadro observado previamente. El SVG
  decorativo de la fuente coincide con la apariencia en estas capturas. La
  comprobación geométrica del runner aporta evidencia DOM complementaria; la
  confirmación de que la flecha se ve procede de inspeccionar los PNG.

Los paneles se capturaron con color pleno, sin la atenuación de entrada del
primer lote. No observé regresiones evidentes de layout en los ocho PNG
revisados: cantidades y tamaños, CTA, aviso de precio por confirmar y ausencia
de reserva/cobro permanecen visibles. La etiqueta más larga cabe a 390 px. Los
estados cerrados siguen siendo claros, con el enlace de regreso y sin controles
de pedido.

La referencia aprobada accesible sigue siendo la landing de escritorio
`public/images/store-reference-approved.webp`, 1536×1024, SHA-256
`0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`, inspeccionada
en la revisión previa. Su alcance permite comparar identidad general, no
aprobar estos resúmenes finales o el móvil: **no hay aquí una referencia
aprobada de checkout/consulta final ni de 390 px**. Las correcciones mantienen
la marca y la paleta de los estados revisados; no se afirma fidelidad exacta.

Conclusión limitada: **confirmación visual favorable de las dos correcciones
solicitadas y sin regresiones evidentes en los ejemplos inspeccionados**. No es
aceptación visual completa del sitio ni certificación de contraste o
accesibilidad. Esta revisión no valida React StrictMode, teclado/foco,
lectores de pantalla, hover, zoom, landscape, Safari u otros navegadores,
dispositivos físicos, todos los estados intermedios o los otros 14 PNG enabled.
La evidencia corresponde a Chromium local; no se extrapola a todos los clientes.

No abrí WhatsApp/Culqi, envié mensajes o pedidos, ejecuté cobros ni modifiqué
fuentes. El único archivo escrito por este revisor es este informe.
