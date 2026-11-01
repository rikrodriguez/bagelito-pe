# Aliases QA y auditoría de lockfile

## Referencias preservadas

- PR47 antes de esta corrección: `2a824c5b29bb85a41b616d20286ed29295e80ed7`; UI runtime `79e484ca37ae151781cc647e5d8096ffce67cc89`.
- PR46: `1cf48c666bcc377e1cd8a068906d27e2494203cf`, sin modificaciones.
- Candidato de coexistencia sólo local: `70fc2a1d4aaf12a217b1bdc8655fe98e7a9fb9e6`, inalterado. Sus167 tests/3 recorridos anteriores no se reasignan al código QA posterior.
- Corrección QA: `3101bda61114618353644ccbbc6dbd073c3bc5d2`; sólo cambian tres aliases de package.json y dos scripts QA. No cambian src/public, negocio, catálogo, dependencia o metadatos de gestor.

## Fallo reproducido

Los tres aliases apuntaban a runners del contrato de imagen: `qa-reference-card-text.cjs`, `qa-reference-secondary-text.cjs` y `qa-reference-direct-entry.cjs`. Esperan una respuesta de `store-reference-approved.webp`, una imagen visible o SVGs que la recortan. La UI actual debe abstenerse de solicitar ese arte. Hay además selectores de cabecera y copy de fidelidad antiguos.

En el DOM real inmutable de PR47 se ejecutaron los nueve predicados de imagen (tres runners por320/390/1280) y los tres inspectores de presentación: rechazaron el contrato obsoleto. Ese probe termina0 porque reproduce los rechazos esperados, no porque acepte la UI antigua. Se ejecutó además **una vez el npm alias antiguo `qa:reference:entry` en390px**: exit1 por `waitForResponse` de20.000 ms a la imagen que la aplicación no solicita,0 casos de imagen/1 fallo. No se ejecutaron las matrices antiguas completas ni se les asigna cobertura.

## Corrección y conservación de cobertura

Los tres aliases ejecutan el driver moderno compartido con perfiles distintos:

- `--profile=text`:18 estados/90 tarjetas en320/390/1280. Mantiene el estado sin selección, los cinco sabores, selección/quitar, precios12/16 para 120 g, cinco tarjetas por estado y auditoría real de texto.
- `--profile=secondary`:36 estados/12 por viewport: formato, cantidad mini, cantidad grande, bagels sin/ con selección, extra opcional, caja, checkout con textos largos/consentimiento, título de Combo, schmear obligatorio del Combo, tamaños y schmear individual seleccionado.
- `--profile=entry`:7entradas responsive, Tab real a las tres categorías con foco visible, Enter real, callbacks con taps/ratón, menú/carrito/progreso y galería decodificada tras scroll nativo.

Se reutilizan sin alterar los inspectores de texto de producto y texto secundario. Permanecen44 px efectivos,12 px de copy/16 px títulos, cardinalidad, clipping, solapes y overflow; la composición conserva la colisión del pseudo-título del Combo y el control más reciente de imágenes fuera de su zona/sobre copy. Se mantienen los controles en flujo del documento y Back fuera del panel.

El helper de checkout se comparte con los recorridos completos. Conserva los textos de resumen/revisión, seis inputs/un select, términos a `/legal`, consentimiento y pago deshabilitado, ausencia de WhatsApp/Culqi/Wallet/confirmación y la regla10pedidos→2bagels+1schmear. Se actualiza únicamente la expectativa de fidelidad pendiente a la semántica ya aprobada del backend; no se exige el párrafo histórico reemplazado ni se activa backend.

El launcher requiere URL loopback y SHA completo, registra scripts/helpers/fuentes, rechaza cobertura de escenario incompatible y no sobrescribe resultados anteriores. Se probaron tres rechazos preflight(exit1) sin navegador: override de escenario, anchos contradictorios y host externo. Estos rechazos no cuentan como recorridos exitosos.

## Resultados terminales

