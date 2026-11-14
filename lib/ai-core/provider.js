'use strict';

// Optional self-hosted OpenAI-compatible endpoint. It has no vendor credit system;
// compute, hosting, model licence and operator terms still apply. HTTPS is required
// for remote endpoints. Plain HTTP is accepted only for loopback development.
function localEndpoint(){
 const raw=String(process.env.AI_LOCAL_BASE_URL||'').trim(); if(!raw)return null;
 let u;try{u=new URL(raw);}catch{return null;}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&loopback))return null;
 if(u.username||u.password)return null;
 return u.toString().replace(/\/$/,'');
}
async function generateLocal(system,contents,tools,timeoutMs){
 const base=localEndpoint();if(!base)throw new Error('Local AI endpoint is missing or unsafe. Use HTTPS, or loopback HTTP for local development.');
 const messages=[{role:'system',content:system},...contents.map(m=>({role:m.role==='model'?'assistant':m.role,content:(m.parts||[]).filter(p=>p.text).map(p=>p.text).join('\n')}))];
 const body={model:process.env.AI_LOCAL_MODEL||'local-model',messages,temperature:0.5,max_tokens:900};
 // Tool calling is deliberately not advertised until an adapter supports and validates
 // the provider-specific tool-call response format.
 const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(process.env.AI_LOCAL_API_KEY?{authorization:'Bearer '+process.env.AI_LOCAL_API_KEY}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('Local model endpoint returned HTTP '+response.status);
 const answer=data.choices?.[0]?.message?.content;
 if(typeof answer!=='string'||!answer.trim())throw new Error('Local model returned an empty response.');
 return {candidates:[{content:{parts:[{text:answer.trim()}]}}],provider:'local'};
}
module.exports={localEndpoint,generateLocal};
