/* Repository rename review. Source planning and all writes belong to the native host. */
(function(g){'use strict';
function location(app){
 if(app.snapshotMode||app.host||!app.server||!app._repoLive||!app.repoPath)return null;
 var source=(app.repoModels||[]).find(function(row){return 'repo:'+row.path===app.modelKey;});
 return source&&source.dir?{root:app.repoPath,modelPath:source.dir}:null;
}
async function request(app,payload){
 var response=await fetch('api/rename',{method:'POST',headers:{'Content-Type':'application/json','X-SMV-Rename-Session':app.server.renameSession||''},body:JSON.stringify(payload),cache:'no-store'});
 var result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Rename request failed.');return result;
}
function show(app){
 if(app.host&&app.host.renameReferences&&!app.snapshotMode){app.host.renameReferences().catch(function(e){app.setState({repoError:e.message});});return;}
 var where=location(app);if(!where)return;
 var el=U.el,opener=document.activeElement,generation=0,token=null,closed=false,reviewed=new Set();
 var overlay=el('div',{style:'position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:100;display:flex;align-items:center;justify-content:center;'});
 var dialog=el('section',{role:'dialog','aria-modal':'true','aria-label':'Rename model object',style:'background:var(--bg,#fff);color:var(--text,#1e293b);padding:22px;border-radius:12px;width:860px;max-width:95vw;max-height:90vh;overflow:auto;'});overlay.appendChild(dialog);
 var status=el('p',{role:'status'}),body=el('div'),busy=false;
 function close(){closed=true;generation++;if(token)request(app,{action:'cancel',token:token}).catch(function(){});overlay.remove();if(opener&&opener.focus)opener.focus();}
 function button(label,fn){return el('button',{cls:'ex-button',text:label,onClick:fn});}
 dialog.appendChild(el('h2',{text:'Rename model object'}));dialog.appendChild(el('p',{text:'Update supported model and repository report references together. Reports and consumers outside this repository may need separate updates.'}));dialog.appendChild(button('Close',function(){if(!busy)close();}));dialog.appendChild(status);dialog.appendChild(body);
 dialog.addEventListener('keydown',function(e){if(e.key==='Escape'&&!busy){e.preventDefault();close();}if(e.key==='Tab'){var nodes=dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary');if(!nodes.length)return;var first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 async function run(fn){if(busy)return;busy=true;status.textContent='Working…';var n=++generation;try{await fn(n);}catch(e){if(!closed&&n===generation)status.textContent=e.message;}finally{busy=false;}}
 function renderObjects(result){
  U.clear(body);if(result.recovery){status.textContent='An interrupted rename needs recovery before another save.';body.appendChild(button('Restore interrupted rename',function(){run(async function(){await request(app,{action:'recover',root:where.root});status.textContent='Original source restored. Reopen Rename to continue.';});}));return;}
  var select=el('select',{'aria-label':'Model object',style:'width:100%;padding:8px;'});(result.objects||[]).forEach(function(o,i){select.appendChild(el('option',{value:String(i),text:o.kind+' · '+(o.kind==='table'?o.name:o.table+'['+o.name+']')}));});
  var name=el('input',{type:'text','aria-label':'New name',placeholder:'New name',style:'width:98%;padding:8px;margin:12px 0;'});body.appendChild(select);body.appendChild(name);
  body.appendChild(button('Preview model and report changes',function(){run(async function(n){var object=result.objects[Number(select.value)];if(!object)throw new Error('No supported model objects were found.');var preview=await request(app,Object.assign({action:'preview',rename:Object.assign({},object,{newName:name.value})},where));if(closed||n!==generation)return;renderPreview(preview);});}));status.textContent='Choose one object and a new name. No source changes until you review and apply.';select.focus();
 }
 function renderPreview(preview){
  U.clear(body);token=preview.token;reviewed.clear();status.textContent=preview.notice;
  if(preview.blockers.length){body.appendChild(el('h3',{text:'Rename cannot be saved'}));preview.blockers.forEach(function(message){body.appendChild(el('p',{text:message}));});body.appendChild(button('Back',function(){run(async function(){renderObjects(await request(app,Object.assign({action:'objects'},where)));});}));return;}
  var apply=button('Apply reviewed rename',function(){run(async function(n){if(app.modelKey!=='repo:'+(app.repoModels||[]).find(function(s){return s.dir===where.modelPath;}).path)throw new Error('The selected model changed. Reopen Rename.');var saved=g.ModelRenameState.capture(app,preview.rename);await request(app,{action:'apply',token:token});token=null;g.ModelRenameState.remember(app,preview.rename);if(closed||n!==generation)return;await app.scanRepo();await app.refreshCurrentRepoModel();g.ModelRenameState.restore(app,saved);close();app.setState({repoError:''});});});apply.disabled=true;
  (preview.changes||[]).forEach(function(change,i){
   var details=el('details'),summary=el('summary',{text:change.path});details.appendChild(summary);
   var columns=el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:12px;'});['original','text'].forEach(function(key){var box=el('div');box.appendChild(el('strong',{text:key==='original'?'Before':'After'}));box.appendChild(el('pre',{text:change[key],style:'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:380px;overflow:auto;'}));columns.appendChild(box);});details.appendChild(columns);
   details.addEventListener('toggle',function(){if(details.open)reviewed.add(i);apply.disabled=reviewed.size!==preview.changes.length;});body.appendChild(details);
  });body.appendChild(el('p',{text:'Open each file comparison, then apply the reviewed rename. A source or report change invalidates this preview.'}));body.appendChild(apply);
 }
 document.body.appendChild(overlay);run(async function(){renderObjects(await request(app,Object.assign({action:'objects'},where)));});
}
g.ModelRenameUI={available:function(app){return !app.snapshotMode&&!!(location(app)||app.host&&app.host.renameReferences&&app.state.loaded);},show:show};
})(typeof window==='undefined'?globalThis:window);
