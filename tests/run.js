// Playwright-Tests für index.html. Aufruf: NODE_PATH=$(npm root -g) node tests/run.js
const {chromium}=require('playwright');
const {ok,done,newPage,tab,overflow}=require('./harness');
const T0='2026-11-24T09:00:00+01:00',D0='2026-11-24';   // Dienstag
const seed=async(page,settings={})=>{await page.evaluate(async([st,d])=>{
  await db.doc('settings/main').set({start:'2026-11-03',height:184,age:31,sched:{gym:[],run:[]},...st});
  await db.collection('body').doc(d).set({date:d,kg:83});},[settings,D0]);await page.waitForTimeout(400)};
const daily=(page,ds)=>page.evaluate(d=>(window.__store.daily&&window.__store.daily.get(d))||null,ds);

(async()=>{
  const browser=await chromium.launch();

  console.log('Grundfunktion');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});
   ok(await page.evaluate(()=>!!db&&typeof targetFor==='function'),'App startet mit Datenbank');
   for(const v of ['dash','gym','run','food','body']){await tab(page,v);const o=await overflow(page);ok(o<=0,'Tab '+v+' ohne Überlauf ('+o+'px)')}
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('1+2 · Heute: Joggen mit km, kcal live');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page);await tab(page,'dash');
   ok(await page.isVisible('#todayCard [data-pk-type="run"]')&&await page.isVisible('#todayCard [data-pk-type="gym"]'),'Oben auf der Startseite: Joggen und Gym');
   ok((await page.textContent('#todayCard .pick')).includes('Ruhetag'),'Ohne Plan: Ruhetag');
   const base=await page.evaluate(d=>targetFor(d).total,D0);
   await page.click('#todayCard [data-pk-type="run"]');await page.waitForTimeout(400);
   let dl=await daily(page,D0);ok(dl&&dl.pick&&dl.pick.run===5,'Joggen gewählt → 5 km vorgeschlagen und gespeichert');
   ok(await page.getAttribute('#todayCard [data-pk-type="run"]','aria-pressed')==='true','Joggen ist markiert');
   const exp5=await page.evaluate(()=>Math.round(runKcalNet(5,5*runPaceNow(),kgNow())));
   const shown=await page.textContent('#todayCard [data-pk-kcal]');
   ok(shown.replace(/\D/g,'')===String(exp5),'Joggen 5 km: angezeigt '+shown.trim()+' = MET netto ('+exp5+' kcal)');
   const T5=await page.evaluate(d=>targetFor(d),D0);
   ok(Math.round(T5.runK)===exp5&&T5.km===5&&T5.total>base&&/gewählt/.test(T5.src),'kcal-Ziel enthält den Lauf ('+base+' → '+T5.total+' kcal, '+T5.src+')');
   await page.fill('#todayCard [data-pk-kmin]','7,5');await page.dispatchEvent('#todayCard [data-pk-kmin]','input');
   const exp75=await page.evaluate(()=>Math.round(runKcalNet(7.5,7.5*runPaceNow(),kgNow())));
   ok((await page.textContent('#todayCard [data-pk-kcal]')).replace(/\D/g,'')===String(exp75),'Live: 7,5 km eingetippt → '+exp75+' kcal sofort');
   ok((await daily(page,D0)).pick.run===5,'… gespeichert erst beim Bestätigen');
   await page.press('#todayCard [data-pk-kmin]','Enter');await page.dispatchEvent('#todayCard [data-pk-kmin]','change');await page.waitForTimeout(400);
   ok((await daily(page,D0)).pick.run===7.5,'7,5 km gespeichert (Dezimalwert)');
   await page.click('#todayCard [data-pk-km="0.5"]');await page.waitForTimeout(400);
   ok((await daily(page,D0)).pick.run===8&&(await page.inputValue('#todayCard [data-pk-kmin]'))==='8','Stepper + → 8 km');
   await page.click('#todayCard [data-pk-km="-0.5"]');await page.click('#todayCard [data-pk-km="-0.5"]');await page.waitForTimeout(400);
   ok((await daily(page,D0)).pick.run===7,'Stepper − − → 7 km');
   await page.fill('#todayCard [data-pk-kmin]','99');await page.dispatchEvent('#todayCard [data-pk-kmin]','change');await page.waitForTimeout(200);
   ok((await page.textContent('#toastT')).includes('0,5 und 60')&&(await daily(page,D0)).pick.run===7,'99 km abgelehnt');
   await page.click('#todayCard [data-pk-type="run"]');await page.waitForTimeout(400);
   ok((await daily(page,D0)).pick.run===0&&await page.evaluate(d=>targetFor(d).runK===0,D0),'Joggen abgewählt → kein Lauf, keine Lauf-kcal');
   // Gewicht fehlt
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('1+2 · Heute: Gym mit Einheit, absolviert markiert');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page);await tab(page,'dash');
   await page.click('#todayCard [data-pk-type="gym"]');await page.waitForTimeout(400);
   const lbl=await page.$$eval('#todayCard [data-pk-gym]',b=>b.map(x=>x.textContent.trim()));
   ok(lbl.join(',')==='OK,UK,GK,Push,Pull,Beine','Gym: OK, UK, GK, Push, Pull, Beine wählbar');
   await page.click('#todayCard [data-pk-gym="push"]');await page.waitForTimeout(400);
   ok((await daily(page,D0)).pick.gym==='push'&&await page.getAttribute('#todayCard [data-pk-gym="push"]','aria-pressed')==='true','Gym Push gewählt und markiert');
   const T=await page.evaluate(d=>targetFor(d),D0);
   ok(T.gymK===250&&(await page.textContent('#todayCard .pick')).includes('250 kcal'),'Gym Push: 250 kcal (Pauschale) im Ziel und angezeigt');
   for(const k of ['ok','uk','gk','beine']){await page.click(`#todayCard [data-pk-gym="${k}"]`);await page.waitForTimeout(300);
     ok(await page.evaluate(([d,k])=>planDay(d).gym===k&&!!TEMPLATES[k].ex.length&&targetFor(d).gymK===250,[D0,k]),'Einheit '+k+' wählbar, mit Übungen, 250 kcal')}
   await page.click('#todayCard [data-go="gym"]');await page.waitForTimeout(300);
   ok(await page.evaluate(()=>day==='beine'&&document.querySelector('#dayChips [data-day="beine"]').getAttribute('aria-pressed')==='true'),'„Jetzt eintragen“ öffnet die gewählte Einheit (Beine) im Gym-Tab');
   ok((await page.$$('#dayChips [data-day]')).length===6,'Gym-Tab: alle 6 Einheiten');
   await page.evaluate(async d=>{await db.collection('sessions').add({date:d,day:'beine',exercises:[{name:'Kniebeugen',sets:[{kg:80,reps:8}]}]})},D0);await page.waitForTimeout(400);
   await tab(page,'dash');
   ok((await page.textContent('#todayCard [data-pk-type="gym"]')).includes('✓')&&(await page.textContent('#todayCard [data-pk-gym="beine"]')).includes('✓')&&await page.isDisabled('#todayCard [data-pk-gym="push"]'),'Absolviertes Workout mit ✓ markiert, Auswahl gesperrt');
   await page.evaluate(async d=>{await db.collection('runs').add({date:d,type:'Easy',km:6.2,sec:2280})},D0);await page.waitForTimeout(400);
   ok((await page.textContent('#todayCard .pick')).includes('Lauf eingetragen: 6,2 km'),'Eingetragener Lauf mit ✓ und km');
   ok(await page.evaluate(d=>{const t=targetFor(d);return Math.round(t.runK)===Math.round(runKcalNet(6.2,2280,83))},D0),'Eingetragener Lauf: kcal netto aus echter Zeit');
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('Plan und alte Daten');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page,{sched:{gym:[0,2,4],run:[1,6]}});await tab(page,'dash');
   ok(await page.evaluate(d=>planDay(d).run&&!planDay(d).pick,D0)&&await page.getAttribute('#todayCard [data-pk-type="run"]','aria-pressed')==='true','Geplanter Lauf (Di) ist vorausgewählt');
   const pk=await page.evaluate(d=>planDay(d).run.km,D0);
   ok((await page.inputValue('#todayCard [data-pk-kmin]'))===String(pk).replace('.',','),'Stepper zeigt die Plan-km ('+pk+')');
   await page.evaluate(async d=>{await db.doc('daily/'+d).set({date:d,skipRun:true,addGym:'pull'})},D0);await page.waitForTimeout(400);
   ok(await page.evaluate(d=>!planDay(d).run&&planDay(d).gym==='pull'&&targetFor(d).gymK===250,D0),'Alte Felder (skipRun, addGym) gelten weiter');
   await page.click('#todayCard [data-pk-type="run"]');await page.waitForTimeout(400);
   const dl=await daily(page,D0);
   ok(dl.pick.run===pk&&!('skipRun' in dl)&&dl.addGym==='pull','Neue Auswahl ersetzt nur die alten Lauf-Felder, Gym bleibt');
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('Startseite: Trainingsplan-Karte weg');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page);await tab(page,'dash');
   ok(await page.evaluate(()=>!document.getElementById('planCard').offsetParent&&![...document.querySelectorAll('#v-dash h2')].some(h=>h.offsetParent&&h.textContent.trim()==='Trainingsplan')),'Karte „Trainingsplan“ ist auf der Startseite ausgeblendet');
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('4+5 · Kreise auf der Startseite');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page,{sched:{gym:[0,2,4],run:[1,6]}});await tab(page,'dash');
   const orbs=await page.$$eval('#v-dash [data-orb]',b=>b.map(x=>x.dataset.orb+':'+Math.round(x.getBoundingClientRect().width)+'x'+Math.round(x.getBoundingClientRect().height)));
   ok(orbs.length===6,'6 Kreise: '+orbs.join(' '));
   ok(await page.evaluate(()=>{const b=[...document.querySelectorAll('[data-orb]')].map(x=>x.getBoundingClientRect());return b.every(r=>Math.abs(r.width-r.height)<2)&&getComputedStyle(document.querySelector('[data-orb]')).borderRadius==='50%'}),'Kreise sind rund');
   ok(await page.evaluate(()=>{const R=[...document.querySelectorAll('.orbs')].map(g=>[...g.querySelectorAll('[data-orb]')].map(x=>x.getBoundingClientRect().top)),[A,B]=R;return A.length===3&&B.length===3&&A.every(v=>v===A[0])&&B.every(v=>v===B[0])&&B[0]>A[0]}),'Zwei nebeneinander, darunter drei in einer Reihe');
   const v=await page.evaluate(()=>['tr','coach','pa','wp','wk','vol'].map(k=>document.getElementById('orbV-'+k).textContent));
   ok(/Woche: \d+ von \d+ Einheiten/.test(v[0])&&v[1]==='noch nie'&&v[2]==='Plan erstellen'&&/Heute frei: [\d.]+ kcal/.test(v[3])&&v[4]==='3× Gym · 2× Lauf'&&v[5]==='noch keine Einheit','Kennzahlen: '+v.join(' | '));
   ok(await page.evaluate(()=>[...document.querySelectorAll('[data-orb]')].map(x=>x.textContent).join('|')).then(t=>/Training prüfen/.test(t)&&/Coach-Check/.test(t)&&/Trainings.?volumen/.test(t)&&/Plan-Assistent/.test(t)&&/Plan dieser Woche/.test(t)&&/Trainings.?woche/.test(t)),'Label in den Kreisen');
   ok(await page.evaluate(()=>[...document.querySelectorAll('.orbp')].every(p=>!p.classList.contains('open')&&p.getBoundingClientRect().height<1)),'Alle zu: nehmen keinen Platz ein');
   const h=await page.evaluate(()=>{const a=document.querySelectorAll('.orbs')[0].getBoundingClientRect().top,b=document.querySelectorAll('.orbs')[1].getBoundingClientRect().bottom;return Math.round(b-a)});
   ok(h<420,'Fünf Funktionen brauchen nur '+h+' px Höhe');
   for(const [k,txt] of [['tr','Training prüfen'],['coach','Coach-Check'],['vol','Trainingsvolumen'],['pa','Plan-Assistent starten'],['wp','Diese Woche'],['wk','Gym-Tage']]){
     await page.click(`[data-orb="${k}"]`);await page.waitForTimeout(450);
     const st=await page.evaluate(k=>{const p=document.getElementById('orbP-'+k);return {open:p.classList.contains('open'),h:p.getBoundingClientRect().height,txt:p.innerText,exp:document.querySelector(`[data-orb="${k}"]`).getAttribute('aria-expanded'),others:[...document.querySelectorAll('.orbp.open')].length}},k);
     ok(st.open&&st.h>60&&st.exp==='true'&&st.others===1&&st.txt.includes(txt),'Kreis '+k+' klappt auf (Inhalt „'+txt+'“, '+Math.round(st.h)+' px)');
     const o=await overflow(page);ok(o<=0,'… ohne Überlauf ('+o+'px)');
   }
   await page.click('[data-orbx="wk"]');await page.waitForTimeout(450);
   ok(await page.evaluate(()=>!document.querySelector('.orbp.open')),'✕ klappt wieder zu');
   await page.click('[data-orb="tr"]');await page.waitForTimeout(100);await page.click('[data-orb="tr"]');await page.waitForTimeout(450);
   ok(await page.evaluate(()=>!document.querySelector('.orbp.open')),'Erneuter Tap klappt zu');
   ok(await page.evaluate(()=>{const p=document.getElementById('orbP-coach');return getComputedStyle(p).transitionDuration.split(',').some(x=>parseFloat(x)>0)}),'Aufklappen ist animiert');
   await page.click('[data-orb="pa"]');await page.waitForTimeout(400);await page.click('#orbP-pa [data-pa-open]');await page.waitForTimeout(300);
   ok(await page.isVisible('#paSheet'),'Plan-Assistent startet direkt aus dem Kreis');await page.click('#paSheet .sheet-x');
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('3 · Tagesplanung im Voraus');
  {const {page,ctx,errs}=await newPage(browser,{time:T0});await seed(page);await tab(page,'dash');
   const F='2026-11-27';
   await page.click('[data-orb="wp"]');await page.waitForTimeout(450);
   ok((await page.$$('#wpBody [data-wpd]')).length===7,'Wochenansicht mit 7 Tagen');
   await page.click('#wpBody [data-wpw="1"]');await page.waitForTimeout(150);
   ok((await page.textContent('#wpBody .wpnav')).includes('Nächste Woche')&&await page.$('#wpBody [data-wpd="2026-12-04"]'),'Nächste Woche planbar');
   await page.click('#wpBody [data-wpw="-1"]');await page.waitForTimeout(150);
   await page.click(`#wpBody [data-wpd="${F}"]`);await page.waitForTimeout(200);
   ok(await page.isVisible('#wpEd'),'Tagesansicht für Fr 27.11. geöffnet');
   await page.click('#wpEd [data-pk-type="run"]');await page.waitForTimeout(400);
   await page.fill('#wpEd [data-pk-kmin]','10');await page.dispatchEvent('#wpEd [data-pk-kmin]','change');await page.waitForTimeout(400);
   ok((await daily(page,F)).pick.run===10,'Workout für einen zukünftigen Tag: Joggen 10 km');
   await page.click('#wpEd [data-pk-type="gym"]');await page.waitForTimeout(400);await page.click('#wpEd [data-pk-gym="pull"]');await page.waitForTimeout(400);
   ok((await daily(page,F)).pick.gym==='pull','… plus Gym Pull');
   // Mahlzeit frei
   const meals0=await page.evaluate(()=>(window.__store.meals||new Map()).size);
   await page.$eval('#wpEd [data-wp-add]',b=>b.click());await page.waitForTimeout(250);
   ok(await page.isVisible('#mealSheet')&&(await page.textContent('#sheetSub')).includes('Planen für'),'Essens-Fenster im Planungsmodus');
   await page.evaluate(()=>{$('qkBox').open=true});await page.fill('#qkName','Pasta Bolognese');await page.fill('#qkK','800');await page.fill('#qkP','40');await page.$eval('#qkGo',b=>b.click());await page.waitForTimeout(400);
   // Mahlzeit aus gespeicherten Lebensmitteln (Suche)
   await page.fill('#fdQ','Skyr');await page.waitForTimeout(300);
   const hit=await page.$('#mealSheet [data-fq]')||await page.$('#mealSheet .fdres button');
   let fromDb=false;if(hit){await hit.click();await page.waitForTimeout(400);fromDb=true}
   await page.click('#mealSheet .sheet-x');await page.waitForTimeout(300);
   const pm=(await daily(page,F)).planMeals||[];
   ok(pm.length>=1&&pm[0].name==='Pasta Bolognese'&&pm[0].kcal===800&&pm[0].p===40,'Mahlzeit frei geplant (Pasta 800 kcal)');
   ok(!fromDb||pm.length===2,'Mahlzeit aus der Lebensmittel-Suche geplant'+(fromDb?' ('+(pm[1]&&pm[1].name)+', '+(pm[1]&&pm[1].kcal)+' kcal)':' (Suchtreffer nicht gefunden)'));
   ok(await page.evaluate(()=>(window.__store.meals||new Map()).size)===meals0,'Geplant ≠ gegessen: nichts im Tagebuch');
   const B=await page.evaluate(d=>{const t=targetFor(d);return {total:t.total,runK:t.runK,gymK:t.gymK,planned:dayBudget(d).planned,free:dayBudget(d).free}},F);
   const sumP=pm.reduce((a,x)=>a+x.kcal,0);
   ok(B.planned===sumP&&B.free===B.total-sumP&&B.gymK===250&&B.runK>500,'Budget: Ziel '+B.total+' (inkl. Lauf '+Math.round(B.runK)+' + Gym 250) − geplant '+sumP+' = '+B.free+' kcal');
   ok((await page.textContent('#wpEd [data-wp-free]')).replace(/\D/g,'')===String(B.free),'„Verfügbar“ zeigt '+B.free+' kcal');
   ok((await page.textContent(`#wpBody [data-wpd="${F}"]`)).includes(f0s(B.free)+' frei'),'Tageszeile zeigt das Budget');
   ok(!(await page.$('#wpEd .notice.warn')),'Noch keine Warnung');
   await page.$eval('#wpEd [data-wp-add]',b=>b.click());await page.waitForTimeout(250);await page.evaluate(()=>{$('qkBox').open=true});
   await page.fill('#qkK','2900');await page.$eval('#qkGo',b=>b.click());await page.waitForTimeout(400);await page.click('#mealSheet .sheet-x');await page.waitForTimeout(300);
   ok((await page.textContent('#wpEd .notice.warn')).includes('Über dem Budget')&&await page.$('#wpEd .wpfree.over'),'Überschreitung: Warnung und roter Balken');
   await page.click('#wpEd [data-wp-del="'+(pm.length)+'"]');await page.waitForTimeout(400);
   ok(((await daily(page,F)).planMeals||[]).length===pm.length,'Geplante Mahlzeit entfernen');
   // Kopieren und Vorlage
   await page.click('#wpEd details summary');await page.fill('#wpCopyTo','2026-12-04');await page.click('#wpEd [data-wp-copy]');await page.waitForTimeout(400);
   const cp=await daily(page,'2026-12-04');ok(cp&&cp.pick.run===10&&cp.pick.gym==='pull'&&cp.planMeals.length===pm.length,'Tag kopiert nach Fr 04.12.');
   await page.fill('#wpTplName','Lauftag');await page.click('#wpEd [data-wp-tsave]');await page.waitForTimeout(400);
   ok(await page.evaluate(()=>window.__store.settings.get('main').dayTemplates.some(x=>x.name==='Lauftag'&&x.pick.run===10)),'Als Vorlage gespeichert');
   await page.click('#wpBody [data-wpd="2026-11-28"]');await page.waitForTimeout(250);
   ok(await page.evaluate(()=>document.querySelector('#wpEd [data-wpfold]').open),'„Kopieren und Vorlagen“ bleibt offen');
   await page.click('#wpEd [data-wp-tuse="0"]');await page.waitForTimeout(400);
   const ap=await daily(page,'2026-11-28');ok(ap&&ap.pick.run===10&&ap.planMeals.length===pm.length,'Vorlage auf Sa 28.11. angewendet');
   // Morgen: als gegessen eintragen
   await page.click('#wpBody [data-wpd="2026-11-25"]');await page.waitForTimeout(250);await page.$eval('#wpEd [data-wp-add]',b=>b.click());await page.waitForTimeout(250);
   await page.evaluate(()=>{$('qkBox').open=true});await page.fill('#qkName','Haferflocken');await page.fill('#qkK','450');await page.$eval('#qkGo',b=>b.click());await page.waitForTimeout(400);await page.click('#mealSheet .sheet-x');await page.waitForTimeout(300);
   await page.$eval('#wpEd [data-wp-eat]',b=>b.click());await page.waitForTimeout(500);
   ok(await page.evaluate(()=>[...window.__store.meals.values()].some(m=>m.date==='2026-11-25'&&m.name==='Haferflocken'&&m.kcal===450))&&!((await daily(page,'2026-11-25')).planMeals),'Morgen: „Als gegessen eintragen“ überträgt ins Tagebuch');
   ok(await page.evaluate(()=>{const b=dayBudget('2026-11-25');return b.eaten===450&&b.planned===0&&b.free===b.total-450}),'… Budget zählt es einmal (gegessen statt geplant)');
   {const o=await overflow(page);ok(o<=0,'Wochenplanung ohne Überlauf ('+o+'px)')}
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  console.log('Schmal (320 px)');
  {const {page,ctx,errs}=await newPage(browser,{time:T0,width:320});await seed(page);await tab(page,'dash');
   await page.click('#todayCard [data-pk-type="gym"]');await page.waitForTimeout(300);await page.click('#todayCard [data-pk-type="run"]');await page.waitForTimeout(300);
   {const o=await overflow(page);ok(o<=0,'Startseite mit Joggen + Gym bei 320 px ohne Überlauf ('+o+'px)')}
   await page.click('[data-orb="wp"]');await page.waitForTimeout(400);await page.click(`#wpBody [data-wpd="${D0}"]`);await page.waitForTimeout(200);
   {const o=await overflow(page);ok(o<=0,'Wochenplanung bei 320 px ohne Überlauf ('+o+'px)')}
   ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));await ctx.close();}

  await browser.close();done();
})();
function f0s(v){return Math.round(v).toLocaleString('de-DE')}
