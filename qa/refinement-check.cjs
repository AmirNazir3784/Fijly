const {chromium}=require('./runtime.cjs');
const assert=require('assert/strict'),fs=require('fs');
(async()=>{
 fs.mkdirSync('qa/refinement-after',{recursive:true});
 const b=await chromium.launch(),p=await b.newPage();const checks=[],errors=[],axeResults=[];
 p.on('pageerror',e=>errors.push(String(e)));
 const base=require('./runtime.cjs').base;
 for(const width of [1440,1280,1024,768,390,375]){
  await p.setViewportSize({width,height:900});await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>document.fonts.ready);
  for(const selector of ['.hero__copy','.hero-showcase','#contact-form','.work__grid','.footer__grid']){
   const r=await p.locator(selector).boundingBox();assert(r.x>=0&&r.x+r.width<=width+1,`${width} clipped ${selector}`);
  }
  assert.equal(await p.locator('a[href="#"]').count(),0);
  assert.equal(await p.locator('.hero__actions a').first().getAttribute('href'),'#contact');
  for(const key of ['aiflow','clouddesk','finly']){
   await p.locator(`[data-concept="${key}"]`).click();assert(await p.locator('#concept-dialog').isVisible());
   assert((await p.locator('#concept-image').getAttribute('src')).includes(key));
   await p.keyboard.press('Escape');assert.equal(await p.locator('#concept-dialog').isVisible(),false);
   assert.equal(await p.evaluate(()=>document.activeElement.dataset.concept),key);
  }
  await p.locator('[data-plan="Studio"]').click();assert.equal(await p.locator('#contact-plan').inputValue(),'Studio');
  assert.equal(await p.locator('#contact-type').inputValue(),'Recurring video production');
  await p.locator('#contact-form button').click();assert.equal(await p.locator('#contact-status').isVisible(),false);
  await p.locator('#contact-name').fill('Jane Founder');await p.locator('#contact-email').fill('invalid');
  await p.locator('#contact-message').fill('We need a launch video for our new product.');
  await p.locator('#contact-form button').click();assert.equal(await p.locator('#contact-email').evaluate(e=>e.validity.typeMismatch),true);
  await p.locator('#contact-email').fill('jane@example.com');await p.locator('#contact-form button').click();
  // Briefs are saved to Supabase (the emulator in QA); the form then clears.
  await p.waitForFunction(()=>/has been sent/.test(document.getElementById('contact-status').textContent));
  assert.equal(await p.locator('#contact-name').inputValue(),'');assert.equal(await p.locator('#contact-status a').count(),0);
  assert.ok(b.fijlyDb.contact_submissions.some(x=>x.name==='Jane Founder'&&x.email==='jane@example.com'&&x.plan==='Studio'&&x.project_type==='Recurring video production'),'brief saved to contact_submissions');
  assert.doesNotMatch(await p.locator('#contact-help').textContent(),/not connected/);
  await p.locator('[data-concept="aiflow"]').click();await p.locator('[data-close-concept]').click();assert.equal(await p.locator('#concept-dialog').isVisible(),false);assert.equal(await p.evaluate(()=>document.activeElement.id),'contact');
  if(width===375){await p.locator('#contact').screenshot({path:'qa/refinement-after/contact-ready-375.png'});}
  checks.push(`${width}: hero bounds, CTA plan context, all concept dialogs, validation, email fallback, contact focus`);
 }
 // Fallbacks, locally: unconfigured (email draft only), database refusal and
 // a blocked SDK (email draft offered, brief kept). No real messages are sent.
 for(const variant of ['unconfigured','rejected','blocked']){
  if(variant==='unconfigured')await p.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.FIJLY_CONFIG={contactEmail:'hello@fijly.com'}"}));
  if(variant==='rejected')await p.route('**/rest/v1/contact_submissions',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'XX000',message:'QA failure'})}));
  if(variant==='blocked')await p.route('**/supabase-js@*/**',r=>r.abort());
  await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});
  await p.locator('#contact-name').fill('Test');await p.locator('#contact-email').fill('test@example.com');await p.locator('#contact-type').selectOption('Explainer Videos');await p.locator('#contact-message').fill('This is a local automated delivery test.');await p.locator('#contact-form button').click();
  await p.waitForFunction(()=>!document.querySelector('#contact-form button').disabled&&!/Sending/.test(document.getElementById('contact-status').textContent));
  assert.match(await p.locator('#contact-status').textContent(),variant==='unconfigured'?/has not been sent/:/could not confirm delivery/);
  const href=await p.locator('#contact-status a').getAttribute('href');assert(href.startsWith('mailto:hello@fijly.com?'));assert(decodeURIComponent(href).includes('local automated delivery test'));
  assert.equal(await p.locator('#contact-message').inputValue(),'This is a local automated delivery test.');
  await p.unrouteAll();
 }
 assert.equal(b.fijlyDb.contact_submissions.filter(x=>x.name==='Test').length,0,'failed sends store nothing');
 // Honeypot: a bot that fills the hidden field sees success, and nothing is saved.
 await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});
 // Off-screen for people (clipped to 1px, hidden from assistive tech, not a tab stop), present for bots.
 assert.deepEqual(await p.locator('#fijly-hp').evaluate(e=>{const r=e.parentElement.getBoundingClientRect();return [e.parentElement.getAttribute('aria-hidden'),e.tabIndex,r.width<=1&&r.height<=1];}),['true',-1,true]);
 await p.locator('#contact-name').fill('Bot');await p.locator('#contact-email').fill('bot@example.com');await p.locator('#contact-type').selectOption('Explainer Videos');await p.locator('#contact-message').fill('Automated spam message for the honeypot test.');
 await p.locator('#fijly-hp').evaluate(e=>{e.value='https://spam.example';});await p.locator('#contact-form button').click();
 await p.waitForFunction(()=>/has been sent/.test(document.getElementById('contact-status').textContent));
 assert.equal(await p.locator('#contact-name').inputValue(),'');assert.equal(b.fijlyDb.contact_submissions.filter(x=>x.name==='Bot').length,0,'honeypot submissions are not saved');
 checks.push('Contact brief saved to Supabase and form cleared; unconfigured, refused and SDK-blocked sends fall back to an email draft and keep the brief; honeypot submissions show success but store nothing');
 await p.setViewportSize({width:1440,height:900});await p.goto(base+'studio.html#overview',{waitUntil:'domcontentloaded'});
 assert.equal(await p.locator('#preview .canvas, #preview .timeline').count(),0);assert.ok(await p.locator('.preview-placeholder').isVisible());
 checks.push('Overview preview is a clear placeholder, not a simulated player');
 for(const width of [1440,375])for(const screen of ['marketing','overview','projects','requests','assets','scripts','analytics','settings']){
  await p.setViewportSize({width,height:900});await p.goto(base+(screen==='marketing'?'index.html':'studio.html#'+screen),{waitUntil:'domcontentloaded'});await p.reload({waitUntil:'domcontentloaded'});await p.addScriptTag({path:'qa/axe.min.js'});
  const violations=await p.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
  axeResults.push({width,screen,violations});
  if(screen==='marketing'){await p.locator('[data-concept="aiflow"]').click();axeResults.push({width,screen:'concept-dialog',violations:await p.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))});}
 }
 fs.writeFileSync('qa/refinement-check-results.json',JSON.stringify({checks,errors,axeResults},null,2));
 console.log(JSON.stringify({checks,errors,accessibility:axeResults.filter(r=>r.violations.length)},null,2));await b.close();assert.deepEqual(errors,[]);assert.ok(axeResults.every(r=>!r.violations.length));
})().catch(e=>{console.error(e);process.exit(1)});
