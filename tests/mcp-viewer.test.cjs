'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {Client,InMemoryTransport}=require('@modelcontextprotocol/client');
const {createServer,URI}=require('../integrations/mcp/server.cjs');
const view=require('../examples/explanations/interactive-tables.json');
async function fixture(t,ui=false,root=path.resolve(__dirname,'..')){const {server,cleanup}=createServer({root}),[a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'viewer-test',version:'1'},{capabilities:ui?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});t.after(async()=>{await client.close();cleanup();});await Promise.all([server.connect(a),client.connect(b)]);return client;}
test('MCP controls the shared session path and refuses out-of-root models',async t=>{
  const client=await fixture(t);const listed=await client.listTools();assert.ok(listed.tools.some(t=>t.name==='smv_selection'));
  const inspected=await client.callTool({name:'smv_inspect',arguments:{model:'Models/demo/Contoso Retail.SemanticModel'}});assert.equal(inspected.structuredContent.name,'Contoso Retail');
  const denied=await client.callTool({name:'smv_inspect',arguments:{model:'../'}});assert.equal(denied.isError,true);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view}});assert.ok(!opened.isError,JSON.stringify(opened));assert.equal(opened.structuredContent.presentation.inline.available,false);
  const session=opened.structuredContent.session;
  const updated=await client.callTool({name:'smv_update',arguments:{session,revision:1,view:{version:2,tables:['Date']}}});assert.equal(updated.structuredContent.revision,2);
  const stopped=await client.callTool({name:'smv_stop',arguments:{session}});assert.equal(stopped.structuredContent.stopped,true);
});

test('open defaults are discoverable and sessions identify exact local sources',async t=>{
  const client=await fixture(t),listed=await client.listTools();
  const schema=listed.tools.find(tool=>tool.name==='smv_open').inputSchema;
  assert.equal(schema.properties.view.properties.version.default,2);
  assert.ok(!schema.required.includes('view'));
  const model='Models/demo/Contoso Retail.SemanticModel';
  for(const args of [{model},{model,view:{}}]){
    const opened=await client.callTool({name:'smv_open',arguments:args});
    assert.ok(!opened.isError,JSON.stringify(opened));
    const data=opened.structuredContent;
    assert.equal(data.provenance.kind,'local-files');
    assert.equal(data.provenance.publishedModelChecked,false);
    assert.equal(data.provenance.path,path.resolve(__dirname,'..',model));
    assert.equal(data.provenance.contentHash,data.sourceRevision);
    assert.equal(data.scope.root,path.resolve(__dirname,'..'));
    const status=await client.callTool({name:'smv_status',arguments:{session:data.session}});
    assert.equal(status.structuredContent.appliedView.version,2);
  }
  const sessions=await client.callTool({name:'smv_sessions',arguments:{}});
  assert.equal(sessions.structuredContent.sessions.length,2);
  for(const entry of sessions.structuredContent.sessions){
    const stopped=await client.callTool({name:'smv_stop',arguments:{session:entry.session}});
    assert.equal(stopped.structuredContent.stopped,true);
  }
  assert.equal((await client.callTool({name:'smv_sessions',arguments:{}})).structuredContent.sessions.length,0);
});

test('advertised inline support is separate from app acknowledgement and browser reachability',async t=>{
  const client=await fixture(t,true);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view}});
  assert.ok(!opened.isError,JSON.stringify(opened));
  const data=opened.structuredContent;
  assert.equal(data.presentation.preferred,'inline');
  assert.equal(data.presentation.inline.status,'advertised-unconfirmed');
  assert.equal(data.presentation.inline.viewerAcknowledged,false);
  const endpoint=new URL(data.presentation.live.url);endpoint.pathname='/client';
  const acknowledged=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'browser',revision:1,sourceRevision:data.sourceRevision,currentView:view,selection:null,workspace:'graph',explored:false})});
  assert.equal(acknowledged.status,200);
  const status=(await client.callTool({name:'smv_status',arguments:{session:data.session}})).structuredContent;
  assert.equal(status.presentation.live.reachability,'viewer-acknowledged');
  assert.equal(status.presentation.preferred,'browser');
  assert.equal(status.presentation.inline.viewerAcknowledged,false);
  await client.callTool({name:'smv_app_sync',arguments:{session:data.session,receipt:{clientId:'embedded',revision:1,sourceRevision:data.sourceRevision,currentView:view,selection:null,workspace:'graph',explored:false}}});
  const synced=(await client.callTool({name:'smv_status',arguments:{session:data.session}})).structuredContent;
  assert.equal(synced.presentation.inline.status,'viewer-acknowledged');
  assert.equal(synced.presentation.preferred,'inline');
});

