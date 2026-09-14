'use strict';
const XLSX=require('xlsx');
const {tableProfile}=require('../dist/ai-core.js');
const MAX_CELLS=100000,MAX_ROWS=10000,MAX_COLUMNS=200,MAX_SHEETS=20,MAX_TEXT=300000;

function extractSpreadsheet(buffer){
  const zip=buffer[0]===0x50&&buffer[1]===0x4b;
  const ole=buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  const biff=[0x09,0x0209,0x0409,0x0809].includes(buffer.length>=2?buffer.readUInt16LE(0):0);
  if(!zip&&!ole&&!biff)throw new Error('El archivo no es un libro Excel válido. Exporta como XLS o XLSX.');
  let book;
  try{book=XLSX.read(buffer,{type:'buffer',cellFormula:true,cellDates:true,cellHTML:false,bookVBA:false,sheetRows:MAX_ROWS+1});}
  catch{throw new Error('No se pudo leer Excel. Comprueba que no esté dañado ni protegido con contraseña.');}
  if(!book.SheetNames.length||book.SheetNames.length>MAX_SHEETS)throw new Error('Excel debe contener entre 1 y 20 hojas. Divide el libro.');
  const sections=[],sheets=[],warnings=[];let cells=0,characters=0;
  for(const name of book.SheetNames){
    const sheet=book.Sheets[name];
    if(!sheet?.['!ref']){warnings.push('Hoja vacía: '+name);continue;}
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
    const rows=range.e.r-range.s.r+1,cols=range.e.c-range.s.c+1;
    cells+=rows*cols;
    if(rows>MAX_ROWS||cols>MAX_COLUMNS||cells>MAX_CELLS)throw new Error('Excel supera 10.000 filas, 200 columnas por hoja o 100.000 celdas por libro. Divide el archivo.');
    const matrix=[],lines=[];let formulas=0,missingValues=0;
    for(let r=range.s.r;r<=range.e.r;r++){
      const values=[],literal=[];
      for(let c=range.s.c;c<=range.e.c;c++){
        const cell=sheet[XLSX.utils.encode_cell({r,c})];
        let value=cell?.v??null;
        if(value instanceof Date)value=value.toISOString();
        if(cell?.t==='e')value=null;
        if(cell?.f){formulas++;if(cell.v==null)missingValues++;}
        values.push(value);
        literal.push(cell?.f?'='+cell.f+(cell.v==null?' [sin valor calculado]':' [valor guardado: '+String(value)+']'):value??'');
      }
      // Preserve blank rows and column positions so cell references remain verifiable.
      const line='Fila '+(r+1)+': '+JSON.stringify(literal);
      characters+=line.length+1;
      if(characters>MAX_TEXT)throw new Error('Excel supera 300.000 caracteres extraídos. Divide el libro.');
      matrix.push(values);lines.push(line);
    }
    if(!matrix.some(row=>row.some(v=>v!==null&&v!==''))&&!formulas){warnings.push('Hoja sin datos: '+name);continue;}
    const headerIndex=matrix.findIndex(row=>row.some(v=>v!==null&&v!==''));
    const header=matrix[Math.max(headerIndex,0)]||[];
    const keys=header.map((value,c)=>XLSX.utils.encode_col(range.s.c+c)+' · '+String(value??'(sin encabezado)'));
    const records=matrix.slice(Math.max(headerIndex,0)+1).map(row=>Object.fromEntries(keys.map((key,c)=>[key,row[c]])));
    sheets.push({name,range:XLSX.utils.encode_range(range),headerRow:range.s.r+Math.max(headerIndex,0)+1,headerAssumption:'Se usa la primera fila no vacía como encabezado.',...tableProfile(records),formulas,formulasWithoutCachedValue:missingValues});
    // Bounded sections retain actual Excel row labels for evidence and retrieval.
    for(let i=0;i<lines.length;i+=100)sections.push({locator:'hoja '+name+' · filas '+(range.s.r+i+1)+'–'+Math.min(range.e.r+1,range.s.r+i+100),text:lines.slice(i,i+100).join('\n')});
    if(formulas)warnings.push(name+': fórmulas conservadas sin ejecutar. Los valores guardados pueden estar desactualizados; '+missingValues+' sin resultado guardado.');
    if(sheet['!merges']?.length)warnings.push(name+': celdas combinadas; el valor se conserva en su celda original.');
  }
  return {sections,profile:{kind:'workbook',sheetCount:book.SheetNames.length,sheets},warnings};
}
module.exports={extractSpreadsheet};
