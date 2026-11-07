"""Baut aus der eigenen Formora-Datei die Online-Version mit Benutzerkonten (Supabase) und Face-ID-Sperre.

Unterschiede zur eigenen (Claude-)Version:
- Daten liegen in Supabase (Tabelle public.docs, eine Zeile pro Dokument, Row Level Security:
  jeder sieht nur seine eigenen Zeilen). Gleiche Schnittstelle wie window.claude db
  (collection/doc, add/set/update/delete/onSnapshot), dadurch bleibt der App-Code unverändert.
- Fotos (Formupdate, Übungs-Notizen) liegen im privaten Storage-Bucket „fotos“ unter <user-id>/<asset-id>.
- Anmeldung mit E-Mail + Passwort, danach optional Face ID / Touch ID (WebAuthn, Gerätesperre).
- Streckenplaner ausgeblendet, neutrale Startwerte, Willkommen mit Plan-Assistent (wie die Teilen-Version).
- Foto-Schätzung und Coach-Check brauchen Claude und sind hier nicht verfügbar.

Aufruf: python3 tools/build_cloud.py <eigene.html> <ausgabe.html> [tools/cloud_config.json]
"""
import json, os, sys

src, out = sys.argv[1], sys.argv[2]
cfg_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "cloud_config.json")
cfg = json.load(open(cfg_path, encoding="utf-8"))
s = open(src, encoding="utf-8").read()
SB_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"


def R(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:80], s.count(a))
    s = s.replace(a, b)


