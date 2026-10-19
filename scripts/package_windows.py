"""Rebuild the downloadable Windows package from reviewed source (no private samples)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]/'pdf-viewer'
target=root/'PDF-Viewer-0.4-Beta-Windows.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for source in sorted((root/'windows').iterdir()):
        if source.is_file() and source.suffix in ('.py','.js','.html','.md','.txt','.bat'):
            archive.write(source,source.name)
    for source in sorted(root.iterdir()):
        if source.is_file() and source.suffix in ('.js','.css','.html'):
            content=source.read_bytes()
            if source.name=='index.html':
                content=content.replace(b'href="PDF-Viewer-0.4-Beta-Windows.zip"',b'href="https://bhavyam.shop/pdf-viewer/PDF-Viewer-0.4-Beta-Windows.zip"')
            archive.writestr('browser/'+source.name,content)
    for name in ('FEATURES.md','THIRD_PARTY.md'):
        archive.write(root/name,name)
print(target)
