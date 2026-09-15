(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DomiAIClient=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  const loginError=()=>Object.assign(new Error('Tu sesión no está activa. Inicia sesión en Domi Schema Studio para continuar; los archivos no fueron descartados.'),{status:401});
  function create({cloud,fetcher=fetch,requiresLogin=()=>true}){
    async function session(refresh=false){const api=cloud();const current=await (refresh?api?.refreshSession():api?.getSession());if(!current?.access_token&&requiresLogin())throw loginError();return current;}
    async function request(body){
      let current=body?await session():null;
      for(let attempt=0;attempt<2;attempt++){
        const response=await fetcher('/api/ai',{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(current?.access_token?{Authorization:'Bearer '+current.access_token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});
        if(body&&response.status===401&&!attempt&&current){current=await session(true);continue;}
        let data;try{data=await response.json();}catch{throw new Error('El servidor no pudo responder. Tus fuentes se conservan; vuelve a intentarlo.');}
        if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo completar la solicitud.'),{status:response.status,code:data.code});
        return data;
      }
    }
    return {request,session};
  }
  // Only file-validation failures belong in the omitted-file report.
  async function batch(files,extract){
    const sources=[],skipped=[];
    for(let i=0;i<files.length;i++){
      try{const result=await extract(files[i],i);sources.push(...result.sources);skipped.push(...result.skipped);}
      catch(error){if(error.code==='FILE_INVALID'){skipped.push({name:files[i].name,reason:error.message});continue;}return {sources,skipped,pending:files.slice(i),error};}
    }
    return {sources,skipped,pending:[],error:null};
  }
  return {create,batch,loginError};
});
