'use strict';
(() => {
  const STORAGE='schema-studio-projects-v1';
  const config=window.DOMI_SUPABASE;
  const button=document.getElementById('cloud-button');
  const dialog=document.getElementById('cloud-dialog');
  const message=document.getElementById('cloud-message');
  if(!button||!dialog)return;
  if(!window.supabase?.createClient||!config?.url||!config?.publishableKey){button.disabled=true;button.title='Supabase no disponible';return;}
  const client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let session=null,timer=null,syncing=false,ready=false;
  const readLocal=()=>{try{const value=JSON.parse(localStorage.getItem(STORAGE));return value&&Array.isArray(value.projects)?value:null;}catch{return null;}};
  const setMessage=(text,error=false)=>{message.textContent=text;message.classList.toggle('error',error);};
  function renderSession(){
    const online=!!session?.user;document.body.dataset.cloud=online?'online':'offline';
    document.getElementById('cloud-signed-out').hidden=online;document.getElementById('cloud-signed-in').hidden=!online;
    document.getElementById('cloud-user').textContent=session?.user?.email||'';
    document.getElementById('cloud-button-label').textContent=online?(session.user.email||'Supabase'):'Nube';
    window.dispatchEvent(new Event('domi:cloud-state'));
  }
  async function pushLocal(removeMissing=true){
    if(!session?.user||syncing)return;const portfolio=readLocal();if(!portfolio)return;
    syncing=true;setMessage('Sincronizando…');
    try{
      const rows=portfolio.projects.map(p=>({id:String(p.id),owner_id:session.user.id,name:String(p.name||p.map?.title||'Proyecto').slice(0,100),map_data:p.map,updated_at:p.updatedAt||new Date().toISOString()}));
      if(rows.length){const {error}=await client.from('schema_projects').upsert(rows,{onConflict:'id'});if(error)throw error;}
      if(removeMissing){const {data,error}=await client.from('schema_projects').select('id');if(error)throw error;const localIds=new Set(rows.map(r=>r.id)),stale=(data||[]).filter(r=>!localIds.has(r.id)).map(r=>r.id);if(stale.length){const result=await client.from('schema_projects').delete().in('id',stale);if(result.error)throw result.error;}}
      setMessage('Proyectos sincronizados.');document.getElementById('save-state').textContent='Guardado en Supabase';
    }catch(error){setMessage(error.message||'No se pudo sincronizar.',true);}finally{syncing=false;}
  }
  async function mergeFromCloud(){
    if(!session?.user)return;syncing=true;setMessage('Buscando proyectos en la nube…');
    try{
      const {data,error}=await client.from('schema_projects').select('id,name,map_data,updated_at').order('updated_at',{ascending:false});if(error)throw error;
      const local=readLocal()||{version:1,currentId:null,projects:[]},byId=new Map(local.projects.map(p=>[String(p.id),p]));let changed=false;
      for(const row of data||[]){const current=byId.get(String(row.id));if(!current||new Date(row.updated_at)>new Date(current.updatedAt||0)){byId.set(String(row.id),{id:String(row.id),name:row.name,updatedAt:row.updated_at,map:row.map_data});changed=true;}}
      local.projects=[...byId.values()];if(!local.currentId&&local.projects.length)local.currentId=local.projects[0].id;if(changed)localStorage.setItem(STORAGE,JSON.stringify(local));
      syncing=false;await pushLocal(false);if(changed)location.reload();
    }catch(error){syncing=false;setMessage(error.message||'No se pudo leer Supabase.',true);}
  }
  button.onclick=()=>{setMessage('');dialog.showModal();};
  document.getElementById('cloud-close').onclick=()=>dialog.close();
  document.getElementById('cloud-form').onsubmit=async event=>{event.preventDefault();setMessage('Iniciando sesión…');const email=document.getElementById('cloud-email').value.trim(),password=document.getElementById('cloud-password').value;const {data,error}=await client.auth.signInWithPassword({email,password});if(error)return setMessage(error.message,true);session=data.session;renderSession();await mergeFromCloud();};
  document.getElementById('cloud-signup').onclick=async()=>{const email=document.getElementById('cloud-email').value.trim(),password=document.getElementById('cloud-password').value;if(!email||password.length<6)return setMessage('Escribe un correo válido y una contraseña de al menos 6 caracteres.',true);setMessage('Creando cuenta…');const {data,error}=await client.auth.signUp({email,password});if(error)return setMessage(error.message,true);if(data.session){session=data.session;renderSession();await mergeFromCloud();}else setMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');};
  document.getElementById('cloud-signout').onclick=async()=>{const {error}=await client.auth.signOut();if(error)return setMessage(error.message,true);session=null;renderSession();setMessage('Sesión cerrada. Los proyectos locales permanecen en este navegador.');};
  document.getElementById('cloud-sync').onclick=mergeFromCloud;
  window.addEventListener('domi:projects-changed',()=>{if(!ready||!session?.user)return;clearTimeout(timer);timer=setTimeout(()=>pushLocal(true),700);});
  window.addEventListener('domi:cloud-state',()=>{const state=document.getElementById('save-state');if(state&&session?.user)state.textContent='Guardado en Supabase';});
  client.auth.onAuthStateChange((_event,next)=>{session=next;renderSession();});
  client.auth.getSession().then(async({data})=>{session=data.session;ready=true;renderSession();if(session)await mergeFromCloud();});
})();
