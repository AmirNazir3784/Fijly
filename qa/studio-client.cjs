const { chromium } = require('./runtime.cjs');
const assert = require('assert/strict'), fs = require('fs');
const base = require('./runtime.cjs').base;
(async () => {
  const browser = await chromium.launch(), context = await browser.newContext();
  const c = await context.newPage(), a = await context.newPage(), errors = [], checks = [], scans = [];
  for (const p of [c,a]) { p.setDefaultTimeout(10000); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if(m.type()==='error') errors.push(m.text()); }); }
  const route = async name => { await c.goto(base+'studio.html#'+name, {waitUntil:'domcontentloaded'}); await c.locator('#client-analytics-kpis h2').first().waitFor({state:'attached'}); };
  const scan = async label => { await c.addScriptTag({path:'qa/axe.min.js'}); const violations = await c.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))); scans.push({label,violations}); };
  const close = async () => c.locator('#workflow-detail .admin-dialog-head button').click();
  // Part 3B: both portals read and write the same Supabase database. The
  // Client portal (c) runs as the Northbeam client user, the second tab (a) is
  // the Admin portal (admin user). Each side refreshes to see the other's writes.
  const db = browser.fijlyDb, sync = page => page.evaluate(() => FijlyData.load());
  await a.goto(base+'admin.html#requests',{waitUntil:'domcontentloaded'}); await route('overview');
  const values = await c.locator('#screen-overview .stat-card__value').allTextContents();
  assert.deepEqual(values,['6','1','1','0']); // 3 open videos + 3 pending requests
  assert.doesNotMatch(await c.locator('#screen-overview').innerText(), /vs last month|faster|72%|18 delivered/i);
  await c.locator('#client-current-video').click(); assert.match(await c.locator('#workflow-detail-title').innerText(),/CloudDesk/); assert.equal(await c.getByRole('button',{name:'Approve video',exact:true}).count(),1); await close();
  for(const link of await c.locator('.project-card:visible .project-card__foot a').all()) { const expected=await link.locator('xpath=../..').locator('.project-card__name').innerText(); await link.click(); assert.equal(await c.locator('#workflow-detail-title').innerText(),expected); await close(); }
  checks.push('Overview metrics derive from owned records; current/recent links open the matching video');
  await route('requests'); assert.ok(await c.locator('#req-length option').count()>=6);
  await c.locator('#req-name').fill('Client QA / Product walkthrough'); await c.locator('#req-brief').fill('Show the reporting flow and end with a clear CTA.'); await c.locator('#req-length').selectOption('2–3 min'); await c.locator('#req-platform').selectOption('LinkedIn'); await c.locator('#req-references').fill('https://example.com/reference'); await c.locator('#req-attachments').setInputFiles({name:'brief.txt',mimeType:'text/plain',buffer:Buffer.from('brief')}); await c.getByRole('button',{name:'Submit request',exact:true}).click();
  await c.waitForFunction(()=>FijlyData.client.records('requests').some(r=>r.title==='Client QA / Product walkthrough')); await sync(a); await a.waitForFunction(()=>FijlyMock.state.requests.some(r=>r.title==='Client QA / Product walkthrough'));
  const request = await a.evaluate(()=>FijlyMock.state.requests.find(r=>r.title==='Client QA / Product walkthrough')); assert.equal(request.client,'northbeam'); assert.equal(request.length,'2–3 min'); assert.equal(request.attachments[0].name,'brief.txt'); assert.equal(request.platform,'LinkedIn');
  assert.match(await c.locator('[data-request-list]').innerText(),/Client QA \/ Product walkthrough/);
  await route('projects'); await c.locator('#client-project-search').fill('Client QA'); assert.match(await c.locator('.projects-table tbody').innerText(),/Client QA[\s\S]*Submitted/);
  const videoId=await a.evaluate(async id=>(await FijlyMock.produce(id)).id,request.id); await sync(c); await c.waitForFunction(id=>FijlyMock.state.videos.some(v=>v.id===id),videoId);
  await a.evaluate(async id=>{await FijlyMock.addVersion(id,'qa-v1.mp4','First cut');await FijlyMock.setVideoStatus(id,'Draft Ready');await FijlyMock.setVideoStatus(id,'Client Review');},videoId);
  await sync(c); await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='Client Review',videoId); await c.locator('[data-filter="review"]').click(); await c.getByRole('button',{name:request.title,exact:true}).click();
  assert.match(await c.locator('#workflow-detail .workflow-version-line').innerText(),/V1 · qa-v1\.mp4/);
  assert.equal(await c.getByRole('button',{name:'Add version',exact:true}).count(),0); assert.equal(await c.getByRole('button',{name:'Edit production details',exact:true}).count(),0);
  await c.getByRole('button',{name:'Request revision',exact:true}).click(); await c.locator('#wf-feedback').fill('Slow the reporting sequence at 00:18.'); await c.locator('#workflow-editor').getByRole('button',{name:'Send revision request',exact:true}).click();
  await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='In Revision',videoId); await sync(a); await a.waitForFunction(id=>FijlyMock.rounds(FijlyMock.get('videos',id)).length===1,videoId); await close();
  await c.locator('[data-filter="production"]').click(); assert.match(await c.locator('.projects-table tbody').innerText(),/Client QA[\s\S]*In Revision/);
  for(let round=1;round<=2;round++) {
    await a.evaluate(async id=>{let v=FijlyMock.get('videos',id);await FijlyMock.setRevisionStatus(FijlyMock.activeRevision(v).id,'In Revision');v=FijlyMock.get('videos',id);await FijlyMock.addVersion(id,'qa-v'+(v.versions.length+1)+'.mp4','Revised cut');await FijlyMock.setVideoStatus(id,'Draft Ready');await FijlyMock.setVideoStatus(id,'Client Review');},videoId);
    await sync(c); await c.waitForFunction(({id,n})=>FijlyMock.get('videos',id).versions.length===n&&FijlyMock.get('videos',id).status==='Client Review',{id:videoId,n:round+1}); await c.locator('[data-filter="review"]').click(); await c.getByRole('button',{name:request.title,exact:true}).click();
    if(round===1) { await c.getByRole('button',{name:'Request revision',exact:true}).click(); await c.locator('#wf-feedback').fill('Use the shorter closing CTA.'); await c.locator('#workflow-editor').getByRole('button',{name:'Send revision request',exact:true}).click(); await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='In Revision',videoId); await sync(a); await a.waitForFunction(id=>FijlyMock.rounds(FijlyMock.get('videos',id)).length===2,videoId); await close(); }
  }
  await c.getByRole('button',{name:'Approve video',exact:true}).click(); await c.locator('#workflow-confirm').getByRole('button',{name:'Cancel',exact:true}).click(); assert.match(await c.locator('#workflow-detail').innerText(),/Client Review/);
  await c.getByRole('button',{name:'Approve video',exact:true}).click(); await c.locator('#workflow-confirm').getByRole('button',{name:'Confirm',exact:true}).click();
  await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='Approved',videoId); await sync(a); await a.waitForFunction(id=>FijlyMock.get('videos',id).status==='Approved',videoId); await a.evaluate(id=>FijlyMock.setVideoStatus(id,'Completed'),videoId);
  await sync(c); await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='Completed',videoId); assert.match(await c.locator('#workflow-detail').innerText(),/Final delivery/); assert.equal(await c.locator('.workflow-version').count(),3); assert.match(await c.locator('#workflow-detail').innerText(),/Slow the reporting sequence/); assert.match(await c.locator('#workflow-detail').innerText(),/shorter closing CTA/); await scan('completed video history'); await close();
  checks.push('Client request reaches the Admin portal through the database; New Request through Completed with studio steps in the Admin portal; two revision rounds, V1–V3, feedback retained; approval/cancel and final delivery; no Admin controls');
  await route('assets'); await c.locator('#client-asset-search').fill('does-not-exist'); assert.match(await c.locator('[data-client-assets]').innerText(),/No matching/); await c.locator('#client-asset-search').fill('');
  await c.locator('[data-client-assets] button').first().click(); await scan('asset details'); await c.locator('#client-asset-detail .admin-dialog-head button').click();
  await c.locator('#client-add-asset').click(); await c.locator('#client-asset-file').setInputFiles({name:'client-brand.txt',mimeType:'text/plain',buffer:Buffer.from('brand')}); await scan('add simulated asset'); await c.getByRole('button',{name:'Save asset',exact:true}).click(); await c.waitForFunction(()=>FijlyData.client.records('assets').some(x=>x.name==='client-brand.txt')); await sync(a); await a.waitForFunction(()=>FijlyMock.state.assets.some(x=>x.name==='client-brand.txt'&&x.client==='northbeam'));
  // Another client's asset never reaches this workspace (RLS).
  await a.evaluate(()=>FijlyMock.saveAsset({name:'foreign-only.txt',client:'layerbase',category:'Other'})); await sync(c); assert.equal(await c.evaluate(()=>FijlyMock.state.assets.some(x=>x.name==='foreign-only.txt')),false); assert.doesNotMatch(await c.locator('#screen-assets').innerText(),/foreign-only/);
  await route('scripts'); const scriptId=await c.locator('#client-script-select').inputValue(); await c.locator('#client-script-revision').fill('Lead with the product benefit.'); await c.getByRole('button',{name:'Request script revision',exact:true}).click(); await c.waitForFunction(()=>document.querySelector('#client-script-status').textContent==='Revision Requested'); assert.match(await c.locator('#client-script-feedback').innerText(),/Lead with/); await c.reload({waitUntil:'domcontentloaded'}); assert.equal(await c.evaluate(id=>FijlyMock.client.get('scripts',id).status,scriptId),'Revision Requested');
  // The feedback is stored with the script's video and shown to the studio.
  await sync(a); assert.ok(await a.evaluate(id=>FijlyMock.get('scripts',id).feedback.some(f=>/Lead with/.test(f.text)),scriptId));
  const relatedTitle=await c.evaluate(()=>FijlyMock.requestFor(FijlyMock.get('videos',FijlyMock.client.get('scripts',document.querySelector('#client-script-select').value).videoId)).title);await c.locator('#client-script-video').click(); assert.equal(await c.locator('#workflow-detail-title').innerText(),relatedTitle); await close();
  const pendingScript=await c.evaluate(()=>FijlyMock.client.records('scripts').find(s=>s.status==='Client Review').id);
  await c.locator('#client-script-select').selectOption(pendingScript);
  await c.locator('#client-script-revision').fill('Keep this unsaved feedback');
  await a.evaluate(()=>FijlyMock.saveAsset({name:'script-edit-broadcast.txt',client:'northbeam',category:'Other'}));
  await sync(c); await c.waitForFunction(()=>FijlyMock.state.assets.some(x=>x.name==='script-edit-broadcast.txt'));
  assert.equal(await c.locator('#client-script-revision').inputValue(),'Keep this unsaved feedback');
  await c.getByRole('button',{name:'Approve script',exact:true}).click();
  await c.waitForFunction(id=>FijlyMock.client.get('scripts',id).status==='Approved',pendingScript); await sync(a); await a.waitForFunction(id=>FijlyMock.get('scripts',id).status==='Approved',pendingScript);
  checks.push('Assets search, details, create and Admin visibility; foreign assets never visible; script review, related video, saved feedback visible to the studio; unsaved feedback survives a refresh');
  await route('settings'); await c.locator('#client-company').fill('Northbeam QA'); await c.locator('#client-contact').fill('Alex QA'); await c.locator('#client-email').fill('alex.qa@example.com'); await c.locator('#set-length').selectOption('30–45 sec'); await c.locator('#client-default-platform').selectOption('YouTube');
  await a.evaluate(()=>FijlyMock.saveAsset({name:'broadcast.txt',client:'northbeam',category:'Other'})); await sync(c); await c.waitForFunction(()=>FijlyMock.state.assets.some(x=>x.name==='broadcast.txt')); assert.equal(await c.locator('#client-company').inputValue(),'Northbeam QA');
  await c.getByRole('button',{name:'Save settings',exact:true}).click(); await c.waitForFunction(()=>/saved/.test(document.querySelector('#client-settings-note').textContent)); await sync(a); await a.waitForFunction(()=>FijlyMock.get('clients','northbeam').name==='Northbeam QA'); await c.reload({waitUntil:'domcontentloaded'}); assert.equal(await c.locator('#client-company').inputValue(),'Northbeam QA'); assert.equal(db.client_settings.find(s=>s.client_id==='northbeam').default_platform,'YouTube');
  await c.locator('#client-company').fill('Discard me'); await c.locator('#client-discard-settings').click(); assert.equal(await c.locator('#client-company').inputValue(),'Northbeam QA'); await route('requests'); assert.equal(await c.locator('#req-length').inputValue(),'30–45 sec'); assert.equal(await c.locator('#req-platform').inputValue(),'YouTube');
  checks.push('Workspace details and request defaults persist in the database; request defaults applied; unsaved settings survive a refresh; discard restores values');
  await route('analytics'); assert.equal(await c.locator('#client-analytics-kpis .stat-card__value').first().innerText(),'2'); assert.doesNotMatch(await c.locator('#client-delivery-chart').innerText(),/Date not recorded/); assert.match(await c.locator('#client-delivery-chart').innerText(),/Sep 2026/); assert.match(await c.locator('#client-production-time').innerText(),/2 deliveries/);
  // Workspace isolation: RLS returns only Northbeam's records, and the client
  // view refuses foreign IDs even if one were known.
  const foreign=db.videos.find(v=>v.client_id!=='northbeam'), foreignAssets=db.assets.filter(a=>a.client_id!=='northbeam').map(a=>a.name), foreignScripts=db.scripts.filter(s=>s.client_id!=='northbeam').map(s=>s.title);
  const scoped=await c.evaluate(async id=>{const f=FijlyMock.client;let rejected=0;for(const call of [()=>f.get('videos',id),()=>FijlyWorkflow.open('videos',id),()=>f.approve(id),()=>f.revise(id,'x')])try{await call()}catch(_){rejected++}return {rejected,clients:FijlyMock.state.clients.map(x=>x.id),videos:f.records('videos').length,completed:f.records('videos').filter(v=>v.status==='Completed').length,ownVideos:FijlyMock.state.videos.every(v=>FijlyMock.requestFor(v).client==='northbeam')};},foreign.id);
  assert.equal(scoped.rejected,4); assert.deepEqual(scoped.clients,['northbeam']); assert.equal(scoped.ownVideos,true);
  await route('analytics'); assert.equal(await c.locator('#client-analytics-kpis .stat-card__value').first().textContent(),String(scoped.completed));
  const assets=await c.locator('#screen-assets').textContent(),scripts=await c.locator('#screen-scripts').textContent(); for(const name of foreignAssets) assert.ok(!assets.includes(name),'asset isolation: '+name); for(const title of foreignScripts) assert.ok(!scripts.includes(title),'script isolation: '+title);
  await route('overview'); assert.equal(await c.locator('.project-card:not([hidden])').count(),Math.min(scoped.videos,4));
  checks.push('Workspace isolation: only Northbeam records load, foreign IDs are refused for detail and mutations, no foreign assets or scripts render, analytics derive from owned records');
  fs.mkdirSync('qa/screenshots',{recursive:true});
  for(const width of [1440,1024,768,390,320]) {
    await c.setViewportSize({width,height:900});
    for(const name of ['overview','projects','requests','assets','scripts','analytics','settings']) {
      await route(name); assert.equal(await c.locator('.screen:visible').count(),1); assert.equal(await c.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${width} overflow`);
      if([1440,390].includes(width)) { await scan(`${name}/${width}`); await c.screenshot({path:`qa/screenshots/client-${name}-${width}.png`,fullPage:true}); }
    }
    checks.push(`${width}px: all seven client routes, no page overflow`);
  }
  fs.writeFileSync('qa/studio-client-results.json',JSON.stringify({checks,scans,errors},null,2));
  await browser.close(); assert.deepEqual(errors,[]); assert.ok(scans.every(s=>!s.violations.length),JSON.stringify(scans.filter(s=>s.violations.length))); console.log(JSON.stringify({checks,scans:scans.length,errors},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
