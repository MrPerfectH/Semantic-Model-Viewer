'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRenameController}=require('../vscode-extension/src/rename');
function setup(overrides={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-native-rename-')),model=path.join(root,'Demo.SemanticModel');fs.mkdirSync(model);
 const calls=[],errors=[],messages=[],diffs=[],texts=new Map();let provider;
 const service={objects:()=>({objects:[{kind:'measure',table:'Sales',name:'Total'}],recovery:false}),preview:()=>({token:'private',changes:[{path:'Demo.SemanticModel/definition/model.tmdl',original:'before model',text:'after model'},{path:'Demo.Report/definition/visual.json',original:'before report',text:'after report'}],blockers:[],notice:'External consumers may need updates.'}),apply:(_t,{beforeApply})=>{beforeApply();calls.push('apply');},cancel:()=>calls.push('cancel'),dispose(){},recover:()=>calls.push('recover'),...overrides.service};
 const panel={current:{kind:'folder',uri:{scheme:'file',fsPath:model}},refresh:async()=>calls.push('refresh')};
 const vscode={workspace:{isTrusted:true,workspaceFolders:[{name:'Repo',uri:{scheme:'file',fsPath:root}}],textDocuments:[],registerTextDocumentContentProvider(_s,p){provider=p;return {dispose(){}};}},window:{showQuickPick:async items=>items[0],showInputBox:async()=> 'Revenue',showInformationMessage:async msg=>messages.push(msg),showErrorMessage:async msg=>errors.push(msg),showWarningMessage:async()=> 'Apply reviewed rename',withProgress:async(_o,fn)=>fn({}, {isCancellationRequested:false})},Uri:{parse:value=>({toString:()=>value})},commands:{executeCommand:async(cmd,before,after,title)=>{assert.equal(cmd,'vscode.diff');diffs.push({before:provider.provideTextDocumentContent(before),after:provider.provideTextDocumentContent(after),title});}},ProgressLocation:{Notification:15}};
 const controller=createRenameController(vscode,panel,{service});return {root,model,calls,errors,messages,diffs,texts,service,panel,vscode,controller,cleanup(){controller.dispose();fs.rmSync(root,{recursive:true,force:true});}};
}
test('native rename opens actual private diffs for model and reports then applies and refreshes',async()=>{
 const s=setup();try{await s.controller.run();assert.deepEqual(s.errors,[]);assert.equal(s.diffs.length,2);assert.equal(s.diffs[0].before,'before model');assert.equal(s.diffs[1].after,'after report');assert.deepEqual(s.calls,['apply','refresh']);}finally{s.cleanup();}
});
test('canceling final review performs no writes and invalidates preview',async()=>{
 const s=setup();s.vscode.window.showWarningMessage=async()=>undefined;try{await s.controller.run();assert.deepEqual(s.calls,['cancel']);}finally{s.cleanup();}
});
test('blockers prevent native apply and diff review',async()=>{
 const s=setup({service:{preview:()=>({token:null,changes:[],blockers:['Unknown report format']})}});try{await s.controller.run();assert.match(s.errors[0],/Unknown report format/);assert.equal(s.diffs.length,0);assert.equal(s.calls.length,0);}finally{s.cleanup();}
});
test('untrusted workspace, BIM and unsaved source are rejected',async()=>{
 for(const modify of [s=>s.vscode.workspace.isTrusted=false,s=>s.panel.current.kind='file',s=>s.vscode.workspace.textDocuments.push({isDirty:true,uri:{scheme:'file',fsPath:path.join(s.root,'Demo.Report/definition/visual.json')}})]){
 const s=setup();modify(s);try{await s.controller.run();assert.equal(s.errors.length,1);assert.equal(s.calls.length,0);assert.equal(s.diffs.length,0);}finally{s.cleanup();}}
});
test('unsaved documents arising during review prevent apply',async()=>{
 const s=setup();s.vscode.window.showWarningMessage=async()=>{s.vscode.workspace.textDocuments.push({isDirty:true,uri:{scheme:'file',fsPath:path.join(s.root,'draft.tmdl')}});return 'Apply reviewed rename';};try{await s.controller.run();assert.match(s.errors[0],/unsaved/);assert.deepEqual(s.calls,['cancel']);}finally{s.cleanup();}
});
test('switching models during review prevents apply',async()=>{
 const s=setup();s.vscode.window.showWarningMessage=async()=>{s.panel.current={...s.panel.current};return 'Apply reviewed rename';};try{await s.controller.run();assert.match(s.errors[0],/model changed/);assert.deepEqual(s.calls,['cancel']);}finally{s.cleanup();}
});
test('canceling progress cancels the private review token',async()=>{
 const s=setup();let checks=0;s.vscode.window.withProgress=async(_o,fn)=>fn({}, {get isCancellationRequested(){return checks++>0;}});try{await s.controller.run();assert.deepEqual(s.calls,['cancel']);assert.equal(s.diffs.length,0);}finally{s.cleanup();}
});
test('interrupted transaction offers restoration and never continues rename',async()=>{
 const s=setup({service:{objects:()=>({objects:[],recovery:true})}});s.vscode.window.showWarningMessage=async()=> 'Restore originals';try{await s.controller.run();assert.deepEqual(s.calls,['recover','refresh']);assert.equal(s.diffs.length,0);}finally{s.cleanup();}
});
test('persistent success notifications do not keep the rename controller busy',async()=>{const s=setup();let picks=0;s.vscode.window.showQuickPick=async items=>{picks++;return items[0];};s.vscode.window.showInformationMessage=()=>new Promise(()=>{});s.vscode.window.showWarningMessage=async(...args)=>{assert.equal(typeof args[1],'string','final approval must be nonmodal so native diffs remain inspectable');return 'Apply reviewed rename';};try{await Promise.race([s.controller.run(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('success notification held rename busy')),100))]);s.vscode.window.showInputBox=async()=>undefined;await s.controller.run();assert.equal(picks,2);assert.deepEqual(s.calls,['apply','refresh']);}finally{s.cleanup();}});
