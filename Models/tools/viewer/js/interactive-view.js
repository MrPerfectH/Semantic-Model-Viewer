/* Shared real-viewer controls, semantic annotations and session bridge. */
(function(g){
  'use strict';
  var active=null, api=null, authored=null, busy=false, dirty=false, selected=null, selectedAt=null, revision=1, pending=null, declinedRevision=0, currentStep=0, browseSnapshot=null;
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function node(tag,text,cls){var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(text,run){var b=node('button',text);b.type='button';b.onclick=run;return b;}
  function hostAction(label,description,pending,run,status){
    var b=button(label,async function(){
      b.disabled=true;status.textContent=pending;
      try{status.textContent=await run()||'Done.';}catch(e){status.textContent=e.message||'The action failed.';}
      finally{b.disabled=false;}
    });b.title=description;return b;
  }
  function refKey(r){return JSON.stringify([r.kind,r.table||'',r.name]);}
  function hooks(app){
    Object.keys(app.canvas.cards||{}).forEach(function(n){var c=app.canvas.cards[n];c.el.dataset.smvKind='table';c.el.dataset.smvName=n;Object.keys(c.colRows).forEach(function(k){var el=c.colRows[k];el.dataset.smvKind='column';el.dataset.smvTable=n;el.dataset.smvName=k;});});
  }
  function selection(app){
    if(app.state.viewMode==='measures'){
      var name=app.state.gPin||app.state.selMeasure;
      var table=app.model.tables.find(function(t){return t.measures.some(function(m){return m.name===name;});});
      return table?{kind:'measure',table:table.name,name:name}:null;
    }
    if(selected&&(selected.kind==='column'||selected.kind==='query'))return clone(selected);
    if(app.canvas.selRel)return {kind:'relationship',name:app.canvas.selRel.name};
    return app.state.selected?{kind:'table',name:app.state.selected}:null;
  }
  function closeLibrary(restore) {
    var app=g.app, wasOpen=document.body.classList.contains('smv-browse-open');
    document.body.classList.remove('smv-browse-open');
    var control=document.querySelector('[data-smv-browse]');
    if(control){control.textContent='Browse measures';control.setAttribute('aria-expanded','false');}
    if(wasOpen&&restore!==false&&browseSnapshot){
      var saved=browseSnapshot; saved.library=app.measures.captureSnapshot().library;
      browseSnapshot=null;app.measures.restoreSnapshot(saved);
    }else browseSnapshot=null;
    if(wasOpen&&restore!==false&&control)control.focus();
  }
  function browseMeasures(app) {
    if(document.body.classList.contains('smv-browse-open')){closeLibrary(true);return;}
    browseSnapshot=app.measures.captureSnapshot();dirty=true;
    app.measures.cancelSnapshotViewport();app.setState({selMeasure:null,gPin:null,gHover:null});
    document.body.classList.add('smv-browse-open');
    var control=document.querySelector('[data-smv-browse]');
    if(control){control.textContent='Close measures';control.setAttribute('aria-expanded','true');}
    var search=document.querySelector('.mv-search');if(search)search.focus();
  }
  function style(){
    if(document.getElementById('smv-interactive-css'))return;
    var s=node('style');s.id='smv-interactive-css';s.textContent=`
.smv-hl{position:fixed;border:2px solid #6854d9!important;box-shadow:0 0 0 2px #ffffffb3;border-radius:7px;pointer-events:none;z-index:90;box-sizing:border-box}.smv-proposal{border-color:#b37713!important}.smv-annotation-lines{position:fixed;inset:0;width:100%;height:100%;z-index:89;pointer-events:none}.smv-context-dim{opacity:1!important}body[data-smv-interactive] [data-smv-kind=table]{opacity:1!important}body[data-smv-interactive] .smv-attention-target{color:var(--smv-ink,#25334c)!important}
body[data-smv-interactive] #root{bottom:var(--smv-controls-height,0px)!important}.smv-explanation-controls{box-sizing:border-box;position:fixed;bottom:0;left:0;right:0;z-index:200;max-width:none;max-height:30vh;overflow:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--smv-line,#cbd2df);border-radius:0;background:var(--smv-surface,#fff);color:var(--smv-ink,#25334c);box-shadow:0 4px 18px #172b4d14;font:13px/1.5 system-ui}
.smv-explanation-controls button{font:inherit;padding:6px 10px;border:1px solid var(--smv-line,#ccd3e0);border-radius:7px;color:inherit;background:var(--smv-soft,#f5f6fb);cursor:pointer}.smv-explanation-controls button:focus-visible{outline:3px solid #8472ed;outline-offset:2px}.smv-view-provenance{max-width:640px}.smv-view-provenance[open]{flex-basis:100%}.smv-view-provenance summary{cursor:pointer}.smv-view-provenance pre{max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.smv-notes{max-width:480px;flex-basis:100%;white-space:pre-wrap}.smv-notes p{margin:4px 0}.smv-status{font-size:12px}.smv-pending{flex-basis:100%;padding:8px;border-left:3px solid #6854d9}.smv-hidden-targets{flex-basis:100%;color:var(--smv-muted,#59667b)}
body[data-smv-interactive] .mv-dax-body pre,body[data-smv-interactive] .mv-dax-code{white-space:pre-wrap!important;overflow-wrap:anywhere!important}
body[data-smv-interactive] .mv-library{display:none!important}body[data-smv-interactive].smv-browse-open .mv-library{display:flex!important;position:absolute;inset:0 auto 0 0;z-index:150;max-width:85vw;width:280px!important;min-width:0}
@media(max-width:700px){body[data-smv-interactive] .mv-analysis-body[data-mode=split]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) 8px minmax(0,1fr)}body[data-smv-interactive] .ex-library{max-width:190px}.smv-explanation-controls{font-size:12px}}
`;document.head.appendChild(s);
  }
  function annotations(app,view,refs,target){
    style();document.body.dataset.smvInteractive='1';if(active)active.stop();
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,.smv-annotation-lines,.smv-explanation-controls').forEach(function(n){n.remove();});
    var controls=node('aside',null,'smv-explanation-controls');controls.setAttribute('aria-label','Explanation controls');
    closeLibrary(false);
    if(view.mode==='measures'){var browse=button('Browse measures',function(){browseMeasures(app);});browse.dataset.smvBrowse='1';browse.setAttribute('aria-expanded','false');controls.appendChild(browse);}
    var actionStatus=node('span','', 'smv-action-status');actionStatus.setAttribute('role','status');actionStatus.setAttribute('aria-live','polite');
    if(g.SMV_EXPAND_WORKSPACE)controls.appendChild(hostAction('Expand workspace','Open this viewer in the host’s fullscreen workspace.','Opening workspace…',g.SMV_EXPAND_WORKSPACE,actionStatus));
    if(g.SMV_SAVE_OFFLINE)controls.appendChild(hostAction('Save offline view','Download an interactive HTML file with the model and current view.','Preparing offline view…',g.SMV_SAVE_OFFLINE,actionStatus));
    if(g.SMV_SEND_CONTEXT)controls.appendChild(hostAction('Use selection in conversation','Share the selected object as context for your next message. This does not send a question.','Sharing selection…',g.SMV_SEND_CONTEXT,actionStatus));
    controls.appendChild(button('Reset explanation',function(){if(api)api.reset();}));
    var hasAnnotations=!!(view.highlights.length||view.callouts.length||view.proposals.length);
    var hidden=view.annotationsVisible===false||!hasAnnotations,toggle=button('Hide annotations',function(){dirty=true;hidden=!hidden;notes.hidden=hidden;toggle.textContent=hidden?'Show annotations':'Hide annotations';paint(true);});toggle.textContent=hidden?'Show annotations':'Hide annotations';if(hasAnnotations)controls.appendChild(toggle);
    controls.appendChild(actionStatus);
    var status=node('span','', 'smv-status');status.setAttribute('aria-live','polite');controls.appendChild(status);
    var notes=node('div',null,'smv-notes');notes.hidden=hidden;
    view.callouts.forEach(function(c){notes.appendChild(node('p',c.text));});
    view.proposals.forEach(function(p){notes.appendChild(node('p','Proposed '+p.kind+': '+p.text));});
    var provenance=node('details',null,'smv-view-provenance');provenance.appendChild(node('summary','About this view'));
    provenance.appendChild(node('p','Model content: '+app.model.name+' · '+app.model.tables.length+' tables. Table names, columns, relationships and DAX come from model metadata.'));
    provenance.appendChild(node('p','Authored instructions: visible context, focus, highlights, explanation text and walkthrough captions. These choices express the author’s interpretation.'));
    provenance.appendChild(node('p','Viewer output: the app renders the diagram, positions highlights, and handles navigation. The CLI packages this interactive view and can capture it. No model query has been executed.'));
    var spec=node('details');spec.appendChild(node('summary','Inspect the view specification'));spec.appendChild(node('pre',JSON.stringify(view,null,2)));provenance.appendChild(spec);controls.appendChild(provenance);
    var hiddenList=node('div',null,'smv-hidden-targets');controls.appendChild(notes);controls.appendChild(hiddenList);
    var pendingBox=node('div',null,'smv-pending');pendingBox.hidden=true;controls.appendChild(pendingBox);
    if(g.SMV_STEPS&&g.SMV_STEPS.length){
      var steps=g.SMV_STEPS,stepLabel=node('span');
      controls.appendChild(button('Previous',function(){api.step(Math.max(0,currentStep-1));}));
      controls.appendChild(button('Next',function(){api.step(Math.min(steps.length-1,currentStep+1));}));
      if(steps[currentStep].evidence){var evidence=node('details');evidence.appendChild(node('summary','Supplied numeric evidence · inspect source and scope'));var content=node('div');content.innerHTML=steps[currentStep].evidence;evidence.appendChild(content);controls.appendChild(evidence);}
      stepLabel.textContent=(currentStep+1)+' / '+steps.length+' · '+steps[currentStep].caption;controls.appendChild(stepLabel);
    }
    document.body.appendChild(controls);
    var autoCamera=(view.mode==='graph'||view.mode==='clusters')&&(!view.state||!view.state.tableView||view.state.tableView.autoFit===true);
    function fit(){if(autoCamera){app.canvas.fitView();if(app.canvas.selRel)app.canvas.selectRel(app.canvas.selRel);}}
    function reserve(){document.documentElement.style.setProperty('--smv-controls-height',Math.ceil(controls.getBoundingClientRect().height)+'px');fit();}
    var observer=new ResizeObserver(reserve);observer.observe(controls);reserve();
    g.addEventListener('resize',fit);
    function escape(e){if(e.key==='Escape'&&document.body.classList.contains('smv-browse-open')){e.preventDefault();closeLibrary(true);}}
    document.addEventListener('keydown',escape);

    var unique=Array.from(new Map(refs.map(function(r){return [refKey(r),r];})).values());
    var overlays=[],raf,last='',clip={x:0,y:0,width:innerWidth,height:innerHeight};
    function visibleBox(el){if(!el)return null;var b=el.getBoundingClientRect();if(!el.getClientRects().length||b.right<=0||b.bottom<=0||b.left>=innerWidth||b.top>=innerHeight)return null;return b;}
    function paint(force){
      hooks(app);
      var boxes=unique.map(function(r){return visibleBox(target(r));});
      var signature=JSON.stringify([hidden,app.state.viewMode,innerWidth,innerHeight,boxes.map(function(b){return b?[b.x,b.y,b.width,b.height]:null;})]);
      if(!force&&signature===last)return;last=signature;
      overlays.forEach(function(n){n.remove();});overlays=[];
      hiddenList.replaceChildren();document.querySelectorAll('.smv-attention-target').forEach(function(n){n.classList.remove('smv-attention-target');});
      var drawing=[];
      function ring(b,proposal){var n=node('div',null,'smv-hl'+(proposal?' smv-proposal':''));n.style.cssText='left:'+Math.max(0,b.left-3)+'px;top:'+Math.max(0,b.top-3)+'px;width:'+(b.width+6)+'px;height:'+(b.height+6)+'px';document.body.appendChild(n);overlays.push(n);drawing.push(n.getBoundingClientRect());}
      unique.forEach(function(r,i){
        if(hidden)return;
        if(!boxes[i]){var text=node('span',r.kind+': '+r.name+' is outside this view. ');hiddenList.appendChild(text);hiddenList.appendChild(button('Reveal',function(){if(api)api.reveal(r);}));}
        else if(!hidden){var el=target(r);if(el)el.classList.add('smv-attention-target');ring(boxes[i],false);overlays[overlays.length-1].dataset.smvTarget=refKey(r);}
      });
      if(!hidden)view.proposals.forEach(function(p){
        if(p.kind==='group'){
          var bs=p.objects.map(function(r){return visibleBox(target(r));});if(bs.some(function(b){return !b;}))return;
          var left=Math.min.apply(null,bs.map(function(b){return b.left;})),top=Math.min.apply(null,bs.map(function(b){return b.top;})),right=Math.max.apply(null,bs.map(function(b){return b.right;})),bottom=Math.max.apply(null,bs.map(function(b){return b.bottom;}));ring({left:left,top:top,width:right-left,height:bottom-top},true);
        }else if(p.kind==='relationship'||p.kind==='arrow'){
          var a=visibleBox(target(p.from)),b=visibleBox(target(p.to));if(!a||!b)return;
          var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('smv-annotation-lines');
          var line=document.createElementNS(svg.namespaceURI,'path'),x=a.right,y=a.top+a.height/2,x2=b.left,y2=b.top+b.height/2;
          line.setAttribute('d','M'+x+' '+y+' L'+x2+' '+y2+(p.kind==='arrow'?' m-8 -6 l8 6 l-8 6':''));line.setAttribute('stroke','#b37713');line.setAttribute('fill','none');line.setAttribute('stroke-width','3');line.setAttribute('stroke-dasharray','7 5');svg.appendChild(line);document.body.appendChild(svg);overlays.push(svg);
        }
      });
      clip={x:0,y:0,width:innerWidth,height:innerHeight};
      if(view.crop==='highlights'&&drawing.length){drawing.push(controls.getBoundingClientRect());var x=Math.max(0,Math.min.apply(null,drawing.map(function(b){return b.left;}))-16),y=Math.max(0,Math.min.apply(null,drawing.map(function(b){return b.top;}))-16);clip={x:x,y:y,width:Math.min(innerWidth,Math.max.apply(null,drawing.map(function(b){return b.right;}))+16)-x,height:Math.min(innerHeight,Math.max.apply(null,drawing.map(function(b){return b.bottom;}))+16)-y};}
    }
    function tick(){paint();raf=requestAnimationFrame(tick);}paint(true);raf=requestAnimationFrame(tick);
    active={stop:function(){observer.disconnect();g.removeEventListener('resize',fit);document.removeEventListener('keydown',escape);cancelAnimationFrame(raf);overlays.forEach(function(n){n.remove();});controls.remove();},status:status,pending:pendingBox,clip:clip,paint:paint,isHidden:function(){return hidden;}};
    return {clip:clip};
  }
  function snapshot(){
    var app=g.app,cv=app.canvas,view=clone(authored);view.version=2;view.mode=app.state.viewMode;view.width=innerWidth;view.height=innerHeight;view.annotationsVisible=active?!active.isHidden():true;
    view.tables=Array.from(app.explorer.names);
    if(view.mode==='measures')view.focus=selection(app);else if(selection(app))view.focus=selection(app);else delete view.focus;
    if(view.mode!=='measures')delete view.context;
    view.state={tableView:{pos:clone(cv.pos),view:clone(cv.view),expanded:Object.keys(cv.cards).filter(function(n){return cv.cards[n].expanded;}),display:cv.captureDisplay(),focus:cv.captureFocus()},measures:app.measures.captureSnapshot(),selection:selection(app)};
    return view;
  }
  function receipt(){return {version:1,revision:revision,sourceRevision:g.SMV_SOURCE_REVISION||null,view:clone(authored),explored:dirty,selection:selection(g.app),selectedAt:selectedAt,workspace:g.app.state.viewMode,currentView:snapshot(),pendingRevision:pending?pending.revision:null,clientId:clientId};}
  var clientId=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Math.random());
  function connect(smv,input){
    api=smv;authored=clone(input);selected=input.state&&input.state.selection||input.focus||null;
    var baseApply=smv.apply,applyQueue=smv.ready().catch(function(){});
    smv.apply=function(v){var requested=clone(v);var task=applyQueue.then(async function(){busy=true;try{var result=await baseApply(requested);selected=requested.state&&requested.state.selection||requested.focus||null;dirty=false;return result;}finally{busy=false;}});applyQueue=task.catch(function(){});return task;};
    smv.reset=async function(){return smv.apply(authored);};
    smv.step=async function(i){if(!g.SMV_STEPS||!g.SMV_STEPS[i])throw new Error('Unknown step');currentStep=i;authored=clone(g.SMV_STEPS[i].view);return smv.reset();};
    smv.reveal=async function(r){var v=clone(authored);v.focus=r;if(r.kind==='measure')v.mode='measures';else if(r.kind==='query')v.mode='power-query';else if(v.mode==='measures'||v.mode==='power-query')v.mode='graph';if(v.mode!=='measures')delete v.context;delete v.state;await smv.apply(v);dirty=true;return smv.inspect();};
    smv.loadView=async function(v,nextRevision){authored=clone(v);revision=nextRevision;dirty=false;pending=null;selected=null;return smv.reset();};
    smv.inspect=receipt;
    smv.offer=async function(update){
      if(update.sourceRevision!==g.SMV_SOURCE_REVISION){showStatus('Source changed. Reopen the session to review the new model.');return {state:'source-changed'};}
      if(update.revision<=revision||update.revision===declinedRevision)return {state:'unchanged'};
      g.SMVExplanation.validate(g.app.model,update.view);
      if(dirty){pending=update;showPending();return {state:'pending',revision:update.revision};}
      return accept(update);
    };
    async function accept(update){await smv.apply(update.view);authored=clone(update.view);revision=update.revision;pending=null;showPending();await report();return {state:'applied',revision:revision};}
    function showStatus(text){if(active)active.status.textContent=text;}
    function showPending(){if(!active)return;var box=active.pending;box.replaceChildren();box.hidden=!pending;if(pending){box.appendChild(node('span','The agent prepared another view. '));box.appendChild(button('Apply',function(){accept(pending).catch(function(e){showStatus(e.message);});}));box.appendChild(button('Keep exploring',function(){declinedRevision=pending.revision;pending=null;box.hidden=true;report();}));}}
    function interacted(e){if(busy||e.target.closest&&e.target.closest('.smv-explanation-controls'))return;dirty=true;selectedAt=new Date().toISOString();var el=e.target.closest&&e.target.closest('[data-smv-kind]');if(el){selected={kind:el.dataset.smvKind,name:el.dataset.smvName};if(el.dataset.smvTable)selected.table=el.dataset.smvTable;}else selected=null;}
    ['pointerdown','wheel','keydown'].forEach(function(name){document.addEventListener(name,interacted,{capture:true,passive:true});});
    function endpoint(action){var url=new URL(g.SMV_SESSION_URL);url.pathname='/'+action;return url;}
    async function report(){if(!g.app||!g.app.state.loaded)return;if(g.SMV_MCP_SYNC)return g.SMV_MCP_SYNC(receipt());if(!g.SMV_SESSION_URL)return;var response=await fetch(endpoint('client'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(receipt())});if(!response.ok){var data=await response.json();throw new Error(data.error?.message||'Viewer acknowledgement failed');}}
    var pollBusy=false;
    async function poll(){if(pollBusy||busy||(!g.SMV_SESSION_URL&&!g.SMV_MCP_SYNC))return;pollBusy=true;try{if(g.SMV_MCP_SYNC){var data=await report();if(data)await smv.offer(data);showStatus('Inline · view '+revision);return;}var res=await fetch(endpoint('view'));if(!res.ok)throw new Error('Session unavailable ('+res.status+')');var update=await res.json();if(update.error)throw new Error(update.error);await smv.offer(update);await report();showStatus('Live · view '+revision);}catch(e){showStatus('Disconnected: '+e.message+'. The loaded model remains interactive. Save an offline view or reopen this session through the agent.');}finally{pollBusy=false;}}
    smv.ready().then(function(){revision=g.SMV_SESSION_REVISION||1;poll();if(g.SMV_SESSION_URL||g.SMV_MCP_SYNC)setInterval(poll,750);}).catch(function(){});
  }
  function appearance(context){
    style();var dark=context&&context.theme==='dark';document.documentElement.dataset.smvColorScheme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';
    var vars=dark?{'paper':'#151923','surface':'#1e2532','soft':'#293243','ink':'#e4e9f3','muted':'#a8b4ca','line':'#45516a'}:{'paper':'#f4f5f7','surface':'#ffffff','soft':'#f0f3fa','ink':'#25334c','muted':'#59667b','line':'#cbd2df'};
    Object.keys(vars).forEach(function(k){document.documentElement.style.setProperty('--smv-'+k,vars[k]);});
    var darkStyle=document.getElementById('smv-host-appearance');if(!darkStyle){darkStyle=node('style');darkStyle.id='smv-host-appearance';document.head.appendChild(darkStyle);}
    darkStyle.textContent='[data-smv-color-scheme=dark] body,[data-smv-color-scheme=dark] #root,[data-smv-color-scheme=dark] #topbar,[data-smv-color-scheme=dark] .mv-library,[data-smv-color-scheme=dark] .mv-dax-card,[data-smv-color-scheme=dark] .mv-analysis-header,[data-smv-color-scheme=dark] .mv-graph-panel{background:var(--smv-surface)!important;color:var(--smv-ink)!important}';
  }
  g.SMVInteractive={closeLibrary:closeLibrary,annotations:annotations,connect:connect,appearance:appearance};
})(window);
