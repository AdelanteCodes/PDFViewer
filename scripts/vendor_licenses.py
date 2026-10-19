"""Collect package metadata and upstream license texts for the vendored modules."""
from pathlib import Path
from urllib.request import urlopen
import json,re
root=Path(__file__).resolve().parents[1]/'pdf-viewer'
lock=json.loads((root/'vendor-lock.json').read_text())
out=root/'vendor'/'licenses';out.mkdir(exist_ok=True)
packages={}
for url,entry in lock.items():
    text=(root/'vendor'/entry['file']).read_text(encoding='utf-8')
    match=re.search(r'Original file: /npm/((?:@[^/]+/)?[^/@]+)@([^/]+)',text)
    if not match:match=re.search(r'/npm/((?:@[^/]+/)?[^/@]+)@([^/]+)',url)
    if match:packages[match[1]+'@'+match[2]]=(match[1],match[2])
packages['pdfjs-dist@4.10.38']=('pdfjs-dist','4.10.38')
packages['xlsx@0.20.3']=('xlsx','0.20.3')
notices=[]
for key,(name,version) in sorted(packages.items()):
    base='https://cdn.jsdelivr.net/npm/'+key+'/' if name!='xlsx' else 'https://cdn.sheetjs.com/xlsx-0.20.3/package/'
    def fetch(file):
        with urlopen(base+file,timeout=30) as r:return r.read()
    meta={'license':'Apache-2.0'} if name=='xlsx' else json.loads(fetch('package.json'))
    license_text=None
    for candidate in ['LICENSE','LICENSE.markdown','LICENSE.md','LICENSE.txt','LICENSE-MIT.txt','LICENSE-MIT','license','license.txt']:
        try:license_text=fetch(candidate);break
        except Exception:pass
    if not license_text and name=='xlsx':
        with urlopen('https://raw.githubusercontent.com/SheetJS/sheetjs/master/LICENSE',timeout=30) as r:license_text=r.read()
    if not license_text:raise RuntimeError('No license text found: '+key)
    filename=re.sub(r'[^a-zA-Z0-9._-]','_',key)+'.txt'
    (out/filename).write_bytes(license_text)
    notices.append({'package':key,'license':meta.get('license',meta.get('licenses')),'source':base,'notice':filename})
    print(key,notices[-1]['license'],flush=True)
(out/'manifest.json').write_text(json.dumps(notices,indent=2)+'\n',encoding='utf-8')
