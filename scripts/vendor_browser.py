"""Vendor pinned browser modules and their ESM imports. Rebuilds verify upstream hashes.

Run once with --install to replace CDN references. Commit vendor files and lock.
OCR language/core downloads remain explicit network resources (no document upload).
"""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urljoin, urlparse
import hashlib, json, re, sys

ROOT=Path(__file__).resolve().parents[1]/'pdf-viewer'
DEST=ROOT/'vendor'
LOCK=ROOT/'vendor-lock.json'
IMPORT=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']''')
URL=re.compile(r'''https://(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com)/[^\s'"`]+''')
prior=json.loads(LOCK.read_text()) if LOCK.exists() else {}
entries={}
DEST.mkdir(exist_ok=True)

def get(url):
    with urlopen(Request(url,headers={'User-Agent':'PDF-Viewer-dependency-build'}),timeout=60) as r:
        return r.read()

def vendor(url):
    if url in entries:return entries[url]['file']
    if urlparse(url).hostname not in {'cdn.jsdelivr.net','cdnjs.cloudflare.com','cdn.sheetjs.com'}:
        raise ValueError('Unapproved dependency host: '+url)
    name=hashlib.sha256(url.encode()).hexdigest()[:20]+'.mjs'
    raw=get(url);digest=hashlib.sha256(raw).hexdigest()
    if url in prior and prior[url]['sha256']!=digest:
        raise ValueError('Upstream changed; review before updating lock: '+url)
    entries[url]={'file':name,'sha256':digest}
    text=raw.decode('utf-8')
    replacements={}
    for match in IMPORT.finditer(text):
        ref=match.group(1)
        if ref.startswith(('/','./','../','https://')):
            child=urljoin(url,ref);replacements[ref]='./'+vendor(child)
    for old,new in replacements.items():text=text.replace('"'+old+'"','"'+new+'"').replace("'"+old+"'","'"+new+"'")
    # Source maps refer to upstream build paths and are not shipped.
    text=re.sub(r'//# sourceMappingURL=.*','',text)
    (DEST/name).write_text(text,encoding='utf-8',newline='\n')
    entries[url]['vendoredSha256']=hashlib.sha256((DEST/name).read_bytes()).hexdigest()
    print(name,url,flush=True)
    return name

sources={p:p.read_text(encoding='utf-8') for p in ROOT.glob('*.js')}
seeds=set(prior)
for text in sources.values():
    seeds.update(u for u in URL.findall(text) if u.endswith(('.js','.mjs','/+esm')))
for url in sorted(seeds):vendor(url)
if '--install' in sys.argv:
    for p,text in sources.items():
        for url,entry in entries.items():text=text.replace(url,'./vendor/'+entry['file'])
        p.write_text(text,encoding='utf-8',newline='\n')
LOCK.write_text(json.dumps(entries,indent=2,sort_keys=True)+'\n',encoding='utf-8')
print(f'Vendored {len(entries)} pinned assets. Review THIRD_PARTY.md and license notices before release.')
