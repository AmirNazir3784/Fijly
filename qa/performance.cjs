const {chromium,base}=require('./runtime.cjs');
const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto');
(async()=>{
  const browser=await chromium.launch(),reports=[];
  for(const portal of ['studio','admin']) {
    const samples=[];
    for(let i=0;i<3;i++) {
      const context=await browser.newContext(),page=await context.newPage();
      await page.goto(base+portal+'.html',{waitUntil:'load'});
      samples.push(await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domReadyMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,domNodes:document.querySelectorAll('*').length,resources:performance.getEntriesByType('resource').length};}));
      if(i===2) {
        let result=await page.evaluate(async()=>{let changed=0;const observer=new MutationObserver(records=>{changed+=records.length;});observer.observe(document.querySelector('main'),{subtree:true,childList:true,characterData:true});const start=performance.now();for(let j=0;j<10;j++)FijlyMock.saveSettings({...FijlyMock.state.settings});await new Promise(resolve=>setTimeout(resolve,0));observer.disconnect();return {tenNoopSavesMs:performance.now()-start,domMutations:changed};});
        samples[i].noopUpdates=result;
      }
      await context.close();
    }
    reports.push({portal,samples});
  }
  function files(dir){return fs.readdirSync('site/'+dir).flatMap(name=>fs.statSync('site/'+dir+'/'+name).isDirectory()?files(dir+'/'+name):[dir+'/'+name]);}
  const hashes=new Map(),sizes=['js','css','assets'].flatMap(files).map(file=>{const data=fs.readFileSync('site/'+file),hash=crypto.createHash('sha256').update(data).digest('hex');if(!hashes.has(hash))hashes.set(hash,[]);hashes.get(hash).push(file);return {file,bytes:data.length,gzipBytes:zlib.gzipSync(data).length};});
  const portalAssets=['studio','admin'].map(portal=>{const html=fs.readFileSync('site/'+portal+'.html','utf8'),paths=[...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m=>m[1]),assets=sizes.filter(s=>paths.includes(s.file));return {portal,jsCssFiles:assets.length,jsCssBytes:assets.reduce((sum,a)=>sum+a.bytes,0),jsCssGzipBytes:assets.reduce((sum,a)=>sum+a.gzipBytes,0)};});
  const report={measuredAt:new Date().toISOString(),note:'Local static server, Chromium, three fresh contexts. Diagnostic timings, not a production SLA. Gzip sizes are estimates; the QA server serves uncompressed files.',reports,portalAssets,sizes,duplicateFiles:[...hashes.values()].filter(files=>files.length>1)};
  fs.writeFileSync(process.argv[2]||'qa/performance-results.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report.reports));
})().catch(e=>{console.error(e);process.exit(1)});
