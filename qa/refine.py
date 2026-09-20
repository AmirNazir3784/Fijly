from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
site=root/'site'

def poster(name, color, bg, title, subtitle, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" fill="none">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="{color}"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dy="12" stdDeviation="14" flood-opacity=".18"/></filter></defs>
<rect width="800" height="500" fill="url(#bg)"/><circle cx="720" cy="30" r="210" stroke="white" stroke-opacity=".12" stroke-width="60"/>
<g font-family="Arial,sans-serif"><text x="42" y="58" fill="white" font-size="23" font-weight="700">{name}</text><text x="758" y="56" text-anchor="end" fill="white" font-size="13" letter-spacing="2">FIJLY / CONCEPT</text>
<text x="42" y="122" fill="white" font-size="36" font-weight="700">{title}</text><text x="42" y="154" fill="white" font-size="17">{subtitle}</text>
<g filter="url(#shadow)"><rect x="42" y="188" width="716" height="278" rx="14" fill="#F4F5F7"/><path d="M56 188h688a14 14 0 0 1 14 14v22H42v-22a14 14 0 0 1 14-14" fill="white"/><circle cx="61" cy="207" r="4" fill="#D1D5DE"/><circle cx="76" cy="207" r="4" fill="#D1D5DE"/><circle cx="91" cy="207" r="4" fill="#D1D5DE"/><text x="400" y="212" text-anchor="middle" fill="#576173" font-size="12">{name} · Product UI study</text>{body}</g></g></svg>'''

ai='''<rect x="60" y="242" width="175" height="206" rx="8" fill="#0C0E13"/><text x="78" y="273" fill="white" font-size="17" font-weight="700">AI Assistant</text><rect x="73" y="294" width="149" height="32" rx="6" fill="#5B4BF5"/><text x="86" y="315" fill="white" font-size="13">✦ Conversations</text><text x="86" y="352" fill="#CDD0DB" font-size="13">Knowledge base</text><text x="86" y="389" fill="#CDD0DB" font-size="13">Insights</text><rect x="251" y="242" width="486" height="76" rx="8" fill="white"/><text x="270" y="267" fill="#576173" font-size="12">RESOLVED</text><text x="270" y="300" fill="#0C0E13" font-size="27" font-weight="700">92%</text><text x="440" y="267" fill="#576173" font-size="12">AVG REPLY</text><text x="440" y="300" fill="#0C0E13" font-size="27" font-weight="700">1.4s</text><text x="610" y="267" fill="#576173" font-size="12">CSAT</text><text x="610" y="300" fill="#0C0E13" font-size="27" font-weight="700">4.9</text><rect x="251" y="332" width="486" height="116" rx="8" fill="white"/><text x="270" y="360" fill="#0C0E13" font-size="13">How many refunds this week?</text><rect x="291" y="375" width="428" height="53" rx="9" fill="#EDEAFF"/><text x="306" y="398" fill="#4433CD" font-size="13">142 refunds — down 12% WoW.</text><text x="306" y="416" fill="#4433CD" font-size="13">Top reason: shipping delay.</text>'''
cloud='''<text x="64" y="255" fill="#0C0E13" font-size="17" font-weight="700">Your workspace, in sync.</text><text x="64" y="284" fill="#576173" font-size="12">PLAN</text><text x="296" y="284" fill="#576173" font-size="12">IN PROGRESS</text><text x="528" y="284" fill="#576173" font-size="12">READY TO LAUNCH</text>'''
for x,y,t,c in [(64,300,'Product brief','#DBEAFE'),(64,371,'Launch checklist','#EDEAFF'),(296,300,'Homepage video','#DBEAFE'),(296,371,'Team feedback','#D1FAE5'),(528,300,'Brand assets','#D1FAE5'),(528,371,'Final review','#DBEAFE')]:
    cloud+=f'<rect x="{x}" y="{y}" width="208" height="60" rx="8" fill="white"/><rect x="{x+12}" y="{y+12}" width="4" height="36" rx="2" fill="#2563EB"/><text x="{x+28}" y="{y+28}" fill="#0C0E13" font-size="13" font-weight="700">{t}</text><circle cx="{x+34}" cy="{y+45}" r="7" fill="{c}"/><path d="M{x+50} {y+45}h90" stroke="#E5E7EB" stroke-width="5" stroke-linecap="round"/>'
finly='''<rect x="62" y="242" width="290" height="204" rx="9" fill="white"/><text x="83" y="275" fill="#0C0E13" font-size="20" font-weight="700">Getting started</text><text x="83" y="310" fill="#576173" font-size="14">01   Set up your workspace</text><rect x="74" y="329" width="265" height="39" rx="6" fill="#FEF3C7"/><text x="83" y="354" fill="#854D0E" font-size="14" font-weight="700">02   Connect your accounts</text><text x="83" y="400" fill="#576173" font-size="14">03   Explore your dashboard</text><rect x="369" y="242" width="368" height="204" rx="9" fill="#0C0E13"/><circle cx="553" cy="304" r="28" fill="#F59E0B"/><path d="m540 304 9 9 17-19" stroke="#0C0E13" stroke-width="4"/><text x="553" y="362" text-anchor="middle" fill="white" font-size="20" font-weight="700">Accounts connected</text><text x="553" y="392" text-anchor="middle" fill="#D1D5DE" font-size="14">A clear next step. Every time.</text><rect x="451" y="412" width="204" height="5" rx="2" fill="#343744"/><rect x="451" y="412" width="95" height="5" rx="2" fill="#F59E0B"/>'''
assets={
'aiflow':poster('AIFlow','#8B5CF6','#4939DD','Support, without the wait.','Product launch · Interface animation study',ai),
'clouddesk':poster('CloudDesk','#2FB4F3','#1D4ED8','One place. Every moving part.','Homepage explainer · Workspace UI study',cloud),
'finly':poster('Finly','#F59E0B','#945300','From first click to confident.','Tutorial series · Guided onboarding study',finly),
'taskpilot':poster('TaskPilot','#10B981','#047857','Turn plans into progress.','Product demo · Workflow UI study',cloud.replace('Your workspace, in sync.','Your next step, made clear.'))}
for key,svg in assets.items(): (site/'assets'/f'concept-{key}.svg').write_text(svg,encoding='utf-8')

p=site/'index.html'; s=p.read_text(encoding='utf-8')
# Hero: retain the original UI and all its metrics; give it a purpose and compact composition.
s=s.replace('<div class="container">\n        <span class="pill">','<div class="container hero__grid">\n        <div class="hero__copy">\n        <span class="pill">',1)
s=s.replace('        <!-- hero product frame -->','        </div>\n        <!-- hero product frame -->',1)
s=s.replace('<div class="hero-frame" role="img" aria-label="Preview of a SaaS analytics dashboard video">','<div class="hero-frame">\n          <div class="hero-frame__caption"><span>FIJLY / PRODUCT IN MOTION</span><span>UI CONCEPT</span></div>')
s=s.replace('<div class="hero-frame__overlay">\n              <div class="hero-frame__play"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></div>\n            </div>','')
s=s.replace('        <!-- trust marquee -->','        <!-- trust marquee -->',1)
s=s.replace('TRUSTED BY PRODUCT TEAMS AT','PRODUCT WORLDS IN OUR SAMPLE SHOWCASE')
s=s.replace('Trusted product teams; focus to pause animation','Sample product brands; focus to pause animation')
s=s.replace('<a class="btn btn-outline btn--md" href="#work">View all work</a>','<a class="btn btn-outline btn--md" href="#contact">Discuss your video</a>')
s=s.replace('        <div class="work__grid">','        <p class="work__note">Concept showcase: illustrative projects and sample outcomes, not published client films. Open a preview to explore the visual direction.</p>\n        <div class="work__grid">')
for key in ['aiflow','clouddesk','finly']:
    name={'aiflow':'AIFlow','clouddesk':'CloudDesk','finly':'Finly'}[key]
    pattern=r'<div class="work-card__media work-card__media--'+key+r'">.*?<span class="work-card__type">(.*?)</span>\s*</div>'
    s=re.sub(pattern,lambda m:f'<button class="work-card__media work-card__media--{key}" type="button" data-concept="{key}" aria-label="View {name} concept preview"><img src="assets/concept-{key}.svg" alt="" width="800" height="500" loading="lazy"><span class="work-card__view">View concept <span aria-hidden="true">↗</span></span></button>',s,flags=re.S)
# Honest context around existing unverified sample proof, without altering the metrics.
s=s.replace('<section class="results" aria-label="Results">','<section class="results" aria-label="Sample results"><p class="sample-label">ILLUSTRATIVE RESULTS · SAMPLE DATA</p>')
s=s.replace('<figure>\n        <svg class="testimonial__mark"','<figure>\n        <p class="sample-label">SAMPLE CLIENT STORY</p>\n        <svg class="testimonial__mark"')
# Wire conversions, retain pricing navigation.
s=re.sub(r'href="#pricing">Start Your Video', 'href="#contact">Start Your Video',s)
for label,plan in [('Get started','Single'),('Start with Studio','Studio'),('Talk to us','Scale')]:
    s=s.replace(f'href="mailto:hello@fijly.studio">{label}',f'href="#contact" data-plan="{plan}">{label}')
# Services now carry their context into the form rather than generic learn-more links.
for title in ['SaaS Launch Videos','Product Promo Videos','Product Demo Videos','Explainer Videos','Tutorial Videos','Homepage Videos']:
    # Match the card individually to preserve the existing SVG and copy.
    pat=r'(<h3 class="service-card__title">'+re.escape(title)+r'</h3>.*?)(<a class="service-card__link" href=")#pricing(">)Learn more'
    s=re.sub(pat,lambda m:m[1]+m[2]+'#contact" data-service="'+title+'">Discuss this format',s,flags=re.S)
contact='''    <!-- CONTACT / FINAL CTA -->
    <section class="contact" id="contact" aria-labelledby="contact-title">
      <div class="container contact__grid">
        <div class="contact__intro">
          <span class="eyebrow">LET'S MAKE IT CLEAR</span>
          <h2 id="contact-title">Your product deserves a video people actually watch.</h2>
          <p>Launch, demo, explainer, tutorial, homepage video, or a recurring production partner. Tell us what you're building and what your video needs to do.</p>
          <div class="contact__next"><span class="contact__step">01</span><div><h3>Start with your product and goal</h3><p>We'll use your brief to discuss the right format, scope, and timeline.</p></div></div>
          <a class="contact__email" href="mailto:hello@fijly.studio">hello@fijly.studio <span aria-hidden="true">↗</span></a>
        </div>
        <form class="contact-form" id="contact-form" aria-labelledby="form-title">
          <h3 id="form-title">Tell us about your project</h3>
          <p class="contact-form__help" id="contact-help">Complete your brief below, then send it using your email app. Direct form delivery is not connected yet.</p>
          <div class="contact-form__row">
            <div class="form-field"><label for="contact-name">Name <span>(required)</span></label><input id="contact-name" name="name" autocomplete="name" required maxlength="100"></div>
            <div class="form-field"><label for="contact-email">Work email <span>(required)</span></label><input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254"></div>
          </div>
          <div class="contact-form__row">
            <div class="form-field"><label for="contact-company">Company <span>(optional)</span></label><input id="contact-company" name="company" autocomplete="organization" maxlength="150"></div>
            <div class="form-field"><label for="contact-type">What do you need?</label><select id="contact-type" name="project_type" required><option value="">Choose a video type</option><option>SaaS Launch Videos</option><option>Product Promo Videos</option><option>Product Demo Videos</option><option>Explainer Videos</option><option>Tutorial Videos</option><option>Homepage Videos</option><option>Recurring video production</option><option>Help choosing a format</option></select></div>
          </div>
          <div class="form-field"><label for="contact-message">Project details <span>(required)</span></label><textarea id="contact-message" name="message" rows="4" required minlength="20" maxlength="4000" placeholder="What does your product do, who is it for, and what is your goal or timeline?"></textarea></div>
          <input type="hidden" name="plan" id="contact-plan" value="">
          <p class="contact-form__plan" id="contact-plan-note" hidden></p>
          <button class="btn btn-primary btn--block" type="submit">Prepare Project Email <span aria-hidden="true">↗</span></button>
          <p class="contact-form__privacy">Your brief stays in this browser until you send it. <a href="privacy.html">Privacy notice</a></p>
          <div class="contact-form__status" id="contact-status" role="status" tabindex="-1" hidden></div>
          <noscript><p>Email your project details to <a href="mailto:hello@fijly.studio">hello@fijly.studio</a>. The brief builder requires JavaScript.</p></noscript>
        </form>
      </div>
    </section>

'''
s=re.sub(r'    <!-- FINAL CTA -->.*?  </main>',contact+'  </main>',s,flags=re.S)
s=s.replace('<li><a href="#">About</a></li>','<li><a href="#process">Process</a></li>').replace('<li><a href="#">Careers</a></li>','<li><a href="#contact">Contact</a></li>')
s=s.replace('<li><a href="#services">Launch Videos</a></li>','<li><a href="#services">Launch Videos</a></li>\n          <li><a href="#services">Product Promos</a></li>')
s=s.replace('<li><a href="#services">Tutorials</a></li>','<li><a href="#services">Tutorials</a></li>\n          <li><a href="#services">Homepage Videos</a></li>')
s=re.sub(r'      <nav aria-labelledby="footer-connect">.*?</nav>','',s,flags=re.S)
s=s.replace('Video production for SaaS. We make software easier to understand, trust, and buy.</p>','Video production for SaaS. We make software easier to understand, trust, and buy.</p>\n        <a class="footer__email" href="mailto:hello@fijly.studio">hello@fijly.studio ↗</a>')
dialog='''<dialog class="concept-dialog" id="concept-dialog" aria-labelledby="concept-title">
  <div class="concept-dialog__head"><h2 id="concept-title">Concept preview</h2><button class="concept-dialog__close" type="button" aria-label="Close concept preview" autofocus>×</button></div>
  <img id="concept-image" src="assets/concept-aiflow.svg" alt="AIFlow product interface concept" width="800" height="500">
  <div class="concept-dialog__body"><p id="concept-description"></p><p class="concept-dialog__note">A designed concept still, not a playable client film. Real portfolio videos will be added when available.</p><a class="btn btn-primary btn--md" href="#contact" data-close-concept>Discuss a video like this</a></div>
</dialog>
'''
s=s.replace('<script src="js/main.js"></script>',dialog+'\n<script src="js/config.js"></script>\n<script src="js/main.js"></script>\n<script src="js/contact.js"></script>')
p.write_text(s,encoding='utf-8')

# Studio: meaningful, distinct thumbnails, using the same local visual language.
p=site/'studio.html';s=p.read_text(encoding='utf-8')
keys=iter(['aiflow','clouddesk','taskpilot','finly'])
s=re.sub(r'<div class="mini-window" aria-hidden="true">.*?<div class="mini-window__chart">.*?</div>\s*</div>',lambda m:'<img class="project-concept" src="assets/concept-'+next(keys)+'.svg" alt="" width="800" height="500" loading="lazy">',s,flags=re.S)
s=s.replace('PREVIEW · v4 · 1920×1080','UI MOTION DEMO · v4 · 1920×1080').replace('● REC 00:24','UI MOTION DEMO')
s=s.replace('<main ', '<main ',1)
s=s.replace('<p class="visually-hidden" id="studio-demo-note">','<p class="studio-demo-note" id="studio-demo-note">')
s=s.replace('Sample workspace. Search, notifications, date selection, storyboard editing, rewind, and logo changes are unavailable in this static demo.','Sample workspace · Explore the production workflow. Changes are temporary; no client data or requests are sent. <a href="index.html#contact">Start a real project ↗</a>')
p.write_text(s,encoding='utf-8')
