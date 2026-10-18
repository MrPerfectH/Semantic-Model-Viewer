const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,context,plain}=require('./power-query-ui-harness.cjs');
const zooms=[.58,.47,.37,.3,.85,1,2];
// Synthetic coordinates reproduce the reported topology: four distinct sources,
// two above and two below the right-hand consumer. No source model is loaded.
const fanIn={positions:[[0,-230],[0,-80],[0,220],[0,370],[730,70]],edges:[[0,4],[1,4],[2,4],[3,4]]};
function setup(fixture){const c=context(1,fixture.positions.length);c.graph.edges=fixture.edges.map(([a,b],i)=>({id:'edge-'+String(i).padStart(3,'0'),inputId:'id-'+a,consumerId:'id-'+b}));const h=harness('power-query-canvas.js'),events=[];const canvas=h.win.PowerQueryCanvas.mount(h.host,{context:c,onEdge:e=>events.push(e)});canvas.restoreLayout(new Map(fixture.positions.map(([x,y],i)=>['id-'+i,{x,y}])));return {...h,c,canvas,events};}
function geometry(d){let at;const segments=[],corners=[],samples=[];for(const m of d.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g)){const p=[+m[2],+m[3]];if(m[1]==='M'){at=p;corners.push(p);samples.push(p);}else if(m[1]==='L'){if(at[0]!==p[0]||at[1]!==p[1])segments.push([at,p]);at=p;samples.push(p);}else{const end=[+m[4],+m[5]];corners.push(p);for(let j=1;j<=16;j++){const t=j/16,u=1-t;samples.push([u*u*at[0]+2*u*t*p[0]+t*t*end[0],u*u*at[1]+2*u*t*p[1]+t*t*end[1]]);}at=end;}}corners.push(at);return {segments,corners,samples};}
function overlap([a,b],[c,d]){const v=a[0]===b[0];return v===(c[0]===d[0])&&Math.abs(a[v?0:1]-c[v?0:1])<.01&&Math.min(Math.max(a[v?1:0],b[v?1:0]),Math.max(c[v?1:0],d[v?1:0]))-Math.max(Math.min(a[v?1:0],b[v?1:0]),Math.min(c[v?1:0],d[v?1:0]))>.1;}
function distance(p,[a,b]){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function verify(s,k,{all=true}={}){
  const groups=s.host.querySelectorAll('.pqc-edge').filter(g=>g.style.display!=='none'),routes=groups.map(g=>geometry(g.querySelector('.pqc-edge-line').getAttribute('d')||''));
  if(all)assert.equal(routes.filter(r=>r.segments.length).length,s.c.graph.edges.length,'every edge routed '+JSON.stringify({k,layout:[...s.canvas.captureLayout()],status:s.host.querySelector('.pqc-route-status').textContent}));
  for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++)for(const a of routes[i].segments)for(const b of routes[j].segments)assert.equal(overlap(a,b),false,`shared trunk ${i}/${j} at ${k}: ${JSON.stringify([a,b])}`);
  const boxes=[...s.canvas.captureLayout()].filter(([id])=>!s.host.querySelectorAll('.pqc-node').find(n=>n.dataset.nodeId===id).hidden).map(([,p])=>p);
  routes.forEach((route,i)=>{if(!route.segments.length)return;const group=groups[i],hit=group.querySelector('.pqc-edge-hit'),line=group.querySelector('.pqc-edge-line');assert.equal(hit.getAttribute('d'),line.getAttribute('d'));assert.equal(group.querySelectorAll('polyline').length,1,'one visible arrow');
    for(const [a,z] of route.segments)for(const b of boxes){const cuts=a[0]===z[0]?a[0]>b.x+.11&&a[0]<b.x+252-.11&&Math.max(a[1],z[1])>b.y+.11&&Math.min(a[1],z[1])<b.y+96-.11:a[1]>b.y+.11&&a[1]<b.y+96-.11&&Math.max(a[0],z[0])>b.x+.11&&Math.min(a[0],z[0])<b.x+252-.11;assert.equal(cuts,false,'entire straight segment clears every card');}
    for(const p of route.samples)for(const b of boxes)assert.ok(!(p[0]>b.x+.11&&p[0]<b.x+252-.11&&p[1]>b.y+.11&&p[1]<b.y+96-.11),'rounded path avoids cards');
    const other=routes.filter((_,j)=>i!==j).flatMap(r=>r.samples.slice(1).map((p,j)=>[r.samples[j],p])),candidates=route.segments.flatMap(([a,b])=>[.2,.5,.8].map(t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]));
    assert.ok(candidates.some(p=>other.every(seg=>distance(p,seg)>7/k+.05)),'exclusive hit region '+i+' at '+k);
    const arrow=group.querySelector('.pqc-edge-arrow').children[0],ink=arrow.children[0],center=arrow.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number),points=ink.children[0].getAttribute('points').split(' ').map(v=>v.split(',').map(Number)),padding=+ink.getAttribute('stroke-width')/2;
    const xs=points.map(p=>p[0]+center[0]),ys=points.map(p=>p[1]+center[1]);
    for(const b of boxes)assert.ok(Math.max(...xs)+padding<=b.x||Math.min(...xs)-padding>=b.x+252||Math.max(...ys)+padding<=b.y||Math.min(...ys)-padding>=b.y+96,'chevron clears card including stroke');
    const dx=points[1][0]-(points[0][0]+points[2][0])/2,dy=points[1][1]-(points[0][1]+points[2][1])/2;
    const seat=route.segments.find(seg=>distance(center,seg)<.15);assert.ok(seat,'arrow seated on straight run');assert.ok(dx*(seat[1][0]-seat[0][0])+dy*(seat[1][1]-seat[0][1])>0,'arrow points input to consumer');
    hit.fire('click',{clientX:300,clientY:200});assert.equal(s.events.at(-1).edgeId,hit.dataset.edgeId);
  });return routes;
}
test('four-input screenshot-like fan-in has distinct visible ports and no shared trunks at every requested zoom',()=>{const s=setup(fanIn);for(const k of zooms){s.canvas.setViewport({x:11,y:23,k});const routes=verify(s,k);assert.equal(new Set(routes.map(r=>JSON.stringify(r.corners.at(-1)))).size,4);const ports=routes.map(r=>r.corners.at(-1)[1]).sort((a,b)=>a-b);for(let i=1;i<ports.length;i++)assert.ok((ports[i]-ports[i-1])*k>=7.9,'at least 8px port pitch allowing SVG rounding');}});

