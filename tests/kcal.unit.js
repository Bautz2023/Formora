// Unit-Tests der kcal-Rechnung fürs Laufen (MET, netto). Aufruf: node tests/kcal.unit.js
// Die Funktionen werden direkt aus index.html gelesen – getestet wird also genau der Code der App.
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const pick=re=>{const m=src.match(re);if(!m)throw new Error('nicht gefunden: '+re);return m[0]};
const code=[pick(/const MET_RUN=\[[^\n]*\];/),pick(/function metRun\(kmh\)\{[\s\S]*?return T\[T\.length-1\]\[1\]\}/),pick(/function runKcalNet\(km,sec,kg\)\{[^\n]*\}/)].join('\n');
const ctx={};vm.createContext(ctx);vm.runInContext(code+';this.metRun=metRun;this.runKcalNet=runKcalNet;this.MET_RUN=MET_RUN;',ctx);
const {metRun,runKcalNet,MET_RUN}=ctx;
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ ')+m)};
const near=(a,b,t=1)=>Math.abs(a-b)<=t;
console.log('MET-Tabelle');
ok(MET_RUN.every((r,i)=>i===0||(r[0]>MET_RUN[i-1][0]&&r[1]>=MET_RUN[i-1][1])),'Tabelle aufsteigend (km/h und MET)');
ok(metRun(8)===8.3&&metRun(9.7)===9.8&&metRun(12.1)===11.5,'Stützstellen exakt (8 → 8,3 · 9,7 → 9,8 · 12,1 → 11,5)');
ok(near(metRun(8.85),(8.4<8.85?9.0+(9.8-9.0)*(8.85-8.4)/(9.7-8.4):0),1e-9),'Zwischenwerte linear interpoliert');
ok(metRun(4)===6.0&&metRun(25)===14.5,'Unter- und oberhalb der Tabelle: Randwerte');
ok(metRun(0)===0&&metRun(-3)===0&&metRun(NaN)===0,'Ungültiges Tempo → 0');
console.log('kcal netto = (MET − 1) × kg × h');
// 5 km in 30:00 → 10 km/h, MET 9,8 + (10,5 − 9,8) × (10 − 9,7)/(10,8 − 9,7) = 9,991; netto 8,991 × 83 × 0,5 = 373,1
ok(near(runKcalNet(5,1800,83),8.990909*83*0.5,0.1),'5 km in 30 Min., 83 kg → '+runKcalNet(5,1800,83).toFixed(1)+' kcal');
ok(near(runKcalNet(10,3600,70),(metRun(10)-1)*70,1e-9),'10 km in 60 Min., 70 kg: (MET − 1) × kg × 1 h');
ok(runKcalNet(5,1800,83)<metRun(10)*83*0.5,'Netto liegt unter brutto (Ruheumsatz nicht doppelt gezählt)');
ok(near(runKcalNet(5.5,5.5*400,80),(metRun(3600/400)-1)*80*(5.5*400/3600),1e-9),'Dezimal-km (5,5 km) werden genau gerechnet');
ok(runKcalNet(10,3600,83)>runKcalNet(5,1800,83)*1.9,'Doppelte Strecke bei gleichem Tempo ≈ doppelte kcal');
{const f=runKcalNet(5,1500,83),l=runKcalNet(5,2100,83);ok(Math.abs(f-l)/l<.15,'kcal pro km fast unabhängig vom Tempo (5:00 → '+f.toFixed(0)+', 7:00 → '+l.toFixed(0)+' kcal)')}
ok(runKcalNet(5,1800,0)===0&&runKcalNet(0,1800,83)===0&&runKcalNet(5,0,83)===0,'Fehlendes Gewicht, km oder Zeit → 0 kcal');
ok(runKcalNet('5','1800','83')===runKcalNet(5,1800,83),'Zahlen als Text werden akzeptiert');
console.log('\n'+pass+'/'+(pass+fail)+' bestanden');process.exitCode=fail?1:0;