| Comando final real | Resultado terminal |
| --- | --- |
| `npm run qa:reference:secondary` |exit0;36/36 estados,3 contextos,180 PNG,0 fallos. |
| `npm run qa:reference:text` |exit0;18/18 estados,90/90 tarjetas,3 contextos,66 PNG,0 fallos. |
| `npm run qa:reference:entry` |exit0;7/7 viewports,21 categorías+14 vitrina,7 Tab/Enter,126 fotos decodificadas,210 PNG,0 fallos. |
| Recorrido completo390Pack con extra de sabor |exit0;1 recorrido+1 pestaña legal,59 PNG,0 fallos. No es una nueva matriz completa de compras. |
| Node y build |58/58 pruebas,0 skips/FAIL; build/tipos y checks heredados11/4/14,exit0. No se suman dos veces. |
| Rechazos CLI |3 preflights esperados exit1, sin navegador; no se cuentan como UI PASS. |

Los defaults de los tres aliases se ejecutaron sin filtros de anchura/escenario ni preflight. Todos usan fuentes QA3101 y la misma UI inalterada. Auditoría:515 PNG SHA verificados,24 fuentes+6 helpers/driver quietos,14 contextos/15 documentos(incluye legal);15 lecturas conocidas TanStack, una por documento. Cero API/fetch/XHR/proveedores/POST/escrituras/egress/errores de aplicación.

La [evidencia terminal](qa/qa-aliases-20261101/qa-alias-terminal-summary-3101bda.json), [auditoría independiente](qa/qa-aliases-20261101/green-3101bda-independent-audit-aliases.json), [RED npm real](qa/qa-aliases-20261101/red-npm-entry.json), [RED contratos](qa/qa-aliases-20261101/red-contracts.json), [auditoría lock](qa/qa-aliases-20261101/lockfile-audit.json) e [índice de capturas](qa/qa-aliases-20261101/capture-index.json) conservan alcance y procedencia. Los JSON `.gz` son copias exactas de resultados originales; `.raw.log.gz` preserva logs completos y `.log` sólo normaliza ANSI/espacios finales. Se publican capturas seleccionadas, no los515frames completos.

No quedan suites activas. Los resultados antiguos del contrato raster siguen marcados como obsoletos/fallidos; no se renombran como verdes. El código runtime y el candidato de integración se preservan; este parche no certifica su activación productiva.

## Lockfile: decisión sin generación

No se ha generado/restaurado lockfile, instalado paquetes, alterado versiones ni añadido `engines`/`packageManager`. Los manifiestos de base9a, PR461cf, PR472a y candidato70 no tienen campos de gestor/versión; package.json es idéntico entre esos cuatro. La corrección posterior cambia sólo scripts. No hay workflows o Docker actuales versionados. Vercel sólo fija framework y autodeployfalse; las opciones externas de la plataforma no se auditaron.

Observado en repo/historia, con SHA de blobs en la evidencia:

- Locks de `cbd45f8`, `d7ee1a3`, `6547766`: JSON o UTF-8 inválidos.
- Locks válidos de `f19f8b0`/`56fba5f`: proyecto Next.js anterior `bagelito-pe`,378 entradas; no equivalen al manifiesto TanStack actual.
- `node_modules/.package-lock.json`:197 entradas, sin paquete raíz, metadatos del grafo instalado y binarias opcionales observadas Linux x64. No es un lock raíz portátil y no se copia.
- Entorno observado Node 24.19.0/npm 11.9.0; instalados Supabase 2.118.0 frente al rango^2.106.2, TypeScript 5.9.3 frente a^5.8.3 y@types/node24.19.2 frente a^24.10.1. Son observaciones del entorno, no versiones nuevas propuestas.

Inferencia: resolver ahora puede cambiar transitivas, peers y opcionales aunque no cambie el manifiesto. El build probado con node_modules existente no demuestra equivalencia de una instalación limpia. La ausencia de un lock completo del mismo grafo impide justificar una generación indiscriminada dentro de este parche.

Plan separado: acordar y declarar el gestor/runtime de destino; recuperar primero un lock completo del mismo grafo probado, si existe; verificar raíz, hashes, peers y plataformas. Si no existe, tratar la generación como cambio explícito de resolución, comparar el grafo completo y validar instalación limpia/build/tests/UI antes de aceptarlo. No reutilizar locks corruptos, de Next o el oculto instalado; no introducir upgrades para forzar un lock válido.

## Límites

No cambió dirección visual, UI comercial, catálogo, callbacks, pagos, fidelidad, GHL o consentimientos. Sin deploy/merge, producción, privacidad, credenciales, permisos o gastos. Los datos de prueba son ficticios; los aliases siguen cerrados ante proveedores/API/escrituras y registran por separado la lectura conocida del framework. Safari/dispositivos físicos, resolución limpia de dependencias y CI remoto no certificados.
