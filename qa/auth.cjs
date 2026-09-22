/* Authentication: login page, portal guards, role routing, sign-out, session
   sync across tabs and failure states. Runs the real pinned Supabase SDK
   against the mocked Supabase endpoints in runtime.cjs. */
const {chromium,base,qaUsers,widths}=require('./runtime.cjs');
const assert=require('assert/strict'),fs=require('fs');
fs.mkdirSync('qa/screenshots',{recursive:true});
(async()=>{
  const browser=await chromium.launch(),checks=[],scans=[],errors=[];
  const watch=p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return p;};
  const fresh=async(as=null)=>{const ctx=await browser.newContext({fijlyAuth:as});return {ctx,page:watch(await ctx.newPage())};};
  const scan=async(p,label)=>{await p.addScriptTag({path:'qa/axe.min.js'});const violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>v.id));scans.push({label,violations});assert.deepEqual(violations,[],label);};
  const portalReady=p=>p.waitForFunction(()=>!document.getElementById('auth-loading')&&window.FIJLY_AUTH);
  const signIn=async(p,user,password=user.password)=>{await p.locator('#login-email').fill(user.email);await p.locator('#login-password').fill(password);await p.locator('#login-submit').click();};

  // 1. Signed out: both portals redirect to sign in; the portal never lifts.
  {const {ctx,page}=await fresh();
    for(const portal of ['studio','admin']){
      await page.goto(base+portal+'.html#settings');await page.waitForURL('**/login.html');
      await page.locator('#login-card[data-state="ready"]').waitFor();
    }
    const raw=await (await fetch(base+'studio.html')).text();
    assert.match(raw,/<div class="auth-loading" id="auth-loading"/);assert.match(raw,/id="studio" inert>/);
    await ctx.close();}
  checks.push('Signed out: studio.html and admin.html redirect to login.html; the portal starts inert under the loading overlay');

  // 2. Login page: form, labels, password toggle, wrong password, a11y, widths.
  {const {ctx,page}=await fresh();await page.goto(base+'login.html');await page.locator('#login-card[data-state="ready"]').waitFor();
    assert.equal(await page.locator('h1').innerText(),'Sign in to FIJLY Studio');
    assert.equal(await page.locator('#login-email').getAttribute('type'),'email');
    assert.equal(await page.locator('label[for="login-password"]').count(),1);
    assert.equal(await page.locator('.login__back').getAttribute('href'),'index.html');
    await page.locator('#login-password').fill('secret');await page.locator('#login-toggle').click();
    assert.equal(await page.locator('#login-password').getAttribute('type'),'text');assert.equal(await page.locator('#login-toggle').getAttribute('aria-pressed'),'true');
    await page.locator('#login-toggle').click();assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
    const before=errors.length;await signIn(page,qaUsers.admin,'wrong-password');
    await page.locator('#login-error:not([hidden])').waitFor();
    // The browser logs the rejected credentials request (400); that is the expected outcome.
    assert.deepEqual(errors.splice(before),['Failed to load resource: the server responded with a status of 400 (Bad Request)']);
    assert.match(await page.locator('#login-error').innerText(),/don’t match an account/);
    assert.equal(await page.locator('#login-submit').isDisabled(),false);assert.equal(await page.locator('#login-submit-label').innerText(),'Sign in');
    assert.match(page.url(),/login\.html$/);
    for(const width of widths){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'login overflow at '+width);
      if(width===1440||width===390){await scan(page,'login/'+width);await page.screenshot({path:`qa/screenshots/login-${width}.png`,fullPage:true});}}
    await ctx.close();}
  checks.push('Login form: labels, email type, show/hide toggle, wrong-password error with the button restored, no overflow at five widths, axe clean');

  // 3. Admin: sign in -> admin.html with the real name; sign out -> login.
  {const {ctx,page}=await fresh();await page.goto(base+'login.html');await page.locator('#login-card[data-state="ready"]').waitFor();
    await signIn(page,qaUsers.admin2);await page.waitForURL('**/admin.html');await portalReady(page);
    assert.equal(await page.locator('.sidebar-user__name').innerText(),'Morgan Blake');
    assert.equal(await page.locator('#set-admin-name').inputValue(),'Morgan Blake');
    assert.deepEqual(await page.evaluate(()=>window.FIJLY_AUTH),{userId:qaUsers.admin2.id,role:'admin',clientId:null,fullName:'Morgan Blake',email:'morgan@fijly.example'});
    // Mock data keeps working alongside auth.
    assert.equal(await page.locator('#admin-stats .stat-card').count(),4);
    await page.goto(base+'admin.html#requests');await portalReady(page);assert.ok(await page.locator('#screen-requests tbody tr').count()>0);
    // Already signed in: login.html forwards to the portal.
    await page.goto(base+'login.html');await page.waitForURL('**/admin.html');await portalReady(page);
    // Cross-tab: signing out in one tab sends the other to login.
    const other=watch(await ctx.newPage());await other.goto(base+'admin.html#clients');await portalReady(other);
    await page.locator('[data-sign-out]').click();await page.waitForURL('**/login.html');
    await other.waitForURL('**/login.html');
    await page.goto(base+'admin.html');await page.waitForURL('**/login.html');
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),require('./runtime.cjs').STORAGE_KEY),null);
    await ctx.close();}
  checks.push('Admin: sign in -> admin.html, real name in sidebar and Settings, FIJLY_AUTH set, mock data renders, login.html forwards when signed in, sign out -> login.html, other tab follows, session cleared');

  // 4. Client: studio.html only; admin.html redirects to the client portal.
  {const {ctx,page}=await fresh();await page.goto(base+'login.html');await page.locator('#login-card[data-state="ready"]').waitFor();
    await signIn(page,qaUsers.client);await page.waitForURL('**/studio.html');await portalReady(page);
    assert.equal(await page.locator('.sidebar-user__name').innerText(),'Casey Morgan');
    assert.equal((await page.evaluate(()=>window.FIJLY_AUTH)).clientId,qaUsers.client.profile.client_id);
    assert.ok(await page.locator('#screen-overview .stat-card').count()>0);
    await page.goto(base+'admin.html');await page.waitForURL('**/studio.html');await portalReady(page);
    await page.locator('[data-sign-out]').click();await page.waitForURL('**/login.html');
    await ctx.close();}
  checks.push('Client: sign in -> studio.html with the real name and client id; admin.html redirects to studio.html; sign out works');

  // 5. An account without a profile is refused and signed out.
  {const {ctx,page}=await fresh();await page.goto(base+'login.html');await page.locator('#login-card[data-state="ready"]').waitFor();
    await signIn(page,qaUsers.noprofile);await page.locator('#login-error:not([hidden])').waitFor();
    assert.match(await page.locator('#login-error').innerText(),/isn’t set up/);
    await page.goto(base+'studio.html');await page.waitForURL('**/login.html');
    await ctx.close();}
  {const {ctx,page}=await fresh('noprofile');await page.goto(base+'admin.html');await page.waitForURL('**/login.html');await ctx.close();}
  checks.push('No profile row: sign-in refused with a clear message; an existing session without a profile is signed out of the portals');

  // 6. SDK unavailable: the portal stays covered with retry and sign-in options.
  {const {ctx,page}=await fresh('admin');await ctx.route('https://cdn.jsdelivr.net/**',route=>route.abort());
    const failures=errors.length;await page.goto(base+'admin.html');
    await page.locator('#auth-loading .auth-loading__actions').waitFor();
    assert.match(await page.locator('#auth-loading').innerText(),/couldn’t load the sign-in service/);
    assert.equal(await page.locator('#studio').evaluate(e=>e.inert),true);
    assert.equal(await page.locator('#auth-loading a[href="login.html"]').count(),1);
    errors.splice(failures); // The blocked CDN request is the point of this check.
    await ctx.close();}
  checks.push('SDK blocked: overlay stays up with an explanation, Try again and Go to sign in; the portal stays inert');

  // 7. The landing page is public and never contacts Supabase.
  {const {ctx,page}=await fresh();const requests=[];page.on('request',r=>requests.push(r.url()));
    await page.goto(base+'index.html',{waitUntil:'load'});
    assert.equal(requests.filter(u=>/supabase|jsdelivr/.test(u)).length,0);
    assert.deepEqual(await page.locator('.nav__signin').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),['login.html','login.html']);
    assert.equal(await page.locator('.footer a[href="login.html"]').count(),1);
    assert.equal(await page.locator('a[href="studio.html"]').count(),0);
    await ctx.close();}
  checks.push('Landing page: public, no Supabase or CDN requests; both Sign in links and the footer Studio link point to login.html');

  fs.writeFileSync('qa/auth-results.json',JSON.stringify({checks,scans,errors},null,2));await browser.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,scans:scans.length,errors},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
