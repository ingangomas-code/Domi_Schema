(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DomiAISync=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  const copy=value=>JSON.parse(JSON.stringify(value));
  function create({read,write,remove,cloud,notify=()=>{}}){
    const queues=new Map();
    const key=(id,owner)=>JSON.stringify([owner||'local',id]);
    async function load(id,owner){
      const k=key(id,owner);await queues.get(k)?.catch(()=>{});let record=await read(k);
      if(!record){const legacy=await read(id);if(legacy&&(!legacy.ownerId||legacy.ownerId===owner)){record={state:legacy,dirty:true};await write(k,record);await remove(id);}}
      if(!record&&owner){const guest=await read(key(id,null));if(guest){record=guest;await write(k,record);await remove(key(id,null));}}
      if(!owner){notify('local');return record?.state||null;}
      notify('syncing');
      try{
        const remote=await cloud().loadAI(id,owner);
        if(remote&&record?.dirty&&new Date(remote.updatedAt)>new Date(record.state.updatedAt))throw new Error('Hay cambios más recientes en otro dispositivo. Se conserva tu copia local; exporta el expediente antes de elegir cuál conservar.');
        if(remote&&(!record||new Date(remote.updatedAt)>new Date(record.state.updatedAt))){record={state:remote,dirty:false};await write(k,record);}
        if(record?.dirty)await send(id,owner,record);
        else notify('saved');
      }catch(error){notify('error',error);}
      return record?.state||null;
    }
    async function send(id,owner,record){
      const k=key(id,owner);
      await cloud().saveAI(id,record.state,owner);
      const latest=await read(k);
      if(latest&&JSON.stringify(latest.state)===JSON.stringify(record.state))await write(k,{state:record.state,dirty:false});
      notify('saved');
    }
    async function save(id,owner,state){
      const record={state:copy(state),dirty:true},k=key(id,owner);
      await write(k,record);
      if(!owner){notify('local');return;}
      notify('syncing');
      const previous=queues.get(k)||Promise.resolve();
      const work=previous.catch(()=>{}).then(()=>send(id,owner,record));queues.set(k,work);
      try{await work;}catch(error){notify('error',error);}finally{if(queues.get(k)===work)queues.delete(k);}
    }
    return {load,save};
  }
  return {create};
});
