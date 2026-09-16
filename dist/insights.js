(function(root){
  'use strict';
  const text=(value,max=300)=>String(value??'').slice(0,max);
  const number=value=>Number.isFinite(value)?value.toLocaleString('es',{maximumFractionDigits:3}):'—';
  // All values come from extraction/profiling. No numeric inference from prose.
  function build(state={}){
    const sources=state.sources||[],analysis=state.analysis||{},draft=state.draft;
    const references=sources.slice(0,12).flatMap(source=>{
      const section=(source.sections||[]).find(s=>s.text?.trim());
      return section?[{name:text(source.name),locator:text(section.locator),quote:text(section.text.trim(),700)}]:[];
    });
    const charts=[];
    if(sources.length)charts.push({title:'Volumen de contenido por fuente',unit:'caracteres extraídos',note:'Mide volumen de texto, no relevancia ni calidad. Se muestran hasta 40 fuentes.',points:sources.slice(0,40).map(s=>({label:text(s.name),value:(s.sections||[]).reduce((n,p)=>n+(p.text||'').length,0)}))});
    if(analysis.clusters?.length)charts.push({title:'Temas agrupados automáticamente',unit:'fragmentos',note:'Etiquetas obtenidas de términos frecuentes. Las agrupaciones no equivalen a decisiones confirmadas.',points:analysis.clusters.slice(0,40).map(c=>({label:text((c.terms||[]).join(' · ')),value:c.count}))});
    let numericCount=0;
    for(const source of sources){
      const profiles=source.profile?.sheets|| (source.profile?.columns?[source.profile]:[]);
      for(const profile of profiles)for(const column of profile.columns||[]){
        if(column.type!=='number')continue;
        numericCount++;
        if(charts.length>=60)continue;
        const points=[['Mínimo',column.min],['Mediana',column.median],['Media',column.mean],['Máximo',column.max]].filter(([,v])=>Number.isFinite(v)).map(([label,value])=>({label,value}));
        if(points.length)charts.push({title:text(`${source.name} · ${profile.name||profile.sheet||'Tabla'} · ${column.name}`),unit:'unidades de la columna',note:text(`${number(column.nonNull)} valores · ${number(column.nulls)} nulos · ${number(column.std)} desviación estándar. Estadísticas del perfil extraído; no se mezclan columnas ni se infieren unidades.`),points});
      }
    }
    if(analysis.languages?.length)charts.push({title:'Lenguajes detectados',unit:'caracteres de código',note:'Detección por extensión de archivo.',points:analysis.languages.slice(0,40).map(l=>({label:text(l.name),value:l.characters}))});
    if(draft?.recommendedLanguages?.length)charts.push({title:'Lenguajes recomendados · propuesta del modelo',unit:'orden de prioridad inverso',note:'Propuestas, no datos observados ni porcentajes de confianza. Consulta sus motivos y evidencia en el informe de lenguajes.',points:draft.recommendedLanguages.slice(0,40).map((l,i,a)=>({label:text(l.name),value:a.length-i}))});
    const base={x:0,y:0,w:440,h:600,metrics:[],charts:[],references:[]};
    const cards=[];
    if(references.length||draft){
      const body=references.length?`Selección de extractos literales de ${references.length} de ${sources.length} fuentes. No es una síntesis exhaustiva ni confirma acuerdos. Revisa los documentos completos antes de confirmar conclusiones.`:`Propuesta del modelo sin fuentes documentales. ${text(draft?.limitations,2000)}`;
      cards.push({...base,kind:'summary',title:'Resumen y contexto',body:body+(state.prompt?'\n\nObjetivo solicitado: '+text(state.prompt,3000):'')+(!references.length&&draft?'\n\nConceptos propuestos: '+draft.nodes.map(n=>n.name).join(' · ').slice(0,3000):''),references});
    }
    if(charts.length)cards.push({...base,kind:'dashboard',title:'Dashboard de información',body:'Explora textos, temas, tablas y tecnologías. Cada gráfico indica qué mide. Esta tarjeta conserva una copia del análisis. Los análisis posteriores no la actualizan automáticamente.',metrics:[{label:'Fuentes',value:String(sources.length)},{label:'Fragmentos',value:String(analysis.chunks??'Sin analizar')},{label:'Columnas numéricas',value:String(numericCount)}],charts:charts.slice(0,64)});
    return cards;
  }
  root.DomiInsights={build,number};
  if(typeof module!=='undefined')module.exports=root.DomiInsights;
})(globalThis);
