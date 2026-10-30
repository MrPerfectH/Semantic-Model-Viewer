'use strict';
const assert=require('node:assert/strict');
async function run(){
 const vscode=require('vscode');
 const extension=vscode.extensions.getExtension('MrPerfectH.semantic-model-viewer');assert.ok(extension);
 const {agentTools,cli}=await extension.activate();assert.ok(agentTools,'Native model tools must be registered by the real extension host');
 if(process.env.SMV_TEST_CLI_REQUIRED==='1')assert.ok(cli.available,'Release extension must include the CLI');
 if(cli.available){
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'smv terminal host ')),output=path.join(folder,'version.txt');
  let terminal,listener,timer;
  try{
   const closed=new Promise((resolve,reject)=>{
    listener=vscode.window.onDidCloseTerminal(t=>{if(t===terminal){clearTimeout(timer);resolve(t.exitStatus);}});
    timer=setTimeout(()=>reject(new Error('Bundled CLI terminal did not exit')),15000);
   });
   terminal=vscode.window.createTerminal({name:'SMV bundled CLI acceptance',shellPath:'/bin/sh',shellArgs:['-c',"smv --version > '"+output.replace(/'/g,"'\\''")+"'"],env:{PATH:''}});
   const exit=await closed;assert.equal(exit.code,0,'New terminals must find bundled smv without system Node');
   const info=JSON.parse(fs.readFileSync(path.join(cli.root,'build-info.json'),'utf8'));
   assert.equal(fs.readFileSync(output,'utf8').trim(),info.engineVersion);
   console.log('SMV host: integrated terminal CLI passed without Node on PATH');
  }finally{clearTimeout(timer);if(listener)listener.dispose();if(terminal)terminal.dispose();fs.rmSync(folder,{recursive:true,force:true});}
 }
 console.log('SMV host: discover');
 const discovered=await agentTools.run('discover');assert.equal(discovered.models.length,1);
 const input={model:discovered.models[0].id,table:'Sales',related:true,dependents:true};
 console.log('SMV host: show');
 let result=await agentTools.run('show',input);console.log('SMV host: opened '+JSON.stringify(result.views));assert.equal(result.views.length,2);
 const deadline=Date.now()+25000;let statuses=agentTools.status();
 console.log('SMV host groups '+JSON.stringify(vscode.window.tabGroups.all.map(g=>({column:g.viewColumn,tabs:g.tabs.map(t=>t.label)}))));
 while(statuses.some(view=>view.status==='awaiting-viewer')&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));statuses=agentTools.status();}
 assert.ok(statuses.every(view=>view.status==='applied'),JSON.stringify({statuses,groups:vscode.window.tabGroups.all.map(g=>({column:g.viewColumn,tabs:g.tabs.map(t=>({label:t.label,active:t.isActive}))}))}));
 console.log('SMV host rendered '+JSON.stringify(statuses));
 assert.equal(statuses[0].rendered.workspace,'graph');assert.equal(statuses[1].rendered.workspace,'measures');
 assert.ok(statuses[0].rendered.summary.tableCanvasTables>0);assert.ok(statuses[1].rendered.summary.measureGraphNodes>0);
 assert.ok(statuses.every(view=>view.rendered.width>0&&view.rendered.height>0&&view.rendered.visibility==='visible'),'Acknowledgements must come from visible, sized panes');
 result=await agentTools.run('show',input);
 assert.ok(result.views.every(view=>view.reused),'Reading acknowledgement must preserve existing exploration');
 const locations=result.views.map(view=>vscode.window.tabGroups.all.find(group=>group.tabs.some(tab=>tab.label===view.label)));
 assert.ok(locations.every(Boolean),'Both diagrams must be visible editor tabs');assert.notEqual(locations[0].viewColumn,locations[1].viewColumn,'Diagrams must occupy adjacent groups');
 const compareInput={model:discovered.models[0].id,measure:'Total Sales',with:'Sales LY'};
 const comparison=await agentTools.run('compare',compareInput);assert.equal(comparison.views.length,1);
 const compareDeadline=Date.now()+25000;let compareStatuses=agentTools.status();
 while(compareStatuses.some(view=>view.status==='awaiting-viewer')&&Date.now()<compareDeadline){await new Promise(resolve=>setTimeout(resolve,250));compareStatuses=agentTools.status();}
 assert.ok(compareStatuses.every(view=>view.status==='applied'),JSON.stringify(compareStatuses));
 const compareAgain=await agentTools.run('compare',compareInput);assert.ok(compareAgain.views.every(view=>view.reused&&view.status==='applied'));
 const source=vscode.Uri.joinPath(vscode.Uri.parse(discovered.models[0].source),'definition','model.tmdl');
 const original=await vscode.workspace.fs.readFile(source);await vscode.workspace.fs.writeFile(source,Buffer.concat([Buffer.from(original),Buffer.from('\n// host acceptance refresh\n')]));
 const refreshed=await agentTools.run('show',input);assert.ok(refreshed.views.every(view=>!view.reused));
 const refreshDeadline=Date.now()+25000;let current=agentTools.status();
 while(current.some(view=>view.status==='awaiting-viewer')&&Date.now()<refreshDeadline){await new Promise(resolve=>setTimeout(resolve,250));current=agentTools.status();}
 assert.ok(current.every(view=>view.status==='applied'),JSON.stringify(current));

 const relations=await agentTools.run('relations',input);assert.ok(relations.counts.total>0);
 const dependents=await agentTools.run('dependents',input);assert.ok(dependents.counts.total>0);
 console.log(JSON.stringify({passed:true,host:'vscode',vscodeVersion:vscode.version,nodeVersion:process.version,views:result.views.map(view=>({label:view.label,status:view.status,summary:view.summary}))}));
 agentTools.dispose();
}
module.exports={run};
