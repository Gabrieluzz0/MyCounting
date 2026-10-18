/** Counting core. No network, UI or storage dependencies. */
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUITS = ['♠','♥','♦','♣'];
export const MODES = ['training','truecount','sprint','grow','realistic'];
export const COUNTING_METHODS = {
  hilo:{name:'Hi-Lo',trueCount:true,tags:{A:-1,2:1,3:1,4:1,5:1,6:1,7:0,8:0,9:0,10:-1,J:-1,Q:-1,K:-1}},
  ko:{name:'KO',trueCount:false,tags:{A:-1,2:1,3:1,4:1,5:1,6:1,7:1,8:0,9:0,10:-1,J:-1,Q:-1,K:-1}},
  zen:{name:'Zen',trueCount:true,tags:{A:-1,2:1,3:1,4:2,5:2,6:2,7:1,8:0,9:0,10:-2,J:-2,Q:-2,K:-2}},
  omega2:{name:'Omega II',trueCount:true,tags:{A:0,2:1,3:1,4:2,5:2,6:2,7:1,8:0,9:-1,10:-2,J:-2,Q:-2,K:-2}}
};
export const normalizeMethod = method => Object.hasOwn(COUNTING_METHODS,method)?method:'hilo';
export const supportsTrueCount = method => COUNTING_METHODS[normalizeMethod(method)].trueCount;
export const normalizeCountType = (type,method='hilo') => supportsTrueCount(method)&&['true','both'].includes(type)?type:'running';
export const initialCount = (method,decks) => normalizeMethod(method)==='ko'?4-4*decks:0;
export const valueOf = (rank,method='hilo') => COUNTING_METHODS[normalizeMethod(method)].tags[rank];
export const signed = number => number > 0 ? `+${number}` : number < 0 ? `−${Math.abs(number)}` : '0';
export function createShoe(decks = 1, random = Math.random, countingMethod='hilo') {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8) throw new RangeError('Scegli da 1 a 8 mazzi.');
  const cards = [];
  for (let deck=0; deck<decks; deck++) for (const suit of SUITS) for (const rank of RANKS) cards.push({rank,suit,value:valueOf(rank,countingMethod),id:`${deck}-${suit}-${rank}`});
  for (let i=cards.length-1; i>0; i--) { const j=Math.floor(random()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
export function createSession(config = {}) {
  const mode = config.mode==='truecount'?'training':config.mode==='flash'?'sprint':MODES.includes(config.mode)?config.mode:'training';
  const decks = mode==='grow'?2:config.decks ?? 1;
  const countingMethod=normalizeMethod(config.countingMethod);
  const shoe = createShoe(decks,config.random,countingMethod);
  const sprintLength=Number.isFinite(Number(config.sprintLength))?Math.min(30,Math.max(5,Math.round(Number(config.sprintLength)))):15;
  const countType=normalizeCountType(config.mode==='truecount'?'true':config.countType,countingMethod);
  const countStart=initialCount(countingMethod,decks);
  return {shoe,mode,decks,countType,countingMethod,countStart,limit:mode==='sprint'?sprintLength:countType!=='running'?Math.floor(shoe.length*.75):shoe.length,index:0,count:countStart,checks:[],assisted:false,speed:mode==='grow'?2:config.speed??1.5,peakSpeed:mode==='grow'?2:config.speed??1.5,growths:0};
}
export function deal(session) {
  if(session.index >= session.limit) return null;
  const card = session.shoe[session.index++]; session.count += card.value;
  session.peakSpeed=Math.min(session.peakSpeed,session.speed);
  return card;
}
export function trueCount(session) {
  if(!supportsTrueCount(session.countingMethod))return null;
  const remaining = session.shoe.length - (session.mode==='realistic'?session.dealt:session.index);
  return remaining > 0 ? session.count / (remaining/52) : null;
}
export function parseAnswer(input) {
  const normalized=String(input).trim().replace(/−/g,'-');
  return /^[+-]?\d{1,4}$/.test(normalized) ? Number(normalized) : null;
}
export function checkAnswer(session, input, assisted = false) {
  const both=session.countType==='both';
  const answer = parseAnswer(both?input?.running:input);
  if(answer === null) return null;
  const rawActual=session.countType==='true'?trueCount(session):session.count;
  if(rawActual===null)return null;
  const actual=session.countType==='true'?Math.trunc(rawActual):rawActual;
  const result={answer,actual,rawActual,countType:session.countType||'running',correct:answer===actual,at:session.index,assisted:Boolean(assisted),speed:session.speed};
  if(both){
    const trueAnswer=parseAnswer(input?.true),rawTrueActual=trueCount(session);
    if(trueAnswer===null||rawTrueActual===null)return null;
    Object.assign(result,{trueAnswer,trueActual:Math.trunc(rawTrueActual),rawTrueActual,runningCorrect:answer===actual,trueCorrect:trueAnswer===Math.trunc(rawTrueActual)});
    result.correct=result.runningCorrect&&result.trueCorrect;
  }
  session.checks.push(result);
  if(session.mode==='grow' && result.correct && session.index<session.limit){
    session.speed=Math.max(.4,Math.round((session.speed-.2)*100)/100);session.growths++;
  }
  return result;
}
export function filterSessions(sessions,mode='all') {return mode==='all'?sessions:sessions.filter(s=>s.mode===mode);}
export function trimHistory(sessions) {
  const totals={training:0,sprint:0,grow:0,realistic:0};
  // Keep both former 100-session histories when the two drills are merged.
  return sessions.map(s=>({...s,countingMethod:normalizeMethod(s.countingMethod),...(s.mode==='truecount'?{mode:'training',countType:'true'}:{})})).filter(s=>s.mode in totals && ++totals[s.mode]<=(s.mode==='training'?200:100));
}
export function summarize(sessions,mode='all') {
  sessions=filterSessions(sessions,mode);
  const checks = sessions.flatMap(s=>s.checks || []).filter(c=>!c.assisted);
  const correct=checks.filter(c=>c.correct).length;
  let streak=0,best=0;
  for(const check of [...sessions].reverse().flatMap(s=>s.checks || []).filter(c=>!c.assisted)) {streak=check.correct?streak+1:0;best=Math.max(best,streak);}
  return {sessions:sessions.length,cards:sessions.reduce((n,s)=>n+s.cards,0),checks:checks.length,correct,accuracy:checks.length?Math.round(correct/checks.length*100):null,best};
}
