// Testgerüst für index.html: Browser mit nachgebauter Artefakt-Datenbank (window.claude.use("db")).
// newPage(browser,{time,seed}) → {page,ctx,errs}; window.__store hält die Sammlungen als Map.
const path=require('path'),fs=require('fs');
const DIR=__dirname,FILE=process.env.FORMORA_HTML||path.join(DIR,'..','index.html');
let pass=0,fail=0;const fails=[];
const ok=(c,m)=>{c?pass++:(fail++,fails.push(m));console.log((c?'  ✓ ':'  ✗ ')+m)};
const done=()=>{console.log('\n'+pass+'/'+(pass+fail)+' bestanden');if(fails.length)console.log('Fehlgeschlagen:\n - '+fails.join('\n - '));process.exitCode=fail?1:0};

const MOCK=`(()=>{
  const store=window.__store={};let seq=0;const subs=[];
  const col=c=>store[c]||(store[c]=new Map());
  const snapCol=c=>({docs:[...col(c).entries()].map(([id,d])=>({id,data:()=>JSON.parse(JSON.stringify(d))}))});
  const fire=c=>Promise.resolve().then(()=>subs.filter(s=>s.c===c).forEach(s=>s.fn(s.id?snapDoc(c,s.id):snapCol(c))));
  const snapDoc=(c,id)=>{const d=col(c).get(id);return {exists:!!d,id,data:()=>d?JSON.parse(JSON.stringify(d)):undefined}};
  const docRef=(c,id)=>({id,
    set:async d=>{col(c).set(id,JSON.parse(JSON.stringify(d)));fire(c)},
    delete:async()=>{col(c).delete(id);fire(c)},
    get:async()=>snapDoc(c,id),
    onSnapshot:(fn)=>{const s={c,id,fn};subs.push(s);Promise.resolve().then(()=>fn(snapDoc(c,id)));return ()=>subs.splice(subs.indexOf(s),1)}});
  const db={
    collection:c=>({
      add:async d=>{const id='id'+(++seq)+'_'+Date.now().toString(36);col(c).set(id,JSON.parse(JSON.stringify(d)));fire(c);return docRef(c,id)},
      doc:id=>docRef(c,id),
      onSnapshot:(fn)=>{const s={c,fn};subs.push(s);Promise.resolve().then(()=>fn(snapCol(c)));return ()=>subs.splice(subs.indexOf(s),1)}}),
    doc:p=>{const [c,id]=p.split('/');return docRef(c,id)}};
  window.claude={use:async k=>k==='db'?db:null};
})();`;

async function newPage(browser,{time='2026-11-24T09:00:00+01:00',width=390}={}){
  const ctx=await browser.newContext({viewport:{width,height:844},locale:'de-DE',timezoneId:'Europe/Berlin'});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(u.startsWith('https://formora.test/'))return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(FILE,'utf8')});
    return r.abort()});
  const page=await ctx.newPage();const errs=[];
  page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errs.push(m.text())});
  await page.clock.install({time:new Date(time)});
  await page.addInitScript(MOCK);
  await page.goto('https://formora.test/');
  await page.waitForFunction(()=>typeof db!=='undefined'&&db&&window.__store&&window.__store.settings!==undefined||true);
  await page.waitForTimeout(400);
  return {page,ctx,errs};
}
const tab=async(page,v)=>{await page.click('#tab-'+v);await page.waitForTimeout(120)};
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
module.exports={ok,done,newPage,tab,overflow,DIR};