test('fan-out, diamonds, reciprocal cycles, self-loops and multi-degree nodes retain separate routes in all orientations',()=>{
  const fixtures=[{...fanIn,edges:fanIn.edges.map(([a,b])=>[b,a])},{positions:[[0,0],[430,-160],[430,180],[900,0]],edges:[[0,1],[0,2],[1,3],[2,3]]},{positions:[[0,0],[620,0],[310,330]],edges:[[0,1],[1,0],[1,2],[2,0],[0,0],[2,2]]},{positions:[[0,0],[450,-220],[450,220],[900,0]],edges:[[0,1],[0,2],[1,3],[2,3],[1,2],[2,1],[0,3]]}];
  for(const fixture of fixtures)for(const transform of [(x,y)=>[x,y],(x,y)=>[-x,y],(x,y)=>[y*3,x*.6],(x,y)=>[y*3,-x*.6]]){
    const f={edges:fixture.edges,positions:fixture.positions.map(([x,y])=>transform(x,y))},s=setup(f);
    for(const k of zooms){s.canvas.setViewport({x:0,y:0,k});verify(s,k);}s.canvas.destroy();
  }
});
test('reserved obstacle detours do not share approach, departure or middle segments',()=>{
  const s=setup({positions:[[0,-140],[0,30],[0,220],[850,80],[430,-20],[430,140]],edges:[[0,3],[1,3],[2,3],[3,0]]});
  for(const k of zooms){s.canvas.setViewport({x:0,y:0,k});verify(s,k);}
});
test('edge ordering, panning, hide/show, selection and drag preserve stable identity, state and deterministic allocation',()=>{
  const s=setup(fanIn),graph=JSON.stringify(s.c.graph),layout=plain([...s.canvas.captureLayout()]);
  const paths=()=>Object.fromEntries(s.host.querySelectorAll('.pqc-edge-hit').map(h=>[h.dataset.edgeId,h.getAttribute('d')]));
  for(const k of zooms){s.canvas.setViewport({x:0,y:0,k});const before=paths();s.canvas.setViewport({x:333,y:-777,k});assert.deepEqual(paths(),before);assert.deepEqual(plain([...s.canvas.captureLayout()]),layout);
    s.canvas.setSelection('id-4');s.canvas.setMatches(new Set(['id-0','id-4']));assert.deepEqual(paths(),before);
    s.canvas.setContext({...s.c,graph:{...s.c.graph,edges:s.c.graph.edges.slice().reverse()}});assert.deepEqual(paths(),before);
    s.canvas.setVisibleIds(new Set(['id-0','id-1','id-4']));const visible=s.host.querySelectorAll('.pqc-edge').filter(g=>g.style.display!=='none');assert.equal(visible.length,2);assert.equal(new Set(visible.map(g=>JSON.stringify(geometry(g.querySelector('.pqc-edge-line').getAttribute('d')).corners.at(-1)))).size,2);
    s.canvas.setVisibleIds(null);assert.deepEqual(paths(),before);s.canvas.setContext(s.c);assert.equal(JSON.stringify(s.c.graph),graph);assert.deepEqual(plain(s.canvas.getViewport()),{x:333,y:-777,k});
  }
  s.canvas.setViewport({x:0,y:0,k:1});const node=s.host.querySelectorAll('.pqc-node').find(n=>n.dataset.nodeId==='id-4');node.fire('pointerdown',{clientX:800,clientY:100});node.fire('pointermove',{clientX:1080,clientY:280});node.fire('pointerup');s.flush();verify(s,1);assert.deepEqual(plain(s.canvas.captureLayout().get('id-4')),{x:1010,y:250});assert.equal(JSON.stringify(s.c.graph),graph);
});
test('dense degree and impossible overlaps are explicit and bounded instead of shared-trunk fallbacks',()=>{
  const f={positions:[[800,300],...Array.from({length:120},(_,i)=>[0,i*126])],edges:Array.from({length:120},(_,i)=>[i+1,0])};const s=setup(f),before=plain([...s.canvas.captureLayout()]);
  s.canvas.setViewport({x:0,y:0,k:.3});const status=s.host.querySelector('.pqc-route-status');assert.equal(status.hidden,false);assert.match(status.textContent,/could not be separated|crowded ports/);assert.ok(+status.dataset.maxEdgeWork<=50001);assert.equal(s.host.querySelectorAll('.pqc-edge').length,120);assert.deepEqual(plain([...s.canvas.captureLayout()]),before);
  const groups=s.host.querySelectorAll('.pqc-edge');for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)for(const a of geometry(groups[i].querySelector('.pqc-edge-line').getAttribute('d')).segments)for(const b of geometry(groups[j].querySelector('.pqc-edge-line').getAttribute('d')).segments)assert.equal(overlap(a,b),false);
  const blocked=setup({positions:[[0,0],[0,30]],edges:[[0,1],[1,0]]});assert.equal(blocked.host.querySelector('.pqc-route-status').hidden,false);assert.equal(blocked.canvas.captureLayout().get('id-0').x,0);
});

