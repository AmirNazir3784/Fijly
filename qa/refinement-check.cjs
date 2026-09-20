const {chromium}=require('C:/Users/Mister Naveed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const b=await chromium.launch(),p=await b.newPage();const checks=[],errors=[],axeResults=[];
 p.on('pageerror',e=>errors.push(String(e)));
 const base='http://127.0.0.1:8766/';
 for(const width of [1440,1280,1024,768,390,375]){
  await p.setViewportSize({width,height:900});await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>document.fonts.ready);
  for(const selector of ['.hero__copy','.hero-frame','#contact-form','.work__grid','.footer__grid']){
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
  assert.match(await p.locator('#contact-status').textContent(),/has not been sent/);
  const href=await p.locator('#contact-status a').getAttribute('href');assert(href.startsWith('mailto:hello@fijly.studio?'));assert(decodeURIComponent(href).includes('Jane Founder'));
  await p.locator('[data-concept="aiflow"]').click();await p.locator('[data-close-concept]').click();assert.equal(await p.locator('#concept-dialog').isVisible(),false);assert.equal(await p.evaluate(()=>document.activeElement.id),'contact');
  if(width===375){await p.locator('#contact').screenshot({path:'qa/refinement-after/contact-ready-375.png'});}
  checks.push(`${width}: hero bounds, CTA plan context, all concept dialogs, validation, email fallback, contact focus`);
 }
 // Exercise configured success and failure locally; no real messages are sent.
 for(const accepted of [false,true]){
  await p.route('**/js/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.FIJLY_CONFIG={contactEndpoint:'/test-delivery',contactEmail:'hello@fijly.studio'}"}));
  await p.route('**/test-delivery',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:accepted})}));
  await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});
  await p.locator('#contact-name').fill('Test');await p.locator('#contact-email').fill('test@example.com');await p.locator('#contact-type').selectOption('Explainer Videos');await p.locator('#contact-message').fill('This is a local automated delivery test.');await p.locator('#contact-form button').click();
  await p.waitForFunction(()=>!document.querySelector('#contact-form button').disabled);
  assert.match(await p.locator('#contact-status').textContent(),accepted?/has been sent/:/could not confirm delivery/);
  if(!accepted)assert.equal(await p.locator('#contact-message').inputValue(),'This is a local automated delivery test.');
 }
 await p.unrouteAll();checks.push('Mock endpoint accepted/rejected responses; rejected brief retained');
 await p.setViewportSize({width:1440,height:900});await p.goto(base+'studio.html#overview',{waitUntil:'domcontentloaded'});
 await p.locator('.timeline__play').click();await p.waitForTimeout(1300);assert.notEqual(await p.locator('.timeline__time').first().textContent(),'00:24');
 await p.locator('.timeline__play').click();let time=await p.locator('.timeline__time').first().textContent();await p.waitForTimeout(1100);assert.equal(await p.locator('.timeline__time').first().textContent(),time);
 await p.locator('[data-preview-restart]').click();assert.equal(await p.locator('.timeline__time').first().textContent(),'00:00');
 checks.push('Studio motion preview advances, pauses and restarts');
 for(const width of [1440,375])for(const screen of ['marketing','overview','projects','requests','assets','scripts','analytics','team','settings']){
  await p.setViewportSize({width,height:900});await p.goto(base+(screen==='marketing'?'index.html':'studio.html#'+screen),{waitUntil:'domcontentloaded'});await p.reload({waitUntil:'domcontentloaded'});await p.addScriptTag({path:'qa/axe.min.js'});
  const violations=await p.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
  axeResults.push({width,screen,violations});
  if(screen==='marketing'){await p.locator('[data-concept="aiflow"]').click();axeResults.push({width,screen:'concept-dialog',violations:await p.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))});}
 }
 fs.writeFileSync('qa/refinement-check-results.json',JSON.stringify({checks,errors,axeResults},null,2));
 console.log(JSON.stringify({checks,errors,accessibility:axeResults.filter(r=>r.violations.length)},null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
