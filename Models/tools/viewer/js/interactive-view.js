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
      return table?{kind:'measure',table:table.name,name:name}:null;
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
.smv-explanation-controls button{font:inherit;padding:6px 10px;border:1px solid var(--smv-line,#ccd3e0);border-radius:7px;color:inherit;background:var(--smv-soft,#f5f6fb);cursor:pointer}.smv-explanation-controls button:focus-visible{outline:3px solid #8472ed;outline-offset:2px}.smv-notes{max-width:480px;flex-basis:100%;white-space:pre-wrap}.smv-notes p{margin:4px 0}.smv-status{font-size:12px}.smv-pending{flex-basis:100%;padding:8px;border-left:3px solid #6854d9}.smv-hidden-targets{flex-basis:100%;color:var(--smv-muted,#59667b)}
body[data-smv-interactive] .mv-dax-body pre,body[data-smv-interactive] .mv-dax-code{white-space:pre-wrap!important;overflow-wrap:anywhere!important}
@media(max-width:700px){body[data-smv-interactive] .mv-library{max-width:190px}body[data-smv-interactive] .ex-library{max-width:190px}.smv-explanation-controls{font-size:12px}}
`;document.head.appendChild(s);
  }
  function annotations(app,view,refs,target){
    style();document.body.dataset.smvInteractive='1';if(active)active.stop();
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,.smv-annotation-lines,.smv-explanation-controls').forEach(function(n){n.remove();});
    var controls=node('aside',null,'smv-explanation-controls');controls.setAttribute('aria-label','Explanation controls');
    var label=node('strong','Explanation · attention highlights');controls.appendChild(label);
    if(g.SMV_SEND_CONTEXT)controls.appendChild(button('Use selection in conversation',function(){g.SMV_SEND_CONTEXT().catch(function(e){status.textContent=e.message;});}));
    controls.appendChild(button('Reset explanation',function(){if(api)api.reset();}));
    var hidden=view.annotationsVisible===false,toggle=button('Hide annotations',function(){hidden=!hidden;toggle.textContent=hidden?'Show annotations':'Hide annotations';paint(true);});toggle.textContent=hidden?'Show annotations':'Hide annotations';controls.appendChild(toggle);
    var status=node('span','', 'smv-status');status.setAttribute('aria-live','polite');controls.appendChild(status);
    var notes=node('div',null,'smv-notes');
    view.callouts.forEach(function(c){notes.appendChild(node('p',c.text));});
    view.proposals.forEach(function(p){notes.appendChild(node('p','Proposed '+p.kind+': '+p.text));});
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
    active={stop:function(){cancelAnimationFrame(raf);overlays.forEach(function(n){n.remove();});controls.remove();},status:status,pending:pendingBox,clip:clip,paint:paint,isHidden:function(){return hidden;}};
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
    api=smv;authored=clone(input);
    var baseApply=smv.apply;
    smv.apply=async function(v){busy=true;try{var result=await baseApply(v);selected=null;dirty=false;return result;}finally{busy=false;}};
    smv.reset=async function(){return smv.apply(authored);};
    smv.step=async function(i){if(!g.SMV_STEPS||!g.SMV_STEPS[i])throw new Error('Unknown step');currentStep=i;authored=clone(g.SMV_STEPS[i].view);return smv.reset();};
    smv.reveal=async function(r){var v=clone(authored);v.focus=r;if(r.kind==='measure')v.mode='measures';else if(r.kind==='query')v.mode='power-query';else if(v.mode==='measures'||v.mode==='power-query')v.mode='graph';if(v.mode!=='measures')delete v.context;delete v.state;return smv.apply(v);};
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
    async function report(){if(!g.app||!g.app.state.loaded)return;if(g.SMV_MCP_SYNC)return g.SMV_MCP_SYNC(receipt());if(!g.SMV_SESSION_URL)return;await fetch(endpoint('client'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(receipt())});}
    var pollBusy=false;
    async function poll(){if(pollBusy||busy||(!g.SMV_SESSION_URL&&!g.SMV_MCP_SYNC))return;pollBusy=true;try{if(g.SMV_MCP_SYNC){var data=await report();if(data)await smv.offer(data);showStatus('Inline · view '+revision);return;}var res=await fetch(endpoint('view'));if(!res.ok)throw new Error('Session unavailable ('+res.status+')');var update=await res.json();if(update.error)throw new Error(update.error);await smv.offer(update);await report();showStatus('Live · view '+revision);}catch(e){showStatus(e.message);}finally{pollBusy=false;}}
    smv.ready().then(function(){revision=g.SMV_SESSION_REVISION||1;poll();if(g.SMV_SESSION_URL||g.SMV_MCP_SYNC)setInterval(poll,750);}).catch(function(){});
  }
  g.SMVInteractive={annotations:annotations,connect:connect};
})(window);
