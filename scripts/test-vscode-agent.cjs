'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),ext=path.join(root,'vscode-extension');
const {runTests}=require(path.join(ext,'node_modules/@vscode/test-electron'));
(async()=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'smv vscode host '));
 fs.cpSync(path.join(root,'Models/demo/Contoso Retail.SemanticModel'),path.join(workspace,'Demo.SemanticModel'),{recursive:true});
 try{await runTests({version:process.env.SMV_VSCODE_VERSION||'1.101.0',extensionDevelopmentPath:ext,extensionTestsPath:path.join(root,'tests/vscode-agent-host.cjs'),launchArgs:[workspace,'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--no-sandbox'],extensionTestsEnv:{SMV_AGENT_HOST_TEST:'1'}});}
 finally{fs.rmSync(workspace,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
