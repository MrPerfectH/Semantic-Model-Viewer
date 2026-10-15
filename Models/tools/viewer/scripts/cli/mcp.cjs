'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/server');
const {StdioServerTransport}=require('@modelcontextprotocol/server/stdio');
const {z}=require('zod');
const {registerAppTool,registerAppResource,getUiCapability,RESOURCE_MIME_TYPE}=require('@modelcontextprotocol/ext-apps/server');
const sessions=require('./session.cjs'),explain=require('./explain.cjs');
const URI='ui://smv/viewer.html';
function createServer(options={}){
  const server=new McpServer({name:'semantic-model-viewer',version:'0.2.0'});
  const root=fs.realpathSync(options.root||process.env.SMV_ROOT||process.cwd()),directory=fs.mkdtempSync(path.join(os.tmpdir(),'smv-mcp-')),registry=new Map();
  function local(file,exists=true){const candidate=path.resolve(root,file),p=exists?fs.realpathSync(candidate):path.join(fs.realpathSync(path.dirname(candidate)),path.basename(candidate));if(p!==root&&!p.startsWith(root+path.sep))throw new Error('Path is outside SMV_ROOT');return p;}
  function file(id){if(!registry.has(id))throw new Error('Unknown session ID for this MCP connection');return registry.get(id);}
  const result=(data,meta)=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(meta?{_meta:meta}:{})});
  const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:e.code||'VIEWER_ERROR',message:e.message,details:e.details||{}}})}]};}};
  const id=z.string(),view=z.record(z.string(),z.unknown());
  server.registerTool('smv_inspect',{description:'Inspect actual model metadata. Does not execute queries.',inputSchema:z.object({model:z.string()})},safe(async({model})=>{const {runtime,readModel}=require('./model.cjs'),context=runtime();return result(context.Snapshots.modelData(readModel(context,local(model)).model));}));
  registerAppTool(server,'smv_open',{description:'Open a real focused viewer. Use returned local URL in a reachable browser or export artifacts. Inline UI requires MCP Apps support.',inputSchema:z.object({model:z.string(),view}),_meta:{ui:{resourceUri:URI}}},safe(async(args)=>{
    const model=local(args.model),p=explain.prepare(model,args.view),session=crypto.randomUUID(),stateFile=path.join(directory,session+'.json'),viewFile=path.join(directory,session+'-view.json');fs.writeFileSync(viewFile,JSON.stringify(args.view));
    const state=await sessions.serve(model,{view:viewFile,session:stateFile});registry.set(session,{stateFile,close:state.close});
    const supportsUI=getUiCapability(server.server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE)||false;
    return result({session,revision:state.revision,sourceRevision:state.sourceRevision,presentation:{...state.presentation,inline:{available:supportsUI,resourceUri:supportsUI?URI:null}},containsFullMetadata:true},supportsUI?{viewer:{session,revision:state.revision,sourceRevision:p.hash,view:p.view,model:JSON.parse(JSON.stringify(p.model))}}:undefined);
  }));
  server.registerTool('smv_status',{description:'Read requested and acknowledged revisions for a session.',inputSchema:z.object({session:id})},safe(async({session})=>result(await sessions.request(file(session).stateFile,'status'))));
  server.registerTool('smv_update',{description:'Request an atomic viewer update. Await viewer acknowledgement; users may keep exploring.',inputSchema:z.object({session:id,revision:z.number().int().positive(),view})},safe(async({session,revision,view})=>result(await sessions.request(file(session).stateFile,'update',{expectedRevision:revision,view}))));
  server.registerTool('smv_selection',{description:'Read the qualified current user selection from one acknowledged viewer tab.',inputSchema:z.object({session:id,clientId:id.optional()})},safe(async({session,clientId})=>result(await sessions.request(file(session).stateFile,'selection',{clientId}))));
  server.registerTool('smv_export',{description:'Save a standalone actual viewer HTML or PNG from authored or acknowledged explored state. Output must be inside SMV_ROOT.',inputSchema:z.object({session:id,revision:z.number().int().positive(),basis:z.enum(['authored','current']),out:z.string(),clientId:id.optional()})},safe(async({session,revision,basis,out,clientId})=>{
    const exported=await sessions.exportSession(file(session).stateFile,{revision,basis,out:local(out,false),clientId});
    const response=result(exported);if(path.extname(exported.path)==='.png')response.content.push({type:'image',mimeType:'image/png',data:fs.readFileSync(exported.path).toString('base64')});return response;
  }));
  server.registerTool('smv_stop',{description:'Stop a viewer session owned by this MCP connection.',inputSchema:z.object({session:id})},safe(async({session})=>{const owned=file(session);owned.close();registry.delete(session);return result({stopped:true,session});}));
  registerAppTool(server,'smv_app_sync',{description:'Synchronize embedded real-viewer state without localhost access.',inputSchema:z.object({session:id,receipt:view}),_meta:{ui:{visibility:['app']}}},safe(async({session,receipt})=>{const owned=file(session);await sessions.request(owned.stateFile,'client',receipt);return result(await sessions.request(owned.stateFile,'view'));}));
  registerAppResource(server,'semantic-viewer',URI,{description:'Actual Semantic Model Viewer with MCP Apps bridge'},async()=>{
    const p=explain.prepare(path.resolve(__dirname,'../../../../../examples/explanations/concept.bim'),{version:2,chrome:false});
    const bridge=fs.readFileSync(path.join(__dirname,'mcp-app.bundle.js'),'utf8').replace(/<\/script/gi,'<\\/script');
    return {contents:[{uri:URI,mimeType:RESOURCE_MIME_TYPE,text:p.html.replace('</body>',()=>'<script>'+bridge+'</script></body>'),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]},prefersBorder:true}}}]};
  });
  function cleanup(){for(const entry of registry.values())entry.close();registry.clear();fs.rmSync(directory,{recursive:true,force:true});}
  server.server.onclose=cleanup;
  return {server,cleanup};
}
async function start(){const {server}=createServer();await server.connect(new StdioServerTransport());}
module.exports={createServer,start,URI};
