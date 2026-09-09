"""Verify every archived recovery file. Python 3.9+; no third-party packages."""
from pathlib import Path
import argparse, hashlib, json, sys

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--restore-empty-directories',action='store_true')
args=parser.parse_args()
manifest=json.loads((root/'RECOVERY-MANIFEST.json').read_text(encoding='utf-8'))
failures=[]
for item in manifest['files']:
    path=(root/item['path']).resolve()
    if not path.is_relative_to(root):
        failures.append('Unsafe path: '+item['path']);continue
    if not path.is_file():
        failures.append('Missing: '+item['path']);continue
    if path.stat().st_size!=item['bytes']:
        failures.append('Size mismatch: '+item['path']);continue
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    if h.hexdigest()!=item['sha256']:failures.append('SHA-256 mismatch: '+item['path'])
if failures:
    print('\n'.join(failures));sys.exit(1)
if args.restore_empty_directories:
    specs=[(root/'docs/vercel-source-manifest.json',root/'source')]
    specs.extend((m,m.parent/'source') for m in (root/'history/vercel').glob('*/*/manifest.json'))
    for m,base in specs:
        data=json.loads(m.read_text(encoding='utf-8'))
        for relative in data.get('empty_directories',[]):
            destination=(base/relative).resolve()
            if not destination.is_relative_to(base.resolve()):raise ValueError('Unsafe empty directory path')
            destination.mkdir(parents=True,exist_ok=True)
print('Verified '+str(len(manifest['files']))+' files ('+str(sum(f['bytes'] for f in manifest['files']))+' bytes).')
