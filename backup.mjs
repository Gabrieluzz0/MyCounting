/** Validated account backups: invalid input never replaces live data. */
import {MODES,trimHistory} from './engine.mjs';
import {dayKey,normalizeProfile,restoreProgress} from './progression.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
function validDay(key){if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const[y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d,12))===key;}
export function validBackupSession(row){return object(row)&&MODES.includes(row.mode)&&Number.isInteger(row.cards)&&row.cards>0&&row.cards<=416&&Number.isInteger(row.decks)&&row.decks>=1&&row.decks<=8&&Number.isFinite(row.duration)&&row.duration>=0&&Number.isFinite(row.speed)&&row.speed>0&&row.speed<=5&&typeof row.finalCorrect==='boolean'&&typeof row.assisted==='boolean'&&typeof row.date==='string'&&!Number.isNaN(Date.parse(row.date))&&Array.isArray(row.checks)&&row.checks.every(c=>object(c)&&typeof c.correct==='boolean'&&typeof c.assisted==='boolean'&&Number.isInteger(c.answer)&&Number.isInteger(c.actual));}
export function normalizeBackupSettings(input={}){return {decks:Math.min(8,Math.max(1,Math.round(Number(input.decks)||1))),speed:Math.min(5,Math.max(.25,Number(input.speed)||1.5)),sprintLength:Math.min(30,Math.max(5,Math.round(Number(input.sprintLength)||15))),manual:input.manual===true,showCount:input.showCount===true,sound:input.sound===true,checkpoint:[0,10,20,52].includes(input.checkpoint)?input.checkpoint:20,theme:'dark'};}
export function prepareAccountImport(data,now=new Date()){
 if(!object(data)||data.app!=='MyCounting'||![3,4,5].includes(data.version))throw Error('Scegli un file account MyCounting esportato dalla versione 3 o successiva.');
 if(data.mode&&data.mode!=='all')throw Error('Questo file contiene solo una modalità. Importa un’esportazione completa dell’account.');
 if(!object(data.profile)||typeof data.profile.name!=='string'||!data.profile.name.trim()||data.profile.name.trim().length>24||typeof data.profile.seed!=='string'||!data.profile.seed||data.profile.seed.length>100)throw Error('Il profilo contenuto nel file non è valido.');
 const profile=normalizeProfile(data.profile);
 if(data.profile.avatar!=null&&!profile.avatar)throw Error('L’immagine del profilo contenuta nel file non è valida.');
 if(!Array.isArray(data.history)||data.history.length>300||!data.history.every(validBackupSession))throw Error('Lo storico delle sessioni nel file non è valido.');
 const p=data.progress;
 if(!object(p)||p.schema!==1||!nonnegative(p.xp)||p.xp>1e9||!['totalCompleted','totalSuccess','totalCards','bestStreak'].every(k=>nonnegative(p[k]))||!Array.isArray(p.activityDays)||p.activityDays.length>3660||!p.activityDays.every(validDay)||!Array.isArray(p.ledger)||p.ledger.length>1000||!p.ledger.every(id=>typeof id==='string'&&id.length<=200))throw Error('I progressi dell’account nel file non sono validi.');
 const daily=p.daily;
 if(!object(daily)||!validDay(daily.day)||!object(daily.metrics)||!['sessions','cards','correctChecks','successes'].every(k=>nonnegative(daily.metrics[k]))||!['modes','perfect'].every(type=>object(daily.metrics[type])&&MODES.every(m=>nonnegative(daily.metrics[type][m])))||!Array.isArray(daily.missions)||daily.missions.length!==3||!daily.missions.every(m=>object(m)&&typeof m.id==='string'&&typeof m.claimed==='boolean'))throw Error('Le missioni contenute nel file non sono valide.');
 const history=trimHistory(data.history.map(s=>({...s,checks:s.checks.map(c=>({...c}))})));
 return {schema:5,settings:normalizeBackupSettings(object(data.settings)?data.settings:{}),profile,history,progress:restoreProgress(p,profile.seed,history,now)};
}
