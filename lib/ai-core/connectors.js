'use strict';

// Connector registry only. Integrations must be implemented as explicit adapters,
// use least-privilege OAuth scopes, and never expose raw tokens to the model.
const DEFINITIONS=Object.freeze({
 github:{label:'GitHub',scopes:['read:user','repo:status'],capabilities:['read repositories','read issues','read pull requests']},
 google_drive:{label:'Google Drive',scopes:['drive.metadata.readonly'],capabilities:['search authorized files','read authorized files']},
 notion:{label:'Notion',scopes:['read content'],capabilities:['search pages','read pages']},
 discord:{label:'Discord',scopes:['bot permissions per server'],capabilities:['read permitted server context','execute permission-checked bot commands']}
});
const adapters=new Map();
function register(name,adapter){
 if(!DEFINITIONS[name])throw new Error('Unknown connector: '+name);
 if(!adapter||typeof adapter.execute!=='function')throw new TypeError('Connector adapter must expose execute().');
 adapters.set(name,adapter);
}
function list(){return Object.entries(DEFINITIONS).map(([id,d])=>({id,label:d.label,scopes:d.scopes,capabilities:d.capabilities,connected:adapters.has(id)}));}
async function execute(name,action,input,actor){
 const def=DEFINITIONS[name],adapter=adapters.get(name);
 if(!def)throw new Error('Unknown connector.');
 if(!adapter)throw new Error(def.label+' is not connected yet.');
 if(!actor||!actor.id)throw new Error('A verified user identity is required.');
 return adapter.execute({action,input,actor});
}
module.exports={DEFINITIONS,register,list,execute};
