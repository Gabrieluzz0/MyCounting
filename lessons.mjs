/** Educational reference: 4–8 decks, American peek, S17, DAS, no surrender. */
export const STRATEGY_COLUMNS=['2','3','4','5','6','7','8','9','10','A'];
export const STRATEGY_ACTIONS={C:'Carta',S:'Sto',D:'Raddoppia; se non consentito, Carta',Ds:'Raddoppia; se non consentito, Sto',P:'Dividi la coppia'};
export const STRATEGY_ROWS={
 hard:[['8 o meno','CCCCCCCCCC'],['9','CDDDDCCCCC'],['10','DDDDDDDDCC'],['11','DDDDDDDDDC'],['12','CCSSSCCCCC'],['13–16','SSSSSCCCCC'],['17 o più','SSSSSSSSSS']],
 soft:[['A,2 / A,3','CCCDDCCCCC'],['A,4 / A,5','CCDDDCCCCC'],['A,6','CDDDDCCCCC'],['A,7',['S','Ds','Ds','Ds','Ds','S','S','C','C','C']],['A,8 / A,9','SSSSSSSSSS']],
 pairs:[['A,A','PPPPPPPPPP'],['2,2 / 3,3','PPPPPPCCCC'],['4,4','CCCPPCCCCC'],['5,5','DDDDDDDDCC'],['6,6','PPPPPCCCCC'],['7,7','PPPPPPCCCC'],['8,8','PPPPPPPPPP'],['9,9','PPPPPSPPSS'],['10,10','SSSSSSSSSS']]
};
// Positive indexes compare identically under flooring and truncation. Zero uses the raw TC.
export const DEVIATION_CASES=[
 {hand:'16 duro',dealer:'10',index:0,base:'Carta',change:'Sto',note:'Senza resa; 8,8 resta una coppia da dividere quando lo split è disponibile.'},
 {hand:'15 duro',dealer:'10',index:4,base:'Carta',change:'Sto',note:'Senza resa. Non usare questo indice per decidere quando arrendersi.'},
 {hand:'12 duro',dealer:'3',index:2,base:'Carta',change:'Sto',note:'Confronta il TC, non il running count.'},
 {hand:'12 duro',dealer:'2',index:3,base:'Carta',change:'Sto',note:'Il divisore sono i mazzi rimasti nel sabot.'},
 {hand:'16 duro',dealer:'9',index:5,base:'Carta',change:'Sto',note:'Senza resa; esempio Hi-Lo multi-mazzo.'},
 {hand:'11 duro',dealer:'A',index:1,base:'Carta',change:'Raddoppia',note:'Se il raddoppio non è disponibile, chiedi Carta; il banco ha già controllato il blackjack.'}
];
export function deviationDecision(index,rawTC){const entry=DEVIATION_CASES[index];if(!entry||!Number.isFinite(rawTC))return null;return {entry,active:rawTC>=entry.index,action:rawTC>=entry.index?entry.change:entry.base};}
