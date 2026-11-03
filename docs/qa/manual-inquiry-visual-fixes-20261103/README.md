# Tamaño visible e icono vectorial de consulta manual

Corrección basada en PR47 `1cbf5162b3e9abc5ddf6a29efc34896bc9feffef`.
La QA anterior encontró dos defectos: packs/combos omitían `120 g` en su resumen
visible, aunque el mensaje sí lo incluía, y el glifo de salida `↗` aparecía como
un pequeño recuadro en Chromium local.

El cajero ahora muestra el tamaño seleccionado junto a todos los schmears:
120 g en packs/combos y 120/180/240 g en individuales. Se usa el mismo estado de
tamaño que alimenta el mensaje, sin alterar selección, catálogo ni precios. Al
retirar el schmear también desaparece su detalle visible. El icono se dibuja con
un SVG inline de 18×18, `currentColor`, decorativo y no enfocable; no depende de
fuentes ni de una descarga de asset.

El script visual ahora comprueba los gramos visibles, el SVG con geometría y
tamaño efectivo, la retirada del extra y la ausencia de overflow. Espera las
animaciones finitas y captura con animaciones desactivadas, verificando opacidad
1 en el cajero para evitar fotografías de la transición de entrada.

## Evidencia ejecutada

- Antes de corregir, las nuevas aserciones reprodujeron **5 fallos** en los 14
  recorridos: tres packs, combo e icono. La salida real está en `red.log`.
- **22/22 pruebas focalizadas** aprobaron: recorridos, configuración y
  disponibilidad. Incluidas en el total Node, no sumadas de nuevo.
- **349/349 pruebas Node ejecutadas aprobaron**, cero fallos/skips. Los tres
  archivos `qa-guided-driver`, `qa-loopback-guard` y `qa-world-driver` se
  excluyeron explícitamente por faltar su HDR offline aprobado: sus 25 casos
  no se ejecutaron aquí. No se sustituyó el recurso ni se repitió su descarga.
- **Build y TypeScript aprobaron**, exit 0. QA estructural 11/11, fallback manual
  4/4 y movimiento 14/14 son subconjuntos, no casos adicionales.
- **QA visual: 22/22 casos y capturas** con el script actualizado: closed 2/2,
  enabled 20/20, en viewports de 390×900 y 1280×900. Ningún error de página,
  HTTP, rutas, tráfico prohibido ni overflow horizontal. Los 20 cajeros enabled
  registran opacidad 1. PNG y resúmenes completos en `closed/` y `enabled/`.
- Revisión independiente del diff favorable, sin hallazgos bloqueantes; detalles
  y límites en `independent-review.json`. Inspección visual adicional en
  `visual-review.md`.

Los recorridos cubren pack single/mixto/minis24 con extra de 120 g y su retirada,
combo2+1, individuales 120/180/240 g y estados cerrados. Verifican el enlace y el
texto del mensaje sin abrir WhatsApp ni enviarlo. La inspección de capturas
confirma que el tamaño y la flecha vectorial se ven en los ejemplos revisados.

## Seguridad y reproducción

Servidores locales secuenciales, solo `http://127.0.0.1:3280`, detenidos al
terminar y con entorno permitido sin credenciales de base o proveedor. Siempre:

```text
BAGELITO_REFERENCE_REVIEW_ONLY=true
BAGELITO_MERCHANT_REVIEW_ONLY=true
CULQI_ENABLED=false
BAGELITO_MANUAL_INQUIRY_ORIGIN=http://127.0.0.1:3280
```

El gate manual fue `false` para closed y `true` para enabled, solo en esos
procesos temporales. Las guardas originales se mantienen: interceptación antes
de navegar, solo GET/HEAD del origen local; API, mutaciones, tráfico externo,
redirecciones y WebSockets bloqueados; service workers deshabilitados. No se
alteraron formularios, SDK, contacto, backend financiero ni habilitación remota.
La ruta de disponibilidad solo lee el entorno; el servidor SSR también se
mantiene sin acceso a credenciales, porque la interceptación es del navegador.

Se reutilizó Playwright 1.64.1 y Chromium del sistema 151.0.7922.173 mediante un
preload externo que solo fija la opción pública `executablePath`. La descarga
del binario empaquetado había respondido 403; no se eludió ni se probó otra URL.
`run-results.json` conserva versiones, origen, comandos, hashes del candidato y
del script, gates y salida. Los servidores terminaron correctamente.

```sh
node --test tests/manual-inquiry-journey.test.cjs \
  tests/manual-inquiry-config.test.cjs tests/manual-inquiry-availability.test.cjs
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=4' npm run build
BASE_URL=http://127.0.0.1:3280 MODE=closed OUTPUT_DIR=<directorio-nuevo> \
  NODE_PATH=/tmp/bagelito-visual-tools/node_modules \
  node --require /tmp/bagelito-system-chromium-preload.cjs scripts/qa-manual-inquiry.cjs
# Repetir con otro proceso servidor, gate manual=true, MODE=enabled y directorio nuevo.
```

## Límites y entrega

Solo se comprobó emulación Chromium local en esos dos anchos. No se certifica
foco de teclado, accesibilidad/contraste completos, dispositivos reales,
React StrictMode ni otros motores. Las capturas son estados finales, no cada
selector intermedio. La referencia aprobada disponible es una portada de
escritorio, no una aprobación de cajero o móvil; no se afirma fidelidad exacta.

No se probó envío/recepción de WhatsApp, aceptación Culqi, SQL, contención real
entre sesiones ni el esquema desplegado. Esos pendientes financieros no se
resuelven con una corrección visual. No se instalaron migraciones, activaron
pagos/pedidos, enviaron mensajes, fusionaron ramas ni desplegó la tienda.
`vercel.json` conserva `git.deploymentEnabled=false`.

La actualización autorizada se limita al PR en borrador después de comprobar que
su rama y ref de PR conservan el HEAD de partida. Los logs de build se mantienen
en bruto, con ANSI y espacios del empaquetador; las fuentes y pruebas pasan la
comprobación de whitespace. Los manifests y lockfiles no cambian.
