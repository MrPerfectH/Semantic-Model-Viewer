/* Native reference-aware rename review. Source and tokens never enter the webview. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
function inside(root, candidate) {const rel=path.relative(root,candidate);return rel!== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);}
function createRenameController(vscode, panel, options={}) {
  let service, providerRegistration; const documents=new Map(); let busy=false;
  const getService=()=>service||(service=options.service||require('../rename/service.cjs').createService({modelPlanner:require('../media/js/model-rename.js')}));
  function assertClean(root) {
    if((vscode.workspace.textDocuments||[]).some(d=>d.isDirty && d.uri.scheme==='file' && inside(root,d.uri.fsPath))) throw new Error('Save or revert unsaved repository documents before renaming.');
  }
  async function run() {
    if(busy) {await vscode.window.showInformationMessage('A rename review is already open.');return;}
    let token; busy=true;
    try {
      if(!vscode.workspace.isTrusted) throw new Error('Trust this workspace before changing repository files.');
      const entry=panel.current;
      if(!entry || entry.kind!=='folder' || entry.uri.scheme!=='file') throw new Error('Open a local TMDL semantic model first. BIM and remote models are not supported for renaming.');
      const modelPath=fs.realpathSync(entry.uri.fsPath);
      const folders=(vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file' && inside(f.uri.fsPath,modelPath) && path.resolve(f.uri.fsPath)!==modelPath);
      if(!folders.length) throw new Error('Open the repository folder containing the semantic model and sibling reports as a workspace.');
      let folder=folders[0];
      if(folders.length>1) {const choice=await vscode.window.showQuickPick(folders.map(f=>({label:f.name||f.uri.fsPath,description:f.uri.fsPath,folder:f})),{placeHolder:'Repository scope containing model and reports'});if(!choice)return;folder=choice.folder;}
      const root=fs.realpathSync(folder.uri.fsPath); assertClean(root);
      const initial=getService().objects(root,modelPath);
      if(initial.recovery) {
        const answer=await vscode.window.showWarningMessage('An interrupted rename needs recovery before another rename. Restore the original files?',{modal:true},'Restore originals');
        if(answer==='Restore originals') {getService().recover(root);await panel.refresh();await vscode.window.showInformationMessage('Original files restored. Start rename again.');} return;
      }
      const objects=Array.isArray(initial)?initial:initial.objects;
      const object=await vscode.window.showQuickPick(objects.map(o=>({label:o.name,description:o.kind+(o.table?' · '+o.table:''),object:o})),{placeHolder:'Object to rename — updates model and repository reports',matchOnDescription:true});
      if(!object)return;
      const newName=await vscode.window.showInputBox({title:'Rename '+object.object.kind+' '+object.object.name,prompt:'New name; source changes require diff review before saving',value:object.object.name,validateInput:value=>!value.trim()?'Enter a nonempty name':/[\r\n\x00-\x1f]/.test(value)?'Control characters are not allowed':undefined});
      if(newName===undefined)return;
      assertClean(root);
      const progress=vscode.window.withProgress||((_o,fn)=>fn({}, {isCancellationRequested:false}));
      const preview=await progress.call(vscode.window,{location:vscode.ProgressLocation?.Notification,title:'Analyzing model and report references',cancellable:true},async(_p,cancellation)=>{
        await new Promise(resolve=>setImmediate(resolve));
        if(cancellation.isCancellationRequested)return null;
        const result=getService().preview(root,modelPath,{...object.object,newName});
        await new Promise(resolve=>setImmediate(resolve));
        if(cancellation.isCancellationRequested){getService().cancel(result.token);return null;} return result;
      });
      if(!preview)return; token=preview.token;
      if(preview.blockers.length) {await vscode.window.showErrorMessage('Rename blocked: '+preview.blockers.join('\n'),{modal:true});return;}
      if(!preview.changes.length) {await vscode.window.showInformationMessage('No source changes found.');return;}
      if(!providerRegistration) providerRegistration=vscode.workspace.registerTextDocumentContentProvider('smv-rename',{provideTextDocumentContent:uri=>documents.get(uri.toString())||''});
      // Keep native diff snapshots bounded across repeated reviews.
      if(documents.size>256)documents.clear();
      const review=crypto.randomUUID();
      for(let i=0;i<preview.changes.length;i++) {
        const change=preview.changes[i], before=vscode.Uri.parse('smv-rename:/'+review+'/'+i+'/before'+path.extname(change.path)),after=vscode.Uri.parse('smv-rename:/'+review+'/'+i+'/after'+path.extname(change.path));
        documents.set(before.toString(),change.original);documents.set(after.toString(),change.text);
        await vscode.commands.executeCommand('vscode.diff',before,after,'Rename review: '+change.path,{preview:false});
      }
      const answer=await vscode.window.showWarningMessage('Review all '+preview.changes.length+' file diffs before applying. '+preview.notice,{modal:true},'Apply reviewed rename');
      if(answer!=='Apply reviewed rename')return;
      assertClean(root);
      if(panel.current!==entry)throw new Error('The open model changed. Start a new rename review.');
      getService().apply(token,{beforeApply:()=>assertClean(root)});token=null;
      await panel.refresh();
      await vscode.window.showInformationMessage('Renamed '+object.object.name+' to '+newName+' in '+preview.changes.length+' source files.');
    } catch(error) {await vscode.window.showErrorMessage('Semantic Model Viewer rename: '+error.message);} finally {if(token)getService().cancel(token);busy=false;}
  }
  return {run,dispose(){documents.clear();providerRegistration?.dispose();service?.dispose();}};
}
module.exports={createRenameController};
