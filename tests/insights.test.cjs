const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../dist/model.js');
const core=require('../dist/ai-core.js');
const {build}=require('../dist/insights.js');
const {extractFile}=require('../server/extract.cjs');
const blank={version:1,title:'Información',modules:[],groups:[],entities:[],relationships:[]};
const source={name:'Reunión.txt',sections:[{locator:'párrafo 1',text:'El cliente solicita reservas y recordatorios. El presupuesto está pendiente.'}]};
test('text-only sources create independent context cards with literal provenance',()=>{
  const cards=build({sources:[source],analysis:{chunks:1,clusters:[{terms:['reservas','recordatorios'],count:1}]}});
  assert.deepEqual(cards.map(c=>c.kind),['summary','dashboard']);
  assert.equal(cards[0].references[0].quote,source.sections[0].text);
  assert.equal(cards[1].charts[0].points[0].value,source.sections[0].text.length);
  assert.equal(cards[1].charts[1].points[0].value,1);
  assert.equal(cards[1].charts.some(c=>c.unit==='unidades de la columna'),false);
});
test('real CSV profiles become separate charts for numeric columns with nulls and negatives',async()=>{
  const source=await extractFile('datos.csv',Buffer.from('Nombre,Importe,Unidades\nA,-10,1\nB,20,3\nC,,5'));
  const dashboard=build({sources:[source]})[1];
  const money=dashboard.charts.find(c=>c.title.includes('Importe'));
  assert.deepEqual(money.points.map(p=>p.value),[-10,5,5,20]);
  assert.match(money.note,/2 valores · 1 nulos/);
  assert.equal(dashboard.charts.filter(c=>c.unit==='unidades de la columna').length,2);
});
test('workbook sheets remain distinct and zero values are preserved',()=>{
  const profile={sheets:[{name:'Ventas',...core.tableProfile([{Monto:0},{Monto:0}])},{name:'Costes',...core.tableProfile([{Monto:10},{Monto:20}])}]};
  const dashboard=build({sources:[{...source,name:'presupuesto.xlsx',profile}]})[1];
  assert.equal(dashboard.charts.find(c=>c.title.includes('Ventas')).points[0].value,0);
  assert.equal(dashboard.charts.find(c=>c.title.includes('Costes')).points[3].value,20);
});
test('cards persist through validation and JSON sharing without requiring nodes or edges',()=>{
  const cards=build({sources:[source]}).map((c,i)=>({...c,id:'card'+i,activeChart:0}));
  const valid=M.validate({...blank,cards});
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(valid))),valid);
  assert.equal(valid.cards.length,2);assert.equal(valid.relationships.length,0);
  assert.deepEqual(M.validate(blank).cards,[]);
});
test('reject invalid card coordinates, numeric values, duplicate ids and excessive charts',()=>{
  const cards=build({sources:[source]}).map((c,i)=>({...c,id:'card'+i}));
  for(const mutate of [c=>c[0].x=Infinity,c=>c[0].h=0,c=>c[1].charts[0].points[0].value='fake',c=>c[1].charts=Array(65).fill(c[1].charts[0]),c=>c[0].activeChart=99,c=>c[1].id=c[0].id]){
    const copy=M.clone(cards);mutate(copy);assert.throws(()=>M.validate({...blank,cards:copy}));
  }
});
test('recommendations remain clearly labeled proposals and empty inputs invent nothing',()=>{
  assert.deepEqual(build(),[]);
  const cards=build({draft:{nodes:[{name:'Reservas'}],recommendedLanguages:[{name:'Python'}]}});
  assert.match(cards[0].body,/sin fuentes/);assert.match(cards[1].charts[0].note,/Propuestas, no datos observados/);
});
test('bounded card generation remains importable for many large sources',()=>{
  const sources=Array.from({length:80},(_,i)=>({...source,name:'Fuente'+i,profile:core.tableProfile([{Monto:i}])}));
  const cards=build({sources}).map((c,i)=>({...c,id:'card'+i}));
  assert.doesNotThrow(()=>M.validate({...blank,cards}));
  assert.equal(cards[0].references.length,12);
});
