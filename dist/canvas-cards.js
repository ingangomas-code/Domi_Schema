(function(root){
  'use strict';
  const instances=new WeakMap();
  function element(tag,className,text){const el=document.createElement(tag);el.className=className||'';if(text!==undefined)el.textContent=text;return el;}
  function render(host,cards,actions){
    (instances.get(host)||[]).forEach(chart=>chart.dispose());const charts=[];instances.set(host,charts);host.replaceChildren();
    for(const card of cards){
      const article=element('article','canvas-card');article.dataset.card=card.id;article.style.cssText=`left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px`;
      const header=element('header','canvas-card-head'),titles=element('div');titles.append(element('small','',card.kind==='summary'?'RESUMEN Y CONTEXTO':'DASHBOARD'),element('h3','',card.title));header.append(titles);
      if(actions){const edit=element('button','canvas-card-edit','Editar');edit.type='button';edit.onclick=()=>actions.edit(card.id);header.append(edit);}
      article.append(header);const body=element('div','canvas-card-body');
      body.append(element('p','canvas-card-description',card.body));
      if(card.metrics.length){const metrics=element('div','canvas-card-metrics');for(const m of card.metrics){const item=element('div');item.append(element('b','',m.value),element('small','',m.label));metrics.append(item);}body.append(metrics);}
      if(card.charts.length){
        const select=element('select','canvas-card-select');select.setAttribute('aria-label','Gráfico del dashboard');
        card.charts.forEach((c,i)=>{const option=element('option','',c.title);option.value=i;select.append(option);});select.value=card.activeChart||0;body.append(select);
        const unit=element('p','canvas-card-unit'),chartEl=element('div','canvas-card-chart'),note=element('p','canvas-card-note'),table=element('table','canvas-card-table');body.append(unit,chartEl,note,table);
        let chart=null;
        const draw=()=>{
          const data=card.charts[Number(select.value)];unit.textContent=data.unit;note.textContent=data.note;table.replaceChildren();
          for(const point of data.points){const row=element('tr');row.append(element('td','',point.label),element('td','',Number(point.value).toLocaleString('es',{maximumFractionDigits:3})));table.append(row);}
          if(root.echarts){chart??=root.echarts.init(chartEl,null,{renderer:'svg'});if(!charts.includes(chart))charts.push(chart);chart.setOption({animation:false,grid:{left:15,right:30,top:12,bottom:25,containLabel:true},tooltip:{trigger:'axis',renderMode:'richText',confine:true},xAxis:{type:'value'},yAxis:{type:'category',data:data.points.slice(0,12).map(p=>p.label),axisLabel:{width:125,overflow:'truncate'}},series:[{type:'bar',data:data.points.slice(0,12).map(p=>p.value),itemStyle:{color:'#39846b',borderRadius:[0,4,4,0]},barMaxWidth:23}]},true);chart.resize();}
        };
        select.onchange=()=>{if(actions?.selectChart)actions.selectChart(card.id,Number(select.value));else draw();};
        // Appends before measuring chart width; the table remains usable without ECharts.
        article.append(body);host.append(article);draw();
      }
      for(const ref of card.references){const quote=element('blockquote');quote.append(element('p','',ref.quote),element('cite','',`${ref.name} · ${ref.locator}`));body.append(quote);}
      if(!article.parentNode){article.append(body);host.append(article);}
      if(actions){
        // Own gestures only; stop editor pan/node creation while interacting with a card.
        article.addEventListener('pointerdown',event=>{
          event.stopPropagation();actions.activate?.();if(event.button!==0||!event.target.closest('.canvas-card-head')||event.target.closest('button'))return;
          event.preventDefault();const zoom=actions.zoom(),x=event.clientX,y=event.clientY;let dx=0,dy=0;
          header.setPointerCapture(event.pointerId);
          const move=e=>{if(e.pointerId!==event.pointerId)return;dx=(e.clientX-x)/zoom;dy=(e.clientY-y)/zoom;article.style.left=(card.x+dx)+'px';article.style.top=(card.y+dy)+'px';};
          const end=e=>{if(e.pointerId!==event.pointerId)return;header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',end);header.removeEventListener('pointercancel',cancel);header.removeEventListener('lostpointercapture',cancel);if(header.hasPointerCapture(event.pointerId))header.releasePointerCapture(event.pointerId);if(dx||dy)actions.move(card.id,card.x+dx,card.y+dy);};
          const cancel=e=>{dx=0;dy=0;article.style.left=card.x+'px';article.style.top=card.y+'px';end(e);};
          header.addEventListener('pointermove',move);header.addEventListener('pointerup',end);header.addEventListener('pointercancel',cancel);header.addEventListener('lostpointercapture',cancel);
        });
      }else article.addEventListener('pointerdown',e=>e.stopPropagation());
      article.addEventListener('dblclick',e=>e.stopPropagation());article.addEventListener('wheel',e=>e.stopPropagation());
    }
  }
  root.DomiCards={render};
})(globalThis);
