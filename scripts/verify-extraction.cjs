// Optional live checks use synthetic/public fixtures only; no model API charges.
const assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const {extractFile,extractGit}=require('../server/extract.cjs');
(async()=>{
  const canvas=createCanvas(1000,180),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,180);ctx.fillStyle='black';ctx.font='42px Arial';ctx.fillText('Invoice belongs to Customer',30,100);
  const result=await extractFile('synthetic-ocr.png',canvas.toBuffer('image/png'));assert.match(result.sections[0].text,/Invoice/i);console.log('OCR: texto sintético reconocido; confianza',result.ocrConfidence);
  const git=await extractGit('https://github.com/octocat/Hello-World');assert.ok(git.sources.length);assert.match(git.sources[0].origin.commit,/^[a-f0-9]{40}$/);console.log('GitHub: revisión fijada y',git.sources.length,'fuentes extraídas.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
