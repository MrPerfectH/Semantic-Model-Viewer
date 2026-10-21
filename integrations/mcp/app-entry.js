import {App} from '@modelcontextprotocol/ext-apps';
// The viewer uses a fixed canvas, so document-flow auto sizing reports zero.
// Request a bounded workspace height explicitly through the MCP Apps protocol.
const host=new App({name:'Semantic Model Viewer',version:'0.2.0'},{},{autoResize:false});
async function sizeWorkspace(view={}){
  const height=Math.max(480,Math.min(1000,Number.isFinite(view.height)?view.height:900));
  await host.sendSizeChanged({height});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}
let session=null;
function output(result){if(result.isError)throw new Error(result.content?.find(c=>c.type==='text')?.text||'Viewer tool failed');return result.structuredContent;}
window.SMV_MCP_SYNC=async(receipt)=>{
  if(!session||receipt.currentView.width<320||receipt.currentView.height<320)return null;
  return output(await host.callServerTool({name:'smv_app_sync',arguments:{session,receipt}}));
};
window.SMV_SEND_CONTEXT=async()=>{
  const current=window.smv.inspect();
  if(!current.selection)throw new Error('Select a table, column, relationship or measure first.');
  await host.updateModelContext({content:[{type:'text',text:JSON.stringify({session,selection:current.selection,workspace:current.workspace,revision:current.revision,sourceRevision:current.sourceRevision})}]});
  return 'Shared '+(current.selection.table?current.selection.table+'['+current.selection.name+']':current.selection.name)+'. Ask your next question in chat.';
};
host.ontoolresult=async result=>{
  const data=result._meta?.viewer;if(!data)return;
  await window.smv.ready();
  await sizeWorkspace(data.view);
  if(session&&session!==data.session){document.querySelector('.smv-status').textContent='A different session was returned. Open a new view to keep this exploration.';return;}
  session=data.session;
  if(window.SMV_SOURCE_REVISION!==data.sourceRevision){
    window.app._applyModel(data.model,data.model.name,'mcp-'+session,{persist:false});window.SMV_SOURCE_REVISION=data.sourceRevision;
    await window.smv.loadView(data.view,data.revision);
  }else await window.smv.offer(data);
};
host.onhostcontextchanged=context=>window.SMVInteractive.appearance(context);
window.SMV_EXPAND_WORKSPACE=async()=>{
  const context=host.getHostContext();
  if(context?.availableDisplayModes?.includes('fullscreen')){
    const result=await host.requestDisplayMode({mode:'fullscreen'});
    if(result.mode!=='fullscreen')throw new Error('The host kept the viewer inline. Try expanding again when the agent is idle.');
    return 'Workspace expanded.';
  }
  else throw new Error('This host does not offer a fullscreen workspace. Save the offline view and open it in your browser.');
};
window.SMV_SAVE_OFFLINE=async()=>{
  const payload=window.Snapshots.capture(window.app),assets=await window.Snapshots.loadAssets(document);
  let html=window.Snapshots.buildHTML(assets.template,assets.sources,payload);
  const adapter=document.querySelector('[data-smv-explanation-adapter]').textContent;
  const view=JSON.stringify(window.smv.inspect().currentView).replace(/</g,'\\u003c');
  const boot='window.SMV_SOURCE_REVISION='+JSON.stringify(window.SMV_SOURCE_REVISION)+';SMVExplanation.start('+view+');';
  html=html.replace('</body>',()=>'<script data-smv-explanation-adapter>'+adapter.replace(/<\/script/gi,'<\\/script')+'</script><script>'+boot+'</script></body>');
  let upload,resource;
  for(let offset=0;offset<html.length;offset+=32768){
    const staged=output(await host.callServerTool({name:'smv_app_download',arguments:{...(upload?{upload}:{}),chunk:html.slice(offset,offset+32768),complete:offset+32768>=html.length}}));
    upload=staged.upload;resource=staged.resource;
  }
  const status=document.querySelector('.smv-action-status');if(status)status.textContent='Confirm the download in your chat app…';
  const response=await host.downloadFile({contents:[resource]});
  if(response.isError)throw new Error('Download was declined or is unsupported. Ask the agent to export an offline HTML view.');
  return 'Download requested: semantic-model-explanation.html. Open it in a browser to explore offline.';
};
host.connect().then(async()=>{window.SMVInteractive.appearance(host.getHostContext()||{});await sizeWorkspace();}).catch(error=>{const status=document.querySelector('.smv-status');if(status)status.textContent='Inline host connection unavailable: '+error.message;});