test('default exports are gitignored, inspectable by receipt, and tied to a local snapshot',async t=>{
  const fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'smv-mcp-export-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  execFileSync('git',['init'],{cwd:root,stdio:'ignore'});
  fs.writeFileSync(path.join(root,'.gitignore'),'keep-original\n');
  const backup=path.join(root,'PMRA.SemanticModel_backup_20260602');fs.mkdirSync(backup);
  const source=path.join(backup,'model.bim');fs.copyFileSync(path.join(__dirname,'../examples/explanations/concept.bim'),source);
  const original=fs.readFileSync(source,'utf8'),client=await fixture(t,false,root);
  const opened=(await client.callTool({name:'smv_open',arguments:{model:path.relative(root,source)}})).structuredContent;
  assert.ok(opened.provenance.warnings.some(w=>w.code==='BACKUP_PATH'));
  const inspected=(await client.callTool({name:'smv_inspect',arguments:{model:path.relative(root,source)}})).structuredContent;
  assert.equal(inspected.provenance.path,source);
  assert.equal(inspected.provenance.publishedModelChecked,false);
  const response=await client.callTool({name:'smv_export',arguments:{session:opened.session,revision:1,basis:'authored'}});
  assert.ok(!response.isError,JSON.stringify(response));
  const exported=response.structuredContent,bytes=fs.readFileSync(exported.path);
  assert.equal(path.dirname(exported.path),path.join(root,'.smv-artifacts'));
  assert.equal(exported.artifact.bytes,bytes.length);
  assert.equal(exported.artifact.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(exported.artifact.mimeType,'text/html');
  assert.equal(exported.artifact.gitIgnoredByDefault,true);
  assert.equal(fs.readFileSync(path.join(root,'.gitignore'),'utf8'),'keep-original\n');
  execFileSync('git',['check-ignore',exported.path],{cwd:root});
  fs.writeFileSync(source,original.replace('concept','changed concept'));
  assert.notEqual(fs.readFileSync(source,'utf8'),original);
  const status=(await client.callTool({name:'smv_status',arguments:{session:opened.session}})).structuredContent;
  assert.equal(status.provenance.filesChangedSinceOpen,true);
  const stale=await client.callTool({name:'smv_export',arguments:{session:opened.session,revision:1,basis:'authored'}});
  assert.equal(stale.isError,true);
  assert.match(stale.content[0].text,/SOURCE_CHANGED/);
});

test('default export refuses a symlink before writing an ignore file outside the project',async t=>{
  const fs=require('node:fs'),os=require('node:os');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'smv-export-scope-'));
  const root=path.join(temporary,'project'),outside=path.join(temporary,'outside');fs.mkdirSync(root);fs.mkdirSync(outside);
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  fs.symlinkSync(outside,path.join(root,'.smv-artifacts'),'junction');
  fs.copyFileSync(path.join(__dirname,'../examples/explanations/concept.bim'),path.join(root,'model.bim'));
  const client=await fixture(t,false,root);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'model.bim'}});
  const exported=await client.callTool({name:'smv_export',arguments:{session:opened.structuredContent.session,revision:1,basis:'authored'}});
  assert.equal(exported.isError,true);
  assert.match(exported.content[0].text,/symlink/);
  assert.deepEqual(fs.readdirSync(outside),[]);
});
test('MCP Apps resource contains the actual viewer and bridge, without localhost dependency',async t=>{
  const client=await fixture(t,true);const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view}});
  assert.ok(!opened.isError,JSON.stringify(opened));assert.equal(opened.structuredContent.presentation.inline.available,true);assert.equal(opened._meta.viewer.model.name,'Contoso Retail');
  const resource=await client.readResource({uri:URI});assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');assert.match(resource.contents[0].text,/data-smv-asset="js\/canvas.js"/);assert.match(resource.contents[0].text,/smv_app_sync/);assert.doesNotMatch(resource.contents[0].text,/window.SMV_SESSION_URL=/);
  const session=opened.structuredContent.session;
  const sync=await client.callTool({name:'smv_app_sync',arguments:{session,receipt:{clientId:'embedded',revision:1,sourceRevision:opened.structuredContent.sourceRevision,currentView:view,selection:view.focus,workspace:'graph',explored:false}}});
  assert.equal(sync.structuredContent.view.focus.name,view.focus.name);
  const selection=await client.callTool({name:'smv_selection',arguments:{session}});assert.equal(selection.structuredContent.selection.name,view.focus.name);
});