CLOUD_JS = r'''/* =====================================================================
   Online-Version: Supabase-Konto, Cloud-Speicher, Face-ID-Sperre
   ===================================================================== */
const SB_URL=__SB_URL__,SB_KEY=__SB_KEY__;
let SB=null,SB_USER=null,CLOUD=null;
const b64u={enc:b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
  dec:s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)),c=>c.charCodeAt(0))};
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
const hex=n=>[...rnd(n)].map(x=>x.toString(16).padStart(2,"0")).join("");

/* Datenbank: Cache im Speicher, Schreiben direkt nach Supabase (Tabelle docs) */
function cloudDb(uid,rows){
  const cache={},subs=new Set();
  const put=r=>{(cache[r.col]||(cache[r.col]={}))[r.id]=r.data};
  rows.forEach(put);
  const load=c=>cache[c]||(cache[c]={});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const split=p=>{const i=p.lastIndexOf("/");return [p.slice(0,i),p.slice(i+1)]};
  const docSnap=(id,v)=>({id,exists:v!=null,data:()=>clone(v)});
  const fire=c=>subs.forEach(s=>{if(s.c===c)setTimeout(()=>{if(subs.has(s))s.emit()},0)});
  const sub=(c,emit)=>{const s={c,emit};subs.add(s);setTimeout(()=>{if(subs.has(s))emit()},0);return ()=>subs.delete(s)};
  const fail=e=>{const x=new Error(e&&e.message||"Speichern fehlgeschlagen – keine Verbindung?");x.code="cloud";return x};
  async function write(c,id,v){
    const o=load(c),old=o[id];
    if(v==null)delete o[id];else o[id]=clone(v);fire(c);
    const q=v==null?SB.from("docs").delete().eq("user_id",uid).eq("col",c).eq("id",id)
      :SB.from("docs").upsert({user_id:uid,col:c,id,data:o[id],updated_at:new Date().toISOString()},{onConflict:"user_id,col,id"});
    let r;try{r=await q}catch(e){r={error:e}}
    if(r&&r.error){if(old===undefined)delete o[id];else o[id]=old;fire(c);throw fail(r.error)}
  }
  const docRef=path=>{const [c,id]=split(path);return {id,path,
    get:async()=>docSnap(id,load(c)[id]),
    set:async v=>write(c,id,v),
    update:async v=>write(c,id,{...(load(c)[id]||{}),...clone(v)}),
    delete:async()=>write(c,id,null),
    onSnapshot:(fn,err)=>sub(c,()=>{try{fn(docSnap(id,load(c)[id]))}catch(e){err&&err(e)}})}};
  const newId=()=>Date.now().toString(36)+hex(5);
  const colRef=c=>({path:c,doc:id=>docRef(c+"/"+(id||newId())),
    add:async v=>{const r=docRef(c+"/"+newId());await r.set(v);return r},
    onSnapshot:(fn,err)=>sub(c,()=>{try{const o=load(c);fn({docs:Object.keys(o).map(k=>docSnap(k,o[k])),size:Object.keys(o).length})}catch(e){err&&err(e)}})});
  /* Andere Geräte: beim Zurückkehren in die App neu laden */
  async function refresh(){
    try{const rows=await cloudLoadAll(uid);const seen=new Set([...Object.keys(cache)]);
      Object.keys(cache).forEach(c=>cache[c]={});rows.forEach(put);rows.forEach(r=>seen.add(r.col));seen.forEach(fire)}catch(e){}
  }
  return {collection:colRef,doc:docRef,refresh,has:c=>Object.keys(load(c)).length>0};
}
async function cloudLoadAll(uid){
  const out=[];
  for(let from=0;;from+=1000){
    const {data,error}=await SB.from("docs").select("col,id,data").eq("user_id",uid).order("col").order("id").range(from,from+999);
    if(error)throw error;out.push(...data);if(data.length<1000)break;
  }
  return out;
}

/* Fotos: privater Bucket „fotos“, Pfad <user-id>/<asset-id> */
function cloudAssets(uid){
  const B=()=>SB.storage.from("fotos");
  return {
    async upload(blob,o){const id=hex(16);
      const {error}=await B().upload(uid+"/"+id,blob,{contentType:(o&&o.type)||blob.type||"image/jpeg",upsert:false});
      if(error)throw error;
      const {data}=await B().createSignedUrl(uid+"/"+id,31536000);return {id,url:data&&data.signedUrl||""}},
    async delete(id){await B().remove([uid+"/"+id])}
  };
}
async function cloudSignAll(uid){
  try{const {data}=await SB.storage.from("fotos").list(uid,{limit:1000});
    const names=(data||[]).map(f=>f.name).filter(n=>/^[0-9a-f]{32}$/.test(n));if(!names.length)return;
    const {data:urls}=await SB.storage.from("fotos").createSignedUrls(names.map(n=>uid+"/"+n),31536000);
    (urls||[]).forEach((u,i)=>{if(u&&u.signedUrl)assetUrl[names[i]]=u.signedUrl});scheduleRender();
  }catch(e){}
}

/* Face ID / Touch ID: WebAuthn mit Plattform-Authenticator als Gerätesperre */
const FID_KEY=uid=>"fm:faceid:"+uid;
const fidGet=uid=>{try{return localStorage.getItem(FID_KEY(uid))}catch(e){return null}};
const fidSet=(uid,v)=>{try{v?localStorage.setItem(FID_KEY(uid),v):localStorage.removeItem(FID_KEY(uid))}catch(e){}};
async function fidAvailable(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())}catch(e){return false}}
async function fidRegister(){
  const cred=await navigator.credentials.create({publicKey:{
    challenge:rnd(32),rp:{name:"Formora"},
    user:{id:rnd(16),name:SB_USER.email,displayName:SB_USER.email},
    pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
    authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"},
    timeout:60000,attestation:"none"}});
  if(!cred)throw new Error("abgebrochen");
  fidSet(SB_USER.id,b64u.enc(cred.rawId));
}
async function fidVerify(){
  const id=fidGet(SB_USER.id);if(!id)return true;
  const a=await navigator.credentials.get({publicKey:{challenge:rnd(32),timeout:60000,userVerification:"required",
    allowCredentials:[{type:"public-key",id:b64u.dec(id),transports:["internal","hybrid"]}]}});
  const ad=a&&a.response&&new Uint8Array(a.response.authenticatorData);
  return !!(ad&&ad.length>32&&(ad[32]&4));   /* UV-Flag: Gesicht/Finger/Gerätecode wurde geprüft */
}

/* Anmelde- und Sperrbildschirm */
const gate=(mode,msg)=>{
  const g=$("authGate");g.hidden=false;document.body.classList.add("gated");
  g.querySelectorAll("[data-gm]").forEach(x=>x.hidden=!x.dataset.gm.split(" ").includes(mode));
  $("agMsg").textContent=msg||"";$("agMsg").hidden=!msg;g.dataset.mode=mode;
};
const ungate=()=>{$("authGate").hidden=true;document.body.classList.remove("gated")};
const agBusy=(b,txt)=>{$("authGate").querySelectorAll("button").forEach(x=>x.disabled=b);if(txt)$("agMsg").textContent=txt,$("agMsg").hidden=false};
const deErr=e=>{const m=(e&&e.message||"")+"";
  if(/Invalid login/i.test(m))return "E-Mail oder Passwort stimmt nicht.";
  if(/not confirmed/i.test(m))return "Bitte bestätige zuerst deine E-Mail – der Link ist in deinem Postfach.";
  if(/already registered|already exists/i.test(m))return "Für diese E-Mail gibt es schon ein Konto – melde dich an.";
  if(/Password should be|weak/i.test(m))return "Das Passwort ist zu schwach – mindestens 8 Zeichen.";
  if(/rate limit|too many/i.test(m))return "Zu viele Versuche – warte kurz und probiere es dann noch einmal.";
  if(/fetch|network|Failed/i.test(m))return "Keine Verbindung zum Server. Prüfe dein Internet.";
  return "Das hat nicht geklappt: "+m};

function cloudStart(){
  return new Promise(resolve=>{
    if(!window.supabase||!SB_URL||!SB_KEY){gate("setup");return resolve(null)}
    const RECOVERY=/type=recovery/.test(location.hash);
    SB=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    let done=false,unlocking=false;
    const finish=async user=>{
      if(done)return;SB_USER=user;
      if(fidGet(user.id)){gate("lock");if(!unlocking)tryUnlock();return}
      await boot();
    };
    const boot=async()=>{
      if(done)return;done=true;gate("load");
      try{const rows=await cloudLoadAll(SB_USER.id);CLOUD=cloudDb(SB_USER.id,rows);ungate();renderAcct();resolve(CLOUD);
        cloudSignAll(SB_USER.id);offerFaceId();
      }catch(e){done=false;gate("login",deErr(e))}
    };
    const tryUnlock=async()=>{
      unlocking=true;agBusy(true);
      try{if(await fidVerify())await boot();else gate("lock","Face ID wurde nicht bestätigt.")}
      catch(e){gate("lock",e&&e.name==="NotAllowedError"?"Abgebrochen – tippe auf „Mit Face ID entsperren“.":deErr(e))}
      finally{unlocking=false;agBusy(false)}
    };
    $("agUnlock").onclick=tryUnlock;
    $("agLogin").onclick=async()=>{
      const em=$("agEmail").value.trim(),pw=$("agPw").value;
      if(!/^\S+@\S+\.\S+$/.test(em))return gate("login","Bitte eine gültige E-Mail eingeben.");
      if(!pw)return gate("login","Bitte dein Passwort eingeben.");
      agBusy(true,"Anmelden …");
      const {data,error}=await SB.auth.signInWithPassword({email:em,password:pw});agBusy(false);
      if(error)return gate("login",deErr(error));
      $("agPw").value="";finish(data.user);
    };
    $("agSignup").onclick=async()=>{
      const em=$("agEmail").value.trim(),pw=$("agPw").value,pw2=$("agPw2").value;
      if(!/^\S+@\S+\.\S+$/.test(em))return gate("signup","Bitte eine gültige E-Mail eingeben.");
      if(pw.length<8)return gate("signup","Das Passwort braucht mindestens 8 Zeichen.");
      if(pw!==pw2)return gate("signup","Die Passwörter stimmen nicht überein.");
      agBusy(true,"Konto wird erstellt …");
      const {data,error}=await SB.auth.signUp({email:em,password:pw,options:{emailRedirectTo:location.origin+location.pathname}});agBusy(false);
      if(error)return gate("signup",deErr(error));
      $("agPw").value=$("agPw2").value="";
      if(data.session)finish(data.user);
      else gate("login","Fast geschafft: Wir haben dir eine E-Mail geschickt. Tippe auf den Link darin und melde dich dann hier an.");
    };
    $("agForgot").onclick=async()=>{
      const em=$("agEmail").value.trim();
      if(!/^\S+@\S+\.\S+$/.test(em))return gate("login","Gib oben deine E-Mail ein, dann schicken wir dir einen Link zum Zurücksetzen.");
      agBusy(true,"Link wird gesendet …");
      const {error}=await SB.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});agBusy(false);
      gate("login",error?deErr(error):"Wenn es ein Konto mit dieser E-Mail gibt, ist ein Link zum Zurücksetzen unterwegs.");
    };
    $("agNewPw").onclick=async()=>{
      const pw=$("agPwNew").value;if(pw.length<8)return gate("reset","Das Passwort braucht mindestens 8 Zeichen.");
      agBusy(true,"Speichern …");const {data,error}=await SB.auth.updateUser({password:pw});agBusy(false);
      if(error)return gate("reset",deErr(error));
      $("agPwNew").value="";toast("Neues Passwort gespeichert");finish(data.user);
    };
    $("authGate").querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>gate(b.dataset.goto));
    $("agLogout").onclick=cloudLogout;
    SB.auth.onAuthStateChange((ev,session)=>{
      if(ev==="PASSWORD_RECOVERY"){gate("reset");return}
      if(ev==="SIGNED_OUT"&&done){location.reload()}
    });
    SB.auth.getSession().then(({data})=>{
      if(RECOVERY){gate("reset");return}
      const u=data&&data.session&&data.session.user;u?finish(u):gate("login");
    }).catch(()=>gate("login"));
    /* Sperren, wenn die App länger als 5 Minuten im Hintergrund war */
    let hiddenAt=0;
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden){hiddenAt=Date.now();return}
      if(!done||!SB_USER)return;
      if(fidGet(SB_USER.id)&&Date.now()-hiddenAt>300000){done=false;gate("lock");
        const relock=async()=>{agBusy(true);try{if(await fidVerify()){done=true;ungate()}else gate("lock","Face ID wurde nicht bestätigt.")}catch(e){gate("lock","Tippe auf „Mit Face ID entsperren“.")}finally{agBusy(false)}};
        $("agUnlock").onclick=relock;relock();return}
      if(CLOUD&&Date.now()-hiddenAt>30000)CLOUD.refresh();
    });
  });
}
async function cloudLogout(){
  try{ls.keys().forEach(k=>ls.del(k))}catch(e){}
  try{await SB.auth.signOut()}catch(e){}
  location.reload();
}
async function offerFaceId(){
  if(fidGet(SB_USER.id)||ls.get("faceidAsked")||!(await fidAvailable()))return;
  ls.set("faceidAsked",1);
  toast("Formora mit Face ID schützen? Unter Einstellungen → Konto einschalten.");
}
async function renderAcct(){
  if(!SB_USER)return;
  $("acEmail").textContent=SB_USER.email||"";
  const on=!!fidGet(SB_USER.id),av=await fidAvailable();
  $("acFid").textContent=on?"Face ID ausschalten":"Face ID einschalten";
  $("acFid").disabled=!av&&!on;
  $("acFidInfo").textContent=on?"An: Formora fragt beim Öffnen nach Face ID / Touch ID (bzw. Gerätecode)."
    :av?"Aus: Formora öffnet sich ohne Face ID, solange du angemeldet bist.":"Dieses Gerät bzw. dieser Browser unterstützt keine Face ID / Touch ID für Websites.";
}
function bindAcct(){
  $("acFid").onclick=async()=>{
    if(fidGet(SB_USER.id)){fidSet(SB_USER.id,null);toast("Face ID ausgeschaltet");return renderAcct()}
    try{await fidRegister();toast("Face ID eingeschaltet");}catch(e){toast(e&&e.name==="NotAllowedError"?"Abgebrochen":"Face ID konnte nicht eingerichtet werden")}
    renderAcct();
  };
  $("acLogout").onclick=cloudLogout;
}
'''

