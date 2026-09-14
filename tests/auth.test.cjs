const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  const elements=new Map(),calls=[];
  function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
  const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signUp:async input=>{calls.push(input);return {data:{session:null}};},resend:async input=>{calls.push(input);return {};},signInWithPassword:async()=>({error:{code:'email_not_confirmed'}})};
  const document={getElementById:el,body:{dataset:{}}},window={DOMI_SUPABASE:{url:'https://example.supabase.co',publishableKey:'public'},supabase:{createClient:()=>({auth})},addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(fs.readFileSync('dist/cloud.js','utf8'),{window,document,location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},localStorage:{getItem:()=>null},URLSearchParams,Event:class{},setTimeout,clearTimeout});
  el('cloud-email').value=' user@example.com ';el('cloud-password').value='test-password';return {el,calls,auth};
}
test('signup and resend return to production, including when used locally',async()=>{
  const {el,calls}=setup();await el('cloud-signup').onclick();await el('cloud-resend').onclick();
  assert.equal(calls.length,2);for(const call of calls){assert.equal(call.options.emailRedirectTo,'https://domi-schema-studio.vercel.app/');assert.equal(call.email,'user@example.com');}
  assert.equal(calls[1].type,'signup');assert.equal(calls[1].password,undefined);
});
test('unconfirmed accounts get actionable feedback, and controls recover after network failure',async()=>{
  const {el,auth}=setup();await el('cloud-form').onsubmit({preventDefault(){}});assert.match(el('cloud-message').textContent,/Confirma tu correo/);
  auth.signUp=async()=>{throw new Error('Network unavailable');};await el('cloud-signup').onclick();assert.equal(el('cloud-signup').disabled,false);assert.match(el('cloud-message').textContent,/No se pudo completar/);
});
