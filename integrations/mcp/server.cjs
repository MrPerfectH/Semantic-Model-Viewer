'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/server');
const {StdioServerTransport}=require('@modelcontextprotocol/server/stdio');
const {z}=require('zod');
const {registerAppTool,registerAppResource,getUiCapability,RESOURCE_MIME_TYPE}=require('@modelcontextprotocol/ext-apps/server');
const sessions=require('../../Models/tools/viewer/scripts/cli/session.cjs'),explain=require('../../Models/tools/viewer/scripts/cli/explain.cjs');
const contracts=require('./contracts.cjs');
const URI='ui://smv/viewer.html';
function createServer(options={}){
  const server=new McpServer({name:'semantic-model-viewer',version:'0.2.1'});
  const root=fs.realpathSync(options.root||process.env.SMV_ROOT||process.cwd()),directory=fs.mkdtempSync(path.join(os.tmpdir(),'smv-mcp-')),registry=new Map();
  function local(file,exists=true){const candidate=path.resolve(root,file),p=exists?fs.realpathSync(candidate):path.join(fs.realpathSync(path.dirname(candidate)),path.basename(candidate));if(p!==root&&!p.startsWith(root+path.sep))throw new Error('Path is outside SMV_ROOT');return p;}
  function file(id){if(!registry.has(id))throw new Error('Unknown session ID for this MCP connection');return registry.get(id);}
  const result=(data,meta)=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(meta?{_meta:meta}:{})});
  const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:e.code||'VIEWER_ERROR',message:e.message,details:e.details||{}}})}]};}};
  const id=z.string(),view=contracts.view,receipt=z.record(z.string(),z.unknown());
  const supportsUI=()=>getUiCapability(server.server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE)||false;
  const scope=()=>contracts.scope(root);
  async function status(session){const entry=file(session),state=await sessions.request(entry.stateFile,'status');return {...state,session,scope:scope(),provenance:{...entry.provenance,filesChangedSinceOpen:sessions.fingerprint(entry.model)!==entry.sourceFingerprint},presentation:contracts.presentation(state,supportsUI(),entry)};}
  server.registerTool('smv_sessions',{description:'List sessions owned by this MCP connection, exact local source paths, SMV_ROOT and the default gitignored export directory. Use smv_stop for sessions no longer needed.',inputSchema:z.object({})},safe(async()=>result({scope:scope(),sessions:await Promise.all([...registry.keys()].map(async session=>{try{return await status(session);}catch(error){return {session,error:error.message};}}))})));
  server.registerTool('smv_inspect',{description:'Inspect local model metadata and exact source provenance. This reads local TMDL/BIM files, not a published Power BI model, and does not execute queries.',inputSchema:z.object({model:z.string()})},safe(async({model})=>{
    const source=local(model),{runtime,readModel}=require('../../Models/tools/viewer/scripts/cli/model.cjs'),context=runtime(),data=context.Snapshots.modelData(readModel(context,source).model);
    return result({...data,scope:scope(),provenance:contracts.provenance(source,data.name,crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'))});
  }));
  registerAppTool(server,'smv_open',{description:'Open a local TMDL/BIM snapshot in the actual viewer. Omit view or pass {} for the default version 2 graph. Inline support is advertised, not proof of a visible chat view. Reuse the returned session URL or export if inline does not appear. Inspect provenance for the exact source and backup warnings.',inputSchema:z.object({model:z.string(),view:view.optional().default({version:2})}),_meta:{ui:{resourceUri:URI}}},safe(async(args)=>{
    const model=local(args.model),p=explain.prepare(model,args.view),session=crypto.randomUUID(),stateFile=path.join(directory,session+'.json'),viewFile=path.join(directory,session+'-view.json');fs.writeFileSync(viewFile,JSON.stringify(args.view));
    const state=await sessions.serve(model,{view:viewFile,session:stateFile});
    if(state.sourceRevision!==p.hash){state.close();throw Object.assign(new Error('Model changed while opening; retry with stable local files'),{code:'SOURCE_CHANGED'});}
    const entry={stateFile,close:state.close,model,sourceFingerprint:sessions.fingerprint(model),provenance:contracts.provenance(model,p.model.name,state.sourceRevision),inlineClients:new Set(),inlineAcknowledgedAt:null};registry.set(session,entry);
    const advertised=supportsUI();
    return result({session,revision:state.revision,sourceRevision:state.sourceRevision,view:p.view,scope:scope(),provenance:entry.provenance,presentation:contracts.presentation(state,advertised,entry),containsFullMetadata:true},advertised?{viewer:{session,revision:state.revision,sourceRevision:p.hash,view:p.view,model:JSON.parse(JSON.stringify(p.model))}}:undefined);
  }));
  server.registerTool('smv_status',{description:'Read revisions, exact local source freshness, scope, browser acknowledgement and inline-advertisement/initialization state. No result proves the user can see an inline chat view.',inputSchema:z.object({session:id})},safe(async({session})=>result(await status(session))));
  server.registerTool('smv_update',{description:'Request an atomic viewer update. Await viewer acknowledgement; users may keep exploring.',inputSchema:z.object({session:id,revision:z.number().int().positive(),view})},safe(async({session,revision,view})=>result(await sessions.request(file(session).stateFile,'update',{expectedRevision:revision,view}))));
  server.registerTool('smv_selection',{description:'Read the qualified current user selection from one acknowledged viewer tab.',inputSchema:z.object({session:id,clientId:id.optional()})},safe(async({session,clientId})=>result(await sessions.request(file(session).stateFile,'selection',{clientId}))));
  server.registerTool('smv_export',{description:'Save a standalone viewer HTML or PNG. Omit out for a unique file under the self-ignored .smv-artifacts folder inside SMV_ROOT; explicit out must remain inside that root and its parent must exist. Returns a small receipt with path, byte size and SHA-256, not the HTML body. Use native file attachments or links; do not bypass host publication requirements.',inputSchema:z.object({session:id,revision:z.number().int().positive(),basis:z.enum(['authored','current']),out:z.string().optional(),format:z.enum(['html','png']).default('html').describe('Extension for a default output path; explicit out determines its own format.'),clientId:id.optional()})},safe(async({session,revision,basis,out,format,clientId})=>{
    const entry=file(session),target=out===undefined?contracts.defaultExport(root,session,revision,format):local(out,false);
    const exported=await sessions.exportSession(entry.stateFile,{revision,basis,out:target,clientId});
    const response=result({...exported,scope:scope(),provenance:entry.provenance,artifact:contracts.artifact(exported.path,out===undefined)});if(path.extname(exported.path)==='.png')response.content.push({type:'image',mimeType:'image/png',data:fs.readFileSync(exported.path).toString('base64')});return response;
  }));
  server.registerTool('smv_stop',{description:'Stop a viewer session owned by this MCP connection.',inputSchema:z.object({session:id})},safe(async({session})=>{const owned=file(session);owned.close();registry.delete(session);return result({stopped:true,session});}));
  registerAppTool(server,'smv_app_sync',{description:'Synchronize embedded real-viewer state without localhost access. A successful receipt acknowledges app initialization, not user visibility.',inputSchema:z.object({session:id,receipt}),_meta:{ui:{visibility:['app']}}},safe(async({session,receipt})=>{const owned=file(session);await sessions.request(owned.stateFile,'client',receipt);owned.inlineClients.add(receipt.clientId);owned.inlineAcknowledgedAt=new Date().toISOString();return result(await sessions.request(owned.stateFile,'view'));}));
  registerAppResource(server,'semantic-viewer',URI,{description:'Actual Semantic Model Viewer with MCP Apps bridge'},async()=>{
    const p=explain.prepare(path.resolve(__dirname,'../../examples/explanations/concept.bim'),{version:2,chrome:false});
    const bridge=fs.readFileSync(path.join(__dirname,'app.bundle.js'),'utf8').replace(/<\/script/gi,'<\\/script');
    return {contents:[{uri:URI,mimeType:RESOURCE_MIME_TYPE,text:p.html.replace('</body>',()=>'<script>'+bridge+'</script></body>'),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]},prefersBorder:true}}}]};
  });
  function cleanup(){for(const entry of registry.values())entry.close();registry.clear();fs.rmSync(directory,{recursive:true,force:true});}
  server.server.onclose=cleanup;
  return {server,cleanup};
}
async function start(){const {server}=createServer();await server.connect(new StdioServerTransport());}
module.exports={createServer,start,URI};
