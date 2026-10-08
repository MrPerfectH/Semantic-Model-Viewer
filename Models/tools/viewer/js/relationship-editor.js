/* Reviewed relationship form. Offline snapshots never expose source editing. */
(function(g){
  'use strict';
  function open(app) {
    const host=app.editHost ? app.editHost() : app.host;
    if(app.snapshotMode||!host||!host.prepareRelationshipEdit||!app.model)return;
    const el=U.el,modelId=app.modelKey,dialog=el('dialog',{cls:'mv-edit-dialog','aria-label':'Edit relationships'}),fields={},controls=[];
    const status=el('p',{role:'status','aria-live':'polite'}),preview=el('div'); let token=null,busy=false;
    const review=el('button',{text:'Review change',cls:'mv-button'}),save=el('button',{text:'Save to TMDL',cls:'mv-button'});save.disabled=true;
    function reset(){token=null;save.disabled=true;U.clear(preview);status.textContent='';}
    function select(key,label,options){const node=el('select',{'aria-label':label});options.forEach(x=>node.appendChild(el('option',{value:x[0],text:x[1]})));fields[key]=node;controls.push(node);node.addEventListener('change',reset);dialog.appendChild(el('label',{text:label}));dialog.appendChild(node);return node;}
    const identity=select('relationshipId','Relationship',[['','Create relationship']].concat(app.model.relationships.filter(r=>r.name).map(r=>[r.name,r.name+' · '+r.from+' → '+r.to])));
    const tables=app.model.tables.map(t=>[t.name,t.name]);
    ['from','to'].forEach(side=>{
      const table=select(side+'Table',side==='from'?'From table':'To table',tables),column=select(side+'Column',side==='from'?'From column':'To column',[]);
      function columns(value){U.clear(column);const t=app.model.tables.find(t=>t.name===table.value);(t?t.columns:[]).forEach(c=>column.appendChild(el('option',{value:c.name,text:c.name})));if(value)column.value=value;}
      table.addEventListener('change',()=>columns());columns();fields[side+'Columns']=columns;
    });
    select('fromCardinality','From cardinality',[['many','Many'],['one','One']]);select('toCardinality','To cardinality',[['one','One'],['many','Many']]);
    select('crossFilteringBehavior','Filter direction',[['oneDirection','One direction (To → From)'],['bothDirections','Both directions']]);
    select('isActive','Status',[['true','Active'],['false','Inactive']]);
    identity.addEventListener('change',()=>{const r=app.model.relationships.find(r=>r.name===identity.value);if(!r)return;fields.fromTable.value=r.from;fields.toTable.value=r.to;fields.fromColumns(r.fromCol);fields.toColumns(r.toCol);fields.fromCardinality.value=r.fromCard;fields.toCardinality.value=r.toCard;fields.crossFilteringBehavior.value=r.both?'bothDirections':'oneDirection';fields.isActive.value=r.inactive?'false':'true';});
    function lock(value){busy=value;controls.forEach(c=>c.disabled=value);review.disabled=value;save.disabled=value||!token;}
    review.addEventListener('click',async()=>{if(busy)return;reset();lock(true);try{const data={modelId,relationshipId:identity.value||null};['fromTable','fromColumn','toTable','toColumn','fromCardinality','toCardinality','crossFilteringBehavior'].forEach(k=>data[k]=fields[k].value);data.isActive=fields.isActive.value==='true';const result=await host.prepareRelationshipEdit(data);if(app.modelKey!==modelId)throw Error('The model changed.');token=result.token;preview.appendChild(el('p',{text:result.path}));preview.appendChild(el('h4',{text:'Before'}));preview.appendChild(el('pre',{text:result.before||'(new relationship file or object)'}));preview.appendChild(el('h4',{text:'After'}));preview.appendChild(el('pre',{text:result.after}));status.textContent=result.validation||'Metadata only. Engine and data validation have not run.';}catch(e){status.textContent=e.message;}finally{lock(false);}});
    save.addEventListener('click',async()=>{if(busy||!token)return;lock(true);try{const result=await host.saveRelationshipEdit(token);if(app.modelKey===modelId) { if(host.parseModelMessage) app.hostOpenModel(host.parseModelMessage(result.model)); else if(result.model) app.hostOpenModel(result.model); }dialog.close();}catch(e){token=null;status.textContent=e.message;}finally{lock(false);}});
    dialog.appendChild(el('p',{text:'Names stay fixed. Metadata checks do not validate engine ambiguity, column data types or key uniqueness.'}));dialog.appendChild(el('div',{cls:'mv-dax-actions'},[review,save,el('button',{text:'Cancel',cls:'mv-button',onClick:()=>{if(!busy)dialog.close();}})]));dialog.appendChild(status);dialog.appendChild(preview);dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
  }
  g.SMVRelationshipEditor={open};
})(window);
