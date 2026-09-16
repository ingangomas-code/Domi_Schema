'use strict';
const AI=require('../dist/ai-core.js');
const Providers=require('../server/providers.cjs');
const Extract=require('../server/extract.cjs');
const {createHash}=require('node:crypto');
const recent=new Map();
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
async function authorize(req){
  if(req.domiLocal===true)return 'local';
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)fail('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Vercel.',503);
  if(!/^Bearer [\w.-]+$/.test(req.headers.authorization||''))fail('Tu sesión no está activa. Inicia sesión en Domi Schema Studio para cargar y generar.',401);
  const response=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:req.headers.authorization},signal:AbortSignal.timeout(10000)});if(!response.ok)fail('Sesión caducada. Inicia sesión de nuevo.',401);
  const user=await response.json();const allowed=(process.env.AI_ALLOWED_EMAILS||'').toLowerCase().split(',').map(x=>x.trim());if(!user.email||!allowed.includes(user.email.toLowerCase())||!user.email_confirmed_at)fail('Tu cuenta aún no tiene acceso a la IA. Solicita al administrador que habilite tu correo.',403);return user.id;
}
function checkSources(sources){
  if(!Array.isArray(sources)||sources.length>80)fail('Máximo 80 fuentes por proyecto.');let total=0;const ids=new Set();
  const safe=sources.map(s=>{if(!s||typeof s.name!=='string'||s.name.length>250||!Array.isArray(s.sections)||s.sections.length>1000)fail('Fuente inválida.');const sections=s.sections.map(p=>{if(typeof p.text!=='string'||typeof p.locator!=='string'||p.locator.length>250)fail('Fragmento inválido.');total+=p.text.length;return {text:p.text,locator:p.locator};});const id=createHash('sha256').update(s.name).update(JSON.stringify(sections)).digest('hex');if(ids.has(id))fail('Hay fuentes duplicadas.');ids.add(id);return {id,name:s.name,sections,warnings:Array.isArray(s.warnings)?s.warnings.filter(x=>typeof x==='string').slice(0,10):[],profile:s.profile||null};});
  if(total>Extract.MAX_TEXT)fail('Máximo 300.000 caracteres por proyecto.');return safe;
}
async function index(sources,semantic){const chunks=AI.chunkSources(sources);if(chunks.length>250)fail('Máximo 250 fragmentos por índice. Reduce las fuentes.');const vectors=semantic&&chunks.length?await Providers.embeddings(chunks.map(c=>c.text)):null;return {chunks,vectors,analysis:AI.summarize(sources,chunks,vectors),embedding:semantic?Providers.embeddingConfig():{provider:'TF-IDF',model:'léxico; pendiente de embeddings semánticos',configured:false}};}
async function bodyOf(req){if(req.body!==undefined){if(Buffer.byteLength(typeof req.body==='string'?req.body:JSON.stringify(req.body))>3600000)fail('Carga demasiado grande.',413);return typeof req.body==='string'?JSON.parse(req.body):req.body;}let total=0,parts=[];for await(const part of req){total+=part.length;if(total>3600000)fail('Carga demasiado grande.',413);parts.push(part);}return JSON.parse(Buffer.concat(parts).toString());}
async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  try{
    if(req.method==='GET')return send(200,{providers:Providers.configuration(),embedding:Providers.embeddingConfig(),requiresLogin:!req.domiLocal,limits:{fileBytes:Extract.MAX_FILE,maxSources:80,maxCharacters:Extract.MAX_TEXT}});
    if(req.method!=='POST')return send(405,{error:'Método no permitido.'});
    const who=await authorize(req),now=Date.now();for(const [id,times] of recent){if(!times.some(t=>now-t<60000))recent.delete(id);}const times=(recent.get(who)||[]).filter(t=>now-t<60000);if(times.length>=20)fail('Espera un minuto antes de procesar más solicitudes.',429);recent.set(who,[...times,now]);
    const body=await bodyOf(req);
    if(body.action==='extract'){if(typeof body.name!=='string'||typeof body.data!=='string'||body.data.length>3400000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))fail('Archivo inválido.');try{return send(200,await Extract.extractUpload(body.name,Buffer.from(body.data,'base64')));}catch(error){if(!error.status||error.status<500)error.code='FILE_INVALID';throw error;}}
    if(body.action==='git')return send(200,await Extract.extractGit(body.url));
    const sources=checkSources(body.sources||[]);
    if(body.action==='analyze'){const data=await index(sources,!!body.semantic&&Providers.embeddingConfig().configured);return send(200,data);}
    if(body.action==='generate'){
      if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000)fail('Escribe un prompt de 1 a 4.000 caracteres.');
      const grounded=sources.length>0;if(!grounded&&body.mode!=='creative')fail('Carga fuentes o selecciona creación por prompt.');
      const provider=Providers.configuration().find(p=>p.id===body.provider);if(!provider?.configured||!provider.models.includes(body.model))fail('Configura la clave y los modelos del proveedor en el servidor.',503);
      const indexed=grounded?await index(sources,true):null;
      const q=grounded?(await Providers.embeddings([body.prompt]))[0]:null;
      const context=grounded?AI.retrieve(indexed.chunks,body.prompt,indexed.vectors,q):[];
      if(grounded&&!context.length)fail('No se encontró contexto relacionado. Amplía las fuentes o cambia el prompt.');
      const draft=await Providers.generate({provider:body.provider,model:body.model,prompt:body.prompt,context,grounded});
      if(!draft.nodes.length)fail('No se encontraron elementos suficientes para crear el esquema. Amplía las fuentes o precisa el prompt.');
      // Reuse the editor validator before offering any generated map for import.
      require('../dist/model.js').validate(AI.toMap(draft));
      return send(200,{draft,context,analysis:indexed?.analysis||null,embedding:indexed?.embedding||null});
    }
    fail('Acción desconocida.');
  }catch(e){const message=e.name==='TimeoutError'?'El procesamiento superó el tiempo disponible. Divide las fuentes.':e.message;send(e.status||400,{error:message||'No se pudo completar la operación.',...(e.code==='FILE_INVALID'?{code:e.code}:{})});}
}
module.exports=handler;module.exports.checkSources=checkSources;module.exports.authorize=authorize;
