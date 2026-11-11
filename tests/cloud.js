// Test der Online-Version (Supabase + Face ID) gegen einen nachgebauten Supabase-Server.
// Aufruf: NODE_PATH=$(npm root -g) node cloud.js <gebaute.html> <supabase.js (UMD)>
const {chromium}=require('playwright');
const fs=require('fs');
const [,,HTML,SBJS]=process.argv;
const ORIGIN='https://formora.test',SB='https://test.supabase.co';
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ ')+m)};

// ---- Nachgebauter Supabase-Server (Auth + REST + Storage), mit RLS über das Token ----
const users=new Map(),rows=[],files=new Map();let n=0;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=u=>b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.sig';
const userOf=req=>{const a=req.headers()['authorization']||'';const t=a.split(' ')[1]||'';try{const p=JSON.parse(Buffer.from(t.split('.')[1],'base64url'));return [...users.values()].find(u=>u.id===p.sub)||null}catch(e){return null}};
const uJson=u=>({id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()});
const sess=u=>({access_token:jwt(u),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+u.id,user:uJson(u)});
const J=(route,status,body)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:body==null?'':JSON.stringify(body)});
const qp=(u,k)=>{const v=u.searchParams.get(k);return v&&v.startsWith('eq.')?decodeURIComponent(v.slice(3)):null};
async function backend(route){
  const req=route.request(),u=new URL(req.url()),p=u.pathname,m=req.method();
  if(m==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const body=()=>{try{return JSON.parse(req.postData()||'{}')}catch(e){return {}}};
  if(p==='/auth/v1/signup'){const b=body();if(b.email==='limit@test.de')return J(route,429,{code:429,error_code:'over_email_send_rate_limit',msg:'email rate limit exceeded'});if(users.has(b.email))return J(route,422,{code:422,error_code:'user_already_exists',msg:'User already registered'});
    const usr={id:'00000000-0000-4000-8000-00000000000'+(++n),email:b.email,pw:b.password};users.set(b.email,usr);return J(route,200,sess(usr))}
  if(p==='/auth/v1/token'){const g=u.searchParams.get('grant_type'),b=body();
    if(g==='password'){const usr=users.get(b.email);if(!usr||usr.pw!==b.password)return J(route,400,{code:400,error_code:'invalid_credentials',msg:'Invalid login credentials'});return J(route,200,sess(usr))}
    if(g==='refresh_token'){const usr=[...users.values()].find(x=>'r-'+x.id===b.refresh_token);return usr?J(route,200,sess(usr)):J(route,400,{msg:'invalid refresh'})}}
  if(p==='/auth/v1/user'){const usr=userOf(req);if(!usr)return J(route,401,{msg:'unauthorized'});if(m==='PUT'){const b=body();if(b.password)usr.pw=b.password}return J(route,200,uJson(usr))}
  if(p==='/auth/v1/logout')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  if(p==='/auth/v1/recover')return J(route,200,{});
  const usr=userOf(req);
  if(p==='/rest/v1/docs'){
    if(!usr)return J(route,401,{message:'JWT required'});
    const mine=rows.filter(r=>r.user_id===usr.id);   // RLS
    if(m==='GET'){const want=qp(u,'user_id');let a=mine.filter(r=>!want||r.user_id===want).sort((x,y)=>(x.col+x.id).localeCompare(y.col+y.id));
      const off=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||1e9);return J(route,200,a.slice(off,off+lim).map(r=>({col:r.col,id:r.id,data:r.data})))}
    if(m==='POST'){const b=[].concat(body());for(const r of b){if(r.user_id!==usr.id)return J(route,403,{message:'new row violates row-level security policy'});
        const i=rows.findIndex(x=>x.user_id===r.user_id&&x.col===r.col&&x.id===r.id);if(i>=0)rows[i]=r;else rows.push(r)}return J(route,201,null)}
    if(m==='DELETE'){const c=qp(u,'col'),id=qp(u,'id');for(let i=rows.length-1;i>=0;i--){const r=rows[i];if(r.user_id===usr.id&&r.col===c&&r.id===id)rows.splice(i,1)}return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}})}
  }
  if(p.startsWith('/storage/v1/')){
    if(!usr)return J(route,401,{message:'unauthorized'});
    const own=k=>k.startsWith(usr.id+'/');
    if(p==='/storage/v1/object/list/fotos'){const pre=body().prefix;return J(route,200,[...files.keys()].filter(k=>own(k)&&k.startsWith(pre+'/')).map(k=>({name:k.slice(pre.length+1),id:k})))}
    if(p==='/storage/v1/object/sign/fotos'&&m==='POST'){return J(route,200,body().paths.filter(own).map(k=>({path:k,signedURL:'/object/sign/fotos/'+k+'?token=t',error:null})))}
    if(p.startsWith('/storage/v1/object/sign/fotos/')){const k=decodeURIComponent(p.slice('/storage/v1/object/sign/fotos/'.length));if(!own(k))return J(route,403,{message:'denied'});return J(route,200,{signedURL:'/object/sign/fotos/'+k+'?token=t'})}
    if(p.startsWith('/storage/v1/object/fotos/')&&m==='POST'){const k=decodeURIComponent(p.slice('/storage/v1/object/fotos/'.length));if(!own(k))return J(route,403,{message:'new row violates row-level security policy'});files.set(k,req.postDataBuffer());return J(route,200,{Key:'fotos/'+k})}
    if(p==='/storage/v1/object/fotos'&&m==='DELETE'){for(const k of body().prefixes||[])if(own(k))files.delete(k);return J(route,200,[])}
  }
  return J(route,404,{message:'nicht nachgebaut: '+m+' '+p});
}

