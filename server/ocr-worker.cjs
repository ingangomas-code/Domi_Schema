// OCR lives in a disposable thread: corrupt inputs or missing language files
// must not crash the API process or leave the request running indefinitely.
const {parentPort,workerData}=require('node:worker_threads');
const {createWorker}=require('tesseract.js');
(async()=>{
  let worker;
  try{
    worker=await createWorker('spa+eng',1,{cachePath:require('node:os').tmpdir(),errorHandler:error=>parentPort.postMessage({error:String(error)})});
    const {data}=await worker.recognize(Buffer.from(workerData));parentPort.postMessage({text:data.text,confidence:data.confidence});
  }catch(e){parentPort.postMessage({error:e.message||String(e)});}
  finally{await worker?.terminate();}
})();
