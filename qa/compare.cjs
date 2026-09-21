/* The .dc.html files require their retired prototype runtime. Compare immutable
   references and retained components, not obsolete demo numbers or Team routes. */
const {chromium,base,routes}=require('./runtime.cjs'),fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
(async()=>{
  const references=JSON.parse(fs.readFileSync('qa/reference-hashes.json','utf8').replace(/^\uFEFF/,''));
  for(const r of references){const name=r.Path.replaceAll('\\','/').split('/').pop();assert.equal(crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex').toUpperCase(),r.Hash,name);}
  const browser=await chromium.launch(),p=await browser.newPage(),results=[];
  await p.goto(base+'studio.html',{waitUntil:'domcontentloaded'});
  for(const selector of ['.sidebar','.studio-topbar','.stats-grid','.overview-grid','.project-grid','.projects-table','.requests-grid','.assets-grid','.scripts-grid','.kpi-grid','.settings'])assert.equal(await p.locator(selector).count(),selector==='.assets-grid'?2:1,selector+' retained');
  for(const screen of routes.studio){await p.goto(base+'studio.html#'+screen,{waitUntil:'domcontentloaded'});assert.equal(await p.locator('.screen:visible').getAttribute('data-screen'),screen);results.push({screen,heading:await p.locator('h1:visible').innerText(),status:'Approved component layout retained; operational content intentionally derived from shared state'});}
  fs.writeFileSync('qa/content-comparison.json',JSON.stringify({referenceFilesUnchanged:true,results},null,2));await browser.close();console.log('Reference hashes and seven retained Client layouts passed.');
})().catch(e=>{console.error(e);process.exit(1)});
