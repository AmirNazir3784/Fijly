const {chromium,base,routes,widths}=require('./runtime.cjs'),assert=require('assert/strict'),fs=require('fs');
/* Both portals read and write Supabase through FijlyData (Parts 3A/3B). Admin
   pages act as the admin user, Client pages as the Northbeam client user, on
   one test database. Each tab refreshes to see changes made elsewhere. */
(async()=>{
 const b=await chromium.launch(),ctx=await b.newContext(),p=await ctx.newPage(),q=await ctx.newPage(),errors=[],requests=[],cancelledResources=new Set(),checks=[],scans=[];
 for(const page of [p,q]){page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)requests.push(r.url());});page.on('requestfailed',r=>{if(r.failure().errorText==='net::ERR_ABORTED')cancelledResources.add(r.url());else requests.push(r.url()+': '+r.failure().errorText);});}
 const load=async(page,portal,route)=>page.goto(base+portal+'.html#'+route,{waitUntil:'load'});
 const scan=async(label)=>{await p.addScriptTag({path:'qa/axe.min.js'});scans.push({label,violations:await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})))});};
 await load(p,'admin','dashboard');await load(q,'studio','overview');
  // Client write guards: invalid input is refused before anything is written.
  const validation=await q.evaluate(async()=>{const f=FijlyData.client,input={title:'Guard test',instructions:'A clear brief',platform:'Website',videoType:'Tutorial',priority:'Normal',deadline:'2026-10-01'},out={};
   const rejects=async(name,fn)=>{try{await fn();out[name]=false;}catch(e){out[name]=!!e.message;}};
   // Clients may no longer insert requests: every project goes through submit_project.
   await rejects('in-portal request creation retired',()=>f.createRequest(input));
   const submit=args=>supabaseClient.rpc('submit_project',Object.assign({p_title:'Guard test',p_video_type:'Tutorial / Onboarding',p_duration:60,p_brief:'A clear brief for the guard test.'},args));
   const refuses=async(name,args)=>{out[name]=!!(await submit(args)).error;};
   await refuses('unknown video type',{p_video_type:'Tutorial'});
   await refuses('unknown length',{p_duration:45});
   await refuses('empty brief',{p_brief:'   '});
   await refuses('script promised but not uploaded',{p_has_script:true});
   await refuses('voice over promised but not uploaded',{p_has_voice_over:true});
   await refuses('file outside the client folder',{p_has_script:true,p_script_file_path:'someone-else/project-files/x.pdf'});
   out['direct request insert refused']=!!(await supabaseClient.from('requests').insert({client_id:'northbeam',title:'Direct',video_type:'SaaS Explainer'})).error;
   await rejects('invalid workspace email',()=>f.saveProfile({...f.current(),...f.preferences(),email:'invalid'}));
   await rejects('invalid default length',()=>f.saveProfile({...f.current(),...f.preferences(),defaultLength:'bogus'}));
   await rejects('approve outside review',()=>f.approve(f.records('videos').find(v=>v.status!=='Client Review').id));
   await rejects('script review outside Client Review',()=>f.reviewScript(f.records('scripts').find(s=>s.status!=='Client Review').id,'Approved'));
   // A valid project is saved, priced by the database and opened Awaiting Payment.
   const created=await submit({p_attachment_names:['brief.txt']});
   out['valid project saved']=!created.error&&!!created.data;
   if(created.data){await FijlyData.load();const saved=f.get('requests',created.data);
    out['priced server-side']=saved.prices.total===500&&saved.prices.base===500;
    out['opens awaiting payment']=saved.stage==='Awaiting Payment'&&saved.status==='Submitted';
    out['attachment names kept']=saved.attachments.length===1&&saved.attachments[0].name==='brief.txt';
    out['three milestones created']=f.paymentsFor(created.data).map(p=>p.percent).join(',')==='15,45,40';}
   return out;});
  assert.ok(Object.values(validation).every(Boolean),JSON.stringify(validation));checks.push({validation});
 // The same guards on the Supabase data service (Admin portal): invalid input
 // is refused before anything is written.
 const dbValidation=await p.evaluate(async()=>{const api=FijlyData,out={};
  const rejects=async(name,fn)=>{try{await fn();out[name]=false;}catch(e){out[name]=!!e.message;}};
  await rejects('invalid client email',()=>api.saveClient({name:'Invalid',contact:'Test',email:'invalid',status:'Active'}));
  await rejects('invalid client website',()=>api.saveClient({name:'Invalid site',contact:'Test',email:'t@example.com',website:'javascript:alert(1)',status:'Active'}));
  await rejects('invalid studio email',()=>api.saveSettings({studioEmail:'invalid'}));
  await rejects('fractional turnaround',()=>api.saveSettings({defaultLeadDays:1.5}));
  await rejects('invalid length',()=>api.saveSettings({defaultLength:'bogus'}));
  const completed=api.state.videos.find(v=>v.status==='Completed');
  for(const [name,fn] of [['completed version',()=>api.addVersion(completed.id)],['completed revision',()=>api.requestRevision(completed.id,'text')],['completed transition',()=>api.setVideoStatus(completed.id,'In Production')],['completed request edit',()=>api.updateRequest(completed.requestId,{title:'bad'})]])await rejects(name,fn);
  const pending=api.pendingRequests('northbeam')[0];const v=await api.produce(pending.id);out['production idempotent']=(await api.produce(pending.id)).id===v.id;
  await rejects('no draft review',()=>api.setVideoStatus(v.id,'Client Review'));await rejects('no draft ready',()=>api.setVideoStatus(v.id,'Draft Ready'));
  let called=0;const unsubscribe=api.subscribe(()=>called++);unsubscribe();await api.saveSettings({studioName:'QA studio'});out['unsubscribe works']=called===0;return out;});
 assert.ok(Object.values(dbValidation).every(Boolean),JSON.stringify(dbValidation));checks.push({dbValidation});
 // Idempotent production leaves exactly one video per request in the database.
 const perRequest=b.fijlyDb.videos.reduce((m,v)=>m.set(v.request_id,(m.get(v.request_id)||0)+1),new Map());assert.ok([...perRequest.values()].every(n=>n===1),'one video per request');
  // Two client tabs submitting at the same moment both persist.
  await load(p,'studio','overview');
  // Two tabs submitting at the same time: submit_project is the only way in,
  // and each call must produce exactly one project with its own payments.
  await Promise.all([p,q].map((page,i)=>page.evaluate(async i=>{
   const r=await supabaseClient.rpc('submit_project',{p_title:'Concurrent tab '+i,p_video_type:'Tutorial / Onboarding',p_duration:30,p_brief:'A brief for the concurrent submission test.',p_purpose:'Check concurrency.',p_target_audience:'The QA suite.'});
   if(r.error)throw new Error(r.error.message);
   await FijlyData.load();
  },i)));
  assert.equal(b.fijlyDb.requests.filter(r=>/^Concurrent tab /.test(r.title)).length,2);
  for(const page of [p,q]){await page.evaluate(()=>FijlyData.load());assert.equal(await page.evaluate(()=>FijlyData.client.records('requests').filter(r=>/^Concurrent tab /.test(r.title)).length),2);}
  checks.push('Two client tabs submitting at once both persist; each tab sees both after a refresh');
 await load(p,'admin','dashboard');
 // Dynamic filter options and a live client profile asset count.
 const newClient=await p.evaluate(()=>FijlyMock.saveClient({name:'QA new client',contact:'QA',email:'qa@example.com',status:'Active'}).then(c=>c.id));
 await load(p,'admin','requests');assert.ok((await p.locator('[data-workflow-list="requests"] [data-filter="client"] option').allTextContents()).includes('QA new client'));
 await p.evaluate(()=>FijlyMock.saveClient({name:'QA live option',contact:'QA',email:'live@example.com',status:'Active'}));assert.ok((await p.locator('[data-workflow-list="requests"] [data-filter="client"] option').allTextContents()).includes('QA live option'));
 await load(p,'admin','clients');await p.locator('#client-rows [data-client="northbeam"]').first().click();const assetsBefore=await p.evaluate(()=>FijlyMock.assetsFor('northbeam').length);
 // An asset added elsewhere (written straight to the database) appears once the data refreshes.
 b.fijlyDb.assets.push({id:'cross-tab-profile',client_id:'northbeam',name:'cross-tab-profile.txt',category:'Other',file_type:'txt',file_size:12,file_url:null,notes:'',uploaded_by:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 await p.evaluate(()=>FijlyData.load());await p.waitForFunction(n=>document.querySelector('#client-detail-body').textContent.includes(n+' files'),assetsBefore+1);await p.keyboard.press('Escape');
 await load(p,'admin','assets');await p.locator('#asset-search').fill('cross-tab-profile');await p.locator('#asset-rows button').first().click();await p.locator('#edit-asset').click();
 b.fijlyDb.assets=b.fijlyDb.assets.filter(a=>a.id!=='cross-tab-profile');await p.evaluate(()=>FijlyData.load());
 await p.waitForFunction(()=>!document.querySelector('#asset-editor').open);assert.match(await p.locator('#asset-save-status').innerText(),/removed in another tab/);
 checks.push('New client filters refresh, profile asset count updates on refresh, a deletion made elsewhere closes the stale asset editor');
 // Long text must wrap in cards and dialogs without page overflow.
 await load(q,'studio','requests');
  const longId=await q.evaluate(async()=>{const r=await supabaseClient.rpc('submit_project',{p_title:'LongTitle'.repeat(13),p_video_type:'Tutorial / Onboarding',p_duration:120,p_brief:'Instructions'.repeat(250),p_purpose:'Purpose'.repeat(80),p_target_audience:'Audience'.repeat(80),p_brand_colors:'Colour'.repeat(40)});if(r.error)throw new Error(r.error.message);await FijlyData.load();return r.data;});
  await q.waitForFunction(()=>FijlyData.client.records('requests').some(r=>r.title.startsWith('LongTitle')));
  assert.equal(b.fijlyDb.requests.filter(r=>r.title.startsWith('LongTitle')).length,1,'one project per submission');
  await p.evaluate(()=>FijlyData.load());await p.evaluate(id=>FijlyWorkflow.open('requests',id),longId);
 for(const width of widths){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'long dialog '+width);assert.equal(await p.locator('#workflow-detail').evaluate(d=>d.scrollWidth>d.clientWidth+1),false,'dialog internal overflow '+width);}
 await scan('long request detail mobile');await p.keyboard.press('Escape');
 checks.push('Long title/instructions, repeated submit and dialog wrapping at all five widths');
 await p.setViewportSize({width:1440,height:900});await load(p,'studio','projects');
 await p.getByRole('button',{name:'CloudDesk / Homepage explainer',exact:true}).click();await p.getByRole('button',{name:'Approve video',exact:true}).click();await p.locator('#workflow-confirm').getByRole('button',{name:'Confirm',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#workflow-detail').contains(document.activeElement)&&document.activeElement.checkVisibility());
 await p.locator('#workflow-detail .admin-dialog-head button').click();await p.waitForFunction(()=>document.activeElement!==document.body&&document.activeElement.checkVisibility()&&!document.activeElement.closest('dialog'));
 await p.getByRole('button',{name:'CloudDesk / Homepage explainer',exact:true}).click();await p.evaluate(()=>location.hash='analytics');await p.waitForFunction(()=>!document.querySelector('dialog[open]'));
 checks.push('Approval/close returns visible keyboard focus; route changes close modal details');
  // (The session mock and its malformed-session scenarios were retired with
  // Part 3B; the portals now render whatever RLS returns from the database.)
 // An empty studio database: every Admin screen renders, and assets need a client first.
 {const eb=await chromium.launch();for(const key of Object.keys(eb.fijlyDb))if(!['profiles','admin_settings'].includes(key))eb.fijlyDb[key]=[];
  const page=await eb.newPage();page.on('pageerror',e=>errors.push('empty-db: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('empty-db: '+m.text());});
  for(const screen of routes.admin){await load(page,'admin',screen);assert.equal(await page.locator('.screen:visible').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'empty-db/'+screen);}
  await load(page,'admin','assets');await page.locator('[data-add-asset]').click();assert.match(await page.locator('#asset-save-status').innerText(),/Add a client/);
  await load(page,'admin','dashboard');assert.deepEqual(await page.locator('#admin-stats .stat-card__value').allInnerTexts(),['00','00','00','00','00']);
  await eb.close();checks.push('Empty database: all 11 Admin screens render, Dashboard shows zeros, assets ask for a client first');}
 // IDs, relationships, status/round/version consistency across the exercised state.
 const integrity=await p.evaluate(()=>{const s=FijlyMock.state,issues=[];for(const key of ['clients','requests','videos','revisions','assets','scripts'])if(new Set(s[key].map(r=>r.id)).size!==s[key].length)issues.push(key+' duplicate IDs');for(const r of s.requests)if(!s.clients.some(c=>c.id===r.client))issues.push('orphan request');for(const v of s.videos){if(!s.requests.some(r=>r.id===v.requestId))issues.push('orphan video');if(new Set(v.versions.map(x=>x.number)).size!==v.versions.length)issues.push('duplicate versions');for(const round of FijlyMock.rounds(v))if(!v.feedback.some(f=>f.id===round.feedbackId&&f.version===round.baseVersion))issues.push('revision feedback ownership');}for(const script of s.scripts){const v=s.videos.find(v=>v.id===script.videoId);if(!v||FijlyMock.requestFor(v).client!==script.client)issues.push('script ownership');}return issues;});assert.deepEqual(integrity,[]);
 await p.setViewportSize({width:1440,height:900});await load(p,'admin','analytics');await p.locator('#analytics-range').selectOption('all');await p.locator('#analytics-client').selectOption('linearwave');assert.equal(await p.locator('#analytics-kpis .stat-card__value').first().innerText(),'00');assert.equal(await p.locator('#analytics-kpis .stat-card__value').nth(6).innerText(),'6.3d');
 checks.push('Integrity checks pass; inactive-client analytics and seeded completion dates are accurate');
 for(const width of widths){await p.setViewportSize({width,height:900});await load(p,'admin','assets');if(width>600){assert.ok(await p.locator('.admin-assets-table').evaluate(t=>t.offsetWidth>=1100));assert.ok(await p.locator('#asset-rows tr').first().evaluate(r=>r.offsetHeight<200));}else{assert.equal(await p.locator('.admin-assets-table').evaluate(t=>getComputedStyle(t).display),'block');assert.ok(await p.locator('.admin-assets-table').evaluate(t=>t.scrollWidth<=t.clientWidth+1));}assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await load(p,'admin','analytics');assert.ok(await p.locator('#screen-analytics .table').evaluate(t=>t.offsetWidth>=650));}
 checks.push('Assets use cards on mobile and tables on desktop; analytics retain readable columns');
 // Navigation or re-render can cancel lazy images. Verify those URLs directly;
 // never count a missing resource as an expected navigation cancellation.
 for(const url of cancelledResources){const response=await ctx.request.get(url);assert.ok(response.ok(),'Cancelled resource is unavailable: '+url);}
 const cancelledResourcesChecked=[...cancelledResources];
 fs.writeFileSync('qa/studio-stability-results.json',JSON.stringify({checks,scans,errors,failedRequests:requests,cancelledResourcesChecked,integrity},null,2));await b.close();assert.deepEqual(errors.filter(e=>!/status of (400|403)/.test(e)),[],'only the deliberate refusals (RLS 403, guard 400) may log an error');assert.deepEqual(requests.filter(url=>!/\/rest\/v1\/(requests|rpc\/submit_project)$/.test(url)),[],'only the deliberate refusals may fail');assert.ok(scans.every(s=>!s.violations.length),JSON.stringify(scans));console.log(JSON.stringify({checks,scans:scans.length,errors,failedRequests:requests,cancelledResourcesChecked},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
