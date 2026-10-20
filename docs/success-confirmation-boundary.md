# El enlace de éxito no certifica un pago

Base: PR 13, `4e59cfb1a7e5cc0b5cecfea5f9801297c8a5c67d`. Esta corrección continúa su rama existente; no contiene la demo POV ni modifica su catálogo.

## Problema y comportamiento

`/reserve/success?payment=paid&amount=987654.32` mostraba pago confirmado e importe sin comprobar el estado del pedido. Los parámetros también alimentaban el evento de analítica. Esto era una afirmación visual no verificada; la reproducción no modificó la base de datos ni demostró un cargo real.

La página conserva únicamente una referencia de texto para el enlace de seguimiento. Muestra **Por verificar / Not verified**, sin estado financiero, importe o productos procedentes del URL y sin valores de compra en analítica. Un enlace sin referencia o con parámetros repetidos ofrece el seguimiento general. El estado registrado se consulta mediante el seguimiento existente; esta corrección no evalúa ni modifica su control de acceso. La página no incorpora otra capability, almacenamiento o consulta automática al proveedor.

`ReservationFlow`, su redirección y eliminación de la referencia de recuperación después de una consulta autoritativa permanecen intactos. También se conservan los plazos, 3DS, coordinación de cargos, RPCs, webhooks, precios, dependencias y migraciones del PR 13.

## Comprobación de la rama actual

La copia local inicial `1e6e2a6` tenía campos de tarjeta de demostración y otras implementaciones antiguas. Se consultaron las ramas remotas antes de cambiar código. En la base actual del PR 13:

- Culqi deshabilitado ya muestra un aviso y no monta formularios ni inputs de pago; `tests/checkout-render.test.mjs` verifica esa frontera y el aviso sandbox.
- Coordinación de reintentos, ownership y aplicación transaccional de eventos ya corrigen los riesgos observados en el snapshot antiguo. No se rehacen esas implementaciones.
- Sólo la presentación de éxito por URL seguía pendiente y motiva este cambio.

## Pruebas

Doce regresiones nuevas fallaron antes de la corrección y pasaron después. Ejecutan la página y el componente reales mediante TypeScript y React; simulan idioma, navegación y analítica, sin proveedor ni base de datos. Cubren español/inglés, `paid`, `pending`, `demo`, `manual`, desconocido, importes y productos manipulados, ausencia de parámetros y códigos repetidos. Verifican la salida HTML, destino de seguimiento y ausencia de valores financieros derivados del enlace en analítica.

```sh
node --test tests/payments/success-confirmation.test.mjs
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
```

Validación local: 590/590 pruebas Node, compilación y tipos correctos y lint sin errores (una advertencia previa en `culqi-readonly-adapter.test.mjs:99`). La guardia de red de la suite y de la compilación registró cero intentos externos. Revisión independiente sin bloqueos. CI se registra en el PR con su SHA exacto; no se confunden los fixtures con pruebas del proveedor.

## Bloqueos externos conservados

El `event_lookup` HTTP 400 histórico sigue sin causa probada: faltan ID de evento sandbox legítimo, asociación merchant/test, historial de entrega y parámetro rechazado. No se cambian headers por hipótesis ni se reenvían eventos.

`supabase/add-culqi-retry-pending-state.sql` sigue pendiente de revisión e instalación en el destino autorizado. Esta corrección no añade ni instala migraciones. Faltan validación real del comercio/medios de pago y autorización de lanzamiento. No se activan pagos, credenciales ni flags; no hay cobros, merge, despliegue o SQL remoto.
