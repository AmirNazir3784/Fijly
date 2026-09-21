const {chromium} = require('./runtime.cjs');
const fs = require('fs');
const screens = ['overview','projects','requests','assets','scripts','analytics','settings'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const results=[];
 for(const width of [1440,1024,768,375,390]) {
  await page.setViewportSize({width,height:940});
  for(const screen of ['marketing',...screens]) {
   await page.goto(require('./runtime.cjs').base+(screen==='marketing'?'index.html':'studio.html#'+screen));
   await page.reload();
   await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(100);
   results.push({width,screen,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,title:document.title,h1:[...document.querySelectorAll('h1')].filter(e=>e.checkVisibility()).map(e=>e.textContent),overflows:[...document.querySelectorAll('main *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-scroll,.marquee,.cta__blob')).map(e=>e.className).slice(0,15)}))});
   await page.screenshot({path:`qa/screenshots/${screen}-${width}.png`,fullPage:true});
  }
 }
 fs.writeFileSync('qa/render-results.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({renders:results.length,issues:results.filter(r=>r.overflow||r.overflows.length),errors}));
 await browser.close();require('assert/strict').deepEqual(errors,[]);require('assert/strict').ok(results.every(r=>!r.overflow&&!r.overflows.length));
})();
