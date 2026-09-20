from pathlib import Path
import re
p=Path('site/studio.html');s=p.read_text(encoding='utf-8')
for color,key,name in [('violet','aiflow','AIFlow'),('blue','clouddesk','CloudDesk'),('green','taskpilot','TaskPilot'),('amber','finly','Finly')]:
 s=s.replace(f'<div class="shot bg-grad-{color}"></div>',f'<figure class="shot"><img src="assets/concept-{key}.svg" alt="{name} sample product interface" width="800" height="500" loading="lazy"><figcaption>{name} · UI concept</figcaption></figure>')
s=s.replace('aria-label="Rewind" aria-disabled="true" aria-describedby="studio-demo-note" title="Unavailable in this static demo"','aria-label="Restart motion preview" data-preview-restart')
p.write_text(s,encoding='utf-8')
p=Path('site/index.html');s=p.read_text(encoding='utf-8')
for klass,text in [('mock-launch__title','Meet your next launch.'),('mock-launch__button','Explore the product'),('mock-homepage__title','Software, made clear.'),('mock-homepage__line','See the product in action')]:
 s=re.sub(r'(<div class="[^"]*'+klass+r'">)</div>',lambda m:m[1]+text+'</div>',s)
s=s.replace('<div class="mock-promo__play">','<div class="mock-promo__caption">One product.<br>One powerful story.</div><div class="mock-promo__play">')
s=s.replace('<div class="mock-bar mock-demo__title"></div>','<div class="mock-bar mock-demo__title">Your workflow, simplified.</div>')
s=s.replace('<div class="mock-tutorial__screen"><span></span></div>','<div class="mock-tutorial__screen"><span></span><strong>Your first steps, explained.</strong></div>')
texts=iter(['Start with the problem','Show the solution','Make the next step clear'])
s=re.sub(r'<div class="mock-bar mock-explainer__line"></div>',lambda m:'<div class="mock-bar mock-explainer__line">'+next(texts)+'</div>',s)
# Guard native submission when scripts are disabled. JS enables the working brief builder.
s=s.replace('<button class="btn btn-primary btn--block" type="submit">Prepare','<button class="btn btn-primary btn--block" type="submit" disabled>Prepare')
p.write_text(s,encoding='utf-8')