test('installed-style stdio command negotiates UI capability and serves actual viewer resources',async t=>{
  const {StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
  const root=path.resolve(__dirname,'..');
  for(const ui of [false,true])await t.test(ui?'MCP Apps client':'tools-only client',async()=>{
    const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'bin/smv.cjs'),'mcp'],cwd:root,env:{...process.env,SMV_ROOT:root},stderr:'pipe'});
    const client=new Client({name:'stdio-integration-test',version:'1'},{capabilities:ui?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
    try{
      await client.connect(transport);
      const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='smv_open'&&tool._meta?.ui?.resourceUri===URI));
      const inspected=await client.callTool({name:'smv_inspect',arguments:{model:'Models/demo/Contoso Retail.SemanticModel'}});assert.equal(inspected.structuredContent.name,'Contoso Retail');
      const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view:require('../examples/explanations/sales-yoy-calculation.json')}});
      assert.ok(!opened.isError,JSON.stringify(opened.content));assert.equal(opened.structuredContent.presentation.inline.available,ui);
      const status=await client.callTool({name:'smv_status',arguments:{session:opened.structuredContent.session}});assert.equal(status.structuredContent.presentation.inline.available,ui,'status preserves negotiated UI capability');
      if(ui){
        assert.equal(opened._meta.viewer.view.focus.name,'Sales YoY');
        const resource=await client.readResource({uri:URI});assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');assert.match(resource.contents[0].text,/smv_app_sync/);
        assert.doesNotMatch(resource.contents[0].text,/window.SMV_SESSION_URL=/);
      }else assert.equal(opened._meta?.viewer,undefined);
      const stopped=await client.callTool({name:'smv_stop',arguments:{session:opened.structuredContent.session}});assert.equal(stopped.structuredContent.stopped,true);
    }finally{await client.close();}
  });
});

test('offline downloads cross the app bridge in bounded chunks and remain readable without a session',async t=>{
  const client=await fixture(t,true),html='<!doctype html><title>Offline viewer</title>'+('model metadata 😀 '.repeat(30000));
  let upload,resource;
  for(let offset=0;offset<html.length;offset+=32768){
    const args={...(upload?{upload}:{}),chunk:html.slice(offset,offset+32768),complete:offset+32768>=html.length};
    assert.ok(Buffer.byteLength(JSON.stringify(args))<262144);
    const response=await client.callTool({name:'smv_app_download',arguments:args});
    assert.ok(!response.isError,JSON.stringify(response.content));upload=response.structuredContent.upload;resource=response.structuredContent.resource;
  }
  assert.equal(resource.type,'resource_link');
  const read=await client.readResource({uri:resource.uri});assert.equal(read.contents[0].text,html);
  const overwrite=await client.callTool({name:'smv_app_download',arguments:{upload,chunk:'changed',complete:true}});assert.equal(overwrite.isError,true);
  const other=await fixture(t,true);await assert.rejects(other.readResource({uri:resource.uri}));
});