GATE_HTML = '''  <div id="authGate" class="gate" hidden>
    <div class="gate-in">
      <div class="gate-logo">Formora</div>
      <div data-gm="login signup reset" class="gate-sub"><span data-gm="login">Willkommen zurück</span><span data-gm="signup">Konto erstellen</span><span data-gm="reset">Neues Passwort festlegen</span></div>
      <div data-gm="lock" class="gate-sub">Formora ist gesperrt</div>
      <div data-gm="load" class="gate-sub">Deine Daten werden geladen …</div>
      <div data-gm="setup" class="gate-sub">Die Online-Version ist noch nicht eingerichtet (Supabase fehlt).</div>
      <p id="agMsg" class="gate-msg" role="status" hidden></p>
      <div data-gm="login signup" class="gate-form">
        <label class="f">E-Mail<input id="agEmail" type="email" autocomplete="email" inputmode="email" placeholder="du@beispiel.de"></label>
        <label class="f">Passwort<input id="agPw" type="password" autocomplete="current-password" placeholder="mindestens 8 Zeichen"></label>
        <label class="f" data-gm="signup">Passwort wiederholen<input id="agPw2" type="password" autocomplete="new-password"></label>
        <button class="btn" id="agLogin" data-gm="login">Anmelden</button>
        <button class="btn" id="agSignup" data-gm="signup">Konto erstellen</button>
        <button class="btn ghost" data-gm="login" data-goto="signup">Neu hier? Konto erstellen</button>
        <button class="btn ghost" data-gm="signup" data-goto="login">Schon ein Konto? Anmelden</button>
        <button class="linkbtn" id="agForgot" data-gm="login">Passwort vergessen?</button>
      </div>
      <div data-gm="reset" class="gate-form">
        <label class="f">Neues Passwort<input id="agPwNew" type="password" autocomplete="new-password" placeholder="mindestens 8 Zeichen"></label>
        <button class="btn" id="agNewPw">Passwort speichern</button>
      </div>
      <div data-gm="lock" class="gate-form">
        <button class="btn" id="agUnlock">Mit Face ID entsperren</button>
        <button class="btn ghost" id="agLogout">Abmelden</button>
      </div>
      <p class="gate-foot" data-gm="login signup">Deine Daten liegen in deinem eigenen Konto und werden verschlüsselt übertragen. Andere Nutzer können sie nicht sehen.</p>
    </div>
  </div>
'''

