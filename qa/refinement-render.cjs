const {chromium}=require('C:/Users/Mister Naveed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs=require('fs');
const phase=process.argv[2]||'before';
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});const report=[];
fs.mkdirSync(`qa/refinement-${phase}`,{recursive:true});
for(const width of [1440,1280,1024,768,390,375]){
 await p.setViewportSize({width,height:900});
 for(const screen of ['marketing','overview','projects','requests','assets','scripts','analytics','team','settings']){
 await p.goto('http://127.0.0.1:8766/'+(screen==='marketing'?'index.html':'studio.html#'+screen),{waitUntil:'domcontentloaded'});await p.reload({waitUntil:'domcontentloaded'});await p.evaluate(()=>document.fonts.ready);
 await p.screenshot({path:`qa/refinement-${phase}/${screen}-${width}.png`,fullPage:true});
 if(screen==='marketing'){await p.screenshot({path:`qa/refinement-${phase}/fold-${width}.png`});for(const name of ['services','process','work','results','testimonial','pricing','faq','footer','contact']){const el=p.locator(['footer','results','testimonial'].includes(name)?'.'+name:'#'+name);if(await el.count())await el.screenshot({path:`qa/refinement-${phase}/${name}-${width}.png`,style:'.nav,.skip-link{visibility:hidden!important}'});}}
 report.push({width,screen,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),title:await p.title()});
 }
}fs.writeFileSync(`qa/refinement-${phase}/results.json`,JSON.stringify({report,errors},null,2));console.log({renders:report.length,overflow:report.filter(r=>r.overflow),errors});await b.close();})();
