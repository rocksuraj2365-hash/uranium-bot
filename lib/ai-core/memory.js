'use strict';

// Privacy-first short conversation memory. No global cross-user memory and no raw
// Discord message persistence. Memory expires and can be cleared by the caller.
const sessions=new Map();
const TTL=Number(process.env.AI_MEMORY_TTL_MS)||30*60*1000;
const MAX_MESSAGES=Number(process.env.AI_MEMORY_MESSAGES)||8;
function key(guildId,channelId,userId){return [guildId||'dm',channelId||'unknown',userId].join(':');}
function get(guildId,channelId,userId){
 const k=key(guildId,channelId,userId), entry=sessions.get(k);
 if(!entry)return [];
 if(Date.now()-entry.updatedAt>TTL){sessions.delete(k);return [];}
 return entry.messages.slice();
}
function add(guildId,channelId,userId,role,text){
 if(!['user','model'].includes(role))return;
 const clean=String(text||'').slice(0,1600); if(!clean)return;
 const k=key(guildId,channelId,userId),entry=sessions.get(k)||{messages:[],updatedAt:Date.now()};
 entry.messages.push({role,parts:[{text:clean}]});
 entry.messages=entry.messages.slice(-MAX_MESSAGES);entry.updatedAt=Date.now();sessions.set(k,entry);
}
function forget(guildId,channelId,userId){return sessions.delete(key(guildId,channelId,userId));}
function prune(){const now=Date.now();for(const [k,v] of sessions)if(now-v.updatedAt>TTL)sessions.delete(k);}
module.exports={get,add,forget,prune};
