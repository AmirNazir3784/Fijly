const {chromium}=require('./runtime.cjs');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const out=[];
for(const s of ['marketing','overview','projects','requests','assets','scripts','analytics','settings']){
 await p.goto(require('./runtime.cjs').base+(s==='marketing'?'index.html':'studio.html#'+s));await p.reload();await p.addScriptTag({path:'qa/axe.min.js'});
 out.push({screen:s,violations:await p.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))});
} fs.writeFileSync('qa/accessibility-results.json',JSON.stringify(out,null,2));console.log(out.map(x=>({screen:x.screen,violations:x.violations.map(v=>[v.id,v.nodes.length])})));
await p.setViewportSize({width:375,height:800});await p.goto(require('./runtime.cjs').base+'studio.html');await p.locator('[data-sidebar-open]').click();await p.locator('.sidebar-link[data-screen="projects"]').click();await p.waitForTimeout(300);console.log('Focus after mobile navigation:',await p.evaluate(()=>({active:document.activeElement.outerHTML,visible:document.activeElement.checkVisibility({visibilityProperty:true})})));
await p.evaluate(()=>location.hash='settings');await p.waitForTimeout(100);console.log('Hash change visible screen:',await p.locator('.screen:visible').getAttribute('data-screen'));await b.close();require('assert/strict').ok(out.every(r=>!r.violations.length));})();

