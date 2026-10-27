'use strict';
const assert=require('node:assert/strict');
async function run(){
 const vscode=require('vscode');
 const extension=vscode.extensions.getExtension('MrPerfectH.semantic-model-viewer');assert.ok(extension);
 const {agentTools}=await extension.activate();assert.ok(agentTools,'Native model tools must be registered by the real extension host');
 console.log('SMV host: discover');
 const discovered=await agentTools.run('discover');assert.equal(discovered.models.length,1);
 const input={model:discovered.models[0].id,table:'Sales',related:true,dependents:true};
 console.log('SMV host: show');
 let result=await agentTools.run('show',input);console.log('SMV host: opened '+JSON.stringify(result.views));assert.equal(result.views.length,2);
 const deadline=Date.now()+25000;let statuses=agentTools.status();
 console.log('SMV host groups '+JSON.stringify(vscode.window.tabGroups.all.map(g=>({column:g.viewColumn,tabs:g.tabs.map(t=>t.label)}))));
 while(statuses.some(view=>view.status==='awaiting-viewer')&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));statuses=agentTools.status();}
 assert.ok(statuses.every(view=>view.status==='applied'),JSON.stringify(statuses));
 result=await agentTools.run('show',input);
 assert.ok(result.views.every(view=>view.reused),'Reading acknowledgement must preserve existing exploration');
 const locations=result.views.map(view=>vscode.window.tabGroups.all.find(group=>group.tabs.some(tab=>tab.label===view.label)));
 assert.ok(locations.every(Boolean),'Both diagrams must be visible editor tabs');assert.notEqual(locations[0].viewColumn,locations[1].viewColumn,'Diagrams must occupy adjacent groups');
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
