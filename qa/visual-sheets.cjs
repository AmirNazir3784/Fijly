const {chromium}=require('C:/Users/Mister Naveed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs=require('fs');
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1440,height:900}});fs.mkdirSync('qa/visual-sheets',{recursive:true});
for(const screen of ['fold','services','process','work','results','testimonial','pricing','faq','contact','footer','overview','projects','requests','assets','scripts','analytics','team','settings']){
 await p.setContent(`<style>body{margin:0;background:#d8dbe2;font:16px Arial}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px}article{background:white}h2{padding:8px;font-size:16px;margin:0}img{width:100%;height:620px;object-fit:contain;object-position:top}</style><main>${[1440,1280,1024,768,390,375].map(w=>`<article><h2>${screen} — ${w}px</h2><img src="http://127.0.0.1:8765/qa/refinement-after/${screen}-${w}.png"></article>`).join('')}</main>`);
 await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await p.screenshot({path:`qa/visual-sheets/${screen}.png`,fullPage:true});
}await b.close()})();
