/** Local blackjack practice. S17, American peek; optional DAS, four hands, late surrender. No stakes. */
import {createShoe,normalizeMethod,normalizeCountType,initialCount} from './engine.mjs';
export function handValue(cards){let total=0,aces=0;for(const card of cards){if(card.hidden)continue;if(card.rank==='A'){total+=11;aces++;}else total+=['K','Q','J'].includes(card.rank)?10:Number(card.rank);}while(total>21&&aces>0){total-=10;aces--;}return {total,soft:aces>0,bust:total>21,blackjack:cards.length===2&&total===21};}
const pip=card=>card.rank==='A'?11:['K','Q','J'].includes(card.rank)?10:Number(card.rank);
const freshHand=(cards=[],split=false,splitAces=false)=>({cards,split,splitAces,done:false,doubled:false,surrendered:false});
export function createTableSession(config={}){const decks=config.decks??6,countingMethod=normalizeMethod(config.countingMethod),shoe=createShoe(decks,config.random,countingMethod),countStart=initialCount(countingMethod,decks);return {mode:'realistic',ultra:config.ultra===true,countType:normalizeCountType(config.countType,countingMethod),countingMethod,countStart,decks,shoe,index:0,dealt:0,count:countStart,limit:shoe.length,checks:[],assisted:false,speed:config.speed??1.5,peakSpeed:config.speed??1.5,growths:0,round:0,maxRounds:5,hands:[[],[],[]],playerHands:[],activeHand:0,dealer:[],visibleCards:[],stage:'ready',queue:[],turn:0,outcomes:[],playerOutcomes:[],insurance:null,insuranceResult:null,peeked:false,finished:false};}
export function beginTableRound(s){if(!['ready','roundEnd'].includes(s.stage)||s.finished)return false;s.round++;s.hands=[[],[],[]];s.playerHands=[freshHand(s.hands[1])];s.activeHand=0;s.dealer=[];s.outcomes=[];s.playerOutcomes=[];s.insurance=null;s.insuranceResult=null;s.peeked=false;s.turn=0;s.stage='dealing';s.queue=[];for(let pass=0;pass<2;pass++){for(let seat=0;seat<3;seat++)s.queue.push({seat,hidden:false});s.queue.push({seat:3,hidden:pass===1});}return true;}
function expose(s,card){s.count+=card.value;s.index++;s.visibleCards.push({...card,hidden:false});}
function canDrawTableCard(s,n=1){return s.dealt+n<=s.shoe.length-(s.countType!=='running'?1:0);}
function drawTableCard(s,seat,hidden=false){if(!canDrawTableCard(s))return null;const card={...s.shoe[s.dealt++],hidden};(seat===3?s.dealer:s.hands[seat]).push(card);if(!hidden)expose(s,card);return card;}
function revealDealer(s){const hole=s.dealer.find(card=>card.hidden);if(hole){hole.hidden=false;expose(s,hole);return hole;}return null;}
function peek(s){s.peeked=true;const natural=handValue(s.dealer.map(c=>({...c,hidden:false}))).blackjack;if(s.insurance!==null)s.insuranceResult=s.insurance?(natural?'Assicurazione riuscita':'Assicurazione non riuscita'):'Assicurazione rifiutata';s.stage=natural?'reveal':'players';s.turn=0;}
function outcome(cards,d,meta={}){const p=handValue(cards);if(meta.surrendered)return 'Resa';if(p.bust)return 'Sballato';const natural=p.blackjack&&!meta.split;if(d.blackjack)return natural?'Parità':'Banco';if(natural)return 'Blackjack';if(d.bust||p.total>d.total)return 'Mano vinta';return p.total===d.total?'Parità':'Banco';}
function finishTableRound(s){const d=handValue(s.dealer);s.outcomes=s.hands.map(cards=>outcome(cards,d));if(s.ultra){s.playerOutcomes=s.playerHands.map(h=>outcome(h.cards,d,h));s.outcomes[1]=s.playerOutcomes.length===1?s.playerOutcomes[0]:s.playerOutcomes.join(' · ');}if(s.countType!=='running'&&!canDrawTableCard(s))s.outcomes=s.hands.map(()=>'Fine sabot');s.stage='roundEnd';s.finished=s.round>=s.maxRounds||s.shoe.length-s.dealt<20;return {type:'roundEnd'};}
export function automaticHit(cards,upcard){const value=handValue(cards);const up=pip(upcard||{rank:'10'});if(value.total>=21)return false;if(value.soft)return value.total<18||(value.total===18&&up>=9);if(value.total<=11)return true;if(value.total>=17)return false;if(value.total===12)return up<4||up>6;return up<2||up>6;}
function completePlayerHand(s){const h=s.playerHands[s.activeHand];if(h)h.done=true;if(s.ultra&&s.activeHand+1<s.playerHands.length){s.activeHand++;s.hands[1]=s.playerHands[s.activeHand].cards;s.stage='splitDeal';}else{s.turn=2;s.stage='players';}}
export function availableTableActions(s){if(s.stage==='insurance')return ['insure','decline'];if(s.stage!=='player')return [];const cards=s.hands[1],h=s.playerHands[s.activeHand]||{},value=handValue(cards);if(value.total>=21||h.done)return [];const actions=['stand'];if(canDrawTableCard(s))actions.unshift('hit');if(s.ultra&&cards.length===2&&!h.splitAces){if(canDrawTableCard(s))actions.push('double');if(s.playerHands.length<4&&pip(cards[0])===pip(cards[1])&&canDrawTableCard(s,2))actions.push('split');if(!h.split&&s.peeked)actions.push('surrender');}return actions;}
export function advanceTable(s){
 if(s.stage==='dealing'){const event=s.queue.shift();if(event){const card=drawTableCard(s,event.seat,event.hidden);return {type:'card',seat:event.seat,hidden:event.hidden,card};}if(s.ultra&&s.dealer[0]?.rank==='A'&&s.insurance===null){s.stage='insurance';return {type:'insurance'};}peek(s);}
 if(s.stage==='splitDeal'){const card=drawTableCard(s,1),h=s.playerHands[s.activeHand];if(h.splitAces||handValue(h.cards).total>=21||!canDrawTableCard(s))completePlayerHand(s);else s.stage='player';return {type:'card',seat:1,card};}
 if(s.stage==='players'){
  while(s.turn<3){const value=handValue(s.hands[s.turn]);if(value.total>=21||!canDrawTableCard(s)){s.turn++;continue;}if(s.turn===1){s.stage='player';return {type:'player'};}if(automaticHit(s.hands[s.turn],s.dealer[0])){const card=drawTableCard(s,s.turn);return {type:'card',seat:s.turn,card};}s.turn++;}
  s.stage='reveal';
 }
 if(s.stage==='reveal'){const card=revealDealer(s);s.stage='dealer';return {type:'reveal',seat:3,card};}
 if(s.stage==='dealer'){if(handValue(s.dealer).total<17&&canDrawTableCard(s)){const card=drawTableCard(s,3);return {type:'card',seat:3,card};}return finishTableRound(s);}
 return {type:s.stage};
}
export function tableAction(s,action){if(!availableTableActions(s).includes(action))return null;
 if(s.stage==='insurance'){s.insurance=action==='insure';peek(s);return {type:'insurance',accepted:s.insurance};}
 const h=s.playerHands[s.activeHand];
 if(action==='split'){const cards=s.hands[1],aces=cards[0].rank==='A',first=freshHand([cards[0]],true,aces),second=freshHand([cards[1]],true,aces);s.playerHands.splice(s.activeHand,1,first,second);s.hands[1]=first.cards;s.stage='splitDeal';return {type:'split'};}
 if(action==='surrender'){h.surrendered=true;completePlayerHand(s);return {type:'surrender'};}
 if(action==='hit'||action==='double'){if(action==='double')h.doubled=true;const card=drawTableCard(s,1);if(action==='double'||handValue(s.hands[1]).total>=21||!canDrawTableCard(s))completePlayerHand(s);return {type:'card',seat:1,card};}
 completePlayerHand(s);return {type:'stand'};
}
