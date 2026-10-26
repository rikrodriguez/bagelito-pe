# Bagelito · Visita digital a la tienda · Candidate V1
**Estado:** rama aislada, base PR #27 (SHA dbfbc9bb1dffa9bc073b837ce35bbb55fd55636a). No merge a main, no release de Culqi, sin SQL ni escrituras a Supabase.

## Alcance implementado
- Portada Next.js propia: entrada luminosa, mostrador con cerámica blanca y superficie tipo acero, producto protagonista. La escena se identifica como ilustración digital, no como fotografía de un local real.
- Logo vectorizado desde la imagen JPG del titular, azul #0751ae y coral #f28d7d. No es el archivo editable original; requiere aprobación visual.
- Mostrador con 10 sabores existentes y sus imágenes versionadas, filtro clásicos/premium y ampliación modal.
- Packs de 6/12 bagels mixtos o de sabor único sin alterar precios: 6 single S/50, 6 mixed S/60, 12 single S/100, 12 mixed S/115. La caja muestra unidades una a una, barra, contador y +/-; evita sobrellenado.
- Enlace directo al checkout, sin recorrido forzado.
- Integración no financiera con ReservationFlow existente: la clave localStorage bagelito:shop-box:v1 almacena solamente pack y sabores, con validación en recuperación. No guarda datos personales ni bancarios.
- Home en español inicialmente, selector de inglés intacto. Adaptación móvil, scroll natural, foco visible y movimiento reducido.
- Fuera del home: temporizador/capacidad pública de batch y popups rotativos de compras. Se conserva lógica interna de disponibilidad y protección del checkout.
- Metadatos actuales; ningún pago paralelo.

## Qué NO demuestra
- La página en modo revisión NO significa Culqi LIVE habilitado: PR #23 mantiene pendientes merchant approval, webhook HTTP, pruebas de banco y credenciales LIVE.
- La presencia de archivos webp en Git no prueba que todas las imágenes carguen en la red; falta verificación efectiva en Preview.
- Vercel build READY no es QA real de clics o imágenes ni prueba de cobros. No se han ejecutado capturas autenticadas de escritorio/móvil del último commit.
- Ningún cambio en Supabase, órdenes históricas, claves, cobros o registros financieros.
- La rama parte del PR #27, no del PR #23. Reconciliar los candidatos de forma explícita antes de merge, sin rebase destructivo.

## QA de aceptación pendiente
1. Desktop 1440px y móviles 320/360/390px: fotos 10/10, logo, enlaces, botones, foco, cero overflow.
2. Mixed 6/12: agregar/restar, evitar > capacidad, cambiar pack, atrás/adelante, recarga. Single: elegir y reemplazar.
3. Home -> counter -> zoom -> caja -> checkout: cotejar mismos sabores y cantidades; editar en checkout y recuperar en home.
4. Distrito/delivery y total: comprobar función de tarifa existente y errores de entrada.
5. Modo demo explícito: sin datos bancarios ni escrituras a órdenes/pagos. Comprobar tráfico y logs seguros.
6. Node tests, lint y build exactos del head, teclado/Safari/Chrome/Firefox y red fallida.
7. Revisar vectorización JPG frente al arte original y aprobar antes de publicar.

## Publicación
DRAFT / NO MERGE / NO PRODUCCIÓN. Las previews automáticas de Vercel que pudieran generarse por push no son una publicación en bagelito.pe. Solicitar aprobación antes de fusionar o habilitar pagos.