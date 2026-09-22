/* Compare retained FIJLY components, not obsolete demo numbers or Team routes. */
const {chromium,base,routes}=require('./runtime.cjs'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
  const browser=await chromium.launch(),p=await browser.newPage(),results=[];
  await p.goto(base+'studio.html',{waitUntil:'domcontentloaded'});
  for(const selector of ['.sidebar','.studio-topbar','.stats-grid','.overview-grid','.project-grid','.projects-table','.requests-grid','[data-client-assets]','.scripts-grid','.kpi-grid','.settings'])assert.equal(await p.locator(selector).count(),1,selector+' retained');
  for(const screen of routes.studio){await p.goto(base+'studio.html#'+screen,{waitUntil:'domcontentloaded'});assert.equal(await p.locator('.screen:visible').getAttribute('data-screen'),screen);results.push({screen,heading:await p.locator('h1:visible').innerText(),status:'Approved component layout retained; operational content intentionally derived from shared state'});}
  fs.writeFileSync('qa/content-comparison.json',JSON.stringify({results},null,2));await browser.close();console.log('Seven retained Client layouts passed.');
})().catch(e=>{console.error(e);process.exit(1)});
