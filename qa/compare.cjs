const {chromium}=require('C:/Users/Mister Naveed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1440,height:940}});
 await page.goto('http://127.0.0.1:8765/Fijly%20Studio.dc.html');
 await page.locator('aside').waitFor(); await page.evaluate(()=>document.fonts.ready);
 const results=[];
 for(const [id,label] of Object.entries({overview:'Overview',projects:'Projects',requests:'Video Requests',assets:'Brand Assets',scripts:'Scripts',analytics:'Analytics',team:'Team',settings:'Settings'})){
  await page.locator('aside nav > div').filter({hasText:label}).click();
  await page.screenshot({path:`qa/screenshots/reference-${id}.png`,fullPage:true});
  const texts=await page.locator('main').evaluate(e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);const out=[];while(w.nextNode()){const t=w.currentNode.textContent.trim();if(t)out.push(t)}return out});
  const prod=await browser.newPage(); await prod.goto('http://127.0.0.1:8765/site/studio.html#'+id);
  const html=await prod.locator('#screen-'+id).evaluate(e=>e.textContent+' '+[...e.querySelectorAll('input,textarea')].map(e=>e.value+' '+e.placeholder).join(' '));
  results.push({id,strings:texts.length,missing:texts.filter(t=>!html.includes(t))}); await prod.close();
 }
 fs.writeFileSync('qa/content-comparison.json',JSON.stringify(results,null,2));console.log(results);
 // Contact sheets of original and production screens for visual review.
 for(const width of [1440,1024,768,375,390]){
  const names=['overview','projects','requests','assets','scripts','analytics','team','settings'];
  await page.setViewportSize({width:1600,height:1000});
  await page.setContent('<body style="margin:0;background:#ddd;font:16px sans-serif"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">'+names.map(n=>`<div>${n} / ${width}<img style="width:100%;display:block" src="http://127.0.0.1:8765/qa/screenshots/${n}-${width}.png"></div>`).join('')+'</div>');
  await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:`qa/screenshots/contact-${width}.png`,fullPage:true});
 }
 await browser.close();
})();
