#!/usr/bin/env python3
"""Package an already-built reference review; no install, network or deploy."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--build', required=True)
parser.add_argument('--source-sha', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
build = Path(args.build).resolve()
output = Path(args.output).resolve()
if len(args.source_sha) != 40 or any(c not in '0123456789abcdef' for c in args.source_sha):
    raise SystemExit('Expected full application commit SHA')
if not (build / 'server/index.mjs').is_file() or not (build / 'public/images/store-reference-approved.webp').is_file():
    raise SystemExit('Expected complete immutable Nitro build')
files = {}
for path in sorted(build.rglob('*')):
    if path.is_symlink():
        raise SystemExit('Do not package symlinks: ' + str(path))
    if not path.is_file():
        continue
    rel = path.relative_to(build).as_posix()
    if rel.startswith('.') or any(part.startswith('.env') for part in path.parts):
        raise SystemExit('Unexpected hidden/environment file')
    # Both documented and direct Node entrypoints enforce the review boundary.
    if rel == 'server/index.mjs':
        rel = 'server/review-runtime.mjs'
    files[rel] = path.read_bytes()
files['server/index.mjs'] = b'''// Review-only artifact entrypoint. Always bind to loopback and close APIs.
process.env.BAGELITO_REFERENCE_REVIEW_ONLY = 'true'
process.env.BAGELITO_MERCHANT_REVIEW_ONLY = 'true'
process.env.NITRO_HOST = '127.0.0.1'
process.env.HOST = '127.0.0.1'
const port = Number(process.env.PORT || '4173')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024..65535')
process.env.NITRO_PORT = String(port)
process.env.PORT = String(port)
await import('./review-runtime.mjs')
'''
files['start-review.mjs'] = b"await import('./server/index.mjs')\n"
files['README.md'] = ('''# Bagelito: preview local sobre la imagen exacta

Aplicación: `''' + args.source_sha + '''`.

Requiere Node.js24.19 o compatible. No necesita npm install, DB, cuentas ni credenciales.

1. Descomprimir este ZIP en una carpeta nueva.
2. Abrir una terminal en esa carpeta y ejecutar `node start-review.mjs`.
3. Visitar `http://127.0.0.1:4173/` en el mismo equipo. Para otro puerto: `PORT=4174 node start-review.mjs` (Bash).
4. Ctrl+C detiene el servidor. Borrar la carpeta elimina la preview.

Permite recorrer Packs/Combos/Schmears, revisar selección, upsell opcional, entrega y consentimiento. No cobra, reserva ni crea pedidos; el botón de pago está desactivado. El programa de fidelidad10pedidos→2bagels+1schmear está pendiente de seguimiento interno y canje. Sin Wallet ni integración GHL.

Ambos entrypoints Node fuerzan loopback y el flag que bloquea `/api` antes de los handlers de negocio. La UI se compila en modo revisión. No se despliega ningún servicio. No introducir datos personales reales: los campos sólo permiten revisar la interacción local. La selección desaparece al recargar. TanStack puede leer una clave interna de scroll; no se persiste el pedido.

La imagen es el WebP aprobado sin modificar; no se afirma identidad de bytes con el JPEG. Sus precios dibujados son referencia visual. El flujo conserva el catálogo verificado y deja el importe final pendiente de validación.

`manifest.json` identifica cada archivo y SHA256. `server/review-runtime.mjs` conserva el entrypoint Nitro original byte por byte; `server/index.mjs` es el wrapper de seguridad añadido al artefacto. Este paquete no certifica pagos, stock, fidelidad operativa, Safari o disponibilidad comercial.
''').encode()
manifest = {'applicationSHA': args.source_sha, 'sourceImageSHA256': hashlib.sha256(files['public/images/store-reference-approved.webp']).hexdigest(), 'runtime': 'Node.js24.19.0', 'reviewOnly': True, 'host': '127.0.0.1', 'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(files.items())}}
files['manifest.json'] = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo('bagelito-reference-review/' + name, date_time=(2026, 11, 1, 0, 0, 0))
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data, compresslevel=9)
print(json.dumps({'applicationSHA': args.source_sha, 'archive': str(output), 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'files': len(files)}))
