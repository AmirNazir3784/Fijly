/* Round B behavior and browser regression coverage. Uses only the shared mock. */
const {chromium, base}=require('./runtime.cjs');
const assert=require('assert/strict'),fs=require('fs');
(async()=>{
  const browser=await chromium.launch(),ctx=await browser.newContext(),a=await ctx.newPage(),c=await ctx.newPage();
  const errors=[],checks=[],scans=[];
  for(const p of [a,c]){p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
  const go=(p,portal,screen)=>p.goto(base+portal+'.html#'+screen);
  const scan=async(p,label)=>{await p.addScriptTag({path:'qa/axe.min.js'});scans.push({label,violations:await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})))});};
  await go(a,'admin','dashboard');await go(c,'studio','overview');
  const seed=await a.evaluate(()=>JSON.parse(JSON.stringify(FijlyMock.state)));
  async function checkQueue(){
    const data=await a.evaluate(()=>{
      const s=FijlyMock.state,actions=FijlyMock.adminActions();
      const expected={requests:s.requests.filter(r=>['Submitted','Under Review'].includes(r.status)&&!s.videos.some(v=>v.requestId===r.id)).length,revisions:s.revisions.filter(r=>['Revision Requested','In Revision','Draft Ready'].includes(r.status)).length,scripts:s.scripts.filter(s=>['Draft','Revision Requested'].includes(s.status)).length,videos:s.videos.filter(v=>v.status==='Approved'||v.status==='Draft Ready'&&!s.revisions.some(r=>r.videoId===v.id&&r.status!=='Resolved')).length};
      return {expected,actions,rows:document.querySelectorAll('[data-action-id]').length,badges:Object.fromEntries([...document.querySelectorAll('[data-action-badge]')].map(b=>[b.dataset.actionBadge,{count:Number(b.textContent),hidden:b.hidden}]))};
    });
    assert.equal(data.rows,Object.values(data.expected).reduce((x,y)=>x+y,0));
    assert.equal(new Set(data.actions.map(x=>x.section+'/'+x.id)).size,data.rows);
    for(const [key,value] of Object.entries(data.expected)){assert.equal(data.badges[key].count,value);assert.equal(data.badges[key].hidden,value===0);}
    return data;
  }
  await checkQueue();
  assert.equal(await c.locator('.studio-topbar .search, [aria-label="Notifications (unread)"], .storyboard .btn-dashed, .page-head--overview > button').count(),0);
  assert.match(await c.locator('#preview-message').innerText(),/Draft ready for review/);
  const deadline=await a.locator('#admin-priorities tr').first().locator('button').first().textContent();
  await a.locator('#admin-priorities tr').first().locator('button').first().click();assert.equal(await a.locator('#workflow-detail-title').innerText(),deadline);assert.equal(await a.locator('#client-detail').evaluate(d=>d.open),false);await a.keyboard.press('Escape');
  for(const kind of ['requests','revisions','scripts']){
    const link=a.locator('[data-action-section="'+kind+'"]').first();if(await link.count()){const title=await link.textContent();await link.click();assert.match(await a.locator(kind==='scripts'?'#script-detail-title':'#workflow-detail-title').textContent(),new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await a.keyboard.press('Escape');}
  }
  checks.push('One derived queue, matching live badges, direct record links and deadline navigation; inactive controls removed; Overview notification preserved');
  await go(a,'admin','requests');assert.equal(await a.locator('[data-workflow-list="requests"] [data-filter="status"]').inputValue(),'action');assert.equal(await a.locator('#screen-requests tbody tr').count(),3);
  await a.locator('#screen-requests [data-filter="status"]').selectOption('all');assert.equal(await a.locator('#screen-requests tbody tr').count(),seed.requests.length);
  assert.notEqual(await a.evaluate(()=>FijlyMock.statusClass('Submitted')),await a.evaluate(()=>FijlyMock.statusClass('In Production')));
  await go(c,'studio','requests');await c.getByRole('button',{name:'Submit request',exact:true}).click();assert.equal(await c.locator('#req-name').getAttribute('aria-invalid'),'true');assert.equal(await c.locator('#req-brief-error').isVisible(),true);
  await c.locator('#req-name').fill('Round B request');await c.locator('#req-brief').fill('A useful walkthrough.');await c.locator('#req-references').fill('example.com');await c.getByRole('button',{name:'Submit request',exact:true}).click();assert.equal(await c.locator('#req-references-error').isVisible(),true);assert.equal(await c.locator('#req-references').evaluate(e=>e.nextElementSibling.id),'req-references-error');await scan(c,'inline submission errors');
  await c.locator('#req-references').fill('https://example.com/reference');await c.getByRole('button',{name:'Submit request',exact:true}).click();assert.match(await c.locator('[data-request-note]').innerText(),/Request submitted/);assert.doesNotMatch(await c.locator('[data-request-note]').innerText(),/Admin|internal/);assert.equal(await c.locator('[data-request-note]').getAttribute('class'),'workflow-notice');assert.equal(await c.locator('[aria-invalid="true"]').count(),0);
  await a.waitForFunction(()=>FijlyMock.state.requests.some(r=>r.title==='Round B request'));await checkQueue();
  const produced=await a.evaluate(()=>FijlyMock.produce(FijlyMock.state.requests.find(r=>r.title==='Round B request').id).id);await c.waitForFunction(id=>FijlyMock.state.videos.some(v=>v.id===id),produced);
  checks.push('Needs-review default and all-record filter; distinct shared status tones; success banner and field-level errors; immediate cross-tab synchronization');
  await go(c,'studio','assets');assert.equal(await c.locator('[data-asset-group]').count(),0);const ownedAssets=await c.evaluate(()=>FijlyMock.client.records('assets').length);assert.equal(await c.locator('[data-client-assets] button').count(),ownedAssets);
  assert.equal(await c.locator('#client-asset-category option').count(),9);
  assert.deepEqual(await c.evaluate(()=>[1024,1048576,1572864,0].map(FijlyMock.formatBytes)),['1.0 KB','1.0 MB','1.5 MB','0 KB']);
  await c.locator('#client-asset-category').selectOption('Other');await c.locator('#client-asset-search').fill('missing-file');assert.equal(await c.locator('[data-client-assets] button').count(),0);
  await c.locator('#client-add-asset').click();await c.locator('#client-asset-file').setInputFiles({name:'round-b-brand.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(1572864)});await c.locator('#client-asset-kind').selectOption('Reference Files');await c.getByRole('button',{name:'Save asset',exact:true}).click();assert.match(await c.locator('#client-asset-success').innerText(),/round-b-brand.pdf added/);assert.equal(await c.locator('[data-client-assets] button').filter({hasText:'round-b-brand.pdf'}).count(),1);assert.match(await c.locator('[data-client-assets]').innerText(),/1.5 MB/);
  await c.locator('#client-asset-category').selectOption('Reference Files');await c.locator('#client-asset-search').fill('round-b-brand');assert.equal(await c.locator('[data-client-assets] button').count(),1);
  await a.waitForFunction(()=>FijlyMock.state.assets.some(x=>x.name==='round-b-brand.pdf'));await go(a,'admin','assets');await a.locator('#asset-search').fill('round-b-brand');await a.locator('#asset-rows button').first().click();assert.match(await a.locator('#delete-asset').getAttribute('class'),/btn-danger/);await a.locator('#delete-asset').click();assert.equal(await a.locator('#asset-confirm').evaluate(d=>d.open),true);assert.match(await a.locator('#asset-confirm-ok').getAttribute('class'),/btn-danger/);await a.locator('#asset-confirm-cancel').click();await a.keyboard.press('Escape');
  checks.push('Assets shown once, all categories searchable, shared KB/MB formatting and add feedback; destructive removal styling and confirmation preserved');
  await go(c,'studio','scripts');const scriptId=await a.evaluate(id=>FijlyMock.state.scripts.find(s=>s.videoId===id).id,produced);assert.equal(await c.locator('#client-script-select option[value="'+scriptId+'"]').count(),0);
  await a.evaluate(id=>FijlyMock.adminSendScriptForReview(id),scriptId);await c.waitForFunction(id=>!!document.querySelector('#client-script-select option[value="'+id+'"]'),scriptId);await c.locator('#client-script-select').selectOption(scriptId);assert.match(await c.locator('#client-script-actions').innerText(),/Needs your review/);
  await c.locator('#client-script-revision').fill('Clarify the opening scene.');await c.getByRole('button',{name:'Request script revision',exact:true}).click();await a.waitForFunction(id=>FijlyMock.get('scripts',id).status==='Revision Requested',scriptId);await checkQueue();
  await a.evaluate(id=>FijlyMock.adminReviewScript(id),scriptId);await c.waitForFunction(id=>!document.querySelector('#client-script-select option[value="'+id+'"]'),scriptId);await checkQueue();
  await a.evaluate(id=>FijlyMock.adminSendScriptForReview(id),scriptId);await c.waitForFunction(id=>!!document.querySelector('#client-script-select option[value="'+id+'"]'),scriptId);await c.locator('#client-script-select').selectOption(scriptId);assert.match(await c.locator('#client-script-feedback').innerText(),/Clarify the opening/);assert.equal(await a.evaluate(id=>FijlyMock.get('scripts',id).version,scriptId),2);
  await c.getByRole('button',{name:'Approve script',exact:true}).click();assert.match(await c.locator('#client-script-actions').innerText(),/review is complete/);assert.equal(await c.getByRole('button',{name:'Approve script',exact:true}).count(),0);await a.waitForFunction(id=>FijlyMock.get('scripts',id).status==='Approved',scriptId);await checkQueue();
  await c.evaluate(()=>FijlyMock.client.select('relay'));assert.match(await c.locator('#screen-scripts').innerText(),/No scripts ready for review/);await c.evaluate(()=>FijlyMock.client.select('northbeam'));
  checks.push('Unshared drafts hidden, shared scripts marked for review, approval completed, useful empty state and live visibility updates');
  await a.evaluate(id=>{FijlyMock.addVersion(id);FijlyMock.setVideoStatus(id,'Draft Ready');},produced);await checkQueue();
  await go(a,'admin','dashboard');await a.locator('[data-action-section="videos"][data-action-id="'+produced+'"]').click();assert.equal(await a.locator('#workflow-detail-title').innerText(),'Round B request');await a.keyboard.press('Escape');
  await a.evaluate(id=>FijlyMock.setVideoStatus(id,'Client Review'),produced);await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='Client Review',produced);
  await c.evaluate(id=>FijlyMock.client.revise(id,'Use a clearer opening.'),produced);await a.waitForFunction(id=>FijlyMock.get('videos',id).status==='In Revision',produced);await checkQueue();
  await a.evaluate(id=>{const revision=FijlyMock.activeRevision(FijlyMock.get('videos',id));FijlyMock.setRevisionStatus(revision.id,'In Revision');FijlyMock.addVersion(id);FijlyMock.setVideoStatus(id,'Draft Ready');},produced);await checkQueue();
  await a.evaluate(id=>FijlyMock.setVideoStatus(id,'Client Review'),produced);await c.waitForFunction(id=>FijlyMock.get('videos',id).status==='Client Review',produced);await checkQueue();
  await c.evaluate(id=>FijlyMock.client.approve(id),produced);await a.waitForFunction(id=>FijlyMock.get('videos',id).status==='Approved',produced);await checkQueue();
  await a.evaluate(id=>FijlyMock.setVideoStatus(id,'Completed'),produced);await checkQueue();assert.equal(await a.locator('[data-action-badge="videos"]').isVisible(),false);
  checks.push('Queue and badge counts track draft sharing, requested/in-progress revisions, client approval and final completion across tabs, including live zero state');
  // Frozen clock and boundary fixtures: old seeds, future dates, inclusive start,
  // current endpoint, all-time and client filters cannot inflate request counts.
  const analyticsCtx=await browser.newContext({timezoneId:'UTC'});
  await analyticsCtx.addInitScript(state=>sessionStorage.setItem('fijly-studio-workflow-v3',JSON.stringify(state)),seed);
  const p=await analyticsCtx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));await go(p,'admin','analytics');
  await p.evaluate(()=>{const s=FijlyMock.state;const sample=s.requests[0];['2026-10-15T00:00:00.000Z','2026-10-21T11:59:59.000Z','2026-10-21T12:00:01.000Z','2026-10-14T23:59:59.000Z'].forEach((at,i)=>s.requests.push({...sample,id:'range-'+i,requestedAt:at,status:'Submitted'}));});
  await p.locator('#analytics-range').selectOption('7');assert.equal(await p.locator('#analytics-kpis .stat-card__value').nth(1).innerText(),'02');assert.match(await p.locator('#analytics-scope').innerText(),/Oct 21, 2026/);
  await p.locator('#analytics-range').selectOption('all');assert.equal(Number(await p.locator('#analytics-kpis .stat-card__value').nth(1).innerText()),seed.requests.length+3);
  const production=await p.evaluate(()=>FijlyMock.state.videos.filter(v=>v.status==='In Production').length);assert.equal(Number(await p.locator('#analytics-kpis .stat-card__value').nth(2).innerText()),production);assert.equal(await p.locator('#analytics-stages li').filter({hasText:'In Production'}).locator('strong').innerText(),String(production));
  await p.locator('#analytics-client').selectOption('relay');assert.equal(await p.locator('#analytics-kpis .stat-card__value').nth(1).innerText(),'00');await analyticsCtx.close();checks.push('Analytics current endpoint, exact date boundaries, future exclusion, all-time/client scope and In Production breakdown agreement');
  // Empty queue must also hide every badge (and never persist derived state).
  const empty=structuredClone(seed);delete empty.clocks;empty.requests.forEach(r=>r.status='Completed');empty.videos.forEach(v=>v.status='Completed');empty.revisions.forEach(r=>r.status='Resolved');empty.scripts.forEach(s=>s.status='Approved');
  const emptyCtx=await browser.newContext();await emptyCtx.addInitScript(s=>sessionStorage.setItem('fijly-studio-workflow-v3',JSON.stringify(s)),empty);const e=await emptyCtx.newPage();await go(e,'admin','dashboard');assert.equal(await e.locator('[data-action-id]').count(),0);assert.equal(await e.locator('[data-action-badge]:not([hidden])').count(),0);assert.match(await e.locator('#admin-action-queue').innerText(),/All caught up/);await emptyCtx.close();checks.push('Empty action queue and zero-count badge state');
  fs.mkdirSync('qa/screenshots',{recursive:true});
  for(const width of [1440,390,375]){
    for(const [page,portal,routes] of [[a,'admin',['dashboard','requests','videos','revisions','scripts','assets']],[c,'studio',['projects','assets','scripts','requests']]]){
      await page.setViewportSize({width,height:900});
      for(const route of routes){await go(page,portal,route);await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,portal+'/'+route+'/'+width);
        if(width<=600)assert.equal(await page.locator('.screen:visible .table-hint:visible').count(),0);
        for(const table of await page.locator('.screen:visible .mobile-records').all()){
          assert.equal(await table.evaluate(t=>getComputedStyle(t).display),width<=600?'block':'table');
          if(width<=600){assert.equal(await table.evaluate(t=>t.scrollWidth>t.clientWidth+1),false);assert.equal(await table.locator('tbody td').first().getAttribute('data-label')===null,false);const button=table.locator('tbody button').first();if(await button.count()){await button.click();assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');}}
        }
        await scan(page,portal+'/'+route+'/'+width);await page.screenshot({path:'qa/screenshots/round-b-'+portal+'-'+route+'-'+width+'.png',fullPage:true});
      }
    }
  }
  checks.push('Desktop tables preserved; 375/390px labelled cards have no horizontal table/page scrolling, open records, and pass accessibility scans');
  const result={checks,scans,errors};fs.writeFileSync('qa/round-b-results.json',JSON.stringify(result,null,2));await browser.close();assert.deepEqual(errors,[]);assert.ok(scans.every(s=>!s.violations.length),JSON.stringify(scans));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
