const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('../dist/ai-workflow.js');
const config={providers:[{id:'openai',configured:false,models:[]},{id:'gemini',label:'Gemini',configured:true,models:['configured-model']}],embedding:{configured:true}};
test('old workspaces defaulting to unavailable OpenAI select configured Gemini',()=>{
  assert.equal(W.provider(config,'openai').id,'gemini');
  assert.equal(W.request({provider:'openai',sources:[]},config,'Genera un flujo','').provider,'gemini');
});
test('prompt-only generation uses creative mode automatically and documents force evidence',()=>{
  const state={provider:'gemini',sources:[]};
  assert.equal(W.request(state,config,'Flujo de pedidos','wrong-model').mode,'creative');
  state.sources=[{id:'source',sections:[{locator:'documento',text:'El cliente realiza pedidos.'}]}];
  const r=W.request(state,config,'Pedidos','');assert.equal(r.mode,'grounded');assert.deepEqual(r.sources,state.sources);assert.equal(r.model,'configured-model');
});
test('missing prompts, generation models and embeddings fail with actionable messages',()=>{
  assert.throws(()=>W.request({sources:[]},config,'  ',''),/Escribe/);
  assert.throws(()=>W.request({sources:[]},{providers:[]},'Flujo',''),/modelo disponible/);
  assert.throws(()=>W.request({sources:[{}]},{...config,embedding:{configured:false}},'Flujo',''),/embeddings/);
});