GATE_CSS = '''/* Online-Version: Anmelde-/Sperrbildschirm */
.gate{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;justify-content:center;overflow:auto;
  padding:calc(48px + env(safe-area-inset-top,0px)) 16px calc(32px + env(safe-area-inset-bottom,0px))}
.gate::before{content:"";position:fixed;inset:0;z-index:-1;background:radial-gradient(420px 320px at 100% 0%,rgba(217,180,90,.20),rgba(217,180,90,0) 70%)}
.gate-in{width:100%;max-width:400px;display:flex;flex-direction:column;gap:14px}
.gate-logo{font:800 18px var(--display);letter-spacing:.22em;text-transform:uppercase;margin-bottom:18px}
.gate-sub{font:700 26px var(--display);letter-spacing:-.01em}
.gate-form{display:flex;flex-direction:column;gap:12px}
.gate-form .f{display:flex;flex-direction:column;gap:6px}
.gate-form .btn{width:100%;min-height:48px}
.gate-msg{margin:0;padding:12px 14px;border:1px solid var(--edge,var(--line));border-radius:var(--r-sm);background:var(--surface);font-size:14px}
.gate-foot{font-size:12.5px;color:var(--muted);margin:8px 0 0}
.linkbtn{background:none;border:0;color:var(--accent);font:600 14px var(--body);min-height:44px;cursor:pointer}
body.gated .wrap,body.gated nav.tabs{visibility:hidden}
body.gated .gate{visibility:visible}
'''

