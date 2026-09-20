from pathlib import Path
import re
p=Path('site/studio.html');s=p.read_text(encoding='utf-8')
s=s.replace('<div class="table-scroll" tabindex="0"','<p class="table-hint">Swipe horizontally, or focus the table and use the arrow keys, to see every column.</p>\n          <div class="table-scroll" tabindex="0"')
for color,key in [('violet','aiflow'),('blue','clouddesk'),('green','taskpilot'),('amber','finly')]:
 s=s.replace(f'<span class="thumb bg-grad-{color}"></span>',f'<span class="thumb bg-grad-{color}"><img src="assets/concept-{key}.svg" alt="" width="800" height="500" loading="lazy"></span>')
p.write_text(s,encoding='utf-8')
# Remove CSS that only served the deleted fake play overlays and CTA box.
p=Path('site/css/marketing.css');s=p.read_text(encoding='utf-8')
s=re.sub(r'/\* 11\. Final CTA.*?/\* 12\. Footer', '/* 12. Footer',s,flags=re.S)
for prefix in ['hero-frame__overlay','hero-frame__play','work-card__play','work-card__type']:
 s=re.sub(r'\.'+prefix+r'[^{}]*\{[^{}]*\}\s*','',s)
s=re.sub(r'^  \.cta[^\n]*\n','',s,flags=re.M)
p.write_text(s,encoding='utf-8')
