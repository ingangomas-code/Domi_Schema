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
  window.DomiCloud=Object.freeze({
    getSession:async()=>{const {data,error}=await client.auth.getSession();if(error)throw error;return data.session;},
    saveAI:async(projectId,state)=>{const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw new Error('Inicia sesión desde Nube.');const {error}=await client.from('ai_workspaces').upsert({owner_id:user.id,project_id:projectId,state,updated_at:new Date().toISOString()},{onConflict:'owner_id,project_id'});if(error)throw error;},
    loadAI:async projectId=>{const {data,error}=await client.from('ai_workspaces').select('state').eq('project_id',projectId).maybeSingle();if(error)throw error;return data?.state||null;}
  });
  const readLocal=()=>{try{const value=JSON.parse(localStorage.getItem(STORAGE));return value&&Array.isArray(value.projects)?value:null;}catch{return null;}};
  const setMessage=(text,error=false)=>{message.textContent=text;message.classList.toggle('error',error);};
  // Always return confirmation links to the published app, including local signups.
  const emailRedirectTo='https://domi-schema-studio.vercel.app/';
  let authBusy=false;
  const authMessage=error=>({
    invalid_credentials:'El correo o la contraseña no son correctos.',
    email_not_confirmed:'Confirma tu correo antes de entrar. Puedes reenviar la confirmación aquí.',
    user_already_exists:'Ya tienes una cuenta. Usa Iniciar sesión.',
    email_address_not_authorized:'El envío de correos aún está restringido. El administrador debe configurar el correo de la aplicación.',
    over_email_send_rate_limit:'Se alcanzó el límite de correos. Espera unos minutos antes de reenviar.',
    over_request_rate_limit:'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    weak_password:'Elige una contraseña más segura, de al menos 6 caracteres.',
    otp_expired:'El enlace venció o ya fue utilizado. Inicia sesión o solicita una nueva confirmación.'
  }[error?.code]||'No se pudo completar el acceso. '+(error?.message||'Comprueba tu conexión y vuelve a intentarlo.'));
  async function authAction(label,work){
    if(authBusy)return;authBusy=true;setMessage(label);
    const controls=['cloud-signin','cloud-signup','cloud-resend'].map(id=>document.getElementById(id));
    controls.forEach(b=>b.disabled=true);
    try{await work();}catch(error){setMessage(authMessage(error),true);}finally{authBusy=false;controls.forEach(b=>b.disabled=false);}
  }
  function credentials(requirePassword=true){
    const email=document.getElementById('cloud-email'),password=document.getElementById('cloud-password');
    if(!email.reportValidity()||(requirePassword&&!password.reportValidity()))return null;
    return {email:email.value.trim(),password:password.value};
  }
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
  document.getElementById('cloud-form').onsubmit=event=>{event.preventDefault();const input=credentials();if(!input)return;return authAction('Iniciando sesión…',async()=>{const {data,error}=await client.auth.signInWithPassword(input);if(error)throw error;session=data.session;document.getElementById('cloud-password').value='';renderSession();await mergeFromCloud();});};
  document.getElementById('cloud-signup').onclick=()=>{const input=credentials();if(!input)return;return authAction('Creando cuenta…',async()=>{const {data,error}=await client.auth.signUp({...input,options:{emailRedirectTo}});if(error)throw error;if(data.session){session=data.session;document.getElementById('cloud-password').value='';renderSession();await mergeFromCloud();}else setMessage('Revisa tu correo y abre el nuevo enlace de confirmación. Volverás a Domi Schema Studio. Si ya confirmaste la cuenta, inicia sesión.');});};
  document.getElementById('cloud-resend').onclick=()=>{const input=credentials(false);if(!input)return;return authAction('Enviando confirmación…',async()=>{const {error}=await client.auth.resend({type:'signup',email:input.email,options:{emailRedirectTo}});if(error)throw error;setMessage('Si tu cuenta está pendiente de confirmar, recibirás un nuevo enlace. Revisa también la carpeta de spam.');});};
  document.getElementById('cloud-signout').onclick=async()=>{const {error}=await client.auth.signOut();if(error)return setMessage(error.message,true);session=null;renderSession();setMessage('Sesión cerrada. Los proyectos locales permanecen en este navegador.');};
  document.getElementById('cloud-sync').onclick=mergeFromCloud;
  window.addEventListener('domi:projects-changed',()=>{if(!ready||!session?.user)return;clearTimeout(timer);timer=setTimeout(()=>pushLocal(true),700);});
  window.addEventListener('domi:cloud-state',()=>{const state=document.getElementById('save-state');if(state&&session?.user)state.textContent='Guardado en Supabase';});
  client.auth.onAuthStateChange((_event,next)=>{session=next;renderSession();});
  const callback=new URLSearchParams(location.hash.slice(1));
  if(callback.has('error')){setMessage(authMessage({code:callback.get('error_code')}),true);history.replaceState(null,'',location.pathname+location.search);dialog.showModal();}
  client.auth.getSession().then(async({data,error})=>{if(error)throw error;session=data.session;ready=true;renderSession();if(session)await mergeFromCloud();}).catch(error=>{ready=true;setMessage(authMessage(error),true);dialog.showModal();});
})();
