import {createSession,deal,trueCount,signed,checkAnswer,summarize,filterSessions,trimHistory} from './engine.mjs';
import {dayKey,previousDay,nextMidnightDelay,levelInfo,perfectSession,sessionXP,normalizeProfile,restoreProgress,refreshDay,streakInfo,missionValue,applyCompletion} from './progression.mjs';
import {prepareAccountImport} from './backup.mjs';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'mycounting.v1';
const defaults = {decks:1,speed:1.5,sprintLength:15,manual:false,showCount:false,sound:false,checkpoint:20,theme:'dark'};
const MODE_INFO = {training:{name:'Allenamento',icon:'layers'},sprint:{name:'Sprint',icon:'bolt'},grow:{name:'Grow',icon:'grow'}};
const MODE_ORDER = ['training','sprint','grow'];
let settings={...defaults},history=[],storageAvailable=true,savedData=null;
try {
  const data=JSON.parse(localStorage.getItem(KEY) || 'null');
  if(data) {
    savedData=data;
    const p=data.settings || {};
    settings={decks:Math.min(8,Math.max(1,Math.round(Number(p.decks)||1))),speed:Math.min(5,Math.max(.25,Number(p.speed)||1.5)),sprintLength:Math.min(30,Math.max(5,Math.round(Number(p.sprintLength)||15))),manual:p.manual===true,showCount:p.showCount===true,sound:p.sound===true,checkpoint:[0,10,20,52].includes(p.checkpoint)?p.checkpoint:20,theme:'dark'};
    const rows=Array.isArray(data.history)?data.history.map(s=>s && ({...s,mode:s.mode==='flash'?'sprint':s.mode})):[];
    history=trimHistory(rows.filter(s=>s && Number.isInteger(s.cards) && s.cards>0 && s.cards<=416 && Array.isArray(s.checks) && s.checks.every(c=>c && typeof c.correct==='boolean' && typeof c.assisted==='boolean' && Number.isInteger(c.answer) && Number.isInteger(c.actual)) && Number.isFinite(s.duration) && s.duration>=0 && Number.isFinite(s.speed) && s.speed>0 && MODE_ORDER.includes(s.mode) && Number.isInteger(s.decks) && s.decks>=1 && s.decks<=8 && !Number.isNaN(Date.parse(s.date))));
  }
} catch {storageAvailable=false;}
let profile=normalizeProfile(savedData?.profile || {});
let progress=restoreProgress(savedData?.progress,profile.seed,history);
let calendarTimer=null,activeView='training';
let mode='training',statsMode='all',phase='idle',session=null,dealTimer=null,clockTimer=null,activeSince=0,elapsed=0,answerIsFinal=false,lastResult=null,checkpointStart=0,confirmAction=null,toastTimer=null,audioContext=null;
const isManual = () => mode!=='grow' && settings.manual;
const currentDecks = () => mode==='grow'?2:settings.decks;
const currentSpeed = () => session?.speed ?? (mode==='grow'?2:settings.speed);
const number = (n,digits=0) => n.toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
function persist(){try{localStorage.setItem(KEY,JSON.stringify({schema:5,settings,history,profile,progress}));storageAvailable=true;return true;}catch{if(storageAvailable)toast('Salvataggio non disponibile. Esporta il profilo per conservare i progressi.');storageAvailable=false;return false;}}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function getElapsed(){return elapsed+(activeSince ? performance.now()-activeSince : 0);}
function formatTime(ms){const sec=Math.floor(ms/1000);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function stopTimers(){clearTimeout(dealTimer);clearInterval(clockTimer);dealTimer=null;clockTimer=null;if(activeSince){elapsed+=performance.now()-activeSince;activeSince=0;}}
function setStatus(text,live=false){$('status-label').innerHTML=`<i></i>${text}`;$('status-label').classList.toggle('live',live);}
function backCard(){const el=$('playing-card');el.className='playing-card is-back';el.setAttribute('aria-label','Carta coperta');el.innerHTML='<div class="card-back"><div class="back-border"><span class="back-mini">MYCOUNTING</span><img class="back-brand" src="./assets/mark-transparent.webp" alt="" width="75" height="75"><span class="back-mini bottom">MAKE EVERY CARD COUNT</span></div></div>';$('stage-message').hidden=false;}
function renderCard(card){const el=$('playing-card');el.className=`playing-card dealt ${['♥','♦'].includes(card.suit)?'red':''}`;el.setAttribute('aria-label',`${card.rank} ${({'♠':'picche','♥':'cuori','♦':'quadri','♣':'fiori'})[card.suit]}`);
  let center;
  const rank=Number(card.rank);
  if(card.rank==='A')center=`<div class="card-center">${card.suit}</div>`;
  else if(rank) {const rows=Array.from({length:rank},(_,i)=>`<span${rank%2 && i===rank-1?' class="pip-center"':''}>${card.suit}</span>`).join('');center=`<div class="card-pips">${rows}</div>`;}
  else center=`<div class="card-center"><div class="face-letter">${card.rank}<small>${card.suit}</small></div></div>`;
  el.innerHTML=`<div class="card-corner">${card.rank}<span>${card.suit}</span></div>${center}<div class="card-corner bottom">${card.rank}<span>${card.suit}</span></div>`;
  // Restart the entry animation even when two identical cards appear in sequence.
  el.style.animation='none';void el.offsetWidth;el.style.animation='';
  $('stage-message').hidden=false;$('stage-message').innerHTML=`<h2>${mode==='sprint'?'Resta nel flusso.':mode==='grow'?'Cresci nel ritmo.':'Una carta alla volta.'}</h2><p>${mode==='sprint'?`${session.limit} carte. Un solo conto.`:mode==='grow'?`${session.index===session.limit?'Conto finale in arrivo':session.index%10===0?'Verifica del conto in arrivo':'Verifica tra '+Math.min(10-session.index%10,session.limit-session.index)+' carte'} · ${number(session.speed,1)} s / carta`:'Il prossimo valore è già nel tuo ritmo.'}</p>`;
}
function renderCounts(){const visible=settings.showCount && mode==='training' && !['answering','feedback'].includes(phase);const rc=visible?(session?signed(session.count):'0'):'—';const tc=session?trueCount(session):0;
  $('running-count').textContent=rc;
  $('true-count').textContent=visible && tc!==null?`${tc>0?'+':''}${number(Object.is(tc,-0)?0:tc,1)}`:'—';
  $('count-visibility').innerHTML=`${icon('eye')}${mode!=='training'?'Sfida senza aiuti':visible?'Visibile':'Nascosto'}`;
}
function renderProgress(){const seen=session?.index || 0;const total=session?.limit || (mode==='sprint'?settings.sprintLength:currentDecks()*52);$('cards-seen').textContent=seen;$('cards-total').textContent=total;$('remaining-decks').textContent=number((currentDecks()*52-seen)/52,2);$('session-progress').style.width=`${seen/total*100}%`;$('time-display').textContent=formatTime(getElapsed());
  const speed=currentSpeed();$('grow-speed').textContent=number(speed,1);$('grow-speed-progress').style.width=`${(2-speed)/1.6*100}%`;$('grow-level').textContent=`Fase ${(session?.growths || 0)+1} · ${speed<=.4?'Ritmo massimo raggiunto.':session?.growths?'Continua a crescere.':'Parti con calma.'}`;
  renderCounts();
}
function renderControls(){const ongoing=['running','paused','answering','feedback'].includes(phase);$('session-settings').disabled=ongoing;
  for(const m of MODE_ORDER)$('mode-'+m).disabled=phase==='answering'||phase==='feedback';
  $('show-count-input').disabled=mode!=='training' || ['answering','feedback'].includes(phase);
  const extraControls=Boolean(session&&['running','paused'].includes(phase));$('session-secondary-controls').hidden=!extraControls;$('restart-button').hidden=!extraControls;
  $('restart-button').disabled=!session || phase==='answering' || phase==='feedback';
  const running=phase==='running';$('start-button').innerHTML=icon(running?'pause':'play')+`<span>${running?'Pausa':phase==='paused'?'Riprendi':'Inizia'}</span>`;
  $('start-button').disabled=phase==='answering'||phase==='feedback';
  $('next-button').hidden=!(isManual() && ['running','paused'].includes(phase));$('next-button').disabled=!running;
  $('next-button').innerHTML=`${session && session.index===session.limit?'Concludi':'Prossima'}${icon('arrow')}`;
  $('verify-button').hidden=mode!=='training'||!extraControls;$('verify-button').disabled=!session||session.index===0||!['running','paused'].includes(phase);
  $('session-footnote').textContent=mode==='sprint'?`Conteggio nascosto. Dopo ${session?.limit || settings.sprintLength} carte, tocca a te.`:mode==='grow'?'2 mazzi · Verifiche ogni 10 carte · Ogni risposta corretta aumenta il ritmo.':isManual()?'Premi → o Prossima per girare una carta. Spazio per la pausa.':'Nessuna fretta. Puoi mettere in pausa quando vuoi.';
  $$('.keyboard-hint').forEach(el=>el.textContent=running?'SPAZIO per mettere in pausa':phase==='paused'?'SPAZIO per riprendere':'SPAZIO per iniziare');
}
function applySettings(){settings.theme='dark';document.documentElement.dataset.theme='dark';
  $('decks-input').value=settings.decks;$('deck-label').textContent=`${settings.decks} ${settings.decks===1?'mazzo':'mazzi'}`;$('deck-minus').disabled=settings.decks<=1;$('deck-plus').disabled=settings.decks>=8;
  $('sprint-length-input').value=settings.sprintLength;$('sprint-length-label').textContent=`${settings.sprintLength} carte`;$('sprint-badge').textContent=settings.sprintLength;$('sprint-minus').disabled=settings.sprintLength<=5;$('sprint-plus').disabled=settings.sprintLength>=30;
  $('speed-input').value=settings.speed;$('speed-value').textContent=number(settings.speed,settings.speed%1===.25 || settings.speed%1===.75?2:1);
  $('manual-input').checked=settings.manual;$('show-count-input').checked=mode==='training'?settings.showCount:false;$('sound-input').checked=settings.sound;$('checkpoint-input').value=settings.checkpoint;
  $$('.presets button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.speed)===settings.speed));
  $('speed-input').disabled=settings.manual;$$('.presets button').forEach(b=>b.disabled=settings.manual);
  $('session-settings').hidden=mode==='grow';$('grow-settings').hidden=mode!=='grow';$('sprint-length-setting').hidden=mode!=='sprint';$('count-setting').hidden=mode!=='training';
  $$('.checkpoint-setting').forEach(el=>el.hidden=mode!=='training');
  $('settings-title').textContent=MODE_INFO[mode].name;$('settings-mode-icon').innerHTML=icon(MODE_INFO[mode].icon);
  $('mode-description').innerHTML=mode==='sprint'?`${settings.sprintLength} carte, una risposta.<br>Metti alla prova il tuo colpo d’occhio.`:mode==='grow'?'Ogni conferma è un passo avanti.<br>Quanto riesci a crescere?':'Personalizza la sessione.<br>Al resto pensiamo noi.';
  $('stage-caption').textContent=mode==='sprint'?'SPRINT. FIDATI DEL TUO CONTO.':mode==='grow'?'GROW. IL RITMO CRESCE CON TE.':'IL TUO TAVOLO, IL TUO RITMO';
  for(const m of MODE_ORDER){const active=m===mode;$('mode-'+m).classList.toggle('selected',active);$('mode-'+m).setAttribute('aria-selected',String(active));$('mode-'+m).setAttribute('tabindex',active?'0':'-1');}
  $('table-stage').setAttribute('aria-labelledby','mode-'+mode);
  $('settings-toggle-label').textContent='Impostazioni '+MODE_INFO[mode].name;renderModeReward();
  renderProgress();renderControls();
}
function sound(){if(!settings.sound)return;try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator();const gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(600,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(260,audioContext.currentTime+.035);gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.045);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.05);}catch{}}
function schedule(){clearTimeout(dealTimer);if(phase==='running'&&!isManual())dealTimer=setTimeout(step,currentSpeed()*1000);}
function runClock(){activeSince=performance.now();clockTimer=setInterval(()=>$('time-display').textContent=formatTime(getElapsed()),250);}
function start(){if(phase==='running'){pause();return;}if(phase==='paused'){phase='running';runClock();setStatus('Sessione in corso',true);renderControls();schedule();return;}
  if(!['idle','complete'].includes(phase))return;
  refreshCalendar();$('session-configuration').classList.remove('expanded');$('settings-toggle').setAttribute('aria-expanded','false');
  stopTimers();elapsed=0;checkpointStart=0;session=createSession({decks:currentDecks(),mode,speed:settings.speed,sprintLength:settings.sprintLength});session.assisted=settings.showCount&&mode==='training';phase='running';runClock();setStatus('Sessione in corso',true);renderControls();step();
}
function pause(message='In pausa'){if(phase!=='running')return;stopTimers();phase='paused';setStatus(message);renderControls();}
function step(){if(phase!=='running')return;clearTimeout(dealTimer);
  if(session.index>=session.limit){askAnswer(true);return;}
  const checkpoint=mode==='grow'?10:mode==='training'?settings.checkpoint:0;
  if(checkpoint>0 && session.index>0 && session.index%checkpoint===0 && checkpointStart!==session.index){askAnswer(false);return;}
  const card=deal(session);renderCard(card);sound();renderProgress();renderControls();schedule();
}
function reset(){stopTimers();phase='idle';session=null;elapsed=0;checkpointStart=0;setStatus('Pronto quando vuoi');backCard();$('stage-message').innerHTML='<h2>Prendi posto.</h2><p>Fai spazio alla concentrazione.</p>';applySettings();}
function confirm(title,copy,action){confirmAction=action;$('confirm-title').textContent=title;$('confirm-copy').textContent=copy;$('confirm-dialog').showModal();$('confirm-no').focus();}
function guardedChange(action){if(session && session.index>0 && ['running','paused'].includes(phase)){pause();confirm('Cambiamo tavolo?','La sessione in corso verrà interrotta e non entrerà nello storico.',action);}else action();}
function setMode(next){if(mode===next || !MODE_ORDER.includes(next))return;guardedChange(()=>{mode=next;reset();});}
function askAnswer(final=false){if(!session || session.index===0 || !['running','paused'].includes(phase))return;
  stopTimers();answerIsFinal=final;lastResult=null;phase='answering';setStatus('Il tuo turno');backCard();$('stage-message').innerHTML='<h2>Tocca a te.</h2><p>Quanto dice il tuo conto?</p>';
  $('reward-result').hidden=true;$('answer-input-section').hidden=false;$('answer-result-section').hidden=true;$('answer-cancel').hidden=final || mode==='grow';
  $('answer-eyebrow').textContent=final?(mode==='sprint'?`SPRINT · ${session.limit} CARTE`:'SESSIONE COMPLETATA'):mode==='grow'?`GROW · CHECKPOINT ${session.index/10}`:'CHECKPOINT';
  $('answer-title').textContent=final?'Qual è il tuo conto?':'A che punto sei?';
  $('answer-description').textContent=`Hai visto ${session.index} ${session.index===1?'carta':'carte'}. Inserisci il running count${final?' finale':''}, anche negativo.`;
  $('answer-input').value='';$('answer-error').textContent='';$('review-details').open=false;renderControls();renderCounts();$('answer-dialog').showModal();$('answer-input').focus();
}
function cancelAnswer(){if(answerIsFinal || mode==='grow')return;$('answer-dialog').close();phase='paused';setStatus('In pausa');if(session.index)renderCard(session.shoe[session.index-1]);renderControls();renderCounts();}
function submitAnswer(event){event.preventDefault();if(phase!=='answering')return;const result=checkAnswer(session,$('answer-input').value,session.assisted);
  if(!result){$('answer-error').textContent='Scrivi un numero intero, per esempio +2, 0 o −3.';$('answer-input').focus();return;}
  lastResult=result;phase='feedback';renderProgress();$('answer-input-section').hidden=true;$('answer-result-section').hidden=false;$('answer-cancel').hidden=true;
  $('result-symbol').textContent=result.correct?'✓':'↺';$('result-symbol').classList.toggle('incorrect',!result.correct);
  $('result-title').textContent=result.correct?'Il conto torna.':'Ritroviamo il filo.';
  $('result-copy').textContent=mode==='grow' && !answerIsFinal?(result.correct?(result.speed===session.speed?'Ritmo massimo raggiunto: 0,4 s per carta.':`Il ritmo cresce: da ${number(result.speed,1)} a ${number(session.speed,1)} s per carta.`):`Scarto di ${Math.abs(result.answer-result.actual)}. Il ritmo resta a ${number(session.speed,1)} s per carta.`):result.correct?'Precisione e concentrazione. Continua così.':`Scarto di ${Math.abs(result.answer-result.actual)}. Rivedi le carte e riparti con calma.`;
  $('your-count').textContent=signed(result.answer);$('correct-count').textContent=signed(result.actual);
  $('result-meta').textContent=`${session.index} carte · ${formatTime(getElapsed())} di attività${session.assisted?' · Sessione con conteggio visibile: esclusa dalla precisione.':''}`;
  let running=0;const cards=session.shoe.slice(0,session.index);const start=Math.max(checkpointStart,cards.length-52);
  const review=cards.map((card,i)=>{running+=card.value;return i<start?'':`<div class="review-card ${['♥','♦'].includes(card.suit)?'red':''}" aria-label="Carta ${i+1}, ${card.rank} ${card.suit}, valore ${signed(card.value)}, conto ${signed(running)}">${card.rank}${card.suit}<small>${i+1} · ${signed(card.value)}</small><b>${signed(running)}</b></div>`;}).join('');
  $('card-review').innerHTML=review;
  $('review-details').querySelector('summary').textContent=start>0?`Rivedi le carte ${start+1}–${session.index}`:'Rivedi le carte e il conteggio';
  checkpointStart=session.index;
  $('continue-button').innerHTML=`${answerIsFinal?'Torna al tavolo':'Continua la sessione'}${icon('arrow')}`;
  if(answerIsFinal)saveSession();renderControls();$('continue-button').focus();
}
function saveSession(){if(session.saved)return;session.saved=true;const completedAt=new Date();const record={id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`,date:completedAt.toISOString(),mode,decks:session.decks,speed:mode==='grow'?2:settings.speed,peakSpeed:session.peakSpeed,growths:session.growths,manual:isManual(),cards:session.index,duration:Math.round(getElapsed()),assisted:session.assisted,checks:session.checks.map(c=>({...c})),finalCorrect:lastResult.correct};
  session.reward=applyCompletion(progress,record,profile.seed,completedAt);record.xp=session.reward.baseXP;history.unshift(record);history=trimHistory(history);persist();renderStats();renderGamification();
  const reward=session.reward;$('reward-result').hidden=false;$('reward-result').innerHTML=`<div>${icon(reward.levelUp?'trophy':'bolt')}<strong>${reward.totalXP?'+'+reward.totalXP+' XP':'Sessione conclusa'}</strong>${reward.levelUp?`<span>Livello ${reward.level}!</span>`:''}</div><p>${session.assisted?(reward.baseXP?'Sessione assistita: 3 XP. Le missioni non avanzano.':'Sessione assistita: servono tutte le risposte corrette per ottenere 3 XP.'):(reward.baseXP?`${reward.baseXP} XP per la sessione perfetta.`:'Per gli XP di sessione servono tutte le risposte corrette, senza aiuti.')}${reward.missionXP?` +${reward.missionXP} XP dalle missioni completate.`:''}</p>`;
}
function continueSession(){$('answer-dialog').close();if(answerIsFinal){phase='complete';setStatus('Sessione completata');$('stage-message').innerHTML='<h2>Ben giocato.</h2><p>Ogni sessione è un passo avanti.</p>';applySettings();if(session.reward?.levelUp)toast(`Nuovo livello: ${session.reward.level}. Continua così!`);}else{phase='paused';setStatus('In pausa');if(session.index)renderCard(session.shoe[session.index-1]);renderControls();renderCounts();toast('Premi Riprendi quando sei pronto.');}}
function showHelp(){showView('manual');}
function showView(name){const views=['training','stats','missions','account','streak','manual'];if(!views.includes(name))return;if(name!=='training')pause();activeView=name;for(const view of views)$(view+'-view').hidden=name!==view;for(const [view,id] of Object.entries({training:'nav-training',stats:'nav-stats',manual:'nav-help'})){$(id).classList.toggle('active',name===view);$(id).removeAttribute('aria-current');if(name===view)$(id).setAttribute('aria-current','page');}for(const [view,id] of Object.entries({account:'header-account',streak:'header-streak-button',missions:'header-missions'}))$(id).setAttribute('aria-pressed',String(name===view));$('breadcrumb').textContent=({training:'Allenamento',stats:'Statistiche',missions:'Missioni',account:'Account',streak:'Streak',manual:'Manuale'})[name];refreshCalendar();if(name==='stats')renderStats();if(['missions','account','streak'].includes(name))renderGamification();window.scrollTo({top:0,behavior:'auto'});}
function renderStats(){const rows=filterSessions(history,statsMode);const stats=summarize(rows);const label=statsMode==='all'?'Tutte le modalità':MODE_INFO[statsMode].name;
  for(const m of ['all',...MODE_ORDER]){$('stats-'+m).classList.toggle('selected',m===statsMode);$('stats-'+m).setAttribute('aria-selected',String(m===statsMode));$('stats-'+m+'-count').textContent=filterSessions(history,m).length;}
  $('stats-content').setAttribute('aria-labelledby','stats-'+statsMode);$('stats-context-icon').innerHTML=icon(statsMode==='all'?'grid':MODE_INFO[statsMode].icon);$('stats-context-title').textContent=label;
  $('stats-context-copy').textContent=statsMode==='all'?'Allenamento, Sprint e Grow: tutti i progressi insieme.':statsMode==='training'?'Sessioni personalizzate, precisione e costanza.':statsMode==='sprint'?'Sfide da 5 a 30 carte. Il tuo conto, senza aiuti.':'Due mazzi, verifiche ogni 10 carte e un ritmo che cresce.';
  const boxes=[['Sessioni completate',number(stats.sessions),statsMode==='all'?'fino a 100 per modalità':'ultime 100 di questa modalità'],['Precisione senza aiuti',stats.accuracy===null?'—':`${stats.accuracy}%`,`${stats.correct} corrette su ${stats.checks} verifiche`],['Carte osservate',number(stats.cards),'delle sessioni completate'],['Miglior serie',number(stats.best),'verifiche corrette consecutive']];
  $('stats-summary').innerHTML=boxes.map(([label,value,note])=>`<div class="stat-box"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('grow-record').hidden=statsMode!=='grow';const fastest=rows.length?Math.min(...rows.map(s=>Number.isFinite(s.peakSpeed)?s.peakSpeed:s.speed)):null;
  $('grow-record').innerHTML=`<div>${icon('grow')}<div><span>Il tuo ritmo migliore</span><strong>${fastest===null?'—':number(fastest,1)+' s / carta'}</strong></div></div><p>${fastest===null?'Completa una sessione Grow per stabilire il tuo primo record.':'Velocità effettivamente usata nelle tue sessioni Grow completate.'}</p>`;
  $('history-title').textContent=statsMode==='all'?'Tutte le sessioni':`Le tue sessioni ${MODE_INFO[statsMode].name}`;$('history-description').textContent=statsMode==='all'?'Fino a 100 sessioni per modalità, dalla più recente.':'Le ultime 100 di questa modalità, dalla più recente.';
  $('history-empty').hidden=rows.length>0;$('history-body').parentElement.hidden=rows.length===0;$('clear-history').disabled=rows.length===0;$('clear-history').textContent=statsMode==='all'?'Cancella tutti i dati':'Cancella questa modalità';
  $('empty-title').textContent=statsMode==='all'?'La prima carta è tutta da giocare.':`Il tuo percorso ${MODE_INFO[statsMode].name} inizia qui.`;$('empty-copy').textContent=statsMode==='all'?'Completa una sessione e ritroverai qui i tuoi progressi.':'Completa una sessione in questa modalità per vedere le sue statistiche.';
  $('history-body').innerHTML=rows.map(s=>{const date=new Date(s.date);const checks=s.checks.filter(c=>!c.assisted);const pace=s.mode==='grow'?`2,0 → ${number(Number.isFinite(s.peakSpeed)?s.peakSpeed:2,1)} s`:s.manual?'Manuale':`${number(s.speed,2)} s`;return `<tr><td>${date.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})}<small>${date.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ${date.getFullYear()}</small></td><td><span class="history-mode">${icon(MODE_INFO[s.mode].icon)}${MODE_INFO[s.mode].name}</span><small>${s.decks} ${s.decks===1?'mazzo':'mazzi'}${s.assisted?' · con aiuti':''}</small></td><td>${s.cards}<small>${formatTime(s.duration)}</small></td><td>${pace}</td><td>${checks.length?`${checks.filter(c=>c.correct).length}/${checks.length}`:'Con aiuti'}</td><td><span class="outcome ${s.finalCorrect?'':'wrong'}">${s.finalCorrect?'Corretto':'Da riprovare'}</span></td></tr>`;}).join('');
}

function updateConfig(key,value){if(['running','paused','answering','feedback'].includes(phase))return;settings[key]=value;persist();if(phase==='complete'){reset();}else applySettings();}
const escapeHtml=text=>String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function renderAvatar(id){const el=$(id);if(profile.avatar)el.innerHTML=`<img src="${profile.avatar}" alt="">`;else el.textContent=profile.name.trim().split(/\s+/).slice(0,2).map(word=>[...word][0]||'').join('').toUpperCase();}
function renderGamification(){const info=levelInfo(progress.xp),streak=streakInfo(progress);$('header-streak').textContent=streak.current;$('header-level').textContent='Livello '+info.level;$('header-xp-fill').style.width=info.percent+'%';$('header-xp-bar').setAttribute('aria-valuenow',String(Math.round(info.percent)));$('header-xp-bar').setAttribute('aria-valuetext',`${info.current} di ${info.needed} XP verso il livello ${info.level+1}`);renderAvatar('header-avatar');$('mission-nav-count').textContent=progress.daily.missions.filter(m=>m.claimed).length+'/3';$('header-streak-button').setAttribute('aria-label',`Streak: ${streak.current} giorni. Apri i dettagli`);$('header-account').setAttribute('aria-label',`Account di ${profile.name}, livello ${info.level}`);renderAccount(info);renderStreak(streak);renderMissions();}
function renderAccount(info=levelInfo(progress.xp)){
 renderAvatar('profile-avatar');$('profile-name').textContent=profile.name;$('profile-rank').textContent=info.rank;if(document.activeElement!==$('profile-name-input'))$('profile-name-input').value=profile.name;$('avatar-remove').disabled=!profile.avatar;
 $('account-level').textContent=info.level;$('account-rank').textContent=info.rank;$('account-level-xp').textContent=`${number(info.current)} / ${number(info.needed)} XP`;$('account-next-level').textContent='Livello '+(info.level+1);$('account-xp-fill').style.width=info.percent+'%';$('account-xp-bar').setAttribute('aria-valuenow',String(Math.round(info.percent)));$('account-xp-remaining').textContent=`Mancano ${number(info.remaining)} XP al prossimo livello.`;$('account-total-xp').textContent=number(progress.xp);$('account-successes').textContent=number(progress.totalSuccess);$('account-completed').textContent=number(progress.totalCompleted);
}
function renderStreak(streak=streakInfo(progress)){
 $('streak-count').textContent=streak.current;$('streak-unit').textContent=streak.current===1?'giorno di streak':'giorni di streak';$('streak-best').textContent=streak.best;$('streak-copy').textContent=streak.todayDone?'Giornata completata. Ci vediamo domani.':streak.current?'Mantieni il ritmo: completa una modalità oggi.':'Completa una modalità oggi per iniziare.';
 const now=new Date(),days=new Set(progress.activityDays),today=dayKey(now);const week=[];for(let i=6;i>=0;i--){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i,12),key=dayKey(date),done=days.has(key);week.push(`<div class="streak-day ${done?'done':''} ${key===today?'is-today':''}" aria-label="${date.toLocaleDateString('it-IT')}: ${done?'completato':'non completato'}"><span>${date.toLocaleDateString('it-IT',{weekday:'short'}).replace('.','')}</span><strong>${done?icon('check'):date.getDate()}</strong><small>${key===today?'oggi':''}</small></div>`);}$('streak-week').innerHTML=week.join('');
}
function renderMissions(){
 const daily=progress.daily,done=daily.missions.filter(m=>m.claimed).length;$('mission-date').textContent=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long'});$('missions-done').textContent=`${done} di 3 completate`;$('mission-rewards-total').textContent=`Ottenuti ${daily.missions.filter(m=>m.claimed).reduce((sum,m)=>sum+m.xp,0)} / ${daily.missions.reduce((sum,m)=>sum+m.xp,0)} XP bonus`;$('missions-reset').textContent='Si rinnovano a mezzanotte, secondo l’orario del tuo dispositivo.';
 $('mission-grid').innerHTML=daily.missions.map((mission,i)=>{const value=Math.min(mission.target,missionValue(mission,daily.metrics));return `<article class="mission-card ${mission.claimed?'completed':''}"><div class="mission-card-top"><span class="mission-icon">${icon(mission.claimed?'check':mission.icon)}</span><span class="mission-xp">+${mission.xp} XP</span></div><span class="mission-overline">${['RISCALDAMENTO','CONCENTRAZIONE','UN PASSO IN PIÙ'][i]}</span><h2>${escapeHtml(mission.title)}</h2><p>${escapeHtml(mission.description)}</p><div class="mission-progress-caption"><span>${mission.claimed?'Completata · XP assegnati':value+' / '+mission.target}</span><span>${Math.round(value/mission.target*100)}%</span></div><div class="mission-progress" role="progressbar" aria-label="${escapeHtml(mission.title)}" aria-valuemin="0" aria-valuemax="${mission.target}" aria-valuenow="${value}"><div style="width:${value/mission.target*100}%"></div></div></article>`;}).join('');

}
function refreshCalendar(){if(refreshDay(progress,profile.seed)){persist();renderGamification();}else if(['account','missions','streak'].includes(activeView))renderGamification();scheduleCalendar();}
function scheduleCalendar(){clearTimeout(calendarTimer);calendarTimer=setTimeout(()=>{refreshCalendar();renderGamification();},nextMidnightDelay());}
function saveProfile(event){event.preventDefault();const name=$('profile-name-input').value.trim().replace(/\s+/g,' ').slice(0,24);if(!name){$('profile-status').textContent='Inserisci un nome prima di salvare.';return;}const previous=profile.name;profile.name=name;if(persist()){$('profile-status').textContent='Nome aggiornato.';toast('Il tuo profilo è aggiornato.');}else{profile.name=previous;$('profile-status').textContent='Il browser non ha potuto salvare il nome.';}renderGamification();}
async function saveAvatar(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Scegli un’immagine JPG, PNG o WebP.');return;}if(file.size>10*1024*1024){toast('Scegli un’immagine più piccola di 10 MB.');return;}
 let url;try{url=URL.createObjectURL(file);const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>80000000)throw Error('image-size');const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const size=Math.min(image.naturalWidth,image.naturalHeight);canvas.getContext('2d').drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,256,256);const avatar=canvas.toDataURL('image/webp',.86);if(avatar.length>300000)throw Error('image-size');const previous=profile.avatar;profile.avatar=avatar;if(!persist()){profile.avatar=previous;toast('Immagine non salvata: spazio del browser insufficiente.');}else{$('profile-status').textContent='Immagine aggiornata.';toast('Nuova immagine del profilo.');}renderGamification();}catch{toast('Impossibile aprire l’immagine. Prova un altro file JPG, PNG o WebP.');}finally{if(url)URL.revokeObjectURL(url);$('avatar-input').value='';}}
