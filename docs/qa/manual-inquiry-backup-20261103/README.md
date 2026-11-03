# Respaldo de consulta manual — 3 noviembre 2026

Preparado sobre PR47 `3dcd98509118454b3ae1d301ca6af06767b4773d`, tree
`91b3f1920cb967237d9fb747eb60549813f6e7ec`. La copia de partida coincide
exactamente con ese tree. **Es un respaldo cerrado por defecto, no un lanzamiento
ni una sustitución del checkout Culqi solicitado.**

## Bloqueo corregido en el candidato

Las dos entradas públicas `/` y `/playable` montan `ReferenceStorefront` en
`reviewOnly`. Esa decisión protege la revisión pero oculta también el contacto
manual. `qa:launch` sólo comprobaba el formateador del mensaje, no que existiera
una ruta comercial accesible. Quitar `reviewOnly` no es una solución segura:
también habilitaría consultas de configuración y potencialmente checkout.

La nueva ruta `/consulta` tiene una capacidad de sólo contacto. Requiere
`BAGELITO_MANUAL_INQUIRY_ENABLED=true` y un
`BAGELITO_MANUAL_INQUIRY_ORIGIN` igual al origen de la solicitud. El origen debe
ser HTTPS; HTTP sólo se admite para localhost, 127.0.0.1 o [::1], con puerto
exacto, para pruebas locales. Los headers reenviados no conceden la capacidad.
La ruta y su función de disponibilidad devuelven `private, no-store` y la página
es `noindex,nofollow,noarchive`. El navegador recibe sólo `enabled`, nunca el
entorno privado. Un flag ausente, falso o no exacto mantiene la pantalla cerrada.

`manualInquiry` hereda las guardas de revisión para no leer/escribir el borrador,
consultar configuración/precios, cargar Culqi, crear reservas ni mostrar datos
de entrega, consentimiento de compra, pago o recibo. La única excepción es
generar un enlace de contacto después de completar una selección. Si se combina
con review o sandbox explícitos, el enlace tampoco aparece. El paso Pago se
oculta y el carrito dice que el precio final se confirma con Bagelito.

El mensaje conserva productos, cantidades y tamaños, incluidos los **120 g del
schmear opcional**, antes omitidos en el texto de packs y combos. No incorpora
nombre, dirección, email o información de pago. El cliente decide si abre
WhatsApp y envía el texto. Ninguna prueba abre ese enlace ni envía un mensaje.
Contacto existente: +51 917 547 745, confirmado funcional por el titular el
26 de octubre. La consulta pide disponibilidad, precio, delivery y fecha, y
declara que no confirma ni paga el pedido.

El upsell de este respaldo es el schmear opcional y reversible del pack.
No se activan las ofertas `upsell8/downsell2` exclusivas de QA, ni se inventa
precio para el combo actual de 2 bagels + 1 schmear. Los combos históricos 6+1,
12+2 y 6+3 no se confunden con esa composición.

## Verificación

- **373/373 pruebas Node**, cero fallos/skips, con el HDR aprobado existente
  comprobado por su hash. Son 352 previas más 21 nuevas: 13 recorridos, 5 de
  configuración y 3 de disponibilidad.
- Los 13 recorridos ejecutan los componentes completos `GuidedCommerce` y
  `ReferenceScene`, las funciones de dominio, efectos y handlers reales con
  un harness local de hooks/JSX. Packs single/mixed, minis24, extra120 y retirada,
  combo2+1, tres tamaños individuales, incompletos, contradicciones y estado
  hostil de pagos/QA. Fallan ante fetch, almacenamiento, SDK o formulario PII.
- Build completo/TypeScript en `build.log`. QA estructural, manual4/4 y
  movimiento14/14 son subconjuntos, no casos adicionales al total Node.
- Una revisión independiente no encontró defectos bloqueantes en esos recorridos.
- La primera ejecución global sin la variable de fixture terminó en
  346 passes/3 fallos de preparación. Se conserva en `node-missing-fixture.log`;
  se corrigió la invocación, no se sustituyó el recurso ni se omitieron tests.

Comando final:

