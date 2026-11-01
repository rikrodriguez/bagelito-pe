# Evidencia del guard API de preview

Fuente de aplicación registrada: `fe4c3ec460a9fb7bdd33cd2e6ebaec8156db9ecc`. El HEAD del archivo de evidencias puede ser posterior; [provenance.json](provenance.json) registra esa distinción y los hashes de fuente y outputs.

El guard de este commit tiene SHA-256 `1016d6e467145286c73de2c8a69cda129298a1d5fd9b72b90f4eba7388d8a3e9`. Lee `BAGELITO_REFERENCE_REVIEW_ONLY` en cada request. Con valor `true` devuelve 503 para API antes de los handlers; con flag falso o ausente deja continuar. Los handlers financieros no se modificaron.

## Dos comprobaciones distintas

- **Fixture Nitro 3 construido, no aplicación real:** [resultado original](original/results.json), [build](original/build.log), [stdout](original/probe.stdout.log) y [driver histórico](original/probe.cjs). El mismo bundle probado con flag `true` bloqueó seis solicitudes API y produjo cero llamadas al contador downstream. Con flag `false`, GET y POST llegaron a un stub en memoria. El fixture no importó código financiero, clientes de DB ni proveedores. **El resultado con flag falso no acredita una ejecución financiera de la aplicación.** Se ejecutó antes de crearse el commit registrado; los bytes del guard coinciden con la fuente guardada de ese commit.
- **Aplicación real en loopback 3208:** sólo se verificó `GET http://127.0.0.1:3208/api/batch` el 1 de noviembre a las 00:30:42 UTC. Devolvió **503**, `reviewOnly: true` y `Cache-Control: private, no-store, max-age=0`. [Body](app-3208-api-batch.body) y [headers](app-3208-api-batch.headers) son copias originales sin modificar. El build `fe4c3ec` fue identificado por el hilo padre; el guard y la fuente de aplicación del checkout coinciden con ese commit. No se ejecutó flag falso ni otro endpoint en la aplicación para esta evidencia.

[Node completo](node58.log): **58/58 PASS, cero fallos, cero skipped**, sin browser ni sockets reales. [Guard unitario](original/guard-unit6.log): seis pruebas específicas PASS.

## Reproducir el fixture incluido

```bash
node docs/qa/reference-image-storefront-20261101/api-guard-fe4c3ec/reproduce.cjs
```

El driver usa únicamente el bundle incluido en `fixture-build/`, Node y loopback; no necesita reconstruir la app ni instalar módulos. Es un fixture con handler contador, también en las URLs que parecen assets. El puerto predeterminado es 3295; se puede seleccionar otro con `QA_GUARD_FIXTURE_PORT`. Comprueba que su proceso inició antes de enviar solicitudes, para evitar usar una aplicación ajena en un puerto ocupado.

Los nuevos outputs se escriben en un directorio temporal separado, o en `QA_GUARD_FIXTURE_OUTPUT` fuera de este archivo histórico. El driver de reproducción se comprobó sólo por sintaxis durante el archivado; no se volvió a ejecutar ni se realizó un nuevo build.

`original/` conserva los archivos históricos byte por byte, incluidas sus rutas temporales. `source/` contiene el guard, registro Vite y pruebas del commit registrado. No se copiaron credenciales, variables de entorno ni `node_modules`.
