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

/** Badges use lifetime progress; performance records use retained, unaided completions. */
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
 const badges=definitions.map(([id,title,description,icon,metric,target,unit])=>({id,title,description,icon,target,unit,current:Math.min(target,totals[metric]),earned:totals[metric]>=target}));
 const clean=rows.filter(s=>!s.assisted&&s.finalCorrect&&s.checks?.length&&s.checks.every(c=>c.correct&&!c.assisted));
 const auto=clean.filter(s=>!s.manual&&Number.isFinite(s.speed)&&s.speed>0);
 const best=(list,metric,lower=false)=>list.reduce((winner,row)=>!winner||(lower?metric(row)<metric(winner):metric(row)>metric(winner))?row:winner,null);
 const training=best(auto.filter(s=>['training','truecount'].includes(s.mode)&&s.cards>=39),s=>s.speed,true);
 const sprint=best(auto.filter(s=>s.mode==='sprint'&&s.cards>=15),s=>s.speed,true);
 const grow=best(rows.filter(s=>s.mode==='grow'&&!s.assisted&&s.cards>=13&&Number.isFinite(s.peakSpeed)&&s.peakSpeed>0),s=>s.peakSpeed,true);
 const shoe=best(clean,s=>s.cards);
 const accuracy=best(rows.filter(s=>!s.assisted&&(s.checks||[]).filter(c=>!c.assisted).length>=5),s=>sessionAccuracy(s));
 const records=[
  {id:'streak',title:'Streak più lunga',icon:'fire',value:totals.streak||null,unit:'giorni',detail:'Giorni consecutivi · progresso complessivo',record:null},
  {id:'grow',title:'Ritmo migliore · Grow',icon:'grow',value:grow?.peakSpeed??null,unit:'s / carta',detail:'Velocità raggiunta in una sessione conclusa',record:grow},
  {id:'training',title:'Ritmo migliore · Training',icon:'layers',value:training?.speed??null,unit:'s / carta',detail:'Almeno 39 carte · perfetta · automatica',record:training},
  {id:'sprint',title:'Ritmo migliore · Sprint',icon:'bolt',value:sprint?.speed??null,unit:'s / carta',detail:'Almeno 15 carte · perfetta · automatica',record:sprint},
  {id:'shoe',title:'Sequenza perfetta più lunga',icon:'check',value:shoe?.cards??null,unit:'carte',detail:'Sessione senza errori e senza aiuti',record:shoe},
  {id:'accuracy',title:'Precisione migliore',icon:'target',value:accuracy?sessionAccuracy(accuracy):null,unit:'%',detail:'Almeno 5 verifiche · senza aiuti',record:accuracy}
 ];
 return {badges,records,earned:badges.filter(b=>b.earned).length};
}
