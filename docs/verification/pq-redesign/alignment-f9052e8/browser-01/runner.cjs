'use strict';
// Authorized fallback after preserved T3 explicit lost-host/do-not-retry response.
// Runs the same independent scenarios through actual trusted CDP input.
const fs=require('node:fs'),path=require('node:path'),{execSync,execFileSync}=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {open}=require('./pq-redesign-independent-runtime-transport.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'docs/verification/pq-redesign/alignment-f9052e8'),out=path.join(base,process.env.PQ_RUN||'browser-01'),origin='http://127.0.0.1:54085';fs.mkdirSync(out,{recursive:true});
const mapping=require(path.join(base,'runtime-mapping.json'));
function verify(){assert.equal(mapping.assets.length,33);for(const a of mapping.assets){const d=fs.readFileSync(path.join(base,'served',a.runtimePath));assert.equal(crypto.createHash('sha256').update(d).digest('hex'),a.sha256);assert.deepEqual(d,execFileSync('git',['show',mapping.candidate+':Models/tools/viewer/'+a.runtimePath]));}}
verify();
(async()=>{const b=await open();const wrap=value=>({structuredContent:value});let shot=0;
// Supports only the selectors used by the recorded independent scenario; requires one visible target.
function selector(s){let visible=s.includes(':visible');s=s.replace(/:visible/g,'');let m=s.match(/:has\(strong:text-is\((.*)\)\)$/),child=null;if(m){child=JSON.parse(m[1]);s=s.slice(0,m.index);}let t=s.match(/:text-(is|matches)\((.*)\)$/),kind,text;if(t){kind=t[1];text=JSON.parse(t[2]);s=s.slice(0,t.index);}return `(()=>{const a=[...document.querySelectorAll(${JSON.stringify(s)})].filter(n=>${visible?'n.getBoundingClientRect().width>0':'true'}${child!==null?'&&n.querySelector("strong")?.textContent==='+JSON.stringify(child):''}${t?(kind==='is'?'&&n.textContent==='+JSON.stringify(text):'&&new RegExp('+JSON.stringify(text)+').test(n.textContent)'):''});if(a.length!==1)throw Error('Selector count '+a.length+' '+${JSON.stringify(s)});return a[0]})()`;}
const tools={
 mcp__t3_code__preview_evaluate:async a=>wrap({value:await b.evaluate(a.expression)}),
 mcp__t3_code__preview_click:async a=>{await b.click(selector(a.selector));return wrap({});},
 mcp__t3_code__preview_press:async a=>{await b.key(a.key);return wrap({});},
 mcp__t3_code__preview_upload:async a=>{const d=await b.send('DOM.getDocument'),i=await b.send('DOM.querySelector',{nodeId:d.root.nodeId,selector:a.selector});await b.send('DOM.setFileInputFiles',{nodeId:i.nodeId,files:a.paths});return wrap({});},
 mcp__t3_code__preview_resize:async a=>{await b.send('Emulation.setDeviceMetricsOverride',{width:a.width,height:a.height,deviceScaleFactor:1,mobile:false});return wrap({});},
 mcp__t3_code__preview_snapshot:async()=>{const file=path.join(out,'transport-shot-'+(++shot)+'.png');fs.writeFileSync(file,Buffer.from((await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));return wrap({screenshotPath:file});},
 exec_command:async a=>{try{return {exit_code:0,output:execSync(a.cmd,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})};}catch(e){return {exit_code:e.status,output:e.stderr?.toString()};}},
 apply_patch:async p=>{const m=p.match(/^\*\*\* Begin Patch\n\*\*\* Add File: (.+)\n([\s\S]*)\n\*\*\* End Patch$/);assert.ok(m);assert.ok(m[1].startsWith(out+'/'));fs.mkdirSync(path.dirname(m[1]),{recursive:true});fs.writeFileSync(m[1],m[2].split('\n').map(l=>l.slice(1)).join('\n'));return {};}
};
try{await b.send('Page.enable');await b.send('Network.enable');await b.send('Runtime.enable');await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:origin});await b.until('!!window.app && app.state.showModelMenu','empty boot');await b.click("[...document.querySelectorAll('button')].find(n=>n.textContent==='Import model (TMDL / BIM)')");await tools.mcp__t3_code__preview_upload({selector:'input[type=file][multiple]',paths:[path.join(root,'tests/acceptance-fixtures/pq-redesign/main-integration-e61726d/model.bim')]});await b.until('app.state.importReady','import');await b.click("[...document.querySelectorAll('button')].find(n=>n.textContent==='Add model')");await b.until('!app.state.showImport','committed');await b.send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});let source=fs.readFileSync(path.join(__dirname,'pq-redesign-independent-alignment-f905.t3.cjs'),'utf8').replace("transport:'T3 collaborative preview'","transport:'authorized fresh isolated Chrome CDP fallback'");
 const receipt=await eval(source)(tools,{root,out,tabId:'CDP',groups:process.env.PQ_GROUPS?.split(',')});verify();console.log(JSON.stringify(receipt,null,2));if(receipt.failures.length)process.exitCode=1;
}finally{fs.writeFileSync(path.join(out,'network.json'),JSON.stringify(b.events.filter(e=>/Network.requestWillBeSent|Runtime.exceptionThrown|Network.loadingFailed/.test(e.method)),null,2));await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