test('1000-node ordinary chain retains all 999 distinct routes at 47/85% without warning or global starvation',t=>{
  const f={positions:Array.from({length:1000},(_,i)=>[i*352,0]),edges:Array.from({length:999},(_,i)=>[i,i+1])};const s=setup(f),graph=JSON.stringify(s.c.graph),layout=plain([...s.canvas.captureLayout()]);
  for(const k of [.47,.85]){const start=performance.now();s.canvas.setViewport({x:0,y:0,k});const elapsed=performance.now()-start,groups=s.host.querySelectorAll('.pqc-edge'),status=s.host.querySelector('.pqc-route-status');assert.equal(groups.length,999);assert.equal(groups.filter(g=>g.querySelector('.pqc-edge-line').getAttribute('d')).length,999);assert.equal(groups.every(g=>g.getAttribute('data-route-status')==='routed'&&g.querySelectorAll('polyline').length===1),true);assert.equal(status.hidden,true);assert.equal(+status.dataset.unrouted,0);assert.ok(Number.isFinite(+status.dataset.work)&&+status.dataset.work<999*100,'local collision work scales with disjoint links');
    const runs=groups.flatMap(g=>geometry(g.querySelector('.pqc-edge-line').getAttribute('d')).segments).sort((a,b)=>a[0][0]-b[0][0]);for(let i=1;i<runs.length;i++)assert.equal(overlap(runs[i-1],runs[i]),false);
    assert.deepEqual(plain([...s.canvas.captureLayout()]),layout);assert.equal(JSON.stringify(s.c.graph),graph);t.diagnostic(JSON.stringify({nodes:1000,edges:groups.length,k,elapsedMs:elapsed,work:+status.dataset.work}));
  }
});