```sh
QA_HDR_FIXTURE_PATH=/ruta/al/lebombo_1k.hdr NODE_OPTIONS=--max-old-space-size=384 \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS=--max-old-space-size=384 npm run build
```

## QA visual preparada, aún sin ejecutar

Usar dos servidores locales de build, primero con flag falso y después con flag
verdadero, sin llaves ni DB. No es un deploy. En cada caso mantener
`BAGELITO_REFERENCE_REVIEW_ONLY=true`, `BAGELITO_MERCHANT_REVIEW_ONLY=true`,
`CULQI_ENABLED=false`, y ejecutar `.output/server/index.mjs` con
`NITRO_HOST=127.0.0.1 NITRO_PORT=3280`. Para el caso enabled, usar
`BAGELITO_MANUAL_INQUIRY_ORIGIN=http://127.0.0.1:3280` además del flag.

```sh
BASE_URL=http://127.0.0.1:3280 MODE=closed OUTPUT_DIR=/tmp/qa-manual-closed \
  node scripts/qa-manual-inquiry.cjs
BASE_URL=http://127.0.0.1:3280 MODE=enabled OUTPUT_DIR=/tmp/qa-manual-enabled \
  node scripts/qa-manual-inquiry.cjs
```

Los directorios deben ser nuevos. Playwright tiene que estar disponible; la suite
no instala dependencias. Se esperan 2 casos/capturas closed y 20 enabled en
390/1280. Intercepta tráfico antes de navegar: no externo, API, mutaciones,
redirecciones ni WebSocket. Sólo inspecciona el href WhatsApp, nunca lo abre.
Guarda `summary.json` también si falla. `--preflight` valida configuración sin
abrir navegador; no constituye QA visual. El script pasó syntax y preflight.

**No es QA browser/layout/focus, React StrictMode, WhatsApp delivery, SQL o
aceptación Culqi.** El navegador local tiene una restricción conocida de sockets;
no se intenta eludirla. Browser Use y Firecrawl consultados para la tienda pública
no ejecutaron por créditos insuficientes, sin compras ni reintentos. La lectura
web tampoco pudo acceder al dominio; eso no demuestra caída del sitio.

La metadata de Vercel sí confirma que la última producción enumerada permanece
en `main/ca6f5b022864ee2164845f18c1c81f137cf0b108`, deployment
`dpl_9un1gkBKhhjwkwXjySkajo9f2vDD`. No es este candidato TanStack. El sitio
público no se considera validado por la metadata de despliegue.

## Pasos de lanzamiento pendientes

1. Terminar aceptación del procesador en entorno aislado autorizado: configuración
   test del mismo comercio, esquema real compatible, contención multisesión,
   tarjeta/3DS/Yape, webhook HTTP, rechazo, expiración y pago tardío/reconciliación.
   El guard financiero de 3dcd985 permanece íntegro; su SQL no se instala aquí.
2. Cerrar precios pendientes según composición, stock por sabor/tamaño de pots,
   batch/capacidad/fecha y contenido legal. La activación comercial Culqi ya
   obtenida no se vuelve a pedir ni equivale a aceptación técnica.
3. Ejecutar QA visual segura del commit exacto en un executor autorizado,
   móvil/escritorio, sin abrir WhatsApp o Culqi ni realizar pedidos. El respaldo
   no necesita llaves, DB ni acceso externo. El script preparado debe informarse
   por separado como ejecutado o pendiente, no confundirse con las pruebas Node.
4. Si se decide usar el respaldo mientras se cierra Culqi: revisar la propuesta,
   autorizar despliegue del candidato y habilitar sólo la ruta/origen aprobados.
   Mantener los gates financieros cerrados. Dar al cliente la URL `/consulta`
   deliberadamente; `/` y `/playable` siguen siendo revisión y no se redirigen.
   Cada consulta requiere confirmación humana de stock, precio y entrega.
5. Autorizar el release productivo de Culqi únicamente tras sus pruebas completas.
   Activar un contacto manual nunca autoriza cobros ni migraciones.

No se cambian catálogo/precios, assets, estilos, backend financiero, SQL,
homepage, sandbox, permisos, credenciales o autodeploy. `vercel.json` conserva
`git.deploymentEnabled:false`. Sin merge, despliegue, mensajes, pedido ni cobro.
