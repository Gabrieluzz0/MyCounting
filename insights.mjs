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
