const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../dist/model.js');
test('ERP sample survives export and import with its original modules, fields and relations',()=>{
 const map=M.validate(JSON.parse(JSON.stringify(M.example)));
 assert.equal(map.entities.length,4);assert.equal(map.modules.length,4);assert.equal(map.relationships.length,3);
 assert.equal(map.entities[0].fields[0].pk,true);
 assert.deepEqual(M.validate(JSON.parse(JSON.stringify(map))),map);
});
test('connect all four handle directions and prevent accidental duplicate connections',()=>{
 const map=M.clone(M.example);const before=map.relationships.length;
 for(const side of M.sides)M.connect(map,'project',side,'contractor',side);
 assert.equal(map.relationships.length,before+4);
 assert.throws(()=>M.connect(map,'project','right','contractor','right'),/duplicateConnection/);
 assert.throws(()=>M.connect(map,'project','left','project','left'),/samePort/);
 assert.throws(()=>M.connect(map,'missing','right','project','left'),/invalidConnection/);
 assert.equal(map.relationships.length,before+4);
});
test('deleting a node removes only its attached connections',()=>{
 const map=M.clone(M.example);M.removeNode(map,'project');
 assert.equal(map.entities.length,3);assert.deepEqual(map.relationships.map(r=>r.id),['r2']);
 assert.doesNotThrow(()=>M.validate(map));
});
test('duplicate fields are independent and long names remain importable',()=>{
 const map=M.clone(M.example);map.entities[0].name='A'.repeat(100);
 const duplicate=M.duplicateNode(map,'project');duplicate.fields[0].name='new_id';
 assert.notEqual(duplicate.id,'project');assert.equal(map.entities[0].fields[0].name,'id');
 assert.equal(map.relationships.length,3);assert.equal(duplicate.name.length,100);
 assert.doesNotThrow(()=>M.validate(map));
});
test('reject malformed or dangerous import data without mutating the current map',()=>{
 for(const mutate of [m=>m.entities.push({...m.entities[0]}),m=>m.entities[0].x=Infinity,m=>m.entities[0].module='missing',m=>m.modules[0].color='red; background:url(bad)',m=>m.relationships[0].to='missing',m=>m.relationships[0].fromPort='bad',m=>m.entities[0].fields[0].name='',m=>m.version=2]){
  const map=M.clone(M.example);mutate(map);assert.throws(()=>M.validate(map),/invalidMap/);
 }
 assert.equal(M.example.entities[0].x,80);
});
test('legacy HTML schema data imports without IDs or connection ports',()=>{
 const legacy=M.clone(M.example);delete legacy.version;delete legacy.title;delete legacy.groups;
 legacy.relationships.forEach(r=>{delete r.id;delete r.fromPort;delete r.toPort;delete r.kind;});
 const map=M.validate(legacy);assert.equal(map.title,'Mi mapa');assert.deepEqual(map.groups,[]);assert.ok(map.relationships.every(r=>r.id&&r.fromPort==='right'));
});
test('mother nodes preserve subnode membership and deleting one keeps subnodes and their own connections',()=>{
 const map=M.clone(M.example),group={id:'operations',name:'Operaciones',color:'#267454',x:30,y:20,w:800,h:700};
 map.groups.push(group);map.entities[0].groupId=group.id;map.entities[1].groupId=group.id;
 const valid=M.validate(map);assert.equal(valid.entities.filter(n=>n.groupId===group.id).length,2);
 M.removeGroup(valid,group.id);assert.equal(valid.groups.length,0);assert.ok(valid.entities.every(n=>n.groupId===null));assert.equal(valid.relationships.length,3);
});
test('mother nodes connect as first-class endpoints and remove only their direct relationships',()=>{
 const map=M.clone(M.example),mother={id:'operations',name:'Operaciones',color:'#267454',x:30,y:20,w:800,h:700};
 map.groups.push(mother);map.entities[0].groupId=mother.id;
 M.connect(map,mother.id,'right','invoice','left');
 M.connect(map,'contractor','bottom',mother.id,'top');
 assert.equal(map.relationships.filter(r=>r.from===mother.id||r.to===mother.id).length,2);
 assert.doesNotThrow(()=>M.validate(map));
 M.removeGroup(map,mother.id);
 assert.equal(map.entities.find(n=>n.id==='project').groupId,null);
 assert.equal(map.relationships.length,3);
 assert.doesNotThrow(()=>M.validate(map));
});
test('rejects invalid mother nodes and references to missing mother nodes',()=>{
 const missing=M.clone(M.example);missing.entities[0].groupId='missing';assert.throws(()=>M.validate(missing),/invalidMap/);
 const tooSmall=M.clone(M.example);tooSmall.groups=[{id:'g',name:'G',color:'#267454',x:0,y:0,w:299,h:180}];assert.throws(()=>M.validate(tooSmall),/invalidMap/);
});
test('blank maps are valid and every local entrypoint asset exists',()=>{
 assert.doesNotThrow(()=>M.validate({modules:[],entities:[],relationships:[]}));
 const root=path.join(__dirname,'../dist'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),share=fs.readFileSync(path.join(root,'share.html'),'utf8');
 for(const document of [html,share])for(const match of document.matchAll(/(?:src|href)="\.\/([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