(async()=>{
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});   // wie iPhone: Viewport-Meta wird beachtet
  const html=fs.readFileSync(HTML,'utf8');const errs=[];
  await ctx.route(ORIGIN+'/**',r=>{const p=new URL(r.request().url()).pathname;
    if(p==='/'||p==='/index.html')return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
    return r.fulfill({status:404,body:''})});
  await ctx.route('https://cdn.jsdelivr.net/**',r=>r.abort());   // später registrierte Routen haben Vorrang
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({path:SBJS,contentType:'application/javascript'}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
  await ctx.route(SB+'/**',backend);
  const page=await ctx.newPage();
  page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errs.push(m.text())});
  let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/rest/v1/docs'))posts++});
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});

  await page.goto(ORIGIN+'/');await page.waitForSelector('#authGate:not([hidden])');
  ok(await page.isVisible('#agLogin')&&!(await page.isVisible('#v-dash')),'Ohne Konto: Anmeldebildschirm, App verborgen');
  ok(await page.evaluate(()=>window.innerWidth===390&&document.compatMode==='CSS1Compat'),'Seite in Handy-Breite (Viewport 390 px, Standardmodus)');
  // Registrieren
  await page.click('[data-goto="signup"]');ok(await page.isVisible('#agPw2'),'Registrieren-Formular');
  ok((await page.getAttribute('#agPw','autocomplete'))==='new-password','Registrieren: Handy schlägt neues Passwort vor');
  await page.check('#agShow');ok((await page.getAttribute('#agPw','type'))==='text'&&(await page.getAttribute('#agPw2','type'))==='text','Passwort anzeigen');await page.uncheck('#agShow');
  await page.fill('#agEmail','robin@test.de');await page.fill('#agPw','geheim123');await page.fill('#agPw2','anders123');await page.click('#agSignup');
  ok((await page.textContent('#agMsg')).includes('stimmen nicht'),'Passwörter müssen übereinstimmen');
  await page.fill('#agEmail','limit@test.de');await page.fill('#agPw2','geheim123');await page.click('#agSignup');await page.waitForTimeout(400);
  ok((await page.textContent('#agMsg')).includes('Mail-Kontingent'),'Mail-Limit von Supabase: verständliche Meldung');
  await page.fill('#agEmail','robin@test.de');
  await page.fill('#agPw2','geheim123');await page.click('#agSignup');
  await page.waitForSelector('#authGate',{state:'hidden'});
  ok(await page.isVisible('#welcome'),'Nach Registrierung: App mit Willkommen/Plan-Assistent');
  // Speichern
  await page.evaluate(()=>db.doc('body/2026-11-07').set({date:'2026-11-07',kg:81.5}));await page.waitForTimeout(300);
  const r1=rows.find(r=>r.col==='body'&&r.id==='2026-11-07');
  ok(r1&&r1.data.kg===81.5&&r1.user_id===users.get('robin@test.de').id,'Gewicht in Supabase gespeichert (mit Benutzer-ID)');
  ok(await page.evaluate(()=>S.body.some(b=>b.kg===81.5)),'App zeigt den gespeicherten Wert');
  await page.evaluate(()=>db.doc('body/2026-11-07').update({note:'x'}));await page.waitForTimeout(200);
  ok(rows.find(r=>r.col==='body'&&r.id==='2026-11-07').data.note==='x'&&rows.find(r=>r.col==='body').data.kg===81.5,'update() führt Felder zusammen');
  // Foto hochladen
  const up=await page.evaluate(async()=>{const b=new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'});return ASSETS.upload(b,{type:'image/jpeg'})});
  ok(/^[0-9a-f]{32}$/.test(up.id)&&[...files.keys()].some(k=>k.endsWith('/'+up.id)),'Foto in privatem Ordner gespeichert');
  // Neu laden: Sitzung bleibt, Daten kommen aus der Cloud
  await page.reload();await page.waitForSelector('#authGate',{state:'hidden'});await page.waitForTimeout(400);
  ok(await page.evaluate(()=>S.body.some(b=>b.kg===81.5)),'Nach Neuladen angemeldet, Daten aus der Cloud geladen');
  ok(await page.evaluate(id=>!!assetUrl[id],up.id),'Foto-Link nach Neuladen vorhanden');
  // Face ID einschalten
  await page.evaluate(()=>{showTab('dash');document.getElementById('acctCard').open=true;document.getElementById('acctCard').scrollIntoView()});
  ok((await page.textContent('#acEmail'))==='robin@test.de','Konto-Karte zeigt E-Mail');
  await page.click('#acFid');await page.waitForTimeout(500);
  ok(await page.evaluate(()=>!!localStorage.getItem('fm:faceid:'+SB_USER.id))&&(await page.textContent('#acFid')).includes('ausschalten'),'Face ID eingeschaltet (Gerätesperre registriert)');
  await page.reload();await page.waitForTimeout(800);
  ok(await page.evaluate(()=>document.getElementById('authGate').hidden),'Mit Face ID: entsperrt nach Bestätigung');
  // Face ID schlägt fehl → bleibt gesperrt
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  await page.reload();await page.waitForSelector('#agUnlock',{state:'visible'});await page.waitForTimeout(800);
  ok(await page.isVisible('#agUnlock')&&!(await page.isVisible('#v-dash')),'Face ID nicht bestätigt: App bleibt gesperrt');
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  await page.click('#agUnlock');await page.waitForSelector('#authGate',{state:'hidden'});ok(true,'Entsperren per Knopf');
  // Abmelden
  await page.evaluate(()=>{document.getElementById('acctCard').open=true});await page.click('#acLogout');await page.waitForSelector('#agLogin',{state:'visible'});
  ok(true,'Abmelden → Anmeldebildschirm');
  // Falsches Passwort
  await page.fill('#agEmail','robin@test.de');await page.fill('#agPw','falsch');await page.click('#agLogin');await page.waitForTimeout(400);
  ok((await page.textContent('#agMsg')).includes('stimmt nicht'),'Falsches Passwort: verständliche Meldung');
  // Zweiter Benutzer sieht nichts vom ersten
  await page.click('[data-goto="signup"]');await page.fill('#agEmail','freund@test.de');await page.fill('#agPw','freund123');await page.fill('#agPw2','freund123');await page.click('#agSignup');
  await page.waitForSelector('#authGate',{state:'hidden'});await page.waitForTimeout(400);
  ok(await page.evaluate(()=>S.body.length===0),'Zweiter Benutzer: eigenes, leeres Konto');
  const leak=await page.evaluate(async()=>{const {data}=await SB.from('docs').select('col,id,data');return data.length});
  ok(leak===0,'Zweiter Benutzer kann die Zeilen des ersten nicht lesen');
  // Neues Konto: alles leer, nichts von Robin
  const E=await page.evaluate(()=>({h:CFG.height,a:CFG.age,p:CFG.protein,g:CFG.goalKg,ex:GYM_ORDER.map(k=>TEMPLATES[k].ex.length),names:GYM_ORDER.map(k=>TEMPLATES[k].name),sg:schedOf('base').gym.length,sr:schedOf('base').run.length,tg:targetFor(today()).total,kg:kgNow(),week:planDay(today()).gym}));
  ok(E.h===0&&E.a===0&&E.p===0&&E.g===0&&E.kg===0,'Neues Konto: Größe, Alter, Eiweiß, Zielgewicht, Gewicht = 0');
  ok(E.ex.every(n=>n===0)&&E.names.join()==='Einheit A,Einheit B,Einheit C','Neues Konto: leere Trainingsplan-Einheiten (kein Plan von Robin)');
  ok(E.sg===0&&E.sr===0&&E.week===null&&E.tg===0,'Neues Konto: keine Trainings- und Lauftage, kcal-Ziel 0');
  const bad=[];
  for(const v of ['dash','gym','run','food','body']){await page.click('nav.tabs button[data-v="'+v+'"]');await page.waitForTimeout(250);
    await page.evaluate(()=>document.querySelectorAll('details.card').forEach(d=>d.open=true));await page.waitForTimeout(150);
    const tx=await page.evaluate(()=>document.querySelector('.view:not([hidden])').innerText);
    if(/NaN|Infinity|undefined|\bnull\b/.test(tx))bad.push(v+': '+(tx.match(/.{0,30}(NaN|Infinity|undefined|\bnull\b).{0,20}/)||[''])[0].replace(/\n/g,' '));
    {const m=tx.match(/.{0,40}(Robin|Chopin|Sulzfeld|1:58|184 cm|83,0).{0,30}/);if(m)bad.push(v+': persönlicher Wert … '+m[0].replace(/\n/g,' '))}
    await page.screenshot({path:'shots/neu_'+v+'.png',fullPage:true})}
  ok(bad.length===0,'Neues Konto: kein NaN/Infinity/undefined und keine persönlichen Werte in allen Tabs '+bad.join(' | '));
  ok((await page.textContent('#v-food')).includes('Ziel noch offen')||await page.evaluate(()=>document.getElementById('fLeft').textContent.includes('offen')),'Essen: Hinweis, dass das Ziel noch offen ist');
  ok(await page.evaluate(()=>trainCheck().state==='plan'),'Training prüfen: ohne Plan der Hinweis „Plan anlegen“');
  await page.click('nav.tabs button[data-v="dash"]');await page.waitForTimeout(200);
  // Erster Benutzer wieder anmelden: Face ID gilt pro Benutzer
  await page.evaluate(()=>{document.getElementById('acctCard').open=true});await page.click('#acLogout');await page.waitForSelector('#agLogin',{state:'visible'});
  await page.fill('#agEmail','robin@test.de');await page.fill('#agPw','geheim123');await page.click('#agLogin');await page.waitForSelector('#authGate',{state:'hidden'});await page.waitForTimeout(400);
  ok(await page.evaluate(()=>S.body.some(b=>b.kg===81.5)),'Erster Benutzer: Daten wieder da');
  // Import: 450 Einträge in wenigen Anfragen
  {const meals=Array.from({length:450},(_,i)=>({date:'2026-10-'+String(1+i%28).padStart(2,'0'),name:'Test '+i,kcal:100+i,p:5,c:10,f:2,createdAt:1790000000000+i}));
   const body=[{date:'2026-10-01',kg:83},{date:'2026-10-02',kg:82.8}];
   await page.setInputFiles('#impFile',{name:'export.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({data:{meals,body}}))});
   await page.waitForSelector('#impGo',{state:'attached'});posts=0;
   await page.evaluate(()=>document.getElementById('impGo').click());
   await page.waitForFunction(()=>/importiert/.test(document.getElementById('toast')?.textContent||document.body.textContent),null,{timeout:20000}).catch(()=>{});await page.waitForTimeout(800);
   const me=rows.filter(r=>r.col==='meals').length;
   ok(me===450&&rows.filter(r=>r.col==='body').length>=3,'Import: 450 Mahlzeiten + Gewichte gespeichert ('+me+')');
   ok(posts<=4,'Import in wenigen Anfragen ('+posts+' statt ~452)');
   ok(await page.evaluate(()=>S.meals.length>=450),'Importierte Daten sofort sichtbar');}
  await page.evaluate(()=>{document.getElementById('acctCard').open=true});await page.click('#acLogout');await page.waitForSelector('#agLogin',{state:'visible'});
  // Abgelaufener Bestätigungslink
  await page.goto(ORIGIN+'/?x=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.waitForSelector('#agLogin',{state:'visible'});
  ok((await page.textContent('#agMsg')).includes('abgelaufen'),'Abgelaufener Link: verständliche Meldung');
  // Passwort zurücksetzen über den Link aus der Mail
  {const u=users.get('robin@test.de');
   await page.goto(ORIGIN+'/?r=1#access_token='+jwt(u)+'&refresh_token=r-'+u.id+'&expires_in=3600&token_type=bearer&type=recovery');
   await page.waitForSelector('#agNewPw',{state:'visible'});ok(true,'Link aus der Mail → Formular „Neues Passwort“');
   await page.fill('#agPwNew','neuesPasswort9');await page.click('#agNewPw');await page.waitForSelector('#authGate',{state:'hidden'});
   ok(u.pw==='neuesPasswort9','Neues Passwort gespeichert und angemeldet');}
  await page.screenshot({path:require('path').join(__dirname,'shots','cloud_app.png')});
  await page.evaluate(()=>{document.getElementById('acctCard').open=true});await page.click('#acLogout');await page.waitForSelector('#agLogin',{state:'visible'});
  await page.screenshot({path:require('path').join(__dirname,'shots','cloud_login.png')});
  ok(errs.length===0,'Keine JS-Fehler '+errs.join(' | '));
  await browser.close();
  console.log(`\n${pass}/${pass+fail} bestanden`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