test('250-consumer fan-out retains every possible link with honest crowded-port status, not scan-budget omissions',t=>{
  const f={positions:[[0,0],...Array.from({length:250},(_,i)=>[352,i*126])],edges:Array.from({length:250},(_,i)=>[0,i+1])},s=setup(f);
  for(const k of zooms){const start=performance.now();s.canvas.setViewport({x:0,y:0,k});const elapsed=performance.now()-start,groups=s.host.querySelectorAll('.pqc-edge'),status=s.host.querySelector('.pqc-route-status');assert.equal(groups.filter(g=>g.querySelector('.pqc-edge-line').getAttribute('d')).length,250);assert.equal(+status.dataset.unrouted,0);assert.equal(+status.dataset.crowded,250);assert.ok(groups.every(g=>g.getAttribute('data-route-status')==='crowded-ports'));assert.ok(+status.dataset.maxEdgeWork<=50001);
    const routes=groups.map(g=>geometry(g.querySelector('.pqc-edge-line').getAttribute('d')));for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++)for(const a of routes[i].segments)for(const b of routes[j].segments)assert.equal(overlap(a,b),false,'dense links remain individually drawn');
    t.diagnostic(JSON.stringify({nodes:251,edges:groups.length,k,elapsedMs:elapsed,work:+status.dataset.work,maxEdgeWork:+status.dataset.maxEdgeWork,crowded:+status.dataset.crowded}));
  }
});
test('an impossible early edge cannot consume another edge’s routing budget',()=>{
  const s=setup({positions:[[0,0],[0,30],...Array.from({length:30},(_,i)=>[1000+i*352,300])],edges:[[0,1],...Array.from({length:29},(_,i)=>[i+2,i+3])]});
  s.canvas.setViewport({x:0,y:0,k:.47});const groups=s.host.querySelectorAll('.pqc-edge');assert.equal(groups[0].querySelector('.pqc-edge-line').getAttribute('d'),'');assert.equal(groups.slice(1).every(g=>g.getAttribute('data-route-status')==='routed'&&g.querySelector('.pqc-edge-line').getAttribute('d')),true);assert.equal(+s.host.querySelector('.pqc-route-status').dataset.unrouted,1);
});
