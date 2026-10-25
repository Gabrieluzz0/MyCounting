/** Local training insights. Calendar ranges include today and exclude future days. */
import {dayKey} from './progression.mjs';
export function selectInsights(rows,{days=0,method='all'}={},now=new Date()){
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(days-1));
 return rows.filter(row=>(method==='all'||(row.countingMethod||'hilo')===method)&&(!days||(new Date(row.date)>=start&&new Date(row.date)<end)));
}
export function sessionAccuracy(row){const checks=(row.checks||[]).filter(c=>!c.assisted);return checks.length?Math.round(checks.filter(c=>c.correct).length/checks.length*100):null;}
export function recentAccuracy(rows){return rows.filter(s=>sessionAccuracy(s)!==null).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-6).map(s=>({date:s.date,accuracy:sessionAccuracy(s),mode:s.mode,cards:s.cards}));}
export function activityDays(rows,now=new Date(),length=14){const totals=new Map();for(const s of rows){const key=dayKey(new Date(s.date)),old=totals.get(key)||{sessions:0,cards:0};old.sessions++;old.cards+=s.cards;totals.set(key,old);}return Array.from({length},(_,i)=>{const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(length-i-1));return {day:dayKey(date),label:date.toLocaleDateString('it-IT',{day:'numeric',month:'short'}),...(totals.get(dayKey(date))||{sessions:0,cards:0})};});}
export function latestSession(rows){return rows.reduce((latest,s)=>!latest||new Date(s.date)>new Date(latest.date)?s:latest,null);}

/** Badge milestones use lifetime totals; completed sessions count even with errors. */
export function selectAchievements(progress={},rows=[]){
 const safe=n=>Number.isFinite(n)&&n>0?n:0;
 const totals={sessions:safe(progress.totalCompleted),perfect:safe(progress.totalSuccess),cards:safe(progress.totalCards),streak:safe(progress.bestStreak)};
 const definitions=[
  ['first','Prendi posto','Concludi il tuo primo allenamento.','play','sessions',1,'sessioni'],
  ['ten','Nel ritmo','Concludi 10 allenamenti.','layers','sessions',10,'sessioni'],
  ['fifty','Una buona abitudine','Concludi 50 allenamenti.','grow','sessions',50,'sessioni'],
  ['hundred','Cento volte al tavolo','Concludi 100 allenamenti.','trophy','sessions',100,'sessioni'],
  ['perfect-first','Il conto torna','Concludi una sessione perfetta, senza aiuti.','check','perfect',1,'perfette'],
  ['perfect-ten','Occhio preciso','Concludi 10 sessioni perfette, senza aiuti.','target','perfect',10,'perfette'],
  ['perfect-fifty','Filo continuo','Concludi 50 sessioni perfette, senza aiuti.','trophy','perfect',50,'perfette'],
  ['cards-thousand','Mille carte dopo','Osserva 1.000 carte in sessioni concluse.','layers','cards',1000,'carte'],
  ['cards-ten-thousand','Sguardo allenato','Osserva 10.000 carte in sessioni concluse.','eye','cards',10000,'carte'],
  ['streak-three','Tre giorni insieme','Raggiungi una streak di 3 giorni.','fire','streak',3,'giorni'],
  ['streak-seven','La tua settimana','Raggiungi una streak di 7 giorni.','fire','streak',7,'giorni'],
  ['streak-thirty','Un mese di costanza','Raggiungi una streak di 30 giorni.','fire','streak',30,'giorni']
 ];
 const badges=definitions.map(([id,title,description,icon,metric,target,unit])=>({id,title,description,icon,group:'all',target,unit,current:Math.min(target,totals[metric]),earned:totals[metric]>=target}));
 for(const [mode,name,icon] of [['training','Training','layers'],['sprint','Sprint','bolt'],['grow','Grow','grow'],['realistic','Realistic','table']]){
  const values=progress.modeTotals?.[mode]||{};
  const milestones=[
   ['first','Primo allenamento','sessions',1,'sessioni'],
   ['ten','Dieci al tavolo','sessions',10,'sessioni'],
   ['twentyfive','Nel tuo ritmo','sessions',25,'sessioni'],
   ['fifty','Cinquanta sessioni','sessions',50,'sessioni'],
   ['perfect-first','Il conto perfetto','perfect',1,'perfette'],
   ['perfect-ten','Precisione costante','perfect',10,'perfette'],
   ['cards-fivehundred','Cinquecento carte','cards',500,'carte'],
   ['cards-twothousandfivehundred','Uno sguardo esperto','cards',2500,'carte']
  ];
  for(const [key,title,metric,target,unit] of milestones){const current=safe(values[metric]);const description=metric==='sessions'?`Concludi ${target} ${target===1?'allenamento':'allenamenti'} in modalità ${name}, anche con errori o conteggio visibile.`:metric==='perfect'?`Concludi ${target} ${target===1?'sessione perfetta':'sessioni perfette'} in modalità ${name}, con tutte le verifiche corrette e senza aiuti.`:`Osserva ${target.toLocaleString('it-IT')} carte in allenamenti conclusi in modalità ${name}, anche con errori o conteggio visibile.`;badges.push({id:mode+'-'+key,title,description,icon,group:mode,target,unit,current:Math.min(target,current),earned:current>=target});}
 }
 return {badges,earned:badges.filter(b=>b.earned).length};
}
