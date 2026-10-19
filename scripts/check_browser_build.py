"""Offline release checks for the static browser distribution."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1]
site=root/'pdf-viewer'
entries=json.loads((site/'vendor-lock.json').read_text())
for url,item in entries.items():
    file=site/'vendor'/item['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest()==item['vendoredSha256'],str(file)+' checksum mismatch'
    text=file.read_text(encoding='utf-8')
    for ref in re.findall(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\./[^"']+)["']''',text):
        assert (file.parent/ref).is_file(),str(file)+' missing '+ref
for file in site.glob('*.js'):
    for ref in re.findall(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\./[^"']+)["']''',file.read_text(encoding='utf-8')):
        assert (file.parent/ref).is_file(),str(file)+' missing '+ref
licenses=json.loads((site/'vendor/licenses/manifest.json').read_text())
assert len(licenses)>=25,'Missing transitive license manifest'
for item in licenses:assert (site/'vendor/licenses'/item['notice']).is_file(),item['package']
for name in ['workspace.html','editor.html','excel-merge.html','index.html']:
    text=(site/name).read_text(encoding='utf-8')
    assert 'Content-Security-Policy' in text,name+' missing CSP'
    ids=re.findall(r'\bid="([^"]+)"',text)
    assert len(ids)==len(set(ids)),name+' duplicate IDs'
print(f'Verified {len(entries)} bundled assets, {len(licenses)} license notices and application entry points.')
