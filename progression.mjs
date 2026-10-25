/** Local account progression. Calendar days use the device's local timezone. */
export const XP_SCHEMA=1;
const safeInt=(value,fallback=0)=>Number.isSafeInteger(value)&&value>=0?value:fallback;
export function dayKey(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function previousDay(key) {const [y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d-1,12));}
export function nextMidnightDelay(date=new Date()){return Math.max(1000,new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime()-date.getTime()+100);}
export function levelInfo(xp=0) {
  xp=Math.min(1e9,safeInt(xp));
  const steps=Math.floor((Math.sqrt(5625+100*xp)-75)/50);
  const start=25*steps*steps+75*steps,needed=100+50*steps;
  const level=steps+1;
  const rank=level>=30?'Maestro del conto':level>=20?'Precisione':level>=15?'Focus assoluto':level>=10?'Contatore':level>=5?'Nel ritmo':level>=3?'Osservatore':'Primi passi';
  return {level,rank,total:xp,start,needed,current:xp-start,remaining:needed-(xp-start),percent:(xp-start)/needed*100};
}
export function perfectSession(record) {return Boolean(record.finalCorrect && !record.assisted && record.checks?.length && record.checks.every(c=>c.correct&&!c.assisted));}
export function sessionXP(record) {
  if(['training','truecount'].includes(record.mode) && record.assisted)return record.finalCorrect && record.checks?.length && record.checks.every(c=>c.correct)?3:0;
  if(record.mode==='grow'){
    const checks=record.checks||[];if(record.assisted||!checks.length||!Number.isFinite(record.cards)||record.cards<=0)return 0;
    // Two-deck records retain their original reward scale when restored.
    const limit=record.decks===3?117:['true','both'].includes(record.countType)?78:104,maxXP=Math.round(220*limit/104);
    const accuracy=checks.filter(c=>c.correct&&!c.assisted).length/checks.length;
    return Math.round(maxXP*Math.min(1,record.cards/limit)*(.2+.8*accuracy));
  }
  if(!perfectSession(record))return 0;
  if(record.mode==='sprint')return Math.round(10+Math.min(30,Math.max(5,record.cards))*2/3);
  if(['training','truecount'].includes(record.mode))return Math.round(70*Math.min(8,Math.max(1,record.decks))*(record.mode==='truecount'||['true','both'].includes(record.countType)?.75:1));
  if(record.mode==='realistic')return 25*Math.min(5,Math.max(1,record.rounds||5));
  return 0;
}
const MISSION_POOL = [
 {id:'start',group:0,title:'Una carta alla volta',description:'Completa una sessione in qualsiasi modalità.',metric:'sessions',target:1,xp:25,icon:'play'},
 {id:'fifty',group:0,title:'Scalda lo sguardo',description:'Osserva 50 carte in sessioni completate.',metric:'cards',target:50,xp:30,icon:'layers'},
 {id:'sprint-one',group:0,title:'Un piccolo Sprint',description:'Completa una sessione Sprint.',metric:'modes.sprint',target:1,xp:25,icon:'bolt'},
 {id:'training-one',group:0,title:'Prendi il tuo ritmo',description:'Completa una sessione Training.',metric:'modes.training',target:1,xp:35,icon:'layers'},
 {id:'five-checks',group:1,title:'Cinque conferme',description:'Dai 5 risposte corrette senza aiuti, in sessioni completate.',metric:'correctChecks',target:5,xp:40,icon:'target'},
 {id:'hundred',group:1,title:'Oltre il primo mazzo',description:'Osserva 104 carte in sessioni completate.',metric:'cards',target:104,xp:45,icon:'layers'},
 {id:'mix',group:1,title:'Cambia prospettiva',description:'Completa sessioni in 2 modalità diverse.',metric:'distinctModes',target:2,xp:45,icon:'grid'},
 {id:'two-perfect',group:1,title:'Doppia precisione',description:'Concludi 2 sessioni senza errori e senza aiuti.',metric:'successes',target:2,xp:50,icon:'check'},
 {id:'grow-one',group:2,title:'Lascia crescere il ritmo',description:'Completa una sessione Grow.',metric:'modes.grow',target:1,xp:65,icon:'grow'},
 {id:'grow-perfect',group:2,title:'Grow, senza perdere il filo',description:'Concludi una sessione Grow senza errori.',metric:'perfect.grow',target:1,xp:85,icon:'grow'},
 {id:'training-perfect',group:2,title:'Un sabot di precisione',description:'Concludi un Training senza errori e senza aiuti.',metric:'perfect.training',target:1,xp:65,icon:'target'},
 {id:'sprint-three',group:2,title:'Tre colpi d’occhio',description:'Concludi 3 Sprint senza errori.',metric:'perfect.sprint',target:3,xp:55,icon:'bolt'},
 {id:'double-shoe',group:2,title:'Duecento e oltre',description:'Osserva 208 carte in sessioni completate.',metric:'cards',target:208,xp:65,icon:'layers'}
];
function hash(text){let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function randomSource(seed){let s=seed;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function missionsForDay(key,seed='mycounting') {
 const random=randomSource(hash(seed+'|'+key));
 return [0,1,2].map(group=>{const choices=MISSION_POOL.filter(m=>m.group===group);return {...choices[Math.floor(random()*choices.length)],claimed:false};});
}
const freshMetrics=()=>({sessions:0,cards:0,correctChecks:0,successes:0,modes:{training:0,sprint:0,grow:0,realistic:0},perfect:{training:0,sprint:0,grow:0,realistic:0}});
const MODE_KEYS=['training','sprint','grow','realistic'];
const freshModeTotals=()=>Object.fromEntries(MODE_KEYS.map(mode=>[mode,{sessions:0,perfect:0,cards:0}]));
function retainedModeTotals(history=[]){const totals=freshModeTotals(),seen=new Set();for(const record of history){const mode=record.mode==='truecount'?'training':record.mode;if(!totals[mode]||record.id&&seen.has(record.id))continue;if(record.id)seen.add(record.id);totals[mode].sessions++;totals[mode].perfect+=Number(perfectSession(record));totals[mode].cards+=safeInt(record.cards);}return totals;}
export function newProgress(seed,now=new Date()) {return {schema:XP_SCHEMA,xp:0,totalCompleted:0,totalSuccess:0,totalCards:0,modeTotals:freshModeTotals(),activityDays:[],bestStreak:0,ledger:[],daily:{day:dayKey(now),metrics:freshMetrics(),missions:missionsForDay(dayKey(now),seed)}};}
export function refreshDay(progress,seed,now=new Date()) {const today=dayKey(now);if(progress.daily.day!==today){progress.daily={day:today,metrics:freshMetrics(),missions:missionsForDay(today,seed)};return true;}return false;}
export function streakInfo(progress,now=new Date()) {
 const today=dayKey(now),days=new Set(progress.activityDays),todayDone=days.has(today);
 let cursor=todayDone?today:previousDay(today),current=0;
 while(days.has(cursor)){current++;cursor=previousDay(cursor);}
 return {current,best:Math.max(progress.bestStreak,current),todayDone};
}
export function missionValue(mission,metrics) {if(mission.metric==='distinctModes')return Object.values(metrics.modes).filter(n=>n>0).length;return mission.metric.split('.').reduce((v,k)=>v?.[k],metrics) || 0;}
export function applyCompletion(progress,record,seed,now=new Date(),options={}) {
 if(record.mode==='truecount')record={...record,mode:'training',countType:'true'};
 const id=record.id;
 if(!id || progress.ledger.includes(id))return {duplicate:true,baseXP:0,missionXP:0,totalXP:0,completed:[],levelUp:false};
 refreshDay(progress,seed,now);
 const before=levelInfo(progress.xp).level;
 const baseXP=sessionXP(record),success=perfectSession(record),today=dayKey(now);
 progress.ledger.push(id);progress.ledger=progress.ledger.slice(-1000);
 progress.totalCompleted++;progress.totalCards+=record.cards;progress.totalSuccess+=Number(success);
 progress.modeTotals??=freshModeTotals();const modeTotal=progress.modeTotals[record.mode];if(modeTotal){modeTotal.sessions++;modeTotal.perfect+=Number(success);modeTotal.cards+=record.cards;}
 if(!progress.activityDays.includes(today)){progress.activityDays.push(today);progress.activityDays.sort();progress.activityDays=progress.activityDays.slice(-3660);}
 progress.bestStreak=Math.max(progress.bestStreak,streakInfo(progress,now).current);
 const guided=['training','truecount'].includes(record.mode) && record.assisted;
 const metrics=progress.daily.metrics;
 if(!guided){metrics.sessions++;metrics.cards+=record.cards;
 // One answer per card position counts toward missions; repeated manual checks cannot farm progress.
 const uniqueChecks=new Map();for(const check of record.checks || [])if(check.correct&&!check.assisted)uniqueChecks.set(check.at,true);
 metrics.correctChecks+=uniqueChecks.size;metrics.successes+=Number(success);metrics.modes[record.mode]++;metrics.perfect[record.mode]+=Number(success);}
 let missionXP=0;const completed=[];
 if(!guided && options.missions!==false)for(const mission of progress.daily.missions){if(!mission.claimed && missionValue(mission,metrics)>=mission.target){mission.claimed=true;missionXP+=mission.xp;completed.push(mission.title);}}
 progress.xp=Math.min(1e9,progress.xp+baseXP+missionXP);
 return {duplicate:false,baseXP,missionXP,totalXP:baseXP+missionXP,completed,levelUp:levelInfo(progress.xp).level>before,level:levelInfo(progress.xp).level,success};
}
export function restoreProgress(raw,seed,history=[],now=new Date()) {
 const fresh=newProgress(seed,now);
 if(raw?.schema===XP_SCHEMA && Number.isSafeInteger(raw.xp) && raw.xp>=0 && Array.isArray(raw.activityDays)) {
  const p={...fresh,xp:Math.min(1e9,raw.xp),totalCompleted:safeInt(raw.totalCompleted),totalSuccess:safeInt(raw.totalSuccess),totalCards:safeInt(raw.totalCards),bestStreak:safeInt(raw.bestStreak),activityDays:[...new Set(raw.activityDays.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-3660),ledger:Array.isArray(raw.ledger)?raw.ledger.filter(id=>typeof id==='string').slice(-1000):[]};
  // Previous accounts recover mode milestones from retained sessions once.
  // Thereafter counters survive history cleanup and bounded history retention.
  const retained=retainedModeTotals(history);p.modeTotals=freshModeTotals();
  for(const mode of MODE_KEYS)for(const metric of ['sessions','perfect','cards'])p.modeTotals[mode][metric]=safeInt(raw.modeTotals?.[mode]?.[metric],retained[mode][metric]);
  if(raw.daily?.day===fresh.daily.day){
   const old=raw.daily.metrics || {};const metrics=freshMetrics();
   for(const key of ['sessions','cards','correctChecks','successes'])metrics[key]=safeInt(old[key]);
   for(const type of ['modes','perfect'])for(const mode of ['training','sprint','grow','realistic'])metrics[type][mode]=safeInt(old[type]?.[mode])+(mode==='training'?safeInt(old[type]?.truecount):0);
   const claimed=new Set(Array.isArray(raw.daily.missions)?raw.daily.missions.filter(m=>m?.claimed===true).map(m=>m.id):[]);
   p.daily={...fresh.daily,metrics,missions:fresh.daily.missions.map(m=>({...m,claimed:claimed.has(m.id)}))};
  }
  return p;
 }
 // Upgrade retained v1/v2 sessions once, with base XP and their original activity dates.
 for(const [i,record] of [...history].reverse().entries()) {const date=new Date(record.date);if(Number.isNaN(date.getTime()))continue;applyCompletion(fresh,{...record,id:record.id||`legacy-${i}-${record.date}`},seed,date,{missions:false});}
 fresh.daily={day:dayKey(now),metrics:freshMetrics(),missions:missionsForDay(dayKey(now),seed)};
 return fresh;
}
export function normalizeProfile(raw={}) {
 const name=typeof raw.name==='string'?raw.name.trim().slice(0,24):'';
 const avatar=typeof raw.avatar==='string' && raw.avatar.length<=300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.avatar)?raw.avatar:null;
 const seed=typeof raw.seed==='string'&&raw.seed.length>0&&raw.seed.length<=100?raw.seed:`mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
 return {name:name||'Player',avatar,seed};
}
