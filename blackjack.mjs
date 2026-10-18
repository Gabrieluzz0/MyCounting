/** A local blackjack table for counting practice. No stakes or payouts. S17, hit/stand only. */
import {createShoe,normalizeMethod,normalizeCountType,initialCount} from './engine.mjs';
export function handValue(cards){let total=0,aces=0;for(const card of cards){if(card.hidden)continue;if(card.rank==='A'){total+=11;aces++;}else total+=['K','Q','J'].includes(card.rank)?10:Number(card.rank);}while(total>21&&aces>0){total-=10;aces--;}return {total,soft:aces>0,bust:total>21,blackjack:cards.length===2&&total===21};}
export function createTableSession(config={}){const decks=config.decks??6,countingMethod=normalizeMethod(config.countingMethod),shoe=createShoe(decks,config.random,countingMethod),countStart=initialCount(countingMethod,decks);return {mode:'realistic',countType:normalizeCountType(config.countType,countingMethod),countingMethod,countStart,decks,shoe,index:0,dealt:0,count:countStart,limit:shoe.length,checks:[],assisted:false,speed:config.speed??1.5,peakSpeed:config.speed??1.5,growths:0,round:0,maxRounds:5,hands:[[],[],[]],dealer:[],visibleCards:[],stage:'ready',queue:[],turn:0,outcomes:[],finished:false};}
export function beginTableRound(s){if(!['ready','roundEnd'].includes(s.stage)||s.finished)return false;s.round++;s.hands=[[],[],[]];s.dealer=[];s.outcomes=[];s.turn=0;s.stage='dealing';s.queue=[];for(let pass=0;pass<2;pass++){for(let seat=0;seat<3;seat++)s.queue.push({seat,hidden:false});s.queue.push({seat:3,hidden:pass===1});}return true;}
function expose(s,card){s.count+=card.value;s.index++;s.visibleCards.push({...card,hidden:false});}
function canDrawTableCard(s){return s.dealt<s.shoe.length-(s.countType!=='running'?1:0);}
function drawTableCard(s,seat,hidden=false){if(!canDrawTableCard(s))return null;const card={...s.shoe[s.dealt++],hidden};(seat===3?s.dealer:s.hands[seat]).push(card);if(!hidden)expose(s,card);return card;}
function revealDealer(s){const hole=s.dealer.find(card=>card.hidden);if(hole){hole.hidden=false;expose(s,hole);return hole;}return null;}
function finishTableRound(s){const d=handValue(s.dealer);s.outcomes=s.hands.map(cards=>{const p=handValue(cards);if(p.bust)return 'Sballato';if(d.blackjack)return p.blackjack?'Parità':'Banco';if(p.blackjack)return 'Blackjack';if(d.bust||p.total>d.total)return 'Mano vinta';return p.total===d.total?'Parità':'Banco';});if(s.countType!=='running'&&!canDrawTableCard(s))s.outcomes=s.hands.map(()=>'Fine sabot');s.stage='roundEnd';s.finished=s.round>=s.maxRounds||s.shoe.length-s.dealt<20;return {type:'roundEnd'};}
export function advanceTable(s){
 if(s.stage==='dealing'){const event=s.queue.shift();if(event){const card=drawTableCard(s,event.seat,event.hidden);return {type:'card',seat:event.seat,hidden:event.hidden,card};}s.stage='players';s.turn=0;}
 if(s.stage==='players'){
  while(s.turn<3){const value=handValue(s.hands[s.turn]);if(value.total>=21||!canDrawTableCard(s)){s.turn++;continue;}if(s.turn===1){s.stage='player';return {type:'player'};}if(value.total<17){const card=drawTableCard(s,s.turn);return {type:'card',seat:s.turn,card};}s.turn++;}
  s.stage='reveal';
 }
 if(s.stage==='reveal'){const card=revealDealer(s);s.stage='dealer';return {type:'reveal',seat:3,card};}
 if(s.stage==='dealer'){if(handValue(s.dealer).total<17&&canDrawTableCard(s)){const card=drawTableCard(s,3);return {type:'card',seat:3,card};}return finishTableRound(s);}
 return {type:s.stage};
}
export function tableAction(s,action){if(s.stage!=='player'||!['hit','stand'].includes(action))return null;if(action==='hit'){const card=drawTableCard(s,1);if(handValue(s.hands[1]).total>=21||!canDrawTableCard(s)){s.turn=2;s.stage='players';}return {type:'card',seat:1,card};}s.turn=2;s.stage='players';return {type:'stand'};}
