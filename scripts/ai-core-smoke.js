const assert=require('node:assert/strict');
const core=require('../lib/ai-core');
const a=core.normalizeInput('hlo plz delte tht msg https://example.com/a?id=123456789012345678 <@123456789012345678>');
assert.match(a.normalized,/hello please/);
assert.match(a.normalized,/delete that message/);
assert.match(a.normalized,/https:\/\/example\.com\/a\?id=123456789012345678/);
assert.match(a.normalized,/<@123456789012345678>/);
assert.equal(core.normalizeInput('whts the rulz').normalized,'what is the rules');
assert.equal(core.provider.localEndpoint(),null);
const openRouterMessages=core.provider.toOpenRouterMessages('system prompt',[
 {role:'user',parts:[{text:'Please create a channel'}]},
 {role:'model',parts:[{functionCall:{name:'run_command',args:{command:'channel create',args:{name:'general'}}}}]},
 {role:'user',parts:[{functionResponse:{name:'run_command',response:{ok:true}}}]}
]);
assert.equal(openRouterMessages[0].role,'system');
assert.equal(openRouterMessages[1].role,'user');
assert.equal(openRouterMessages[2].tool_calls[0].function.name,'run_command');
assert.equal(openRouterMessages[3].role,'tool');
assert.equal(openRouterMessages[3].tool_call_id,openRouterMessages[2].tool_calls[0].id);
const converted=core.provider.normalizeOpenRouterResponse({model:'openrouter/free',choices:[{message:{tool_calls:[{function:{name:'set_prefix',arguments:'{"prefix":"!"}'}}]}}]});
assert.deepEqual(converted.candidates[0].content.parts[0].functionCall,{name:'set_prefix',args:{prefix:'!'}});
assert.equal(core.provider.openRouterReady(),false);
assert.ok(core.connectors.list().every(x=>x.connected===false));
const memory=core.memory;
memory.forget('g','c','u');
memory.add('g','c','u','user','hello');
assert.equal(memory.get('g','c','u').length,1);
assert.equal(memory.forget('g','c','u'),true);
assert.equal(memory.get('g','c','u').length,0);
console.log('Uranium AI Core smoke checks passed.');
