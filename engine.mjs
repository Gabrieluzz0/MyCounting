/** Hi-Lo core. No network, UI or storage dependencies. */
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUITS = ['♠','♥','♦','♣'];
export const MODES = ['training','sprint','grow','realistic'];
export const valueOf = rank => ['2','3','4','5','6'].includes(rank) ? 1 : ['7','8','9'].includes(rank) ? 0 : -1;
export const signed = number => number > 0 ? `+${number}` : number < 0 ? `−${Math.abs(number)}` : '0';
export function createShoe(decks = 1, random = Math.random) {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8) throw new RangeError('Scegli da 1 a 8 mazzi.');
  const cards = [];
  for (let deck=0; deck<decks; deck++) for (const suit of SUITS) for (const rank of RANKS) cards.push({rank,suit,value:valueOf(rank),id:`${deck}-${suit}-${rank}`});
  for (let i=cards.length-1; i>0; i--) { const j=Math.floor(random()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
export function createSession(config = {}) {
  const mode = config.mode==='flash'?'sprint':MODES.includes(config.mode)?config.mode:'training';
  const decks = mode==='grow'?2:config.decks ?? 1;
  const shoe = createShoe(decks,config.random);
  const sprintLength=Number.isFinite(Number(config.sprintLength))?Math.min(30,Math.max(5,Math.round(Number(config.sprintLength)))):15;
  const countType=mode==='training'&&config.countType==='true'?'true':'running';
  return {shoe,mode,decks,countType,limit:mode==='sprint'?sprintLength:countType==='true'?Math.floor(shoe.length*.75):shoe.length,index:0,count:0,checks:[],assisted:false,speed:mode==='grow'?2:config.speed??1.5,peakSpeed:mode==='grow'?2:config.speed??1.5,growths:0};
}
export function deal(session) {
  if(session.index >= session.limit) return null;
  const card = session.shoe[session.index++]; session.count += card.value;
  session.peakSpeed=Math.min(session.peakSpeed,session.speed);
  return card;
}
export function trueCount(session) {
  const remaining = session.shoe.length - session.index;
  return remaining > 0 ? session.count / (remaining/52) : null;
}
export function parseAnswer(input) {
  const normalized=String(input).trim().replace(/−/g,'-');
  return /^[+-]?\d{1,4}$/.test(normalized) ? Number(normalized) : null;
}
export function checkAnswer(session, input, assisted = false) {
  const answer = parseAnswer(input);
  if(answer === null) return null;
  const rawActual=session.countType==='true'?trueCount(session):session.count;
  if(rawActual===null)return null;
  const actual=session.countType==='true'?Math.trunc(rawActual):rawActual;
  const result={answer,actual,rawActual,countType:session.countType||'running',correct:answer===actual,at:session.index,assisted:Boolean(assisted),speed:session.speed};
  session.checks.push(result);
  if(session.mode==='grow' && result.correct && session.index<session.limit){
    session.speed=Math.max(.4,Math.round((session.speed-.2)*100)/100);session.growths++;
  }
  return result;
}
export function filterSessions(sessions,mode='all') {return mode==='all'?sessions:sessions.filter(s=>s.mode===mode);}
export function trimHistory(sessions) {
  const totals={training:0,sprint:0,grow:0,realistic:0};
  return sessions.filter(s=>MODES.includes(s.mode) && ++totals[s.mode]<=100);
}
export function summarize(sessions,mode='all') {
  sessions=filterSessions(sessions,mode);
  const checks = sessions.flatMap(s=>s.checks || []).filter(c=>!c.assisted);
  const correct=checks.filter(c=>c.correct).length;
  let streak=0,best=0;
  for(const check of [...sessions].reverse().flatMap(s=>s.checks || []).filter(c=>!c.assisted)) {streak=check.correct?streak+1:0;best=Math.max(best,streak);}
  return {sessions:sessions.length,cards:sessions.reduce((n,s)=>n+s.cards,0),checks:checks.length,correct,accuracy:checks.length?Math.round(correct/checks.length*100):null,best};
}
