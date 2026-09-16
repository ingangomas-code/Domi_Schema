'use strict';
let runtime;
function pdfRuntime(){
  if(runtime)return runtime;
  try{
    // Install the supported Node canvas globals before PDF.js is evaluated.
    // Explicit imports also make Vercel trace the native canvas dependency.
    const {CanvasFactory,getData}=require('pdf-parse/worker');
    const {PDFParse}=require('pdf-parse');
    PDFParse.setWorker(getData());
    runtime={CanvasFactory,PDFParse};return runtime;
  }catch(error){
    console.error('PDF runtime initialization failed:',error.code||error.name,error.message);
    throw Object.assign(new Error('El lector de PDF del servidor no está disponible. Conservamos la carga para reintentar.'),{status:503});
  }
}
module.exports=async function extractPdf(buffer){
  const {CanvasFactory,PDFParse}=pdfRuntime();
  const parser=new PDFParse({data:new Uint8Array(buffer),CanvasFactory,isEvalSupported:false});
  try{
    const info=await parser.getInfo();if(info.total>60)throw new Error('Máximo 60 páginas por PDF.');
    const result=await parser.getText();
    const sections=result.pages.map(p=>({locator:'página '+p.num,text:p.text}));
    if(!sections.some(p=>p.text.trim().length>15))throw new Error('PDF escaneado sin texto: exporta sus páginas como imágenes para OCR.');
    return sections;
  }finally{await parser.destroy();}
};
