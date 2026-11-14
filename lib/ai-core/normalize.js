'use strict';

// Conservative, deterministic cleanup for short forms and common typos.
// URLs, Discord mentions, IDs, code and quoted text are preserved.
const ALIASES = new Map(Object.entries({
  pls:'please', plz:'please', delte:'delete', deete:'delete', thx:'thanks', ty:'thank you', u:'you', ur:'your',
  r:'are', y:'why', wht:'what', wat:'what', wt:'what', wen:'when', whr:'where',
  hw:'how', hv:'have', bcz:'because', bc:'because', coz:'because', cuz:'because',
  msg:'message', msgs:'messages', ppl:'people', mbr:'member', memb:'member',
  del:'delete', dlt:'delete', rm:'remove', asap:'as soon as possible',
  idk:'I do not know', imo:'in my opinion', rn:'right now', btw:'by the way',
  gud:'good', gr8:'great', tht:'that', dis:'this', dat:'that', der:'there',
  cn:'can', cant:'cannot', dont:'do not', doesnt:'does not', wont:'will not',
  isnt:'is not', msges:'messages', rulz:'rules', rulez:'rules', whts:'what is',
  hlp:'help', helo:'hello', hlo:'hello', hiii:'hi', heyy:'hey'
}));
const PROTECTED = /(?:https?:\/\/\S+|www\.\S+|<@!?\d{15,22}>|<@&\d{15,22}>|<#\d{15,22}>|\b\d{15,22}\b|\x60[^\x60]*\x60)/g;
function editDistance(a,b,limit=2){
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row=[i]; let min=i;
    for(let j=1;j<=b.length;j++){const v=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));row[j]=v;if(v<min)min=v;}
    if(min>limit)return limit+1; prev=row;
  }
  return prev[b.length];
}
function protect(text){
  const saved=[];
  const value=String(text||'').replace(PROTECTED,match=>{const key='\u0000P'+saved.length+'\u0000';saved.push(match);return key;});
  return {value,restore:s=>String(s).replace(/\u0000P(\d+)\u0000/g,(_,i)=>saved[Number(i)]||'')};
}
function normalizeInput(input){
  const original=String(input||'').slice(0,4000), p=protect(original);
  let expanded=p.value.replace(/\b([a-z]{1,8})\b/gi,word=>ALIASES.get(word.toLowerCase())||word);
  expanded=expanded.replace(/\s+/g,' ').trim();
  return {original,normalized:p.restore(expanded),changed:expanded!==p.value,languageHint:/[\u0900-\u097f]/.test(original)?'hi-or-hinglish':'undetermined'};
}
module.exports={normalizeInput,editDistance};