ACCT_HTML = '''    <details class="card" id="acctCard">
      <summary><h2 data-ico="heart">Konto</h2></summary>
      <div class="ex-last">Angemeldet als <b id="acEmail"></b></div>
      <button class="btn" id="acFid">Face ID einschalten</button>
      <div class="ex-last" id="acFidInfo"></div>
      <button class="btn ghost" id="acLogout">Abmelden</button>
    </details>
'''

LOCAL_FALLBACK_NOTE = "Foto-Schätzung und Coach-Check brauchen Claude und funktionieren nur in der Claude-Version von Formora."

# Eigenständige Seite: Doctype, Zeichensatz und Viewport (im Artefakt ergänzt das Gerüst diese Zeilen)
HEAD = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#0B0B0A">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
        '<meta name="format-detection" content="telephone=no">\n')
assert s.startswith("<title>"), s[:40]
s = HEAD + s

# Supabase-Bibliothek laden
R('<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<script src="' + SB_JS + '"></script>\n<link rel="preconnect" href="https://fonts.googleapis.com">')

# Datenbank: Supabase statt window.claude db
R('''  try{db=window.claude&&window.claude.use?await window.claude.use("db"):null}catch(e){db=null}''',
  '''  try{db=await cloudStart()}catch(e){db=null}''')
