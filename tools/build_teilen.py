#!/usr/bin/env python3
"""Teilen-Version von Formora bauen: jede Person speichert nur auf dem eigenen Gerät (localStorage),
neutrale Startwerte, Willkommenshinweis, keine Routen-Karte.
Aufruf: python3 tools/build_teilen.py index.html <ausgabe.html>
Nachgebaut aus der veröffentlichten Teilen-Version v18 (exakt gleiches Ergebnis für index.html v69)."""
import re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def R(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:80])
    s = s.replace(a, b)

def RL(pattern, line):
    """Eine ganze Zeile per Muster ersetzen"""
    global s
    s2, k = re.subn(pattern, lambda m: line, s, count=1, flags=re.M)
    assert k == 1, pattern
    s = s2

WELCOME = "  <div id=\"welcome\" class=\"notice\" hidden style=\"margin-top:14px\"><b>Willkommen bei Formora!</b> Beantworte ein paar Fragen zu Ziel, Erfahrung und Trainingstagen – Formora erstellt dir daraus deinen persönlichen Trainingsplan und dein Kalorienziel. <button class=\"btn\" data-pa-open=\"1\" style=\"margin-top:8px;width:100%\">Plan-Assistent starten</button> Deine Daten bleiben nur auf diesem Gerät. <button class=\"btn ghost\" id=\"welcomeOk\" style=\"margin-top:8px\">Verstanden</button></div>"
DBNOTICE = "  <div id=\"dbNotice\" class=\"notice\" hidden style=\"margin-top:14px\">Speichern ist in diesem Browser nicht möglich (privates Fenster oder gesperrte Website-Daten). Öffne Formora in einem normalen Browserfenster.</div>"
PRIVACY = "      <div class=\"notice\"><b>Deine Daten bleiben bei dir:</b> Alles wird nur auf diesem Gerät in diesem Browser gespeichert – niemand sonst sieht es, auch nicht, wer dir den Link gegeben hat. Löschst du die Browserdaten oder wechselst das Handy, ist es weg: sichere ab und zu mit „Export als JSON“.</div>"
CFG = "const DEFAULT_CFG={height:175,age:30,protein:140,deficit:400,activity:1.5,goalKg:75,stepGoal:10000,goal:\"cut\",sex:\"m\",bf:0,surplus:250,week:null,weekSrc:\"plan\",customEx:[],gymEquip:null,kcalAdj:[],race:null,sched:null,runScale:1};"
S_LINE = "const S={sessions:[],runs:[],body:[],meals:[],daily:[],checkins:[],start:(()=>{const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+\"-\"+String(d.getMonth()+1).padStart(2,\"0\")+\"-\"+String(d.getDate()).padStart(2,\"0\")})(),settingsRaw:{}};"
LOCALDB = "/* Lokaler Speicher statt gemeinsamer Datenbank: jede Person hat ihre Daten nur auf dem eigenen Gerät. */\nfunction localDb(){\n  const P=\"fm:db:\",ls0=window.localStorage;ls0.setItem(P+\"probe\",\"1\");ls0.removeItem(P+\"probe\");\n  const subs=new Set();\n  const load=c=>{try{return JSON.parse(ls0.getItem(P+c)||\"{}\")||{}}catch(e){return {}}};\n  const store=(c,o)=>{try{ls0.setItem(P+c,JSON.stringify(o))}catch(e){const x=new Error(\"Gerätespeicher voll\");x.code=\"quota\";throw x}};\n  const split=p=>{const i=p.lastIndexOf(\"/\");return [p.slice(0,i),p.slice(i+1)]};\n  const docSnap=(id,v)=>({id,exists:v!=null,data:()=>v==null?undefined:JSON.parse(JSON.stringify(v))});\n  const fire=c=>subs.forEach(s=>{if(s.c===c)setTimeout(()=>{if(subs.has(s))s.emit()},0)});\n  const sub=(c,emit)=>{const s={c,emit};subs.add(s);setTimeout(()=>{if(subs.has(s))emit()},0);return ()=>subs.delete(s)};\n  const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);\n  const docRef=path=>{const [c,id]=split(path);return {id,path,\n    get:async()=>docSnap(id,load(c)[id]),\n    set:async v=>{const o=load(c);o[id]=JSON.parse(JSON.stringify(v));store(c,o);fire(c)},\n    update:async v=>{const o=load(c);o[id]={...(o[id]||{}),...JSON.parse(JSON.stringify(v))};store(c,o);fire(c)},\n    delete:async()=>{const o=load(c);delete o[id];store(c,o);fire(c)},\n    onSnapshot:(fn,err)=>sub(c,()=>{try{fn(docSnap(id,load(c)[id]))}catch(e){err&&err(e)}})}};\n  const colRef=c=>({path:c,doc:id=>docRef(c+\"/\"+(id||newId())),\n    add:async v=>{const r=docRef(c+\"/\"+newId());await r.set(v);return r},\n    onSnapshot:(fn,err)=>sub(c,()=>{try{const o=load(c);fn({docs:Object.keys(o).map(k=>docSnap(k,o[k])),size:Object.keys(o).length})}catch(e){err&&err(e)}})});\n  window.addEventListener(\"storage\",e=>{if(e.key&&e.key.startsWith(P))fire(e.key.slice(P.length))});\n  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}\n  return {collection:colRef,doc:docRef};\n}"
USE = "  try{db=localDb()}catch(e){db=null}"
WELCOME_JS = "  if(!ls.get(\"welcomed\")&&!window.localStorage.getItem(\"fm:db:settings\"))$(\"welcome\").hidden=false;\n  $(\"welcomeOk\").onclick=()=>{ls.set(\"welcomed\",1);$(\"welcome\").hidden=true};"

R('''  <div id="dbNotice" class="notice" hidden style="margin-top:14px">Speichern ist in dieser Ansicht nicht verfügbar. Öffne Formora angemeldet in der Claude-App oder in Safari.</div>''',
  WELCOME + "\n" + DBNOTICE)
R('''      <div class="notice warn"><b>Datenschutz:</b> Wer diesen Link hat, sieht deine Daten – nicht teilen.</div>''', PRIVACY)
R('''<div class="card" id="rtCard">''', '''<div class="card" id="rtCard" hidden style="display:none">''')
RL(r"^const DEFAULT_CFG=\{.*$", CFG)
RL(r"^const S=\{sessions:.*$", S_LINE)
R('''/* =====================================================================
   Start
   ===================================================================== */''', LOCALDB + '''
/* =====================================================================
   Start
   ===================================================================== */''')
R('''  try{db=window.claude&&window.claude.use?await window.claude.use("db"):null}catch(e){db=null}''', USE)
R('''  buildExIndex();renderDayChips();mix=loadMix();subscribe();render();initPhoto();initAssets();
})();''', '''  buildExIndex();renderDayChips();mix=loadMix();subscribe();render();initPhoto();initAssets();
''' + WELCOME_JS + '''
})();''')
open(out, "w", encoding="utf-8").write(s)
print("ok", len(s))
