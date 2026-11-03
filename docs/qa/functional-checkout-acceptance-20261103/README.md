# Checkout funcional: recuperación y aceptación pendiente

Revisión del PR47 sobre `eff2f0848bc82c3ca58be1b0a6a66500cbc13026` el 3 de
noviembre de 2026. Este lote atiende recuperación de pagos, sin cambios de
precios, catálogo, SQL, gates ni credenciales. No se ejecutaron transacciones
de proveedor, pedidos remotos, mensajes, despliegues ni cambios de servicios.

## Defecto reproducido

La UI trataba `failed` igual que `expired`: borraba la capacidad de recuperación
y ofrecía otro checkout. El fallo del intento no demuestra liberación inmediata
del cupo ni descarta una confirmación tardía. Dos regresiones fallan sobre la
base al perder la referencia, tanto durante el cobro como al recuperar tras
recargar; los controles de `expired` ya pasaban.

La corrección conserva la capacidad guardada y bloquea otro intento. El usuario
puede consultar el mismo pedido; una respuesta `paid` válida puede finalizarlo.
No se guarda token, contacto ni datos bancarios. La respuesta fallida no debe
reescribir el almacenamiento: otra pestaña puede haber guardado un pedido más
reciente mientras la consulta estaba en curso. Las regresiones también cubren
esa sustitución de referencia, consultas duplicadas y callbacks antiguos.
También se retira el reloj local de reserva al entrar en ese estado: volver a
foreground después del plazo no debe sobrescribir una referencia más reciente
ni resucitar una que otra pestaña ya resolvió. El estado del servidor conserva
la autoridad para resolver el pedido.

Un `failed` persistente puede requerir resolución operativa. No se promete que
el plazo lo transforme en `expired`, ni reintento automático, ni cupo inmediato.
No borrar manualmente la referencia para forzar otro pago sin reconciliar.

## Inventario de sandbox sin secretos

`sandbox-inventory.json` contiene únicamente metadatos. No se descifraron ni
imprimieron valores de llaves. Los nombres de variables no prueban su modo.

- No se encontraron variables de pago inyectadas ni `.env` real en los tres
  checkouts locales inspeccionados; solo archivos de ejemplo.
- Los proyectos Vercel `bagelito-pe` y `bagelito-playable` no devolvieron
  despliegues para `feat/rebuilt-storefront-20261101`. El filtro de variables de
  esa rama en el proyecto principal devolvió cero entradas; el inventario
  completo sí contiene nombres de llaves/Culqi en ramas históricas de preview.
- No aparecieron entornos personalizados del proyecto principal. Las 20
  sesiones Vercel más recientes estaban detenidas; no se arrancó ninguna.
- Sí existen previews históricos READY de otras revisiones. Dos GET de
  configuración fallaron con `EAI_AGAIN` antes de recibir HTTP; no se pudo
  establecer modo test ni configuración coherente del runtime. El entorno
  informa red restringida y no permite los destinos Vercel/Culqi necesarios;
  no se modificó la política ni se creó un enlace/token de bypass.
- Supabase reconoce `bagelito-pe` como activo y no devuelve ramas de base de
  datos. Eso no certifica aislamiento ni ausencia global de otro sandbox.
  No se leyeron datos de clientes, llaves ni esquema, ni se ejecutó SQL remoto.

Conclusión acotada: **no se verificó un sandbox accesible que ejecute este
candidato y use el comercio test con datos aislados**. No se enviaron cargos,
tokens ni pedidos de prueba a un entorno no verificado. La aprobación comercial
de Culqi ya obtenida no se vuelve a solicitar.

## Paso concreto para completar la aceptación

El operador autorizado debe identificar una URL de pruebas ya disponible que
ejecute el commit candidato y dar acceso por la ruta existente permitida,
confirmando sin compartir secretos que usa el comercio Culqi en modo test y una
base de pruebas aislada. Si no hay una URL para esta revisión, preparar o
desplegar ese candidato requiere una acción autorizada fuera de este lote;
no se reutiliza una revisión antigua como aceptación del HEAD ni se crean llaves.

Antes de enviar datos sintéticos, verificar en esa URL la configuración pública
coherente (`mode=sandbox`, `configured/enabled/bridgeReady/webhookReady/clientReady`
verdaderos), origen exacto no productivo y el carril `/sandbox-checkout` abierto
solo para test. El operador debe comprobar también el esquema/RPC, la política
de productos y la entrega del webhook al mismo entorno, sin reaplicar fixtures
a ciegas ni conectar la base de clientes. El inventario actual no valida eso.

Entonces ejecutar, con tarjetas y contactos exclusivamente de prueba:

1. Reserva → token → cargo test → webhook verificado → pedido/recibo `paid`
   coherentes en identidad, PEN e importe. No aceptar éxito solo por la UI.
2. Desafío 3DS correcto, cancelado y respuesta tardía; sin segundo cargo por
   callbacks repetidos. Comprobar recuperación tras recarga y respuesta perdida.
3. Rechazo y confirmación posterior: misma referencia, otro pago bloqueado,
   recuperación de `paid` o revisión explícita, sin doble reserva/cobro.
4. Expiración limpia, webhook duplicado/fuera de orden y último cupo con sesiones
   independientes; verificar conciliación del pago tardío antes de liberar o
   confirmar inventario. Los dobles y PGlite no certifican esa concurrencia.

Registrar IDs de prueba y estados minimizados, sin PAN, CVV, tokens ni secretos.
La aceptación real de pedido, webhook, 3DS y conciliación sigue pendiente.
El carril `guided-v1` continúa bloqueado en live por diseño; aprobar sandbox
no habilita ventas productivas automáticamente. Reembolsos siguen requiriendo
operación/revisión explícita. Véase la auditoría histórica de lanzamiento para
las restricciones de catálogo e inventario que permanecen.

## Verificación local

Resultado final: **369/369** pruebas Node; dentro de ellas, **64/64** de
lifecycle del checkout. La selección enfocada de lifecycle, configuración,
gates y recibos pasa **127/127** y se solapa con la suite, no se suma. El build
completo pasa (`npm run build`: Vite, `tsc --noEmit`, QA estática, launch y
movement). La revisión independiente final no encuentra bloqueos en este diff.
No certifica coordinación entre pestañas en otros estados del checkout.

Los comandos y resultados finales se guardan junto a este documento.
La evidencia roja demuestra el defecto previo; las pruebas de lifecycle usan
SDK y transporte sintéticos, sin comunicación con Culqi. El build incluye
TypeScript y las comprobaciones estáticas del proyecto. Tres suites auxiliares
que requieren el HDR offline aprobado no se ejecutan porque falta ese archivo;
no se descargó un sustituto ni se eludió el 403 anterior.

Los logs versionados conservan el contenido con colores ANSI y espacios finales
normalizados para revisión. `verification-inputs.json` identifica versiones y
SHA256 de los archivos comprobados; no se cambiaron dependencias ni lockfile.
