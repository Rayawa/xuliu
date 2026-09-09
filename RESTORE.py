"""Verify this recovery package and unpack it into a new restored/ directory."""
from pathlib import Path
import hashlib, json, tarfile, tempfile, zipfile, shutil

root=Path(__file__).resolve().parent
destination=root/'restored'
if destination.exists() and any(destination.iterdir()):
    raise SystemExit('restored/ is not empty; choose a new directory before unpacking.')
for line in (root/'SHA256SUMS.txt').read_text().splitlines():
    digest,name=line.split('  ',1)
    file=root/name
    if hashlib.sha256(file.read_bytes()).hexdigest()!=digest:
        raise SystemExit('Checksum mismatch: '+name)
destination.mkdir(exist_ok=True)
for file in sorted(root.glob('*-2026-09-09.zip')):
    with zipfile.ZipFile(file) as archive:
        for member in archive.infolist():
            path=Path(member.filename)
            if path.is_absolute() or '..' in path.parts:
                raise SystemExit('Invalid archive path')
        archive.extractall(destination)
parts=sorted(root.glob('attachments-2026-09-09.tar.gz.part*'))
if parts:
    with tempfile.TemporaryFile() as combined:
        for file in parts:
            with file.open('rb') as source:shutil.copyfileobj(source,combined)
        combined.seek(0)
        with tarfile.open(fileobj=combined,mode='r:gz') as archive:
            archive.extractall(destination,filter='data')
    for item in json.loads((destination/'attachments'/'manifest.json').read_text()):
        file=destination/'attachments'/item['pathname']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=item['sha256']:
            raise SystemExit('Attachment checksum mismatch: '+item['pathname'])
print('Verified and restored to '+str(destination))
