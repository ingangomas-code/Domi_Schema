(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DomiAIWorkflow=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  function provider(config,preferred){const available=(config?.providers||[]).filter(p=>p.configured&&p.models?.length);return available.find(p=>p.id===preferred)||available[0]||null;}
  function mode(sources){return sources.length?'grounded':'creative';}
  function request(state,config,prompt,model){
    if(!prompt.trim())throw new Error('Escribe qué esquema quieres generar.');
    const selected=provider(config,state.provider);
    if(!selected)throw new Error('No hay un modelo disponible. Revisa la configuración de IA.');
    if(state.sources.length&&!config?.embedding?.configured)throw new Error('Falta configurar los embeddings para generar con documentos.');
    return {action:'generate',sources:state.sources,prompt:prompt.trim(),mode:mode(state.sources),provider:selected.id,model:selected.models.includes(model)?model:selected.models[0]};
  }
  return {provider,mode,request};
});
