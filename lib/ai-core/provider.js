'use strict';

function safeEndpoint(raw, label) {
 const value=String(raw||'').trim(); if(!value)return null;
 let u;try{u=new URL(value);}catch{return null;}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&loopback))return null;
 if(u.username||u.password)return null;
 return u.toString().replace(/\/$/,'');
}
function localEndpoint(){return safeEndpoint(process.env.AI_LOCAL_BASE_URL,'local');}
function openRouterEndpoint(){return 'https://openrouter.ai/api/v1';}
function openRouterReady(){return !!String(process.env.OPENROUTER_API_KEY||'').trim();}
function openRouterModel(){return String(process.env.OPENROUTER_MODEL||'openrouter/free').trim();}
const openRouterUsage={day:'',count:0};
function claimOpenRouterRequest(){
 const day=new Date().toISOString().slice(0,10);
 if(openRouterUsage.day!==day){openRouterUsage.day=day;openRouterUsage.count=0;}
 const configured=Number(process.env.OPENROUTER_DAILY_LIMIT);
 const limit=Number.isFinite(configured)&&configured>0?Math.min(50,Math.floor(configured)):40;
 if(openRouterUsage.count>=limit)throw new Error('Uranium has reached its daily OpenRouter free-model safety limit. Try again tomorrow.');
 openRouterUsage.count++;return {used:openRouterUsage.count,limit};
}
function toOpenRouterMessages(system,contents){
 const messages=[{role:'system',content:String(system||'')}], pending=new Map();
 let callIndex=0;
 for(const item of contents||[]){
  const parts=item?.parts||[], text=parts.filter(p=>typeof p.text==='string').map(p=>p.text).join('\n');
  const calls=parts.filter(p=>p.functionCall);
  const responses=parts.filter(p=>p.functionResponse);
  const role=item?.role==='model'?'assistant':'user';
  if(calls.length){
   const toolCalls=calls.map(p=>{
    const name=String(p.functionCall.name||''); const id='uranium_call_'+(++callIndex);
    const queue=pending.get(name)||[];queue.push(id);pending.set(name,queue);
    return {id,type:'function',function:{name,arguments:JSON.stringify(p.functionCall.args||{})}};
   });
   messages.push({role:'assistant',...(text?{content:text}:{content:null}),tool_calls:toolCalls});
  }else if(role==='assistant'&&text){messages.push({role:'assistant',content:text});}
  else if(responses.length){
   if(text)messages.push({role:'user',content:text});
   for(const p of responses){
    const name=String(p.functionResponse.name||'');
    const queue=pending.get(name)||[], id=queue.shift();
    if(id)messages.push({role:'tool',tool_call_id:id,name,content:JSON.stringify(p.functionResponse.response??{})});
    else messages.push({role:'user',content:JSON.stringify({tool:name,result:p.functionResponse.response??{}})});
   }
  }else if(text){messages.push({role,content:text});}
 }
 return messages;
}
function normalizeSchema(value){
 if(Array.isArray(value))return value.map(normalizeSchema);
 if(!value||typeof value!=='object')return value;
 const out={};for(const [key,item] of Object.entries(value))out[key]=key==='type'&&typeof item==='string'?item.toLowerCase():normalizeSchema(item);
 return out;
}
function openRouterTools(tools){
 return (tools||[]).map(t=>({type:'function',function:{
  name:t.name,description:t.description||'',
  parameters:normalizeSchema(t.input_schema||t.parameters||{type:'object',properties:{}})
 }}));
}
function normalizeOpenRouterResponse(data){
 const message=data?.choices?.[0]?.message||{}, parts=[];
 if(typeof message.content==='string'&&message.content.trim())parts.push({text:message.content.trim()});
 for(const call of message.tool_calls||[]){
  let args={};try{args=JSON.parse(call.function?.arguments||'{}');}catch{throw new Error('AI provider returned invalid tool arguments.');}
  parts.push({functionCall:{name:String(call.function?.name||''),args}});
 }
 if(!parts.length)throw new Error('OpenRouter returned an empty response.');
 return {candidates:[{content:{parts}}],provider:'openrouter',model:data.model||null};
}
async function generateOpenRouter(system,contents,tools,timeoutMs){
 const key=String(process.env.OPENROUTER_API_KEY||'').trim();
 if(!key)throw new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY in the bot service environment.');
 claimOpenRouterRequest();
 const configured=openRouterModel();
 const models=[...new Set([configured,...String(process.env.OPENROUTER_FALLBACK_MODELS||'').split(',').map(x=>x.trim()).filter(Boolean)])].slice(0,4);
 let last='Free models are temporarily busy.';
 for(const model of models){
  try{
   const body={model,messages:toOpenRouterMessages(system,contents),temperature:0.5,max_tokens:1200};
   const declared=openRouterTools(tools);
   if(declared.length){body.tools=declared;body.tool_choice='auto';}
   const response=await fetch(openRouterEndpoint()+'/chat/completions',{
    method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key,'HTTP-Referer':process.env.OPENROUTER_SITE_URL||'https://uraniumbot.place.run','X-Title':'Uranium Discord Bot'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok)return normalizeOpenRouterResponse(data);
   const message=String(data?.error?.message||'Provider request failed').slice(0,180);
   if([401,403].includes(response.status))throw new Error('OpenRouter rejected the API key or account access. Check the key and provider eligibility.');
   last=response.status===429?'Free model rate limit reached.':message;
   if(![404,408,429,500,502,503,504].includes(response.status))throw new Error('OpenRouter request failed ('+response.status+'). '+message);
  }catch(error){
   if(/rejected the API key|request failed \(/i.test(error.message))throw error;
   last=error.name==='TimeoutError'?'The free model timed out.':String(error.message||error).slice(0,180);
  }
 }
 throw new Error('OpenRouter free models are temporarily unavailable. '+last);
}
async function generateLocal(system,contents,tools,timeoutMs){
 const base=localEndpoint();if(!base)throw new Error('Local AI endpoint is missing or unsafe. Use HTTPS, or loopback HTTP for local development.');
 const messages=[{role:'system',content:system},...contents.map(m=>({role:m.role==='model'?'assistant':m.role,content:(m.parts||[]).filter(p=>p.text).map(p=>p.text).join('\n')}))];
 const body={model:process.env.AI_LOCAL_MODEL||'local-model',messages,temperature:0.5,max_tokens:900};
 const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(process.env.AI_LOCAL_API_KEY?{authorization:'Bearer '+process.env.AI_LOCAL_API_KEY}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('Local model endpoint returned HTTP '+response.status);
 const answer=data.choices?.[0]?.message?.content;
 if(typeof answer!=='string'||!answer.trim())throw new Error('Local model returned an empty response.');
 return {candidates:[{content:{parts:[{text:answer.trim()}]}}],provider:'local'};
}
module.exports={localEndpoint,generateLocal,openRouterEndpoint,openRouterReady,openRouterModel,claimOpenRouterRequest,toOpenRouterMessages,openRouterTools,normalizeOpenRouterResponse,generateOpenRouter};
