# Inventario del export estático

Aplicación `6f765cee68f4c4d2f013a1082b497a73b5191bd7`; exportador `f2cc618ecfeaa52807cd8a1b3ee77121c972f94a`. Auditoría de archivos y fuente sin browser/GPU, HTTP, builds ni modificaciones de aplicación. Datos completos en [file-inventory.json](file-inventory.json).

**PASS de inventario:** 83 archivos regulares: los 82 enumerados por el manifest más el manifest mismo. Los tamaños y hashes de los 82 coinciden. Sin symlinks ni rutas de servidor, API, node_modules, .env, .git o archivos DB/SQL/credenciales/fuente TypeScript.

Los 79 archivos públicos copiados coinciden byte por byte con el `public/` del artefacto de aplicación conservado. Entre ellos, seis JavaScript y dos CSS mantienen sus hashes originales. Los tres HTML se auditan separadamente: recibieron CSP y referrer meta, por lo que no se afirma que su HTML sea idéntico al SSR previo.

`images/store-reference-approved.webp` conserva SHA-256 `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`, coincidente con el manifest y la fuente aprobada local. Esto no acredita identidad de bytes con un JPEG del hilo padre.

## Código dormante y requisitos reales

El JavaScript cliente **sí contiene** los dos URLs de SDK Culqi, las rutas quote/session/payment y un URL de WhatsApp. No se afirma «cero código o strings de pagos». La causa visible en fuente es el import estático de `CulqiBrowserCheckout` desde `GuidedCommerce`; sus funciones permanecen en el bundle.

La ruta activa renderiza `ReferenceStorefront`, que pasa `reviewOnly` y `referenceMode` verdaderos. En `GuidedCommerce`, ese modo retorna antes del fetch de configuración/cotización y de leer/escribir el draft; desactiva `canPayOnline`, omite `CulqiBrowserCheckout`, WhatsApp, recibo/handoff/Wallet y la confirmación de compra. Los SDK externos se cargan dentro de `startCheckout`, no al importar el módulo. En consecuencia, esas referencias dormantes no constituyen por sí mismas una dependencia activa de servidor o proveedor para la preview. No se encontraron nombres de service-role, el factory Supabase admin ni `.rpc(` en los JS del export; esa búsqueda de strings no equivale a una auditoría completa de código.

También se incluyen assets públicos históricos como GLB y otros storyboards porque el export copia todo `public/`. Son archivos estáticos; su presencia no implica que la ruta de imagen monte Canvas ni que necesite un backend 3D.

El alojamiento sí debe servir archivos mediante HTTP/HTTPS desde la raíz del origen, mantener los MIME de módulos/CSS y resolver `index.html` en `/`, `/legal/` y `/playable/`. Abrir con `file://` o montar bajo un subpath no es equivalente. El CSP/hash y las solicitudes HTTP son evaluados por el agente padre; este inventario no ejecutó ni observó la preview en navegador.
