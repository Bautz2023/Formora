// Kurztest der Teilen-Version (Gerätespeicher). Vorher bauen: python3 tools/build_teilen.py index.html tests/teilen_test.html
// Aufruf: NODE_PATH=$(npm root -g) node tests/teilen.js tests/teilen_test.html
const {chromium}=require('playwright');const fs=require('fs');
const F=process.argv[2];let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ ')+m)};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},locale:'de-DE',timezoneId:'Europe/Berlin'});
 await ctx.route('**/*',r=>r.request().url().startsWith('https://formora.test/')?r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(F,'utf8')}):r.abort());
 const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(String(e)));
 await page.clock.install({time:new Date('2026-11-24T09:00:00+01:00')});
 await page.goto('https://formora.test/');await page.waitForTimeout(600);
 ok(await page.isVisible('#welcome'),'Teilen: Willkommenshinweis');
 await page.click('#todayCard [data-pk-type="run"]');await page.waitForTimeout(400);
 const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('fm:db:daily')||'{}'));
 ok(st['2026-11-24']&&st['2026-11-24'].pick.run===5,'Teilen: Auswahl Joggen im Gerätespeicher');
 await page.reload();await page.waitForTimeout(600);
 ok(await page.getAttribute('#todayCard [data-pk-type="run"]','aria-pressed')==='true','Teilen: nach Neuladen noch gewählt (persistent)');
 await page.click('[data-orb="wp"]');await page.waitForTimeout(400);await page.click('#wpBody [data-wpd="2026-11-27"]');await page.waitForTimeout(200);
 await page.$eval('#wpEd [data-wp-add]',x=>x.click());await page.waitForTimeout(250);await page.evaluate(()=>{$('qkBox').open=true});
 await page.fill('#qkK','700');await page.$eval('#qkGo',x=>x.click());await page.waitForTimeout(400);
 await page.reload();await page.waitForTimeout(600);
 ok(await page.evaluate(()=>planMealsOf('2026-11-27').length===1&&planMealsOf('2026-11-27')[0].kcal===700),'Teilen: geplante Mahlzeit nach Neuladen noch da');
 ok(errs.length===0,'Teilen: keine JS-Fehler '+errs.join(' | '));
 console.log(pass+'/'+(pass+fail)+' bestanden');await b.close()})();
