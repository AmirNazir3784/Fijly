const {chromium,base,routes,widths}=require('./runtime.cjs');
const assert=require('assert/strict'),fs=require('fs'),crypto=require('crypto');
(async()=>{
  const browser=await chromium.launch(),ctx=await browser.newContext(),a=await ctx.newPage(),b=await ctx.newPage(),c=await ctx.newPage(),d=await ctx.newPage();
  const errors=[],checks=[],scans=[];
  for(const p of [a,b,c,d]){p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
  const go=(p,portal,route)=>p.goto(base+portal+'.html#'+route);
  const scan=async(p,label)=>{await p.addScriptTag({path:'qa/axe.min.js'});const violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));scans.push({label,violations});assert.deepEqual(violations,[],label);};
  const close=async p=>{await p.locator('#profile-dialog [data-profile-close]').first().click();};
  const open=async p=>{await p.locator('.sidebar-user').click();await p.locator('#profile-name').waitFor({state:'visible'});};
  const save=async p=>{await p.locator('#profile-save').click();assert.match(await p.locator('#profile-status').innerText(),/Profile updated/);};
  await go(a,'admin','settings');await go(b,'admin','settings');await go(c,'studio','settings');await go(d,'studio','settings');
  const original=await a.evaluate(()=>JSON.stringify(['requests','videos','revisions','scripts','assets'].map(k=>FijlyMock.state[k])));
  const clients=await c.evaluate(()=>FijlyMock.state.clients.map(x=>({...x})));
  // Admin: editable personal fields, photo preview, save, cross-tab and reload.
  await open(a);assert.equal(await a.locator('#profile-email').getAttribute('readonly'),'');assert.equal(await a.locator('#profile-role').getAttribute('readonly'),'');
  await a.locator('#profile-name').fill('Sam Studio');await a.locator('#profile-phone').fill('+1 555 123 4567');
  const png=await a.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const x=canvas.getContext('2d');x.fillStyle='#5b4bf5';x.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];});
  await a.locator('#profile-photo-file').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await a.waitForFunction(()=>!document.querySelector('#profile-save').disabled);assert.equal(await a.locator('#profile-avatar img').count(),1);assert.equal(await a.locator('.sidebar-user img').count(),0);
  await save(a);await b.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Studio');assert.equal(await b.locator('#set-admin-name').inputValue(),'Sam Studio');assert.equal(await b.locator('.sidebar-user img').count(),1);assert.match(await b.locator('.profile-reference').innerText(),/123 4567/);await close(a);await a.reload();assert.equal(await a.locator('.sidebar-user img').count(),1);
  // Concurrent profile fields merge through fresh shared values, preserving drafts.
  await open(a);await a.locator('#profile-phone').fill('+44 20 1234 5678');await open(b);await b.locator('#profile-name').fill('Sam Updated');await save(b);await a.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Updated');assert.equal(await a.locator('#profile-name').inputValue(),'Sam Updated');assert.equal(await a.locator('#profile-phone').inputValue(),'+44 20 1234 5678');await save(a);await b.waitForFunction(()=>FijlyMock.state.settings.adminPhone==='+44 20 1234 5678');await close(a);await close(b);
  await a.locator('#set-studio-name').fill('Unsaved studio label');await open(b);await b.locator('#profile-name').fill('Sam Final');await save(b);await a.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Final');assert.equal(await a.locator('#set-studio-name').inputValue(),'Unsaved studio label');assert.equal(await a.locator('#set-admin-name').inputValue(),'Sam Final');await close(b);await a.locator('#settings-reset').click();
  await open(a);await a.locator('#profile-name').fill('Discard this');await a.keyboard.press('Escape');assert.equal(await a.locator('.sidebar-user__name').innerText(),'Sam Final');assert.equal(await a.locator('.sidebar-user').evaluate(e=>e===document.activeElement),true);
  await open(a);await a.locator('#profile-photo-file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});assert.match(await a.locator('#profile-photo-error').innerText(),/PNG, JPG or WebP/);await a.locator('#profile-remove-photo').click();await save(a);await b.waitForFunction(()=>FijlyMock.state.settings.adminPhoto==='');assert.equal(await a.locator('.sidebar-user img').count(),0);await close(a);
  checks.push('Admin name/phone/photo save, remove, cancel, validation, reload, shared references, concurrent fields and unsaved Settings edits');
  // Client personal identity updates the existing contact record, never company
  // identity, workflow records, permissions or request preferences.
  const prefs=await c.evaluate(()=>FijlyMock.client.preferences());
  await open(c);const email=await c.locator('#profile-email').inputValue();await c.locator('#profile-name').fill('Alex Studio');await c.locator('#profile-phone').fill('+92 300 1234567');await c.locator('#profile-photo-file').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await c.waitForFunction(()=>!document.querySelector('#profile-save').disabled);await save(c);await d.waitForFunction(()=>FijlyMock.client.current().contact==='Alex Studio');assert.equal(await d.locator('#client-contact').inputValue(),'Alex Studio');assert.equal(await d.locator('.sidebar-user img').count(),1);assert.equal(await d.locator('#client-email').inputValue(),email);assert.equal(await c.locator('#profile-role').inputValue(),'Client');assert.deepEqual(await c.evaluate(()=>FijlyMock.client.preferences()),prefs);await close(c);
  await go(c,'studio','overview');assert.match(await c.locator('#h-overview').innerText(),/Alex/);await a.waitForFunction(()=>FijlyMock.get('clients','northbeam').contact==='Alex Studio');
  await c.evaluate(()=>FijlyMock.client.select('layerbase'));assert.equal(await c.locator('.sidebar-user img').count(),0);await open(c);assert.equal(await c.locator('#profile-phone').inputValue(),'');await c.locator('#profile-name').fill('Unsaved foreign draft');await c.evaluate(()=>FijlyMock.client.select('northbeam'));assert.equal(await c.locator('#profile-dialog').evaluate(e=>e.open),false);assert.equal(await c.locator('.sidebar-user__name').innerText(),'Alex Studio');
  const untouched=await c.evaluate(()=>FijlyMock.state.clients.filter(x=>x.id!=='northbeam'));assert.deepEqual(untouched,clients.filter(x=>x.id!=='northbeam'));assert.equal(await a.evaluate(()=>JSON.stringify(['requests','videos','revisions','scripts','assets'].map(k=>FijlyMock.state[k]))),original);
  checks.push('Client contact/phone/photo sync across portals and Settings, preserved email/role/preferences, client isolation, cancelled edits and unchanged production records');
  // Shell checks across every route, every requested width; short viewports
  // force sidebar scrolling while leaving its footer reachable and visible.
  fs.mkdirSync('qa/screenshots',{recursive:true});
  for(const width of widths)for(const [p,portal] of [[a,'admin'],[c,'studio']]){
    await p.setViewportSize({width,height:900});
    for(const route of routes[portal]){
      await go(p,portal,route);assert.equal(await p.locator('.screen:visible h1').count(),1);assert.equal(await p.locator('#topbar-title').innerText(),portal==='admin'?'FIJLY ADMIN':'FIJLY STUDIO');assert.equal(await p.locator('.sidebar-link--site,.studio-topbar a[href="index.html"],.admin-portal-label').count(),0);
      const metrics=await p.locator('.screen:visible .page-head').evaluate(e=>({size:getComputedStyle(e.querySelector('h1')).fontSize,weight:getComputedStyle(e.querySelector('h1')).fontWeight,description:getComputedStyle(e.querySelector('p')).fontSize,gap:getComputedStyle(e).marginBottom}));assert.equal(metrics.size,width<768?'24px':'32px');assert.equal(metrics.weight,'700');assert.equal(metrics.description,'15px');assert.equal(metrics.gap,'28px');
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,portal+'/'+route+'/'+width);await scan(p,portal+'/'+route+'/'+width);
      if(['settings',portal==='admin'?'clients':'overview'].includes(route))await p.screenshot({path:`qa/screenshots/polish-${portal}-${route}-${width}.png`,fullPage:true});
    }
    if(width<1024)await p.locator('[data-sidebar-open]').click();
    assert.equal(await p.locator('.sidebar-user').isVisible(),true);assert.equal(await p.locator('.sidebar-home').getAttribute('href'),'index.html');
    await p.locator('.sidebar-user').focus();if(width<1024){await p.keyboard.press('Tab');assert.equal(await p.locator('.sidebar-home').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('.sidebar-user').evaluate(e=>e===document.activeElement),true);}
    await scan(p,portal+'/sidebar/'+width);await p.screenshot({path:`qa/screenshots/polish-${portal}-sidebar-${width}.png`});
    await p.keyboard.press('Enter');assert.equal(await p.locator('#profile-name').evaluate(e=>e===document.activeElement),true);await p.locator('#profile-save').focus();await p.keyboard.press('Tab');assert.equal(await p.locator('#profile-dialog [data-profile-close]').first().evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#profile-save').evaluate(e=>e===document.activeElement),true);await scan(p,portal+'/profile/'+width);assert.equal(await p.locator('#profile-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await p.screenshot({path:`qa/screenshots/polish-${portal}-profile-${width}.png`});await p.keyboard.press('Escape');assert.equal(await p.locator('#profile-dialog').evaluate(e=>e.open),false);assert.equal(await p.locator('.sidebar-user').evaluate(e=>e===document.activeElement),true);
    await p.setViewportSize({width,height:520});await p.locator('.sidebar-nav').evaluate(e=>e.scrollTop=e.scrollHeight);const footer=await p.locator('.sidebar-footer').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=521,'persistent footer '+portal+'/'+width);assert.equal(await p.locator('.sidebar-user').isVisible(),true);
    await p.locator('.sidebar-home').focus();await p.keyboard.press('Enter');await p.waitForURL('**/index.html');
  }
  checks.push('All 16 routes at 1440/1024/768/390/320px; one main title, shared spacing/type, logo keyboard navigation, persistent short-screen footer and modal/sidebar focus traps');
  // Scope guard: unchanged workflow files, fixtures, public website and all
  // assets. Only shell markup/styles, UI composition and optional profile
  // fields in the existing facade are allowed to differ from this pass baseline.
  // The typography pass adds portal-scoped CSS layers and tokens (add-only in
  // variables.css); marketing.css, base.css, components.css and all JS stay guarded.
  const baseline=JSON.parse(fs.readFileSync('qa/polish-baseline-hashes.json','utf8'));
  const allowed=['site/admin.html','site/studio.html','site/js/studio-shell.js','site/js/mock-service.js','site/js/client-portal.js','site/js/admin-sections.js',
    'site/css/variables.css','site/css/dashboard.css','site/css/admin.css','site/css/workflow.css','site/css/client-portal.css'];
  for(const [file,hash] of Object.entries(baseline))if(!allowed.includes(file))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file+' unchanged');
  checks.push('Baseline hash guard: workflow implementation, status logic, fixture data, dashboard renderer, public pages and assets unchanged');
  fs.writeFileSync('qa/studio-polish-results.json',JSON.stringify({checks,scans,errors},null,2));await browser.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,scans:scans.length,errors},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
