from pathlib import Path
import re
for p in Path('site/css').glob('*.css'):
    s=p.read_text(encoding='utf-8')
    s=s.replace('"Fijly Website.dc.html" / "Fijly Studio.dc.html"','the original FIJLY design references')
    s=s.replace('"Fijly Studio.dc.html"','the Studio design reference').replace('"Fijly Website.dc.html"','the marketing design reference')
    p.write_text(s,encoding='utf-8')
for p in [Path('site/index.html'),Path('site/studio.html')]:
    s=p.read_text(encoding='utf-8')
    s=re.sub(r'<svg\b[^>]*>',lambda m:m[0] if 'aria-' in m[0] else m[0][:-1]+' aria-hidden="true">',s)
    p.write_text(s,encoding='utf-8')
