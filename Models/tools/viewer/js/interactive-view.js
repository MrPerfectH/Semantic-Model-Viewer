/* Shared real-viewer controls, semantic annotations and session bridge. */
(function(g){
  'use strict';
  var active=null, api=null, authored=null, busy=false, dirty=false, selected=null, selectedAt=null, revision=1, pending=null, declinedRevision=0, currentStep=0;
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function node(tag,text,cls){var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(text,run){var b=node('button',text);b.type='button';b.onclick=run;return b;}
  function refKey(r){return JSON.stringify([r.kind,r.table||'',r.name]);}
  function hooks(app){
    Object.keys(app.canvas.cards||{}).forEach(function(n){var c=app.canvas.cards[n];c.el.dataset.smvKind='table';c.el.dataset.smvName=n;Object.keys(c.colRows).forEach(function(k){var el=c.colRows[k];el.dataset.smvKind='column';el.dataset.smvTable=n;el.dataset.smvName=k;});});
  }
  function selection(app){
    if(app.state.viewMode==='measures'){
      var name=app.state.gPin||app.state.selMeasure;
      var table=app.model.tables.find(function(t){return t.measures.some(function(m){return m.name===name;});});
      var source=app.state.dependencySource;
      return table?{kind:'measure',table:table.name,name:name}:source?(source.column==null?{kind:'table',name:source.table}:{kind:'column',table:source.table,name:source.column}):null;
    }
    if(selected&&(selected.kind==='column'||selected.kind==='query'))return clone(selected);
    if(app.canvas.selRel)return {kind:'relationship',name:app.canvas.selRel.name};
    return app.state.selected?{kind:'table',name:app.state.selected}:null;
  }
  function style(){
    if(document.getElementById('smv-interactive-css'))return;
    var s=node('style');s.id='smv-interactive-css';s.textContent=`
.smv-hl{position:fixed;border:2px solid #6854d9!important;box-shadow:0 0 0 2px #ffffffb3;border-radius:7px;pointer-events:none;z-index:90;box-sizing:border-box}.smv-proposal{border-color:#b37713!important}.smv-annotation-lines{position:fixed;inset:0;width:100%;height:100%;z-index:89;pointer-events:none}.smv-context-dim{opacity:1!important}body[data-smv-interactive] [data-smv-kind=table]{opacity:1!important}body[data-smv-interactive] .smv-attention-target{color:var(--smv-ink,#25334c)!important}
.smv-explanation-controls{position:fixed;bottom:12px;left:12px;z-index:200;max-width:calc(100vw - 24px);max-height:38vh;overflow:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px;border:1px solid var(--smv-line,#cbd2df);border-radius:12px;background:var(--smv-surface,#fff);color:var(--smv-ink,#25334c);box-shadow:0 4px 18px #172b4d14;font:13px/1.5 system-ui}
.smv-explanation-controls[data-smv-banner=hidden]{display:none}.smv-explanation-controls[data-smv-banner=hidden][data-smv-pending="1"],.smv-explanation-controls[data-smv-banner=hidden][data-smv-error="1"]{display:flex}.smv-explanation-controls[data-smv-banner=hidden]>:not(.smv-pending):not(.smv-status){display:none}.smv-explanation-controls[data-smv-banner=hidden][data-smv-error="0"]>.smv-status{display:none}.smv-pending[hidden]{display:none!important}
.smv-explanation-controls button{font:inherit;padding:6px 10px;border:1px solid var(--smv-line,#ccd3e0);border-radius:7px;color:inherit;background:var(--smv-soft,#f5f6fb);cursor:pointer}.smv-explanation-controls button:focus-visible{outline:3px solid #8472ed;outline-offset:2px}.smv-view-provenance{flex-basis:100%;max-width:640px}.smv-view-provenance summary{cursor:pointer}.smv-view-provenance pre{max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.smv-notes{max-width:480px;flex-basis:100%;white-space:pre-wrap}.smv-notes p{margin:4px 0}.smv-status{font-size:12px}.smv-pending{flex-basis:100%;padding:8px;border-left:3px solid #6854d9}.smv-hidden-targets{flex-basis:100%;color:var(--smv-muted,#59667b)}
body[data-smv-interactive] .mv-dax-body pre,body[data-smv-interactive] .mv-dax-code{white-space:pre-wrap!important;overflow-wrap:anywhere!important}
@media(max-width:700px){body[data-smv-interactive] .mv-library{display:none!important}body[data-smv-interactive].smv-browse-open .mv-library{display:flex!important;position:absolute;inset:0 auto 110px 0;z-index:150;max-width:85vw;width:280px!important;min-width:0}body[data-smv-interactive] .mv-analysis-body[data-mode=split]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) 8px minmax(0,1fr)}body[data-smv-interactive] .ex-library{max-width:190px}.smv-explanation-controls{font-size:12px}}
`;document.head.appendChild(s);
  }
  function annotations(app,view,refs,target){
    style();document.body.dataset.smvInteractive='1';if(active)active.stop();
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,.smv-annotation-lines,.smv-explanation-controls').forEach(function(n){n.remove();});
    var controls=node('aside',null,'smv-explanation-controls');controls.setAttribute('aria-label','Explanation controls');controls.dataset.smvBanner=view.banner===false?'hidden':'shown';controls.dataset.smvPending='0';controls.dataset.smvError='0';
    var label=node('strong','Explanation · attention highlights');controls.appendChild(label);
    if(view.mode==='measures')controls.appendChild(button('Browse measures',function(){dirty=true;app.measures.cancelSnapshotViewport();app.setState({selMeasure:null,gPin:null,gHover:null});document.body.classList.toggle('smv-browse-open');}));
    if(g.SMV_MCP_SYNC)controls.appendChild(button('Sync view',async function(e){var b=e.currentTarget;b.disabled=true;try{status.textContent=await api.sync()||'Sync unavailable. Try again when the viewer is ready.';}catch(error){status.textContent=error.message;}finally{b.disabled=false;}}));
    if(g.SMV_EXPAND_WORKSPACE)controls.appendChild(button('Expand workspace',function(){g.SMV_EXPAND_WORKSPACE().catch(function(e){status.textContent=e.message;});}));
    if(g.SMV_SAVE_OFFLINE)controls.appendChild(button('Save offline view',function(){g.SMV_SAVE_OFFLINE().catch(function(e){status.textContent=e.message;});}));
    if(g.SMV_SEND_CONTEXT)controls.appendChild(button('Use selection in conversation',function(){g.SMV_SEND_CONTEXT().catch(function(e){status.textContent=e.message;});}));
    controls.appendChild(button('Reset explanation',function(){if(api)api.reset();}));
    var hidden=view.annotationsVisible===false,toggle=button('Hide annotations',function(){dirty=true;hidden=!hidden;notes.hidden=hidden;toggle.textContent=hidden?'Show annotations':'Hide annotations';paint(true);});toggle.textContent=hidden?'Show annotations':'Hide annotations';controls.appendChild(toggle);
    var status=node('span','', 'smv-status');status.setAttribute('aria-live','polite');controls.appendChild(status);
    var notes=node('div',null,'smv-notes');notes.hidden=hidden;
    view.callouts.forEach(function(c){notes.appendChild(node('p',c.text));});
    view.proposals.forEach(function(p){notes.appendChild(node('p','Proposed '+p.kind+': '+p.text));});
    var provenance=node('details',null,'smv-view-provenance');provenance.appendChild(node('summary','About this view'));
    provenance.appendChild(node('p','Model content: '+app.model.name+' · '+app.model.tables.length+' tables. Table names, columns, relationships and DAX come from model metadata.'));
    provenance.appendChild(node('p','Authored instructions: visible context, focus, highlights, explanation text and walkthrough captions. These choices express the author’s interpretation.'));
    provenance.appendChild(node('p','Viewer output: the app renders the diagram, positions highlights, and handles navigation. The CLI packages this interactive view and can capture it. No model query has been executed.'));
    var spec=node('details');spec.appendChild(node('summary','Inspect the view specification'));spec.appendChild(node('pre',JSON.stringify(view,null,2)));provenance.appendChild(spec);controls.appendChild(provenance);
    if(view.context)notes.appendChild(node('p','Dependency context: '+view.context.direction+' · '+view.context.depth+' levels · at most '+view.context.limit+' measures. Use branch controls to explore further.'));
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
    active={controls:controls,stop:function(){cancelAnimationFrame(raf);overlays.forEach(function(n){n.remove();});controls.remove();},status:status,pending:pendingBox,clip:clip,paint:paint,isHidden:function(){return hidden;}};
    return {clip:clip};
  }
  function snapshot(){
    var app=g.app,cv=app.canvas,view=clone(authored);view.version=2;view.mode=app.state.viewMode;view.width=innerWidth;view.height=innerHeight;view.arrange=false;view.annotationsVisible=active?!active.isHidden():true;
    view.tables=Array.from(app.explorer.names);
    if(view.mode==='measures')view.focus=selection(app);else if(selection(app))view.focus=selection(app);else delete view.focus;
    if(view.mode!=='measures')delete view.context;
    view.state={tableView:{pos:clone(cv.pos),view:clone(cv.view),expanded:Object.keys(cv.cards).filter(function(n){return cv.cards[n].expanded;}),display:cv.captureDisplay(),focus:cv.captureFocus()},measures:app.measures.captureSnapshot(),selection:selection(app)};
    return view;
  }
  function receipt(){var app=g.app,rendered={workspace:app.state.viewMode,tableCanvasTables:Array.from(app.explorer.names).filter(function(n){return app.canvas.cards[n]&&app.canvas.cards[n].el.style.display!=='none';}).length};if(app.state.viewMode==='measures')rendered.measureGraphNodes=app.measures._g?app.measures._g.nodes.length:0;return {renderedSummary:rendered,version:1,revision:revision,sourceRevision:g.SMV_SOURCE_REVISION||null,view:clone(authored),explored:dirty,selection:selection(g.app),selectedAt:selectedAt,workspace:g.app.state.viewMode,currentView:snapshot(),pendingRevision:pending?pending.revision:null,clientId:clientId};}
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
      if(dirty&&!update.apply){pending=update;showPending();return {state:'pending',revision:update.revision};}
      return accept(update);
    };
    async function accept(update){await smv.apply(update.view);authored=clone(update.view);revision=update.revision;pending=null;showPending();await report();return {state:'applied',revision:revision};}
    function showStatus(text){if(active){active.status.textContent=text;active.controls.dataset.smvError=/^(Disconnected:|Source changed\.)/.test(text)?'1':'0';}}
    function showPending(){if(!active)return;var box=active.pending;box.replaceChildren();box.hidden=!pending;active.controls.dataset.smvPending=pending?'1':'0';if(pending){box.appendChild(node('span','The agent prepared another view. '));box.appendChild(button('Apply',function(){accept(pending).catch(function(e){showStatus(e.message);});}));box.appendChild(button('Keep exploring',function(){declinedRevision=pending.revision;pending=null;showPending();report();}));}}
    function interacted(e){if(busy||e.target.closest&&e.target.closest('.smv-explanation-controls'))return;dirty=true;selectedAt=new Date().toISOString();var el=e.target.closest&&e.target.closest('[data-smv-kind]');if(el){selected={kind:el.dataset.smvKind,name:el.dataset.smvName};if(el.dataset.smvTable)selected.table=el.dataset.smvTable;}else selected=null;}
    ['pointerdown','wheel','keydown'].forEach(function(name){document.addEventListener(name,interacted,{capture:true,passive:true});});
    function endpoint(action){var url=new URL(g.SMV_SESSION_URL);url.pathname='/'+action;return url;}
    async function report(explicit){if(!g.app||!g.app.state.loaded)return;if(g.SMV_MCP_SYNC)return explicit?g.SMV_MCP_SYNC(receipt()):undefined;if(!g.SMV_SESSION_URL)return;var response=await fetch(endpoint('client'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(receipt())});if(!response.ok){var data=await response.json();throw new Error(data.error?.message||'Viewer acknowledgement failed');}}
    var pollBusy=false;
    async function poll(){if(pollBusy||busy||(!g.SMV_SESSION_URL&&!g.SMV_MCP_SYNC))return;pollBusy=true;try{if(g.SMV_MCP_SYNC){var data=await report(true);if(data)await smv.offer(data);showStatus('Inline · view '+revision);return 'Synced view '+revision+'.';}var res=await fetch(endpoint('view'));if(!res.ok)throw new Error('Session unavailable ('+res.status+')');var update=await res.json();if(update.error)throw new Error(update.error);await smv.offer(update);await report();showStatus('Live · view '+revision);}catch(e){if(g.SMV_MCP_SYNC)throw e;showStatus('Disconnected: '+e.message+'. The loaded model remains interactive. Save an offline view or reopen this session through the agent.');}finally{pollBusy=false;}}
    smv.sync=poll;
    // Host tool calls can require a blocking permission dialog on every call.
    // Embedded views synchronize only after a click; keep polling local HTTP sessions.
    smv.ready().then(function(){revision=g.SMV_SESSION_REVISION||1;if(g.SMV_MCP_SYNC){showStatus('Inline · sync when ready');return;}poll();if(g.SMV_SESSION_URL)setInterval(poll,750);}).catch(function(){});
  }
  function appearance(context){
    style();var dark=context&&context.theme==='dark';document.documentElement.dataset.smvColorScheme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';
    var vars=dark?{'paper':'#151923','surface':'#1e2532','soft':'#293243','ink':'#e4e9f3','muted':'#a8b4ca','line':'#45516a'}:{'paper':'#f4f5f7','surface':'#ffffff','soft':'#f0f3fa','ink':'#25334c','muted':'#59667b','line':'#cbd2df'};
    Object.keys(vars).forEach(function(k){document.documentElement.style.setProperty('--smv-'+k,vars[k]);});
    var darkStyle=document.getElementById('smv-host-appearance');if(!darkStyle){darkStyle=node('style');darkStyle.id='smv-host-appearance';document.head.appendChild(darkStyle);}
    darkStyle.textContent='[data-smv-color-scheme=dark] body,[data-smv-color-scheme=dark] #root,[data-smv-color-scheme=dark] #topbar,[data-smv-color-scheme=dark] .mv-library,[data-smv-color-scheme=dark] .mv-dax-card,[data-smv-color-scheme=dark] .mv-analysis-header,[data-smv-color-scheme=dark] .mv-graph-panel{background:var(--smv-surface)!important;color:var(--smv-ink)!important}';
  }
  g.SMVInteractive={annotations:annotations,connect:connect,appearance:appearance};
})(window);
