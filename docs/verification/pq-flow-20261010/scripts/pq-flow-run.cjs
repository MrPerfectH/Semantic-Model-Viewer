const {chromium}=require('/Users/przemek.harazny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out='/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-power-query-metadata-lineage/docs/verification/pq-flow-20261010';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
 const page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const click=async name=>page.getByRole('button',{name,exact:true}).click();
 const snap=async name=>{await page.screenshot({path:path.join(out,name+'.png')});return name+'.png';};
 const state=async()=>page.evaluate(()=>{const w=app.powerQueryWorkspace;return {root:w.flowRootId,selected:w.selectedId,visible:[...w.visible||[]],membership:[...w.membership||[]],view:w.canvas.getViewport(),layout:[...w.canvas.captureLayout()],inspector:w.inspector.captureViewState(),focus:w.focusMode,direction:w.direction,depth:String(w.depth),generation:w.generation};});
 await page.goto('http://localhost:8945/?review=flow-20261010-fallback');
 console.log(JSON.stringify({ready:true,browser:await browser.version(),node:process.version}));
 try { const result=await eval('(async()=>{'+fs.readFileSync(process.argv[2],'utf8')+'})()');console.log(JSON.stringify({ok:true,result})); } catch(e) { fs.appendFileSync(path.join(out,'browser-failures.jsonl'),JSON.stringify({error:e.stack})+'\n');console.error(e);process.exitCode=1;await snap('failure-'+Date.now()); }
 await browser.close();
})();
