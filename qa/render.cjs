const {chromium} = require('C:/Users/Mister Naveed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs');
const screens = ['overview','projects','requests','assets','scripts','analytics','team','settings'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const results=[];
 for(const width of [1440,1024,768,375,390]) {
  await page.setViewportSize({width,height:940});
  for(const screen of ['marketing',...screens]) {
   await page.goto('http://127.0.0.1:8765/site/'+(screen==='marketing'?'index.html':'studio.html#'+screen));
   await page.reload();
   await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(100);
   results.push({width,screen,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,title:document.title,h1:[...document.querySelectorAll('h1')].filter(e=>e.checkVisibility()).map(e=>e.textContent),overflows:[...document.querySelectorAll('main *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-scroll,.marquee,.cta__blob')).map(e=>e.className).slice(0,15)}))});
   await page.screenshot({path:`qa/screenshots/${screen}-${width}.png`,fullPage:true});
  }
 }
 fs.writeFileSync('qa/render-results.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({renders:results.length,issues:results.filter(r=>r.overflow||r.overflows.length),errors}));
 await page.setViewportSize({width:1440,height:940});
 await page.goto('http://127.0.0.1:8765/Fijly%20Studio.dc.html');
 await page.waitForTimeout(6000);
 console.log('reference',await page.locator('body').innerText());
 await page.screenshot({path:'qa/screenshots/reference-overview.png',fullPage:true});
 await browser.close();
})();
