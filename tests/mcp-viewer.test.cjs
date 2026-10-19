'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {Client,InMemoryTransport}=require('@modelcontextprotocol/client');
const {createServer,URI}=require('../integrations/mcp/server.cjs');
const view=require('../examples/explanations/interactive-tables.json');
async function fixture(t,ui=false){const {server,cleanup}=createServer({root:path.resolve(__dirname,'..')}),[a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'viewer-test',version:'1'},{capabilities:ui?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});t.after(async()=>{await client.close();cleanup();});await Promise.all([server.connect(a),client.connect(b)]);return client;}
test('MCP controls the shared session path and refuses out-of-root models',async t=>{
  const client=await fixture(t);const listed=await client.listTools();assert.ok(listed.tools.some(t=>t.name==='smv_selection'));
  const inspected=await client.callTool({name:'smv_inspect',arguments:{model:'Models/demo/Contoso Retail.SemanticModel'}});assert.equal(inspected.structuredContent.name,'Contoso Retail');
  const denied=await client.callTool({name:'smv_inspect',arguments:{model:'../'}});assert.equal(denied.isError,true);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view}});assert.ok(!opened.isError,JSON.stringify(opened));assert.equal(opened.structuredContent.presentation.inline.available,false);
  const session=opened.structuredContent.session;
  const updated=await client.callTool({name:'smv_update',arguments:{session,revision:1,view:{version:2,tables:['Date']}}});assert.equal(updated.structuredContent.revision,2);
  const stopped=await client.callTool({name:'smv_stop',arguments:{session}});assert.equal(stopped.structuredContent.stopped,true);
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
      if(ui){
        assert.equal(opened._meta.viewer.view.focus.name,'Sales YoY');
        const resource=await client.readResource({uri:URI});assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');assert.match(resource.contents[0].text,/smv_app_sync/);
        assert.doesNotMatch(resource.contents[0].text,/window.SMV_SESSION_URL=/);
      }else assert.equal(opened._meta?.viewer,undefined);
      const stopped=await client.callTool({name:'smv_stop',arguments:{session:opened.structuredContent.session}});assert.equal(stopped.structuredContent.stopped,true);
    }finally{await client.close();}
  });
});
