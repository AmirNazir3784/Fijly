const {chromium,base,routes,widths,qaUsers}=require('./runtime.cjs');
const assert=require('assert/strict'),fs=require('fs'),crypto=require('crypto');
(async()=>{
  const browser=await chromium.launch(),ctx=await browser.newContext(),a=await ctx.newPage(),b=await ctx.newPage(),c=await ctx.newPage(),d=await ctx.newPage();
  const errors=[],checks=[],scans=[];
  for(const p of [a,b,c,d]){p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
  const go=(p,portal,route)=>p.goto(base+portal+'.html#'+route);
  const scan=async(p,label)=>{await p.addScriptTag({path:'qa/axe.min.js'});const violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));scans.push({label,violations});assert.deepEqual(violations,[],label);};
  const close=async p=>{await p.locator('#profile-dialog [data-profile-close]').first().click();};
  const open=async p=>{await p.locator('.sidebar-user').click();await p.locator('#profile-name').waitFor({state:'visible'});};
  const save=async p=>{await p.locator('#profile-save').click();await p.locator('#profile-status:not([hidden])').waitFor();assert.match(await p.locator('#profile-status').innerText(),/Profile updated/);};
  await go(a,'admin','settings');await go(b,'admin','settings');await go(c,'studio','settings');await go(d,'studio','settings');
  const original=await a.evaluate(()=>JSON.stringify(['requests','videos','revisions','scripts','assets'].map(k=>FijlyMock.state[k])));
  // Admin: name and photo are saved to the Supabase profile (it has no phone
  // column). Another Admin tab sees saved changes once its data refreshes.
  await open(a);assert.equal(await a.locator('#profile-email').getAttribute('readonly'),'');assert.equal(await a.locator('#profile-role').getAttribute('readonly'),'');
  assert.equal(await a.locator('#profile-phone').isVisible(),false);await a.locator('#profile-name').fill('Sam Studio');
  const png=await a.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const x=canvas.getContext('2d');x.fillStyle='#5b4bf5';x.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];});
  await a.locator('#profile-photo-file').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await a.waitForFunction(()=>!document.querySelector('#profile-save').disabled);assert.equal(await a.locator('#profile-avatar img').count(),1);assert.equal(await a.locator('.sidebar-user img').count(),0);
  await save(a);await b.evaluate(()=>FijlyData.load());await b.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Studio');assert.equal(await b.locator('#set-admin-name').inputValue(),'Sam Studio');assert.equal(await b.locator('.sidebar-user img').count(),1);assert.match(await b.locator('.profile-reference').innerText(),/Add a profile photo|Sam Studio/);await close(a);await a.reload();assert.equal(await a.locator('.sidebar-user img').count(),1);
  // A refresh brings saved values into untouched fields, and keeps drafts.
  await open(a);await open(b);await b.locator('#profile-name').fill('Sam Updated');await save(b);await a.evaluate(()=>FijlyData.load());await a.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Updated');assert.equal(await a.locator('#profile-name').inputValue(),'Sam Updated');await close(a);await close(b);
  await a.locator('#set-studio-name').fill('Unsaved studio label');await open(b);await b.locator('#profile-name').fill('Sam Final');await save(b);await a.evaluate(()=>FijlyData.load());await a.waitForFunction(()=>FijlyMock.state.settings.adminName==='Sam Final');assert.equal(await a.locator('#set-studio-name').inputValue(),'Unsaved studio label');assert.equal(await a.locator('#set-admin-name').inputValue(),'Sam Final');await close(b);await a.locator('#settings-reset').click();
  await open(a);await a.locator('#profile-name').fill('Discard this');await a.keyboard.press('Escape');assert.equal(await a.locator('.sidebar-user__name').innerText(),'Sam Final');assert.equal(await a.locator('.sidebar-user').evaluate(e=>e===document.activeElement),true);
  await open(a);await a.locator('#profile-photo-file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});assert.match(await a.locator('#profile-photo-error').innerText(),/PNG, JPG or WebP/);await a.locator('#profile-remove-photo').click();await save(a);await b.evaluate(()=>FijlyData.load());await b.waitForFunction(()=>FijlyMock.state.settings.adminPhoto==='');assert.equal(await a.locator('.sidebar-user img').count(),0);await close(a);
  checks.push('Admin name/photo save to the profile, remove, cancel, validation, reload, refresh into other tabs and unsaved Settings edits; no phone field (no column)');
  // Client: "Your profile" is the signed-in person's own profile (name and
  // photo on `profiles`). The company contact, workflow records and request
  // preferences are untouched; another tab shows the change after a refresh.
  const workflowRows=()=>JSON.stringify(['requests','videos','revisions','scripts','assets','clients'].map(k=>browser.fijlyDb[k]));
  const before=workflowRows(),prefs=await c.evaluate(()=>FijlyMock.client.preferences()),contactBefore=await c.locator('#client-contact').inputValue();
  await open(c);assert.equal(await c.locator('#profile-phone').isVisible(),false);assert.equal(await c.locator('#profile-email').inputValue(),qaUsers.client.email);await c.locator('#profile-name').fill('Casey Studio');await c.locator('#profile-photo-file').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await c.waitForFunction(()=>!document.querySelector('#profile-save').disabled);await save(c);
  await d.evaluate(()=>FijlyData.load());await d.waitForFunction(()=>document.querySelector('.sidebar-user__name').textContent==='Casey Studio');assert.equal(await d.locator('.sidebar-user img').count(),1);assert.equal(await d.locator('.sidebar-user__email').innerText(),'Northbeam');assert.equal(await d.locator('#client-contact').inputValue(),contactBefore);assert.equal(await c.locator('#profile-role').inputValue(),'Client');assert.deepEqual(await c.evaluate(()=>FijlyMock.client.preferences()),prefs);await close(c);
  const stored=browser.fijlyDb.profiles.find(x=>x.id===qaUsers.client.id);assert.equal(stored.full_name,'Casey Studio');assert.match(stored.avatar_url,/^data:image\//);
  await go(c,'studio','overview');assert.match(await c.locator('#h-overview').innerText(),/Casey/);
  await open(c);await c.locator('#profile-name').fill('Unsaved draft');await c.keyboard.press('Escape');assert.equal(await c.locator('.sidebar-user__name').innerText(),'Casey Studio');
  assert.equal(workflowRows(),before,'a profile edit changes no workflow or company records');
  checks.push('Client profile: name/photo saved to the signed-in user\'s profile, workspace shown under the name, no phone field, company contact and preferences untouched, cancelled edits discarded, other tabs update on refresh');
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
    // Sign out is the sidebar's last control; Tab wraps from it to the logo and back.
    await p.locator('[data-sign-out]').focus();if(width<1024){await p.keyboard.press('Tab');assert.equal(await p.locator('.sidebar-home').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('[data-sign-out]').evaluate(e=>e===document.activeElement),true);}
    await scan(p,portal+'/sidebar/'+width);await p.screenshot({path:`qa/screenshots/polish-${portal}-sidebar-${width}.png`});
    await p.locator('.sidebar-user').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#profile-name').evaluate(e=>e===document.activeElement),true);await p.locator('#profile-save').focus();await p.keyboard.press('Tab');assert.equal(await p.locator('#profile-dialog [data-profile-close]').first().evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#profile-save').evaluate(e=>e===document.activeElement),true);await scan(p,portal+'/profile/'+width);assert.equal(await p.locator('#profile-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await p.screenshot({path:`qa/screenshots/polish-${portal}-profile-${width}.png`});await p.keyboard.press('Escape');assert.equal(await p.locator('#profile-dialog').evaluate(e=>e.open),false);assert.equal(await p.locator('.sidebar-user').evaluate(e=>e===document.activeElement),true);
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
    'site/css/variables.css','site/css/dashboard.css','site/css/admin.css','site/css/workflow.css','site/css/client-portal.css',
    // Part 3A: the Admin portal reads Supabase; these controllers now await its writes.
    'site/js/admin.js','site/js/workflow.js',
    // Part 3D: the contact form saves briefs to Supabase.
    'site/js/contact.js','site/js/config.js'];
  // index.html may differ only by its three Sign in / Studio links, which now
  // point to login.html, and the Supabase SDK tag the contact form uses (Part 3D);
  // restoring both must reproduce the baseline bytes.
  const sdkTag='  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js" integrity="sha384-iLddHTLokph6Omwoyid4XKxHaWa6w41BnoEj0q5oOrzmYPpHIKt1wyjReA7s//pP" crossorigin="anonymous" defer></script>\r\n';
  const bytes=file=>file==='site/index.html'?Buffer.from(fs.readFileSync(file,'latin1').replace(sdkTag,'').replaceAll('href="login.html"','href="studio.html"'),'latin1'):fs.readFileSync(file);
  // Part 3B retired the session mock: these two files must be gone.
  const retired=['site/js/admin-data.js','site/js/mock-service.js'];
  for(const file of retired)assert.equal(fs.existsSync(file),false,file+' retired');
  for(const [file,hash] of Object.entries(baseline))if(!allowed.includes(file)&&!retired.includes(file))assert.equal(crypto.createHash('sha256').update(bytes(file)).digest('hex'),hash,file+' unchanged');
  checks.push('Baseline hash guard: workflow implementation, status logic, fixture data, dashboard renderer, public pages and assets unchanged');
  fs.writeFileSync('qa/studio-polish-results.json',JSON.stringify({checks,scans,errors},null,2));await browser.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,scans:scans.length,errors},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
