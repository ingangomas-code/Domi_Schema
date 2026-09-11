(function (root) {
  'use strict';
  const uid = () => 'id_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const clone = value => JSON.parse(JSON.stringify(value));
  const sides = ['left', 'right', 'top', 'bottom'];
  const example = {
    version: 1, title: 'Constructora ERP',
    groups: [],
    modules: [
      {id:'projects',name:'Proyectos & Obras',core:true,color:'#10b981'},
      {id:'procurement',name:'Compras & Proveedores',core:true,color:'#0ea5e9'},
      {id:'inventory',name:'Inventario & Almacén',core:false,color:'#8b5cf6'},
      {id:'finance',name:'Finanzas & Facturación',core:true,color:'#f59e0b'}
    ],
    entities: [
      {id:'project',module:'projects',name:'Project',label:'Proyecto / Obra',description:'',x:80,y:70,fields:[{name:'id',type:'UUID',pk:true},{name:'code',type:'VARCHAR',observed:true},{name:'name',type:'VARCHAR',observed:true},{name:'budget',type:'DECIMAL',required:true},{name:'status',type:'ENUM',observed:true}]},
      {id:'contractor',module:'procurement',name:'Contractor',label:'Contratista / Proveedor',description:'',x:490,y:70,fields:[{name:'id',type:'UUID',pk:true},{name:'company_name',type:'VARCHAR',observed:true},{name:'tax_id',type:'VARCHAR',required:true},{name:'rating',type:'INT',extension:true}]},
      {id:'material',module:'inventory',name:'MaterialItem',label:'Ítem de Inventario',description:'',x:80,y:440,fields:[{name:'id',type:'UUID',pk:true},{name:'sku',type:'VARCHAR',observed:true},{name:'unit',type:'VARCHAR',observed:true},{name:'stock_qty',type:'DECIMAL',observed:true}]},
      {id:'invoice',module:'finance',name:'Invoice',label:'Factura / Estimación',description:'',x:490,y:440,fields:[{name:'id',type:'UUID',pk:true},{name:'invoice_no',type:'VARCHAR',observed:true},{name:'amount',type:'DECIMAL',required:true},{name:'project_id',type:'UUID',fk:true}]}
    ],
    relationships: [
      {id:'r1',from:'project',to:'invoice',fromPort:'right',toPort:'left',label:'tiene facturas',kind:'1:N'},
      {id:'r2',from:'contractor',to:'invoice',fromPort:'bottom',toPort:'top',label:'emite',kind:'1:N'},
      {id:'r3',from:'project',to:'material',fromPort:'bottom',toPort:'top',label:'consume',kind:'N:M'}
    ]
  };
  function validate(input) {
    const fail = () => {throw new Error('invalidMap');};
    if (!input || typeof input !== 'object' || Array.isArray(input) || (input.version !== undefined && input.version !== 1)) fail();
    if (!Array.isArray(input.modules) || !Array.isArray(input.entities) || !Array.isArray(input.relationships) || (input.groups !== undefined && !Array.isArray(input.groups))) fail();
    if (input.modules.length > 100 || input.entities.length > 1000 || input.relationships.length > 5000 || (input.groups?.length||0) > 200) fail();
    const str = (v, max=300, fallback='') => { if (v === undefined) return fallback; if(typeof v !== 'string' || v.length > max) fail(); return v; };
    const id = v => {const x=str(v,150); if(!x.trim()) fail(); return x;};
    const unique = values => {if(new Set(values).size !== values.length) fail();};
    const modules = input.modules.map(m => { if(!m || typeof m !== 'object') fail(); const name = str(m.name,100); if(!name.trim()) fail(); if(typeof m.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(m.color)) fail(); return {id:id(m.id),name,color:m.color,core:!!m.core}; });
    unique(modules.map(m=>m.id));
    const groups = (input.groups||[]).map(g => {
      if(!g || typeof g !== 'object' || !Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.w) || !Number.isFinite(g.h) || Math.abs(g.x)>100000 || Math.abs(g.y)>100000 || g.w<300 || g.h<180 || g.w>10000 || g.h>10000) fail();
      const name=str(g.name,100);if(!name.trim() || typeof g.color!=='string' || !/^#[0-9a-f]{6}$/i.test(g.color)) fail();
      return{id:id(g.id),name,color:g.color,x:g.x,y:g.y,w:g.w,h:g.h};
    });
    unique(groups.map(g=>g.id));
    const entities = input.entities.map(n => {
      if(!n || !modules.some(m=>m.id===n.module) || !Array.isArray(n.fields) || n.fields.length>100) fail();
      if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>100000||Math.abs(n.y)>100000) fail();
      const name=str(n.name,100); if(!name.trim()) fail();
      if(n.groupId!==undefined && n.groupId!==null && !groups.some(g=>g.id===n.groupId)) fail();
      return {id:id(n.id),module:n.module,name,label:str(n.label,160),description:str(n.description,4000),x:n.x,y:n.y,groupId:n.groupId||null,
        fields:n.fields.map(f=>{if(!f || typeof f !== 'object') fail();const name=str(f.name,100),type=str(f.type,50);if(!name.trim()||!type.trim())fail();return{name,type,pk:!!f.pk,fk:!!f.fk,observed:!!f.observed,required:!!f.required,extension:!!f.extension};})};
    });
    unique(entities.map(n=>n.id));
    const relationships = input.relationships.map(r=>{
      if(!r || !entities.some(n=>n.id===r.from) || !entities.some(n=>n.id===r.to)) fail();
      if((r.fromPort!==undefined&&!sides.includes(r.fromPort)) || (r.toPort!==undefined&&!sides.includes(r.toPort))) fail();
      return{id:r.id===undefined?uid():id(r.id),from:r.from,to:r.to,fromPort:r.fromPort||'right',toPort:r.toPort||'left',label:str(r.label,160),kind:str(r.kind,30,'1:N')};
    });
    unique(relationships.map(r=>r.id));
    return{version:1,title:str(input.title,100,'Mi mapa')||'Mi mapa',groups,modules,entities,relationships};
  }
  function connect(map, from, fromPort, to, toPort) {
    if(!sides.includes(fromPort)||!sides.includes(toPort)||!map.entities.some(n=>n.id===from)||!map.entities.some(n=>n.id===to)) throw new Error('invalidConnection');
    if(from===to&&fromPort===toPort) throw new Error('samePort');
    if(map.relationships.some(r=>r.from===from&&r.to===to&&r.fromPort===fromPort&&r.toPort===toPort)) throw new Error('duplicateConnection');
    const edge={id:uid(),from,to,fromPort,toPort,label:'',kind:'→'};
    map.relationships.push(edge);return edge;
  }
  function removeNode(map,id){map.entities=map.entities.filter(n=>n.id!==id);map.relationships=map.relationships.filter(r=>r.from!==id&&r.to!==id);}
  function removeGroup(map,id){map.groups=map.groups.filter(g=>g.id!==id);map.entities.forEach(n=>{if(n.groupId===id)n.groupId=null;});}
  function duplicateNode(map,id){const original=map.entities.find(n=>n.id===id);if(!original)return null;const node={...clone(original),id:uid(),x:Math.min(100000,original.x+40),y:Math.min(100000,original.y+40),name:original.name.slice(0,96)+' (2)'};map.entities.push(node);return node;}
  root.SchemaModel={uid,clone,example,validate,connect,removeNode,removeGroup,duplicateNode,sides};
  if(typeof module!=='undefined')module.exports=root.SchemaModel;
})(globalThis);