function exportAccount(){const blob=new Blob([JSON.stringify({app:'MyCounting',version:5,kind:'account-backup',exportedAt:new Date().toISOString(),settings,history,profile,progress},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`MyCounting-account-${dayKey()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function applyImportedAccount(candidate){
 try{localStorage.setItem(KEY,JSON.stringify(candidate));}catch{toast('Importazione non salvata. Libera spazio nel browser e riprova. I dati attuali non sono stati cambiati.');return false;}
 stopTimers();settings=candidate.settings;history=candidate.history;profile=candidate.profile;progress=candidate.progress;storageAvailable=true;statsMode='all';mode='training';reset();renderStats();renderGamification();showView('account');$('profile-status').textContent='Account importato correttamente.';toast('Account e progressi importati.');return true;
}
let importReading=false;
async function importAccount(file){if(!file)return;if(importReading){toast('Attendi la lettura del file in corso.');return;}if(file.size>5*1024*1024){toast('Il file supera 5 MB. Scegli un’esportazione account MyCounting.');$('account-import-input').value='';return;}
 importReading=true;try{const text=await file.text();let data;try{data=JSON.parse(text);}catch{throw Error('Il file non contiene un JSON valido.');}const candidate=prepareAccountImport(data);const level=levelInfo(candidate.progress.xp).level;
 confirm(`Importare l’account di ${candidate.profile.name}?`,`Livello ${level} · ${number(candidate.progress.xp)} XP · ${candidate.history.length} sessioni salvate. Questo file sostituirà il profilo, lo storico e i progressi attuali${session&&['running','paused'].includes(phase)?' e interromperà la sessione in corso':''}.`,()=>applyImportedAccount(candidate));
 }catch(error){toast(error.message || 'Non è stato possibile importare questo file.');}finally{importReading=false;$('account-import-input').value='';}
}
function renderModeReward(){const guided=mode==='training'&&(session&&['running','paused','answering','feedback'].includes(phase)?session.assisted:settings.showCount);const reward=sessionXP({mode,cards:mode==='sprint'?settings.sprintLength:currentDecks()*52,decks:currentDecks(),assisted:guided,finalCorrect:true,checks:[{correct:true,assisted:guided}]});$('mode-xp').innerHTML=icon('trophy')+`<span>${guided?'Con aiuti: massimo 3 XP · missioni in pausa':reward+' XP senza errori e senza aiuti'}</span>`;}
let manualDemoIndex=0;
const manualSequence=[{rank:'5',value:1},{rank:'K',value:-1},{rank:'3',value:1},{rank:'A',value:-1},{rank:'8',value:0},{rank:'2',value:1}];
function renderManualDemo(){const count=manualSequence.slice(0,manualDemoIndex).reduce((sum,card)=>sum+card.value,0);const current=manualSequence[manualDemoIndex-1];$('manual-demo-card').textContent=current?.rank||'?';$('manual-demo-count').textContent=signed(count);$('manual-demo-note').textContent=current?`Carta ${manualDemoIndex}: ${signed(current.value)} al totale.`:'Si parte da zero.';$('manual-demo-history').innerHTML=manualSequence.map((card,index)=>`<span class="${index<manualDemoIndex?'seen':''} ${index===manualDemoIndex-1?'current':''}">${card.rank}</span>`).join('');$('manual-demo-next').innerHTML=`${manualDemoIndex===manualSequence.length?'Ricomincia':manualDemoIndex?'Prossima carta':'Prima carta'}${icon(manualDemoIndex===manualSequence.length?'reset':'arrow')}`;}
$('manual-demo-next').addEventListener('click',()=>{manualDemoIndex=manualDemoIndex===manualSequence.length?0:manualDemoIndex+1;renderManualDemo();});$('manual-train').addEventListener('click',()=>showView('training'));
function finishBoot(){const finish=()=>{$('boot-screen').hidden=true;$('app-shell').removeAttribute('inert');$('app-shell').setAttribute('aria-busy','false');};const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;setTimeout(finish,reduced?0:450);$('site-copyright').textContent=`© ${new Date().getFullYear()} Gabrieluzz0. Tutti i diritti riservati.`;}
$('account-import').addEventListener('click',()=>$('account-import-input').click());$('account-import-input').addEventListener('change',event=>importAccount(event.target.files?.[0]));
$('answer-sign').addEventListener('click',()=>{const input=$('answer-input');const value=input.value.trim().replace(/−/g,'-');input.value=value.startsWith('-')?value.slice(1):'-'+value.replace(/^\+/,'');input.focus();});
$('profile-form').addEventListener('submit',saveProfile);$('avatar-input').addEventListener('change',event=>saveAvatar(event.target.files?.[0]));$('avatar-remove').addEventListener('click',()=>{const previous=profile.avatar;profile.avatar=null;if(!persist())profile.avatar=previous;else $('profile-status').textContent='Immagine rimossa.';renderGamification();});$('account-export').addEventListener('click',exportAccount);
$('settings-toggle').addEventListener('click',()=>{const expanded=$('session-configuration').classList.toggle('expanded');$('settings-toggle').setAttribute('aria-expanded',String(expanded));});
$('start-button').addEventListener('click',start);$('next-button').addEventListener('click',step);$('verify-button').addEventListener('click',()=>askAnswer(session.index===session.limit));
$('restart-button').addEventListener('click',()=>guardedChange(reset));
MODE_ORDER.forEach(m=>$('mode-'+m).addEventListener('click',()=>setMode(m)));
$('decks-input').addEventListener('change',e=>updateConfig('decks',Math.min(8,Math.max(1,Math.round(Number(e.target.value)||1)))));
$('deck-minus').addEventListener('click',()=>updateConfig('decks',Math.max(1,settings.decks-1)));$('deck-plus').addEventListener('click',()=>updateConfig('decks',Math.min(8,settings.decks+1)));
$('speed-input').addEventListener('input',e=>updateConfig('speed',Number(e.target.value)));$$('[data-speed]').forEach(b=>b.addEventListener('click',()=>updateConfig('speed',Number(b.dataset.speed))));
$('sprint-length-input').addEventListener('change',e=>updateConfig('sprintLength',Math.min(30,Math.max(5,Math.round(Number(e.target.value)||15)))));
$('sprint-minus').addEventListener('click',()=>updateConfig('sprintLength',Math.max(5,settings.sprintLength-1)));$('sprint-plus').addEventListener('click',()=>updateConfig('sprintLength',Math.min(30,settings.sprintLength+1)));
$('manual-input').addEventListener('change',e=>updateConfig('manual',e.target.checked));$('checkpoint-input').addEventListener('change',e=>updateConfig('checkpoint',Number(e.target.value)));
$('show-count-input').addEventListener('change',e=>{if(mode!=='training'||['answering','feedback'].includes(phase))return;settings.showCount=e.target.checked;if(session && settings.showCount && ['running','paused'].includes(phase))session.assisted=true;persist();renderCounts();renderModeReward();if(['idle','complete'].includes(phase))applySettings();});
$('sound-input').addEventListener('change',e=>{settings.sound=e.target.checked;persist();if(settings.sound)sound();});
$('nav-help').addEventListener('click',showHelp);$('header-missions').addEventListener('click',()=>showView('missions'));$('header-account').addEventListener('click',()=>showView('account'));$('header-streak-button').addEventListener('click',()=>showView('streak'));$('streak-train').addEventListener('click',()=>showView('training'));$('streak-missions').addEventListener('click',()=>showView('missions'));$('mission-train').addEventListener('click',()=>showView('training'));$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('nav-training').addEventListener('click',()=>showView('training'));$('nav-stats').addEventListener('click',()=>showView('stats'));$('empty-start').addEventListener('click',()=>{if(statsMode!=='all')setMode(statsMode);showView('training');});
['all',...MODE_ORDER].forEach(m=>$('stats-'+m).addEventListener('click',()=>{statsMode=m;renderStats();}));
MODE_ORDER.forEach((m,index)=>$('mode-'+m).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'training':e.key==='End'?'grow':MODE_ORDER[(index+(e.key==='ArrowRight'?1:2))%3];setMode(next);$('mode-'+next).focus();}));
$('answer-form').addEventListener('submit',submitAnswer);$('answer-cancel').addEventListener('click',cancelAnswer);$('continue-button').addEventListener('click',continueSession);
$('answer-dialog').addEventListener('cancel',e=>{e.preventDefault();if(phase==='feedback')continueSession();else if(!answerIsFinal && mode!=='grow')cancelAnswer();});
$('confirm-no').addEventListener('click',()=>{$('confirm-dialog').close();confirmAction=null;});$('confirm-yes').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();});$('confirm-dialog').addEventListener('cancel',()=>confirmAction=null);
$('clear-history').addEventListener('click',()=>{const target=statsMode;confirm(target==='all'?'Cancellare tutto lo storico?':`Azzerare ${MODE_INFO[target].name}?`,target==='all'?'Verrà eliminato lo storico delle sessioni. XP, livello, streak e missioni resteranno invariati. Puoi esportare prima i dati.':`Verranno eliminate solo le statistiche ${MODE_INFO[target].name}. Le altre modalità manterranno i loro progressi.`,()=>{history=target==='all'?[]:history.filter(s=>s.mode!==target);persist();renderStats();toast('Statistiche azzerate. Un nuovo punto di partenza.');});});
const modals=['answer-dialog','confirm-dialog'];
document.addEventListener('keydown',e=>{if(modals.some(id=>$(id).open)||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||$('training-view').hidden)return;if(e.key===' '){e.preventDefault();start();}else if(e.key==='ArrowRight'&&isManual()){e.preventDefault();step();}else if(e.key.toLowerCase()==='v'&&mode==='training'&&['running','paused'].includes(phase))askAnswer(session.index===session.limit);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCalendar();if(document.hidden&&phase==='running'){pause('Pausa automatica');toast('Sessione in pausa: riprendi quando torni.');}});
window.addEventListener('pagehide',()=>{pause();persist();});
applySettings();renderStats();renderGamification();persist();scheduleCalendar();renderManualDemo();finishBoot();
if(!storageAvailable)setTimeout(()=>toast('Salvataggio locale non disponibile. Esporta i progressi per conservarli.'),1000);
if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
