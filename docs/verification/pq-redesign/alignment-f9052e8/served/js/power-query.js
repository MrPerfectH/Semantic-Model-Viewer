/* Static metadata inspection only. No M evaluator, connector calls or model writes. */
(function(g){
  'use strict';
  var keywords=new Set('let in each if then else try otherwise error as is meta type nullable optional true false null and or not section shared'.split(' '));
  var types=new Set('any anynonnull binary date datetime datetimezone duration logical none number record table text time list function'.split(' '));
  function tokens(code){
    var out=[], warnings=[], re=/\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|#"(?:[^"]|"")*"|"(?:[^"]|"")*"|(?:#[A-Za-z_]+|[A-Za-z_][\w]*)(?:\.[A-Za-z_][\w]*)*|\d+(?:\.\d+)?|=>|[^]/g,m;
    while((m=re.exec(code))){var s=m[0];if(/^\s|^\/\/|^\/\*/.test(s))continue;var kind=/^#"/.test(s)?'id':/^"/.test(s)?'string':/^[A-Za-z_#]/.test(s)?'id':'punct';
      var value=kind==='id'&&s.startsWith('#"')?s.slice(2,-1).replace(/""/g,'"').replace(/#\(([^)]+)\)/g,function(all,x){if(x==='#')return '#';if(/^[0-9a-f]{4,8}$/i.test(x)&&parseInt(x,16)<=0x10ffff)return String.fromCodePoint(parseInt(x,16));warnings.push('Unsupported identifier escape '+all);return all;}):s;
      out.push({value:value,raw:s,kind:kind,start:m.index,end:re.lastIndex});
    }
    if(/\/\*/.test(code)&&!out.length&& !/\*\//.test(code))warnings.push('Unclosed comment');
    return {tokens:out,warnings:warnings};
  }
  g.PowerQuery={tokens:tokens};
})(window);

(function(g){
  'use strict';
  var el=U.el,sv=U.sv;
  function open(app,table){
    close(app);var previous=document.activeElement,metadata=app.model&&app.model.powerQuery||{nodes:[],warnings:[]},model=app.model;
    var metadataIdentity=model&&model.powerQuery;
    var nodes=metadata.nodes||[], selected=null,root=null,query='',codeQuery='';
    var overlay=el('div',{cls:'pq-overlay','data-canvas-overlay':true}),dialog=el('section',{cls:'pq-dialog',role:'dialog','aria-modal':'true','aria-label':'Power Query metadata',tabindex:'-1'});
    function dismiss(){var current=app._powerQueryOverlay===overlay;if(current)close(app);else overlay.remove();if(current&&previous&&previous.isConnected)previous.focus();}
    overlay.appendChild(dialog);document.body.appendChild(overlay);app._powerQueryOverlay=overlay;app._powerQueryClose=dismiss;
    function valid(){if(app.model!==model||app.model.powerQuery!==metadataIdentity||app._powerQueryOverlay!==overlay){if(app._powerQueryOverlay===overlay)close(app);else overlay.remove();return false;}return true;}
    var head=el('header',{},[el('h2',{text:'Power Query metadata'}),el('button',{text:'Close',onClick:dismiss})]);dialog.appendChild(head);
    dialog.appendChild(el('p',{cls:'pq-note',text:'Read-only metadata. M is never executed. Raw M is excluded from shared snapshots. Dependencies are partial static findings.'}));
    var content=el('div',{cls:'pq-content'}),library=el('aside',{cls:'pq-library'}),main=el('main',{cls:'pq-main'});content.appendChild(library);content.appendChild(main);dialog.appendChild(content);
    var tableSelect=el('select',{'aria-label':'Power Query table',onChange:function(e){chooseTable(e.target.value);}});
    tableSelect.appendChild(el('option',{value:'',text:'Choose a table…'}));(app.model.tables||[]).forEach(function(t){tableSelect.appendChild(el('option',{value:t.name,text:t.name}));});library.appendChild(tableSelect);
    var partitions=el('select',{'aria-label':'Power Query partition',onChange:function(e){root=e.target.value;show(root);}});library.appendChild(partitions);
    library.appendChild(el('h3',{text:'Query / parameter / function library'}));
    var search=el('input',{type:'search',placeholder:'Find shared expressions…','aria-label':'Search Power Query library',onInput:function(e){query=e.target.value;renderLibrary();}});library.appendChild(search);var list=el('div');library.appendChild(list);
    function renderLibrary(){U.clear(list);var shared=nodes.filter(function(n){return n.kind==='expression'&&(n.name+' '+n.classification).toLowerCase().includes(query.toLowerCase());});
      shared.slice(0,200).forEach(function(n){list.appendChild(el('button',{cls:'pq-library-item',text:n.name+' · '+n.classification,title:n.basis,onClick:function(){show(n.id);}}));});
      if(!shared.length)list.appendChild(el('p',{text:'No shared expressions available for this input or filter.'}));if(shared.length>200)list.appendChild(el('p',{text:'Showing 200 results; refine the search.'}));
    }
    function chooseTable(name){if(!valid())return;tableSelect.value=name;U.clear(partitions);var parts=nodes.filter(function(n){return n.kind==='partition'&&n.table===name;});
      parts.forEach(function(n){partitions.appendChild(el('option',{value:n.id,text:n.name+' · '+n.type}));});partitions.disabled=!parts.length;root=parts.length?parts[0].id:null;show(root);
    }
    function show(id){if(!valid())return;selected=nodes.find(function(n){return n.id===id;});codeQuery='';render();}
    function highlight(pre,code){U.clear(pre);var lex=g.PowerQuery.tokens(code),at=0;function add(text,cls){var span=el('span',{cls:cls});if(!codeQuery)span.textContent=text;else{var offset=0,low=text.toLowerCase(),q=codeQuery.toLowerCase(),found;while((found=low.indexOf(q,offset))>=0){span.appendChild(document.createTextNode(text.slice(offset,found)));span.appendChild(el('mark',{text:text.slice(found,found+q.length)}));offset=found+q.length;}span.appendChild(document.createTextNode(text.slice(offset)));}pre.appendChild(span);}
      lex.tokens.forEach(function(t){add(code.slice(at,t.start),'pq-comment');add(code.slice(t.start,t.end),t.kind==='string'?'pq-string':/^(let|in|each|if|then|else|meta|as|type)$/.test(t.value)?'pq-keyword':'');at=t.end;});add(code.slice(at),'pq-comment');
    }
    function render(){U.clear(main);if(!selected){main.appendChild(el('p',{text:app.snapshotMode?'Power Query metadata is excluded from shared snapshots. Open the original TMDL or model.bim to inspect M.':'No partition metadata is available. Choose another table or a shared expression. Pre-generated viewer JSON may omit M.'}));return;}
      main.appendChild(el('h3',{text:(selected.table?selected.table+' / ':'')+selected.name}));main.appendChild(el('p',{cls:'pq-note',text:selected.kind+' · '+selected.classification+' · '+selected.basis}));
      if(selected.state!=='available')main.appendChild(el('p',{role:'status',text:selected.state==='non-m'?'This partition is '+selected.type+', not an M partition.':'M source metadata is missing.'}));
      else{
        var tools=el('div',{cls:'pq-code-tools'}),pre=el('pre',{cls:'pq-code',tabindex:'0','aria-label':'Read-only M code'}),status=el('span',{role:'status'});
        tools.appendChild(el('input',{type:'search',placeholder:'Find in code…','aria-label':'Search M code',onInput:function(e){codeQuery=e.target.value;highlight(pre,selected.code);}}));
        tools.appendChild(el('button',{text:'Copy M',onClick:async function(){var code=selected.code;try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(code);else throw new Error('clipboard unavailable');status.textContent='Copied';}catch(e){var area=el('textarea',{value:code,readonly:true,style:'position:fixed;left:-10000px;'});dialog.appendChild(area);area.value=code;area.select();var ok=document.execCommand&&document.execCommand('copy');area.remove();status.textContent=ok?'Copied':'Copy unavailable. Select the code and copy with your keyboard.';}}}));tools.appendChild(status);main.appendChild(tools);highlight(pre,selected.code);main.appendChild(pre);
      }
      // Optional integration owned by #36/#37; each hook renders into its own container.
      var context={app:app,metadata:metadata,selected:selected,table:tableSelect.value,partitionId:root,openCode:show};
      ['PowerQueryDependencies','PowerQueryLineage'].forEach(function(key){if(g[key]&&typeof g[key].render==='function'){var host=el('section');main.appendChild(host);g[key].render(host,context);}});
    }
    overlay.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();dismiss();}if(e.key==='Tab'){var focusable=Array.from(dialog.querySelectorAll('button,input,select,[tabindex="0"]')).filter(function(n){return !n.disabled;});var first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    renderLibrary();chooseTable(table||'');dialog.focus();
  }
  function close(app){if(app._powerQueryOverlay){app._powerQueryOverlay.remove();app._powerQueryOverlay=null;}app._powerQueryClose=null;}
  g.PowerQuery.open=open;g.PowerQuery.close=close;
})(window);