R('''/* =====================================================================
   Start
   ===================================================================== */''',
  CLOUD_JS.replace("__SB_URL__", json.dumps(cfg.get("url", ""))).replace("__SB_KEY__", json.dumps(cfg.get("anonKey", ""))) +
  '''/* =====================================================================
   Start
   ===================================================================== */''')
R('''async function initAssets(){try{ASSETS=window.claude&&window.claude.use?await window.claude.use("assets"):null}catch(e){ASSETS=null}scheduleRender()}''',
  '''async function initAssets(){ASSETS=SB&&SB_USER?cloudAssets(SB_USER.id):null;scheduleRender()}''')
R('''Speichern ist in dieser Ansicht nicht verfügbar. Öffne Formora angemeldet in der Claude-App oder in Safari.''',
  '''Keine Verbindung zu deinem Konto. Prüfe dein Internet und lade die Seite neu.''')
R('''Der Coach-Check braucht Claude – öffne Formora in der Claude-App.''', LOCAL_FALLBACK_NOTE)

# Datenschutz-Hinweis
R('''<div class="notice warn"><b>Datenschutz:</b> Wer diesen Link hat, sieht deine Daten – nicht teilen.</div>''',
  '''<div class="notice"><b>Deine Daten:</b> Sie liegen in deinem eigenen Konto – andere Nutzer können sie nicht sehen. Du kannst Formora auf jedem Gerät nutzen – einfach anmelden. Zusätzlich kannst du ab und zu „Export als JSON“ sichern.</div>''')

# Konto-Karte vor den Einstellungen
R('''    <details class="card" id="setCard">''', ACCT_HTML + '''    <details class="card" id="setCard">''')

# Anmelde-Bildschirm + CSS
R('''  <div id="dbNotice"''', GATE_HTML + '''  <div id="dbNotice"''')
R('''/* v54 Übungs-Notizen */''', GATE_CSS + '''/* v54 Übungs-Notizen */''')

# Streckenplaner entfernen (Startpunkt ist Robins Adresse)
R('''<div class="card" id="rtCard">''', '''<div class="card" id="rtCard" hidden style="display:none">''')

# Neutrale Startwerte + Willkommen mit Plan-Assistent
R('''const DEFAULT_CFG={height:184,age:31,protein:160,deficit:450,activity:1.5,goalKg:80,''',
  '''const DEFAULT_CFG={height:175,age:30,protein:140,deficit:400,activity:1.5,goalKg:75,''')
R('''const S={sessions:[],runs:[],body:[],meals:[],daily:[],checkins:[],start:"2026-10-19",settingsRaw:{}};''',
  '''const S={sessions:[],runs:[],body:[],meals:[],daily:[],checkins:[],start:(()=>{const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})(),settingsRaw:{}};''')
R('''  <div id="dbNotice"''', '''  <div id="welcome" class="notice" hidden style="margin-top:14px"><b>Willkommen bei Formora!</b> Beantworte ein paar Fragen zu Ziel, Erfahrung und Trainingstagen – Formora erstellt dir daraus deinen persönlichen Trainingsplan und dein Kalorienziel. <button class="btn" data-pa-open="1" style="margin-top:8px;width:100%">Plan-Assistent starten</button> Du hast schon Daten aus der Claude-Version? Unter Einstellungen → „Import“ holst du sie in dein Konto. <button class="btn ghost" id="welcomeOk" style="margin-top:8px">Verstanden</button></div>
  <div id="dbNotice"''')
R('''  buildExIndex();renderDayChips();mix=loadMix();subscribe();render();initPhoto();initAssets();''',
  '''  buildExIndex();renderDayChips();mix=loadMix();subscribe();render();initPhoto();initAssets();bindAcct();
  if(!ls.get("welcomed")&&!db.has("settings"))$("welcome").hidden=false;
  $("welcomeOk").onclick=()=>{ls.set("welcomed",1);$("welcome").hidden=true};''')

open(out, "w", encoding="utf-8").write(s)
print("ok", len(s))
