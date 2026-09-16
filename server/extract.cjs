'use strict';
const {createHash}=require('node:crypto');
const path=require('node:path');
const {unzipSync}=require('fflate');
const AI=require('../dist/ai-core.js');
const MAX_FILE=2500000,MAX_TEXT=300000,MAX_ARCHIVE=16000000;
const TEXT=/(?:\.(txt|md|markdown|csv|tsv|json|js|jsx|ts|tsx|mjs|cjs|py|sql|html|css|java|go|rs|php|rb|yaml|yml|xml|mermaid|mmd)|(?:^|\/)(README|LICENSE|Dockerfile|Makefile))$/i;
function imageDimensions(b){
  if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
    const tag=b.toString('ascii',12,16);
    if(tag==='VP8X')return {width:b.readUIntLE(24,3)+1,height:b.readUIntLE(27,3)+1};
    if(tag==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return {width:b.readUInt16LE(26)&16383,height:b.readUInt16LE(28)&16383};
    if(tag==='VP8L'&&b[20]===0x2f){const bits=b.readUInt32LE(21);return {width:(bits&16383)+1,height:((bits>>>14)&16383)+1};}
  }
  if(b[0]===255&&b[1]===216){let i=2;while(i+4<b.length){if(b[i]!==255)break;const type=b[i+1];if(type===255){i++;continue;}if(type===0xda||type===0xd9)break;const size=b.readUInt16BE(i+2);if(size<2||i+2+size>b.length)break;if([0xc0,0xc1,0xc2].includes(type)&&size>=7)return {height:b.readUInt16BE(i+5),width:b.readUInt16BE(i+7)};i+=2+size;}}
  throw new Error('Cabecera de imagen no admitida. Usa PNG, JPEG o WebP válido.');
}
function recognizeImage(buffer){
  const {Worker}=require('node:worker_threads');
  return new Promise((resolve,reject)=>{const worker=new Worker(require.resolve('./ocr-worker.cjs'),{workerData:{buffer,workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js')}});let settled=false;const done=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(Object.assign(new Error(error),{status:503})):resolve(data);};const timer=setTimeout(()=>done('OCR excedió 40 segundos. Reduce la imagen o vuelve a intentar.'),40000);worker.on('message',data=>{if(data.error)console.error('OCR processing failed:',data.error);done(data.error?'No se pudo completar OCR. La carga queda pendiente; vuelve a intentarlo.':null,data);});worker.on('error',error=>{console.error('OCR worker failed:',error.code||error.name,error.message);done('El lector de imágenes del servidor no está disponible. La carga queda pendiente.');});worker.on('exit',()=>{if(!settled)done('El proceso OCR se cerró antes de terminar.');});});
}
function safePath(name){return !name.includes('\\')&&!name.startsWith('/')&&!/^[a-z]:/i.test(name)&&!name.split('/').includes('..')&&!name.includes('\0');}
function ignored(name){return /(^|\/)(node_modules|\.git|vendor|\.next|dist|build|__MACOSX)(\/|$)|(^|\/)(\.env(?:\..*)?|.*\.(pem|key|p12)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(name);}
function archive(buffer,filter=()=>true){
  let total=0,count=0;return unzipSync(buffer,{filter:file=>{if(!safePath(file.name))throw new Error('ZIP con una ruta no permitida.');total+=file.originalSize;count++;if(total>MAX_ARCHIVE||count>2000||file.originalSize>MAX_FILE*4)throw new Error('ZIP demasiado grande al descomprimir (16 MB / 2.000 entradas).');return filter(file);}});
}
async function extractFile(name,buffer){
  if(!safePath(name)||name.length>250)throw new Error('Nombre de archivo inválido.');
  if(buffer.length>MAX_FILE)throw new Error('Máximo 2,5 MB por archivo.');
  const id=createHash('sha256').update(name).update(buffer).digest('hex'),ext=path.extname(name).toLowerCase();
  const source={id,name,bytes:buffer.length,type:ext.slice(1),sections:[],warnings:[],profile:null};
  if(ext==='.xls'||ext==='.xlsx'){
    if(buffer[0]===0x50&&buffer[1]===0x4b)archive(buffer,()=>false);
    const parsed=require('./spreadsheet.cjs').extractSpreadsheet(buffer);
    source.sections=parsed.sections;source.profile=parsed.profile;source.warnings=parsed.warnings;
  }else if(ext==='.pdf'){
    source.sections=await require('./pdf.cjs')(buffer);
    source.warnings.push('Se extrae texto; las flechas y posiciones visuales del PDF requieren revisión.');
  }else if(ext==='.docx'){
    archive(buffer,()=>false);const mammoth=require('mammoth');const result=await mammoth.extractRawText({buffer});source.sections=[{locator:'documento',text:result.value}];source.warnings.push(...result.messages.map(m=>String(m.message)), 'La extracción de Word conserva texto, pero no valida relaciones visuales.');
  }else if(/\.(png|jpg|jpeg|webp)$/i.test(name)){
    const dimensions=imageDimensions(buffer);if(!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>12000000)throw new Error('Máximo 12 megapíxeles por imagen.');
    const result=await recognizeImage(buffer);source.sections=[{locator:'OCR de imagen',text:result.text}];source.ocrConfidence=result.confidence;source.warnings.push('OCR: revisa la transcripción. La dirección de flechas y conexiones no se deduce del texto.');
  }else if(TEXT.test(name)){
    const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(text.includes('\0'))throw new Error('Archivo binario no admitido como texto.');source.sections=[{locator:'archivo',text}];
    if(ext==='.csv'||ext==='.tsv'){
      const result=require('papaparse').parse(text,{header:true,skipEmptyLines:'greedy',delimiter:ext==='.tsv'?'\t':'',dynamicTyping:false});
      if(result.errors.length)source.warnings.push('CSV con incidencias: '+result.errors.map(e=>e.message).slice(0,5).join('; '));source.profile=AI.tableProfile(result.data);
    }
    if(/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(name)){
      try{const parser=await import('@babel/parser');const ast=parser.parse(text,{sourceType:'unambiguous',plugins:[...(ext.includes('ts')?['typescript']:[]),'jsx']});const symbols=[];const seen=new Set();function visit(n){if(!n||typeof n!=='object'||seen.has(n))return;seen.add(n);if(['ClassDeclaration','FunctionDeclaration','ImportDeclaration','TSInterfaceDeclaration','TSTypeAliasDeclaration'].includes(n.type))symbols.push({kind:n.type,name:n.id?.name||n.source?.value||'(anónimo)',line:n.loc?.start.line});for(const [k,v] of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}visit(ast);source.symbols=symbols;}catch{source.warnings.push('No se pudo analizar el AST; se conserva el código como texto.');}
    }else if(/\.(py|java|go|rs|php|rb|sql)$/.test(name))source.warnings.push('Análisis textual de código; AST disponible actualmente para JavaScript/TypeScript.');
  }else throw new Error('Formato no admitido. Usa XLS, XLSX, CSV, TXT, MD, código, PDF, DOCX o PNG/JPG/WebP; exporta .doc a .docx. Para videos, carga su transcripción.');
  const length=source.sections.reduce((n,s)=>n+s.text.length,0);if(length>MAX_TEXT)throw new Error('El texto extraído supera 300.000 caracteres. Divide el documento.');if(!length)throw new Error('No se encontró texto utilizable.');return source;
}
async function extractUpload(name,buffer){
  if(buffer.length>MAX_FILE)throw new Error('Máximo 2,5 MB por carga.');
  if(!/\.zip$/i.test(name))return {sources:[await extractFile(name,buffer)],skipped:[]};
  const skipped=[];let accepted=0;
  const entries=archive(buffer,f=>{if(f.name.endsWith('/'))return false;const allow=!ignored(f.name)&&(TEXT.test(f.name)||/\.xlsx?$/i.test(f.name))&&f.originalSize<=MAX_FILE;if(!allow)skipped.push({name:f.name,reason:'Formato, carpeta excluida o tamaño no admitido dentro del ZIP.'});else if(++accepted>80)throw new Error('Máximo 80 archivos de texto, código o Excel por ZIP.');return allow;});
  const sources=[];for(const [name,bytes] of Object.entries(entries)){try{sources.push(await extractFile(name,Buffer.from(bytes)));}catch(e){skipped.push({name,reason:e.message});}}
  if(sources.reduce((n,s)=>n+s.sections.reduce((m,p)=>m+p.text.length,0),0)>MAX_TEXT)throw new Error('El ZIP supera 300.000 caracteres extraídos. Divide el repositorio.');
  if(!sources.length)throw new Error('El ZIP no contiene texto o código procesable.');return {sources,skipped};
}
async function limitedFetch(url,options={},max=MAX_FILE){
  const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('No se pudo leer GitHub ('+response.status+'). Comprueba que sea público.');
  const reader=response.body.getReader();let total=0,parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max)throw new Error('Repositorio demasiado grande. Sube un ZIP reducido (máximo 2,5 MB).');parts.push(value);}}finally{await reader.cancel();}return Buffer.concat(parts);
}
function githubRepo(value){let url;try{url=new URL(value);}catch{throw new Error('URL de GitHub inválida.');}const parts=url.pathname.replace(/\.git$/,'').split('/').filter(Boolean);if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||parts.length!==2||parts.some(x=>!/^[-\w.]+$/.test(x)))throw new Error('Usa https://github.com/propietario/repositorio (público).');return parts;}
async function extractGit(url){const [owner,repo]=githubRepo(url),headers={Accept:'application/vnd.github+json','User-Agent':'Domi-Schema-Studio'};const metadata=JSON.parse(await limitedFetch(`https://api.github.com/repos/${owner}/${repo}`,{headers}));const commit=JSON.parse(await limitedFetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`,{headers}));if(!/^[a-f0-9]{40}$/.test(commit.sha))throw new Error('GitHub no devolvió una revisión válida.');const result=await extractUpload(repo+'.zip',await limitedFetch(`https://codeload.github.com/${owner}/${repo}/zip/${commit.sha}`));result.sources.forEach(s=>s.origin={url:`https://github.com/${owner}/${repo}`,commit:commit.sha});return result;}
module.exports={extractFile,extractUpload,extractGit,safePath,githubRepo,archive,imageDimensions,MAX_FILE,MAX_TEXT};
