const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(overrides={},from=()=>{throw new Error('Unexpected database access');}){
  const elements=new Map(),calls=[];
  function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
  const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signUp:async input=>{calls.push(input);return {data:{session:null}};},resend:async input=>{calls.push(input);return {};},signInWithPassword:async()=>({error:{code:'email_not_confirmed'}})};
  Object.assign(auth,overrides);
  const document={getElementById:el,body:{dataset:{}}},window={DOMI_SUPABASE:{url:'https://example.supabase.co',publishableKey:'public'},supabase:{createClient:()=>({auth,from})},addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(fs.readFileSync('dist/cloud.js','utf8'),{window,document,location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},localStorage:{getItem:()=>null},URLSearchParams,Event:class{},setTimeout,clearTimeout});
  el('cloud-email').value=' user@example.com ';el('cloud-password').value='test-password';return {el,calls,auth,window,document};
}
test('signup and resend return to production, including when used locally',async()=>{
  const {el,calls}=setup();await el('cloud-signup').onclick();await el('cloud-resend').onclick();
  assert.equal(calls.length,2);for(const call of calls){assert.equal(call.options.emailRedirectTo,'https://domi-schema-studio.vercel.app/');assert.equal(call.email,'user@example.com');}
  assert.equal(calls[1].type,'signup');assert.equal(calls[1].password,undefined);
});

test('cloud saves enforce the expected account and filter reads by owner and project',async()=>{
  const operations=[];
  const from=table=>({upsert:async row=>{operations.push({table,row});return {};},select:()=>({eq:(column,value)=>{operations.push([column,value]);return {eq:(column,value)=>{operations.push([column,value]);return {maybeSingle:async()=>({data:{state:{prompt:'restored'}}})};}};}})});
  const {auth,window}=setup({},from);await new Promise(resolve=>setImmediate(resolve));
  auth.getSession=async()=>({data:{session:{access_token:'private-test-token',user:{id:'owner',email:'owner@example.com'}}}});
  await assert.rejects(window.DomiCloud.saveAI('project',{},'other'),/cuenta cambió/);assert.equal(operations.length,0);
  await window.DomiCloud.saveAI('project',{updatedAt:'2026-09-15T10:00:00Z'},'owner');assert.equal(operations[0].row.owner_id,'owner');
  assert.equal((await window.DomiCloud.loadAI('project','owner')).prompt,'restored');assert.deepEqual(operations.slice(1),[['owner_id','owner'],['project_id','project']]);
});

test('refresh is shared by concurrent requests and a session alone never means saved',async()=>{
  const {auth,window,el,document}=setup();await new Promise(resolve=>setImmediate(resolve));let calls=0,release;
  const renewed={access_token:'fresh',user:{id:'owner'}};
  auth.refreshSession=()=>{calls++;return new Promise(resolve=>release=()=>resolve({data:{session:renewed}}));};
  const a=window.DomiCloud.refreshSession(),b=window.DomiCloud.refreshSession();release();await Promise.all([a,b]);
  assert.equal(calls,1);assert.equal(document.body.dataset.cloud,'online');assert.doesNotMatch(el('save-state').textContent,/guardado.*Supabase/i);
});
test('unconfirmed accounts get actionable feedback, and controls recover after network failure',async()=>{
  const {el,auth}=setup();await el('cloud-form').onsubmit({preventDefault(){}});assert.match(el('cloud-message').textContent,/Confirma tu correo/);
  auth.signUp=async()=>{throw new Error('Network unavailable');};await el('cloud-signup').onclick();assert.equal(el('cloud-signup').disabled,false);assert.match(el('cloud-message').textContent,/No se pudo completar/);
});
