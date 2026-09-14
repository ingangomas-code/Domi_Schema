(function(root){
  'use strict';
  const stopwords=new Set(['el','la','al','en','de','un','es','se','su','por','sus','los','las','del','para','como','este','esta','con','una','uno','que','the','and','for','from','with','const','return','is','of','to','in']);
  const tokens = text => (String(text).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[]).filter(t=>!stopwords.has(t));
  const norm = v => {const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
  const cosine = (a,b) => a.reduce((sum,x,i)=>sum+x*(b[i]||0),0);
  function lexicalIndex(chunks){
    const bags=chunks.map(c=>{const m=new Map();for(const t of tokens(c.text))m.set(t,(m.get(t)||0)+1);return m;});
    const df=new Map();bags.forEach(b=>b.forEach((_,t)=>df.set(t,(df.get(t)||0)+1)));
    const vocabulary=[...df.keys()].sort((a,b)=>df.get(b)-df.get(a)||a.localeCompare(b)).slice(0,1024);
    const idf=vocabulary.map(t=>Math.log((1+chunks.length)/(1+df.get(t)))+1);
    const encode=text=>{const m=new Map();tokens(text).forEach(t=>m.set(t,(m.get(t)||0)+1));return norm(vocabulary.map((t,i)=>(m.has(t)?1+Math.log(m.get(t)):0)*idf[i]));};
    return {vectors:chunks.map(c=>encode(c.text)),encode};
  }
  function cluster(vectors){
    if(!vectors.length)return [];
    const k=Math.min(6,Math.max(1,Math.round(Math.sqrt(vectors.length/2))));
    let centers=[vectors[0]],labels=[];
    while(centers.length<k){let best=0,d=-1;vectors.forEach((v,i)=>{const distance=1-Math.max(...centers.map(c=>cosine(v,c)));if(distance>d){d=distance;best=i;}});centers.push(vectors[best]);}
    for(let step=0;step<20;step++){
      const next=vectors.map(v=>{let id=0,b=-Infinity;centers.forEach((c,i)=>{const s=cosine(v,c);if(s>b){b=s;id=i;}});return id;});
      if(JSON.stringify(next)===JSON.stringify(labels))break;labels=next;
      centers=centers.map((c,j)=>{const members=vectors.filter((_,i)=>labels[i]===j);return members.length?norm(c.map((_,d)=>members.reduce((s,v)=>s+v[d],0)/members.length)):c;});
    }
    return labels;
  }
  function chunkSources(sources){
    let chunks=[];
    for(const source of sources){for(const [si,section] of source.sections.entries()){
      const text=section.text.replace(/\r\n/g,'\n');let start=0;
      while(start<text.length){let end=Math.min(text.length,start+1800);if(end<text.length){const newline=text.lastIndexOf('\n',end);if(newline>start+800)end=newline;}
        const part=text.slice(start,end);if(part.trim())chunks.push({id:source.id+':'+si+':'+start,sourceId:source.id,name:source.name,locator:section.locator+' · líneas '+(text.slice(0,start).split('\n').length)+'–'+text.slice(0,end).split('\n').length,text:part});
        if(end===text.length)break;start=Math.max(start+1,end-180);
      }
    }}return chunks;
  }
  const languageByExt={js:'JavaScript',jsx:'JavaScript',mjs:'JavaScript',cjs:'JavaScript',ts:'TypeScript',tsx:'TypeScript',py:'Python',java:'Java',go:'Go',rs:'Rust',php:'PHP',rb:'Ruby',sql:'SQL',html:'HTML',css:'CSS',vue:'Vue',svelte:'Svelte',cs:'C#',cpp:'C++',cc:'C++',c:'C',h:'C/C++',kt:'Kotlin',swift:'Swift',dart:'Dart',scala:'Scala',sh:'Shell',ps1:'PowerShell'};
  function detectedLanguages(sources){
    const values=new Map();let total=0;
    for(const source of sources){const ext=(source.name.match(/\.([^.\/]+)$/)?.[1]||'').toLowerCase(),name=languageByExt[ext];if(!name)continue;const characters=source.sections.reduce((n,p)=>n+p.text.length,0);total+=characters;const current=values.get(name)||{name,files:0,characters:0};current.files++;current.characters+=characters;values.set(name,current);}
    return [...values.values()].sort((a,b)=>b.characters-a.characters||a.name.localeCompare(b.name)).map(x=>({...x,percent:total?x.characters*100/total:0}));
  }
  function summarize(sources,chunks,vectors){
    const labels=cluster(vectors||lexicalIndex(chunks).vectors),groups=[];
    [...new Set(labels)].sort().forEach(id=>{const members=chunks.filter((_,i)=>labels[i]===id),freq=new Map();members.forEach(c=>tokens(c.text).forEach(t=>freq.set(t,(freq.get(t)||0)+1)));groups.push({id,count:members.length,terms:[...freq].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]),chunkIds:members.map(c=>c.id)});});
    const counts=chunks.map(c=>c.text.length).sort((a,b)=>a-b),freq=new Map();chunks.forEach(c=>tokens(c.text).forEach(t=>freq.set(t,(freq.get(t)||0)+1)));
    return {sources:sources.length,characters:sources.reduce((n,s)=>n+s.sections.reduce((m,p)=>m+p.text.length,0),0),chunks:chunks.length,emptySources:sources.filter(s=>!s.sections.some(p=>p.text.trim())).length,uniqueTerms:freq.size,chunkLength:{min:counts[0]||0,max:counts.at(-1)||0,mean:counts.reduce((a,b)=>a+b,0)/(counts.length||1)},clusters:groups,languages:detectedLanguages(sources),warnings:sources.flatMap(s=>(s.warnings||[]).map(w=>s.name+': '+w))};
  }
  function retrieve(chunks,prompt,vectors,queryVector){
    const lex=lexicalIndex(chunks),q=lex.encode(prompt),queryTerms=new Set(tokens(prompt));
    const ranked=chunks.map((c,i)=>({ ...c,score:.4*cosine(lex.vectors[i],q)+.6*(vectors&&queryVector?cosine(vectors[i],queryVector):cosine(lex.vectors[i],q)),matches:tokens(c.text).filter(t=>queryTerms.has(t)).length})).sort((a,b)=>b.score-a.score||b.matches-a.matches);
    return ranked.filter(c=>c.score>0).slice(0,18);
  }
  function tableProfile(rows){
    if(!rows.length)return {rows:0,columns:[]};
    const quantile=(v,p)=>{const i=(v.length-1)*p,l=Math.floor(i);return v[l]+(v[Math.ceil(i)]-v[l])*(i-l);};
    return {rows:rows.length,duplicateRows:rows.length-new Set(rows.map(r=>JSON.stringify(r))).size,columns:Object.keys(rows[0]).map(name=>{
      const values=rows.map(r=>r[name]),present=values.filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''),nums=present.map(Number),numeric=present.length>0&&nums.every(Number.isFinite);
      const out={name,type:numeric?'number':'text',nonNull:present.length,nulls:values.length-present.length,unique:new Set(present).size};
      if(numeric){nums.sort((a,b)=>a-b);const mean=nums.reduce((a,b)=>a+b,0)/nums.length,q1=quantile(nums,.25),q3=quantile(nums,.75);Object.assign(out,{min:nums[0],max:nums.at(-1),mean,std:nums.length>1?Math.sqrt(nums.reduce((s,v)=>s+(v-mean)**2,0)/(nums.length-1)):null,p25:q1,median:quantile(nums,.5),p75:q3,outliers:nums.filter(v=>v<q1-1.5*(q3-q1)||v>q3+1.5*(q3-q1)).length});}return out;
    })};
  }
  function validateDraft(raw,context,grounded){
    if(!raw||typeof raw.title!=='string'||!raw.title.trim()||!Array.isArray(raw.nodes)||!Array.isArray(raw.edges)||raw.nodes.length>80||raw.edges.length>200)throw new Error('El modelo no devolvió un borrador válido.');
    const string=(x,max=160)=>typeof x==='string'&&x.trim()&&x.length<=max;
    const byId=new Map(context.map(c=>[c.id,c]));
    const cite=e=>{if(!Array.isArray(e)||e.length>12)throw new Error('Evidencias inválidas.');if(grounded&&!e.length)throw new Error('Se rechazó un elemento sin evidencia.');return e.map(ref=>{const c=byId.get(ref.chunkId);if(!c||!string(ref.quote,1800)||ref.quote.trim().length<8||!c.text.includes(ref.quote))throw new Error('Una cita no existe en los fragmentos recuperados.');return {chunkId:c.id,quote:ref.quote,name:c.name,locator:c.locator};});};
    const nodes=raw.nodes.map(n=>{if(!n||!string(n.id,100)||!string(n.name,100)||!Array.isArray(n.fields)||n.fields.length>40)throw new Error('Nodo inválido.');return {id:n.id,name:n.name,group:typeof n.group==='string'?n.group.slice(0,100):'',evidence:cite(n.evidence||[]),fields:n.fields.map(f=>{if(!string(f.name,100)||!string(f.type,50))throw new Error('Campo inválido.');return {name:f.name,type:f.type,evidence:cite(f.evidence||[])};})};});
    const ids=new Set(nodes.map(n=>n.id));if(ids.size!==nodes.length)throw new Error('IDs repetidos.');
    const edges=raw.edges.map((e,i)=>{if(!ids.has(e.from)||!ids.has(e.to)||!string(e.label,160))throw new Error('Relación inválida.');return {id:'edge_'+i,from:e.from,to:e.to,label:e.label,evidence:cite(e.evidence||[])};});
    const recommendations=(Array.isArray(raw.recommendations)?raw.recommendations:[]).slice(0,20).map((r,i)=>{if(!string(r.text,1200))throw new Error('Recomendación inválida.');return {id:'rec_'+i,text:r.text,evidence:cite(r.evidence||[]),reviewed:false,accepted:false};});
    const recommendedLanguages=(Array.isArray(raw.recommendedLanguages)?raw.recommendedLanguages:[]).slice(0,12).map((r,i)=>{if(!string(r.name,80)||!string(r.reason,1200))throw new Error('Lenguaje recomendado inválido.');return {id:'language_'+i,name:r.name,reason:r.reason,evidence:cite(r.evidence||[])};});
    return {title:raw.title.slice(0,100),nodes,edges,recommendations,recommendedLanguages,grounded,limitations:typeof raw.limitations==='string'?raw.limitations.slice(0,2500):'',createdAt:new Date().toISOString()};
  }
  function toMap(draft){
    const groups=[],entities=[],names=[...new Set(draft.nodes.map(n=>n.group).filter(Boolean))];let cursor=70;
    for(const [i,name] of names.entries()){const members=draft.nodes.filter(n=>n.group===name),maxFields=Math.max(...members.map(n=>n.fields.length),0),rowH=150+maxFields*30;groups.push({id:'ai_group_'+i,name,color:'#267454',x:60,y:cursor,w:900,h:90+Math.ceil(members.length/3)*rowH});cursor+=groups.at(-1).h+80;}
    let free=0;
    for(const n of draft.nodes){const group=groups.find(g=>g.name===n.group),members=draft.nodes.filter(x=>x.group===n.group),i=group?members.indexOf(n):free++,rowH=150+Math.max(...members.map(x=>x.fields.length),0)*30;entities.push({id:n.id,module:'ai',name:n.name,label:'',description:(draft.grounded?'Borrador basado en fuentes. Citas verificadas; interpretación pendiente de revisión.':'Borrador creativo generado por IA.')+'\n'+n.evidence.map(e=>e.name+' · '+e.locator+'\n'+e.quote).join('\n').slice(0,3500),x:(group?group.x+30:80)+(i%3)*285,y:(group?group.y+65:cursor)+Math.floor(i/3)*rowH,groupId:group?.id||null,fields:n.fields.map(f=>({name:f.name,type:f.type,observed:false,required:false,extension:true}))});}
    return {version:1,title:('Borrador · '+draft.title).slice(0,100),modules:[{id:'ai',name:'Borrador IA',color:'#267454',core:true}],groups,entities,relationships:draft.edges.map(e=>({id:e.id,from:e.from,to:e.to,fromPort:'right',toPort:'left',label:e.label,kind:'→'}))};
  }
  function reviewRecommendation(rec,decision,value){
    if(!['reviewed','accepted'].includes(decision))throw new Error('Decisión inválida.');
    if(decision==='accepted'&&value&&!rec.reviewed)throw new Error('Revisa la recomendación antes de aceptarla.');
    rec[decision]=!!value;if(!rec.reviewed)rec.accepted=false;
    rec.reviewedAt=rec.reviewed?(rec.reviewedAt||new Date().toISOString()):null;
    rec.acceptedAt=rec.accepted?(rec.acceptedAt||new Date().toISOString()):null;return rec;
  }
  const api={tokens,cosine,norm,lexicalIndex,cluster,chunkSources,summarize,retrieve,tableProfile,detectedLanguages,validateDraft,toMap,reviewRecommendation};root.DomiAI=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
