const {test}=require('node:test');
const assert=require('node:assert/strict');
const Client=require('../dist/ai-client.js'),Sync=require('../dist/ai-sync.js');
test('authenticated uploads reuse the app token and renew an expired token once',async()=>{
  const tokens=[];let refreshes=0;
  const api=Client.create({cloud:()=>({getSession:async()=>({access_token:'old'}),refreshSession:async()=>{refreshes++;return {access_token:'fresh'};}}),fetcher:async(_url,options)=>{tokens.push(options.headers.Authorization);return tokens.length===1?{status:401,ok:false}:{status:200,ok:true,json:async()=>({sources:['file'],skipped:[]})};}});
  assert.deepEqual(await api.request({action:'extract'}),{sources:['file'],skipped:[]});assert.deepEqual(tokens,['Bearer old','Bearer fresh']);assert.equal(refreshes,1);
});
test('missing session stops before sending files; repeated 401 and forbidden errors never loop',async()=>{
  let requests=0,refreshes=0;
  const absent=Client.create({cloud:()=>({getSession:async()=>null}),fetcher:async()=>{requests++;}});
  await assert.rejects(absent.request({action:'extract'}),e=>e.status===401);assert.equal(requests,0);
  for(const status of [401,403]){requests=0;refreshes=0;const api=Client.create({cloud:()=>({getSession:async()=>({access_token:'token'}),refreshSession:async()=>{refreshes++;return {access_token:'fresh'};}}),fetcher:async()=>{requests++;return {status,ok:false,json:async()=>({error:'Denied'})};}});await assert.rejects(api.request({action:'extract'}),e=>e.status===status);assert.equal(requests,status===401?2:1);assert.equal(refreshes,status===401?1:0);}
});
test('authentication/network errors retain the unprocessed batch and previous successes',async()=>{
  const files=['valid','unsupported','expired','next'].map(name=>({name}));
  const result=await Client.batch(files,async file=>{if(file.name==='unsupported')throw Object.assign(new Error('unsupported'),{code:'FILE_INVALID'});if(file.name==='expired')throw Object.assign(new Error('login'),{status:401});return {sources:[file.name],skipped:[]};});
  assert.deepEqual(result.sources,['valid']);assert.deepEqual(result.skipped,[{name:'unsupported',reason:'unsupported'}]);assert.deepEqual(result.pending.map(f=>f.name),['expired','next']);assert.equal(result.error.status,401);
});
function fixture(){
  const records=new Map(),remote=new Map(),statuses=[],calls=[];let failing=false;
  const copy=x=>x===undefined?undefined:structuredClone(x);
  const cloud={loadAI:async(id,owner)=>{if(failing)throw new Error('offline');return copy(remote.get(owner+':'+id));},saveAI:async(id,state,owner)=>{if(failing)throw new Error('offline');calls.push([id,owner]);remote.set(owner+':'+id,copy(state));}};
  const sync=Sync.create({read:async k=>copy(records.get(k)),write:async(k,v)=>records.set(k,copy(v)),remove:async k=>records.delete(k),cloud:()=>cloud,notify:(status,error)=>statuses.push([status,error?.message])});
  return {sync,records,remote,statuses,calls,cloud,fail:value=>failing=value};
}
const state=(prompt,date='2026-09-15T10:00:00Z')=>({version:1,sources:[{name:'requirements.txt',sections:[{text:prompt,locator:'line 1'}]}],prompt,updatedAt:date});
test('sources save to cloud automatically, restore on a second device, and stay scoped by owner/project',async()=>{
  const a=fixture();await a.sync.save('project','owner',state('first'));assert.equal(a.remote.get('owner:project').prompt,'first');assert.equal(a.statuses.at(-1)[0],'saved');
  a.records.clear();assert.equal((await a.sync.load('project','owner')).prompt,'first');assert.equal(await a.sync.load('project','other'),null);assert.equal(await a.sync.load('other-project','owner'),null);
});
test('failed cloud save retains a dirty local copy and retries when reopened',async()=>{
  const a=fixture();a.fail(true);await a.sync.save('project','owner',state('offline edit'));assert.equal(a.statuses.at(-1)[0],'error');assert.equal(a.records.get(JSON.stringify(['owner','project'])).dirty,true);
  a.fail(false);await a.sync.load('project','owner');assert.equal(a.remote.get('owner:project').prompt,'offline edit');assert.equal(a.records.get(JSON.stringify(['owner','project'])).dirty,false);
});
test('legacy and guest sources migrate once to the signed-in owner without leaking on account switch',async()=>{
  const a=fixture();a.records.set('project',state('legacy'));await a.sync.load('project',null);assert.ok(!a.records.has('project'));await a.sync.load('project','owner');assert.equal(a.remote.get('owner:project').prompt,'legacy');assert.equal(await a.sync.load('project','other'),null);
});
test('newer remote sources do not silently replace unsynced edits',async()=>{
  const a=fixture();a.fail(true);await a.sync.save('project','owner',state('local'));a.fail(false);a.remote.set('owner:project',state('remote','2026-09-16T10:00:00Z'));assert.equal((await a.sync.load('project','owner')).prompt,'local');assert.equal(a.remote.get('owner:project').prompt,'remote');assert.equal(a.statuses.at(-1)[0],'error');
});
test('overlapping saves preserve snapshots and finish with the latest content',async()=>{
  const a=fixture();let release;const wait=new Promise(resolve=>release=resolve),original=a.cloud.saveAI;let count=0;
  a.cloud.saveAI=async(...args)=>{if(++count===1)await wait;return original(...args);};
  const one=a.sync.save('project','owner',state('one'));const latest=state('two');const two=a.sync.save('project','owner',latest);latest.prompt='mutated after save';release();await Promise.all([one,two]);assert.equal(a.remote.get('owner:project').prompt,'two');assert.equal(a.records.get(JSON.stringify(['owner','project'])).dirty,false);
});
