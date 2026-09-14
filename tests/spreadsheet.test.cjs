const {test}=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {extractFile,extractUpload}=require('../server/extract.cjs');
const {zipSync}=require('fflate');
function workbook(type='xlsx',mutate=()=>{}){
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Código','Monto','Monto'],['A',12,1],['B',20,2],['C',null,3]]),'Ventas');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Cliente'],['José']]),'Clientes');
  mutate(book);return XLSX.write(book,{type:'buffer',bookType:type});
}
for(const type of ['xlsx','xls'])test(type+' retains every sheet, source rows, nulls and independent duplicate headers',async()=>{
  const source=await extractFile('datos.'+type,workbook(type));
  assert.equal(source.profile.sheetCount,2);
  assert.match(source.sections[0].locator,/hoja Ventas · filas 1–4/);
  assert.match(source.sections[0].text,/Fila 3: \["B",20,2\]/);
  assert.match(source.sections[1].text,/José/);
  const p=source.profile.sheets[0];assert.equal(p.rows,3);assert.equal(p.columns[1].mean,16);assert.equal(p.columns[1].nulls,1);assert.equal(p.columns[2].mean,2);
});
test('formulas are retained with cached values and never executed',async()=>{
  const source=await extractFile('formulas.xlsx',workbook('xlsx',b=>{b.Sheets.Ventas.B2={t:'n',f:'SUM(1,2)',v:3};b.Sheets.Ventas.B3={t:'n',f:'SUM(4,5)'};}));
  assert.match(source.sections[0].text,/SUM\(1,2\).*valor guardado: 3/);
  assert.match(source.sections[0].text,/sin valor calculado/);
  assert.equal(source.profile.sheets[0].formulas,2);
  assert.equal(source.profile.sheets[0].formulasWithoutCachedValue,1);
});
test('Excel inside ZIP uses the same extractor',async()=>{
  const result=await extractUpload('fuentes.zip',Buffer.from(zipSync({'reportes/ventas.xls':workbook('xls')})));
  assert.equal(result.sources[0].profile.sheetCount,2);assert.equal(result.skipped.length,0);
});
test('malformed workbooks and excessive sparse ranges are rejected',async()=>{
  await assert.rejects(extractFile('fake.xls',Buffer.from('not excel')),/válido/);
  const bytes=workbook('xlsx',b=>{b.Sheets.Ventas['!ref']='A1:A10002';b.Sheets.Ventas.A10002={t:'s',v:'outside'};});
  await assert.rejects(extractFile('huge.xlsx',bytes),/10.000 filas/);
});
