#!/usr/bin/env python3
"""Verify and zip only the already-exported static site, at ZIP root."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--directory',required=True)
p.add_argument('--output',required=True)
a=p.parse_args()
root=Path(a.directory).resolve();out=Path(a.output).resolve()
m=json.loads((root/'static-export-manifest.json').read_text())
assert m['format']=='static-html-assets' and m['reviewOnly'] is True and m['backend'] is False and m['serverFilesIncluded'] is False
expected={e['path']:e for e in m['files']}
files={}
for f in sorted(root.rglob('*')):
 assert not f.is_symlink(),f
 if not f.is_file():continue
 rel=f.relative_to(root).as_posix()
 assert not rel.startswith('server/') and 'node_modules/' not in rel and not any(x.startswith('.env') for x in f.parts),rel
 b=f.read_bytes()
 if rel!='static-export-manifest.json':
  assert rel in expected,rel
  assert len(b)==expected[rel]['bytes'] and hashlib.sha256(b).hexdigest()==expected[rel]['sha256'],rel
 files[rel]=b
assert set(files)==set(expected)|{'static-export-manifest.json'}
for page in ('index.html','legal/index.html','playable/index.html'):
 assert b'connect-src \'none\'' in files[page] and b'Content-Security-Policy' in files[page]
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name,data in sorted(files.items()):
  i=zipfile.ZipInfo(name,(2026,11,1,0,0,0));i.external_attr=0o100644<<16;i.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(i,data,compresslevel=9)
print(json.dumps({'applicationSHA':m['applicationSHA'],'exporterSHA':m['exporterSHA'],'files':len(files),'verifiedHashes':len(expected),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
