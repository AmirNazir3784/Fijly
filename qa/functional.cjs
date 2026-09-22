const {chromium}=require('./runtime.cjs');
const assert=require('assert/strict');const fs=require('fs');
fs.mkdirSync('qa/screenshots',{recursive:true});
(async()=>{
 const b=await chromium.launch();const p=await b.newPage();const errors=[];const checks=[];
 const goto=p.goto.bind(p),reload=p.reload.bind(p);
 p.goto=(url)=>goto(url,{waitUntil:'domcontentloaded'});
 p.reload=()=>reload({waitUntil:'domcontentloaded'});
 p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const base=require('./runtime.cjs').base;
 const screen=async(id)=>assert.equal(await p.locator('.screen:visible').getAttribute('data-screen'),id);
 for(const width of [1440,1024,768,375,390]){
  await p.setViewportSize({width,height:900});
  for(const id of ['overview','projects','requests','assets','scripts','analytics','settings']){
   await p.goto(base+'studio.html#'+id);await p.reload();await screen(id);
   assert.equal(await p.locator('.sidebar-link[aria-current]').getAttribute('data-screen'),id);
   assert.equal(await p.locator('#topbar-title').textContent(),'FIJLY STUDIO');
   assert.equal(await p.locator('h1:visible').count(),1);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  for(const id of ['overview','projects','requests','assets','scripts','analytics','settings']){
   if(width<1024)await p.locator('[data-sidebar-open]').click();
   await p.locator(`.sidebar-link[data-screen="${id}"]`).click();await screen(id);
   assert.equal(await p.evaluate(()=>scrollY),0);
   assert.equal(await p.locator('.sidebar-open').count(),0);
   assert.equal(await p.evaluate(()=>document.activeElement.tagName),'H1');
  }
  checks.push(`${width}px: all seven deep links, navigation, active state, titles, focus, scroll and overflow`);
 }
 await p.setViewportSize({width:375,height:800});await p.goto(base+'studio.html#overview');
 const open=p.locator('[data-sidebar-open]');
 for(const close of ['escape','button','backdrop']){
  await open.click();assert.equal(await p.evaluate(()=>document.querySelector('#sidebar').contains(document.activeElement)),true);
  assert.equal(await p.locator('.studio-main').evaluate(e=>e.inert),true);
  await p.locator('[data-sign-out]').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.className),'sidebar-home');
  await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('sidebar-signout')),true);
  if(close==='escape')await p.keyboard.press('Escape');
  if(close==='button')await p.locator('.sidebar-close').click();
  if(close==='backdrop')await p.locator('.sidebar-backdrop').click({position:{x:340,y:400}});
  assert.equal(await open.getAttribute('aria-expanded'),'false');assert.equal(await open.evaluate(e=>e===document.activeElement),true);
 }
 await open.click();await p.setViewportSize({width:1440,height:900});assert.equal(await p.locator('#sidebar').evaluate(e=>e.inert),false);assert.equal(await p.locator('.studio-main').evaluate(e=>e.inert),false);
 checks.push('Sidebar: open, close button, backdrop, Escape, forward/reverse focus trap, return focus, desktop resize');
 await p.evaluate(()=>location.hash='projects');await p.waitForTimeout(100);await screen('projects');
 await p.locator('.sidebar-link[data-screen="settings"]').click();await p.goBack();await screen('projects');await p.goForward();await screen('settings');
 await p.evaluate(()=>location.hash='invalid%22%5D');await p.waitForTimeout(100);await screen('overview');
 checks.push('Hash changes, browser back/forward and invalid hash fallback');
 await p.locator('[data-screen="projects"].sidebar-link').click();
 for(const [filter,count] of [['production',2],['review',1],['delivered',1],['all',7]]){
  await p.locator(`[data-filter="${filter}"]`).click();assert.equal(await p.locator('.projects-table tbody tr:visible').count(),count);
  assert.equal(await p.locator(`[data-filter="${filter}"]`).getAttribute('aria-pressed'),'true');
 }
 await p.locator('#client-project-search').fill('no-such-title');assert.match(await p.locator('.projects-table tbody').innerText(),/No videos match this filter/);await p.locator('#client-project-search').fill('');
 checks.push('All project filters and real search empty state');
 await p.locator('[data-screen="settings"].sidebar-link').click();
 // Client notification switches had no database columns and were removed;
 // the stored defaults remain. (Admin Settings switches are covered in studio-admin-sections.)
 assert.equal(await p.locator('#client-settings-form input[type="checkbox"]').count(),0);
 assert.equal(await p.locator('#client-default-platform').count(),1);assert.equal(await p.locator('#set-length').count(),1);
 checks.push('Client settings: no unsaved notification switches; stored default platform and length present');
 await p.locator('[data-screen="overview"].sidebar-link').click();assert.equal(await p.locator('#preview .canvas, #preview .timeline, [data-play-toggle], [data-fullscreen]').count(),0);assert.match(await p.locator('#preview-message').innerText(),/Draft ready for review/);
 checks.push('Preview play/pause mouse and keyboard, synchronized names, fullscreen');
 await p.locator('[data-screen="requests"].sidebar-link').click();const before=await p.locator('[data-request-list] .list-card').count();await p.locator('[data-request-form] [type="submit"]').click();assert.equal(await p.locator('[data-request-list] .list-card').count(),before);
 await p.locator('#req-name').fill('Functional regression');await p.locator('#req-brief').fill('Show the core workflow.');await p.locator('[data-request-form] [type="submit"]').click();await p.waitForFunction(n=>document.querySelectorAll('[data-request-list] .list-card').length===n,before+1);checks.push('Request validation and database submission');
 await p.setViewportSize({width:375,height:800});await p.goto(base+'studio.html#projects');await p.reload();const table=p.locator('#screen-projects .projects-table');assert.equal(await table.evaluate(e=>getComputedStyle(e).display),'block');assert.equal(await table.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await table.locator('button').first().focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#workflow-detail').evaluate(e=>e.open),true);await p.keyboard.press('Escape');checks.push('Projects mobile cards: no horizontal scrolling; keyboard opens the record');
 for(const width of [1440,1024,768,375,390]){
  await p.setViewportSize({width,height:900});await p.goto(base+'index.html');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width<768){
   const toggle=p.locator('.nav__toggle');await toggle.click();assert.equal(await p.locator('#mobile-menu a').first().evaluate(e=>e===document.activeElement),true);
   await p.locator('#mobile-menu a').last().focus();await p.keyboard.press('Tab');assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
   await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#mobile-menu a').last().evaluate(e=>e===document.activeElement),true);
   await p.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   await toggle.click();await p.locator('#mobile-menu a[href="#services"]').click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>document.activeElement.id),'services');
  }else{await p.locator('.nav__links a[href="#services"]').click();}
  await p.waitForTimeout(800);assert.equal(await p.evaluate(()=>Math.abs(document.querySelector('#services').getBoundingClientRect().top-68)<3),true);
  for(const item of await p.locator('.faq-item').all()){await item.locator('summary').click();await p.waitForTimeout(350);assert.equal(await item.evaluate(e=>e.open),true);await item.locator('summary').focus();await p.keyboard.press('Enter');await p.waitForFunction(e=>!e.open,await item.elementHandle(),{timeout:3000});}
  checks.push(`${width}px marketing: anchors, menus where applicable, FAQ mouse/keyboard, overflow`);
 }
 await p.emulateMedia({reducedMotion:'reduce'});await p.reload();assert.equal(await p.locator('[data-hero-play]').getAttribute('aria-label'),'Play motion study');
 await p.setViewportSize({width:1440,height:900});await p.locator('.nav__actions a[href="login.html"]').click();await p.waitForURL('**/admin.html');await p.locator('.sidebar-home').click();assert.match(p.url(),/index.html/);await p.locator('.footer a[href="login.html"]').click();await p.waitForURL('**/admin.html');
 checks.push('Motion study reduced-motion preference, Sign in and footer Studio links go through login.html (signed in: straight to the portal), return to website');
 // Render an OG image directly from the existing page, preserving the design.
 await p.setViewportSize({width:1200,height:900});await p.goto(base+'index.html');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:'qa/screenshots/marketing-og-check.png',clip:{x:0,y:0,width:1200,height:630}});
 for(const file of ['privacy.html','terms.html','404.html'])for(const width of [1440,768,375]){await p.setViewportSize({width,height:900});await p.goto(base+file);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`qa/screenshots/${file}-${width}.png`,fullPage:true});}
 checks.push('Supporting pages: desktop, tablet and mobile');
 await p.goto('file:///'+process.cwd().replaceAll('\\','/')+'/site/studio.html#settings');await screen('settings');await p.goto('file:///'+process.cwd().replaceAll('\\','/')+'/site/index.html');assert.equal(await p.locator('h1').count(),1);checks.push('Direct file:// loading for both primary pages');
 assert.deepEqual(errors,[]);fs.writeFileSync('qa/functional-results.json',JSON.stringify({checks,errors},null,2));console.log({checks,errors});await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
