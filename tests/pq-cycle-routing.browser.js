// Run in the registered T3 preview after importing cycles.bim and opening Power Query.
// Fixture preparation uses the public canvas API; clicks/drags are issued by T3.
window.cycleRoutingProof = {
  prepare(b) {
    const w=app.powerQueryWorkspace;
    const ids=['CycleA','CycleB'].map(label=>w.context.graph.nodes.find(n=>n.label===label).id);
    w.canvas.setVisibleIds(new Set(ids));
    w.canvas.restoreLayout(new Map([[ids[0],{x:0,y:0}],[ids[1],b]]));
    w.canvas.fit();
    window.cycleIds=ids;
    window.cycleGraphBefore=JSON.stringify(w.context.graph);
    return this.inspect();
  },
  inspect() {
    const w=app.powerQueryWorkspace;
    return {
      layout:[...w.canvas.captureLayout()], viewport:w.canvas.getViewport(),
      graphUnchanged:!window.cycleGraphBefore||JSON.stringify(w.context.graph)===window.cycleGraphBefore,
      edges:[...document.querySelectorAll('.pqc-edge')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{
        const line=e.querySelector('.pqc-edge-line'),hit=e.querySelector('.pqc-edge-hit'),id=hit.dataset.edgeId;
        const samples=Array.from({length:19},(_,i)=>{
          const fraction=(i+1)/20,p=line.getPointAtLength(line.getTotalLength()*fraction).matrixTransform(line.getScreenCTM());
          return {fraction,x:p.x,y:p.y,hit:document.elementFromPoint(p.x,p.y)?.closest('[data-edge-id]')?.dataset.edgeId??null};
        });
        return {id,d:line.getAttribute('d'),hitPath:hit.getAttribute('d'),stroke:getComputedStyle(hit).strokeWidth,samples};
      })
    };
  }
};
window.cycleTrustedClicks=[];
document.addEventListener('click',e=>{const edge=e.target.closest?.('[data-edge-id]');if(edge)window.cycleTrustedClicks.push({id:edge.dataset.edgeId,isTrusted:e.isTrusted});},true);
