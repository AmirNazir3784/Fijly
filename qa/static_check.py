from pathlib import Path
from urllib.parse import urlsplit, unquote
from bs4 import BeautifulSoup
import html5lib, re, json, hashlib

root=Path('site').resolve()
issues=[]
pages={p:BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser') for p in root.glob('*.html')}
for p,soup in pages.items():
    parser=html5lib.HTMLParser()
    parser.parse(p.read_text(encoding='utf-8'))
    issues.extend([f'{p.name}: HTML parse {e}' for e in parser.errors])
    ids=[e['id'] for e in soup.select('[id]')]
    if len(ids)!=len(set(ids)):issues.append(f'{p.name}: duplicate IDs')
    if soup.select('[style]'):issues.append(f'{p.name}: inline styles')
    for e in soup.select('[href], [src]'):
        value=e.get('href',e.get('src',''))
        url=urlsplit(value)
        if url.scheme or url.netloc or value=='#':continue
        dest=(root/url.path.lstrip('/')) if url.path.startswith('/') else (p.parent/url.path)
        if not url.path:dest=p
        dest=dest.resolve()
        if not dest.is_file():issues.append(f'{p.name}: missing {value}')
        elif url.fragment:
            target=pages.get(dest)
            if target is not None and not target.find(id=unquote(url.fragment)):
                if not (dest.name in ['studio.html','admin.html'] and target.find(attrs={'data-screen':url.fragment})):issues.append(f'{p.name}: broken fragment {value}')
    for e in soup.select('[aria-labelledby], [aria-describedby], [aria-controls], label[for]'):
        for attr in ['aria-labelledby','aria-describedby','aria-controls','for']:
            for key in e.get(attr,'').split():
                if key not in ids:issues.append(f'{p.name}: broken {attr} {key}')
    for e in soup.select('svg'):
        if not e.get('aria-hidden') and not e.get('aria-label') and not e.find('title'):issues.append(f'{p.name}: unnamed SVG')
for p in root.rglob('*'):
    if p.suffix not in ['.html','.css','.js','.xml','.txt']:continue
    text=p.read_text(encoding='utf-8')
    for token in [r'<x-dc',r'<sc-if',r'<sc-for',r'\{\{',r'support\.js',r'\bReact\b',r'\bBabel\b',r'localhost',r'127\.0\.0\.1',r'[A-Z]:\\',r'\.dc\.html',r'console\.log',r'\bTODO\b',r'\bFIXME\b']:
        if re.search(token,text,re.I):issues.append(f'{p.relative_to(root)}: {token}')
    if p.suffix=='.css':
        for url in re.findall(r'url\([\'"]?([^\)\'\"]+)',text):
            if not urlsplit(url).scheme and not (p.parent/url).is_file():issues.append(f'{p.name}: missing CSS asset {url}')
hashes=json.loads(Path('qa/reference-hashes.json').read_text(encoding='utf-8-sig'))
for item in hashes:
    if hashlib.sha256(Path(item['Path'].replace('\\','/').split('/')[-1]).read_bytes()).hexdigest().upper()!=item['Hash']:issues.append('Reference modified: '+item['Path'])
out={'html_pages':len(pages),'issues':issues,'reference_files_unchanged':not any('Reference modified' in i for i in issues)}
Path('qa/static-results.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(out,indent=2))
raise SystemExit(bool(issues))
