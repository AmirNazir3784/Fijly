from pathlib import Path
import re

root = Path('site')
for filename in ['index.html', 'studio.html']:
    p = root / filename
    s = p.read_text(encoding='utf-8')
    s = s.replace('  <meta name="viewport"', '  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">\n  <meta name="theme-color" content="#5B4BF5">\n  <meta name="viewport"', 1)
    if filename == 'index.html':
        s = s.replace('<body>', '<body>\n<a class="skip-link" href="#top">Skip to content</a>', 1)
        s = s.replace('<meta property="og:type"', '<link rel="canonical" href="https://fijly.studio/">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta property="og:image:alt" content="FIJLY — Video production for SaaS, done right">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">\n  <meta property="og:type"', 1)
        s = s.replace('href="#">Privacy', 'href="privacy.html">Privacy').replace('href="#">Terms', 'href="terms.html">Terms')
        s = s.replace('<div class="marquee">', '<div class="marquee" tabindex="0" aria-label="Trusted product teams; focus to pause animation">')
    else:
        s = s.replace('<body class="studio-body">', '<body class="studio-body">\n<a class="skip-link" href="#studio-content">Skip to content</a>')
        s = s.replace('<div class="studio-content">', '<div class="studio-content" id="studio-content" tabindex="-1">')
        s = s.replace('<time class="comment__time">2h</time>', '<span class="comment__time">2h</span>').replace('<time class="comment__time">1h</time>', '<span class="comment__time">1h</span>')
        s = s.replace('<div class="table-scroll">', '<div class="table-scroll" tabindex="0" role="region" aria-label="Projects table, scroll horizontally">', 1)
        s = s.replace('<div class="table-scroll">', '<div class="table-scroll" tabindex="0" role="region" aria-label="Video performance table, scroll horizontally">', 1)
        s = s.replace('Request received — we\'ll scope it within one business day.', 'This demo has not sent a request. Please contact FIJLY to arrange your video.')
        s = s.replace('data-request-form aria-labelledby="h-new-request"', 'data-request-form aria-labelledby="h-new-request" aria-describedby="request-demo"')
        s = s.replace('<button class="btn btn-primary btn--md btn--block" type="submit">', '<p class="request-form__note" id="request-demo">Studio demo: requests are not sent and settings apply only to this visit.</p>\n            <button class="btn btn-primary btn--md btn--block" type="submit">')
        s = s.replace('type="search" placeholder=', 'type="search" readonly aria-disabled="true" aria-describedby="studio-demo-note" placeholder=')
        s = s.replace('<kbd>⌘K</kbd>', '<span class="search__shortcut" aria-hidden="true">⌘K</span>')
        s = s.replace('<main class="studio-main">', '<main class="studio-main">\n    <p class="visually-hidden" id="studio-demo-note">Sample workspace. Search, notifications, date selection, storyboard editing, rewind, and logo changes are unavailable in this static demo.</p>')
        for label in ['Notifications', 'Rewind']:
            s = s.replace('aria-label="'+label+'"', 'aria-label="'+label+'" aria-disabled="true" aria-describedby="studio-demo-note" title="Unavailable in this static demo"')
        for label in ['This month', 'Open full storyboard editor', 'Change logo']:
            s = re.sub(r'<button\b[^>]*>(?:(?!</button>)[\s\S])*?'+re.escape(label)+r'</button>', lambda m: m[0].replace('type="button"', 'type="button" aria-disabled="true" aria-describedby="studio-demo-note" title="Unavailable in this static demo"'), s)
        s = s.replace('aria-label="Fullscreen"', 'aria-label="Fullscreen" data-fullscreen')
    p.write_text(s, encoding='utf-8')

(root/'assets/favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#5B4BF5"/><path d="M15 10v20l16-10z" fill="#fff"/></svg>\n', encoding='utf-8')

pages = {
 'privacy': ('Privacy', 'Privacy information is being prepared.', '''<p>This page is a temporary notice, not a completed privacy policy. The site owner must review and publish the policy before collecting information through this website.</p>
 <h2>Using this website</h2><p>The current website is a static presentation. The Studio contains sample project data; its request form does not send submissions. Google Fonts is loaded from Google servers, and your browser may contact those servers when displaying the site.</p>
 <h2>Before sharing information</h2><p>Please avoid sending confidential product information or personal data until FIJLY has provided its approved privacy information and an appropriate way to share project materials.</p>
 <aside class="owner-review"><h2>Site owner review required</h2><p>Confirm the business identity and privacy contact, hosting logs, enquiry handling, service providers, cookies or analytics actually used, retention periods, international processing, and applicable privacy rights. Replace this notice with reviewed information that reflects actual practices.</p></aside>'''),
 'terms': ('Terms', 'Website terms are being prepared.', '''<p>This page is a temporary notice, not a completed service agreement. The site owner must review and publish appropriate terms before accepting orders through the website.</p>
 <h2>Video production enquiries</h2><p>Before starting a project, request written confirmation of the scope, deliverables, schedule, pricing, payment arrangements, revisions, cancellation arrangements, and rights to the finished work.</p>
 <h2>Studio demonstration</h2><p>The Studio presents sample projects and metrics. It is not an authenticated client account and does not submit requests, send notifications, or save workspace settings to a service.</p>
 <aside class="owner-review"><h2>Site owner review required</h2><p>Confirm the contracting business and contact details, order process, payment and cancellation terms, intellectual property and licensing, confidentiality, responsibilities for supplied materials, and applicable dispute terms with an appropriate adviser. Replace this notice with approved terms.</p></aside>'''),
 '404': ('Page not found', 'We couldn’t find that page.', '<p>The address may have changed or the link may be incomplete.</p><p><a class="btn btn-primary" href="/index.html">Back to FIJLY</a></p>')
}
for name, (title, lead, content) in pages.items():
    prefix = '/' if name == '404' else ''
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>{title} — FIJLY Studio</title>
  <meta name="description" content="{lead}">
  <link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{prefix}css/variables.css">
  <link rel="stylesheet" href="{prefix}css/base.css">
  <link rel="stylesheet" href="{prefix}css/components.css">
  <link rel="stylesheet" href="{prefix}css/marketing.css">
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="document-header container"><a class="logo" href="{prefix}index.html" aria-label="FIJLY home"><img src="{prefix}assets/favicon.svg" width="31" height="31" alt=""><span class="logo__word">FIJLY</span></a></header>
  <main class="document-page container" id="content">
    <h1>{title}</h1><p class="document-lead">{lead}</p>
    {content}
  </main>
  <footer class="document-footer container"><nav aria-label="Footer"><a href="{prefix}index.html">Home</a><a href="{prefix}privacy.html">Privacy</a><a href="{prefix}terms.html">Terms</a></nav></footer>
</body>
</html>
'''
    (root/(name+'.html')).write_text(html, encoding='utf-8')
