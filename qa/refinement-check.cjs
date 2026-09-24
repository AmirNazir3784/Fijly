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
  for(const selector of ['.hero__copy','.hero-showcase','#signup-form','.work__grid','.footer__grid']){
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
  // #contact is the sign-up form (its outcomes are covered in orders.cjs).
  await p.locator('#signup-submit').click();assert.equal(await p.locator('#signup-name').evaluate(e=>e.validity.valueMissing),true);
  assert.equal(await p.locator('#signup-status').isVisible(),false);
  await p.locator('#signup-name').fill('Jane Founder');await p.locator('#signup-email').fill('invalid');await p.locator('#signup-password').fill('password123');
  await p.locator('#signup-submit').click();assert.equal(await p.locator('#signup-email').evaluate(e=>e.validity.typeMismatch),true);
  assert.equal(await p.locator('#google-signin').isDisabled(),true);
  const button=await p.locator('#signup-submit').evaluate(e=>e.scrollWidth<=e.clientWidth);assert.equal(button,true,`${width}: sign-up button label fits`);
  await p.locator('#signup-name').fill('');await p.locator('#signup-email').fill('');await p.locator('#signup-password').fill('');
  await p.locator('[data-concept="aiflow"]').click();await p.locator('[data-close-concept]').click();assert.equal(await p.locator('#concept-dialog').isVisible(),false);assert.equal(await p.evaluate(()=>document.activeElement.id),'contact');
  if(width===375){await p.locator('#contact').screenshot({path:'qa/refinement-after/contact-ready-375.png'});}
  checks.push(`${width}: hero bounds, CTA to the sign-up form, all concept dialogs, sign-up validation, button label fits, contact focus`);
 }
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
