import {App} from '@modelcontextprotocol/ext-apps';
const host=new App({name:'Semantic Model Viewer',version:'0.2.0'},{});
let session=null;
function output(result){if(result.isError)throw new Error(result.content?.find(c=>c.type==='text')?.text||'Viewer tool failed');return result.structuredContent;}
window.SMV_MCP_SYNC=async(receipt)=>{
  if(!session)return null;
  return output(await host.callServerTool({name:'smv_app_sync',arguments:{session,receipt}}));
};
window.SMV_SEND_CONTEXT=async()=>{
  const current=window.smv.inspect();
  await host.updateModelContext({content:[{type:'text',text:JSON.stringify({session,selection:current.selection,workspace:current.workspace,revision:current.revision,sourceRevision:current.sourceRevision})}]});
};
host.ontoolresult=async result=>{
  const data=result._meta?.viewer;if(!data)return;
  await window.smv.ready();
  if(session&&session!==data.session){document.querySelector('.smv-status').textContent='A different session was returned. Open a new view to keep this exploration.';return;}
  session=data.session;
  if(window.SMV_SOURCE_REVISION!==data.sourceRevision){
    window.app._applyModel(data.model,data.model.name,'mcp-'+session,{persist:false});window.SMV_SOURCE_REVISION=data.sourceRevision;
    await window.smv.loadView(data.view,data.revision);
  }else await window.smv.offer(data);
};
host.onhostcontextchanged=context=>{if(context.theme&&window.app?.theme)window.app.theme.set(context.theme);};
host.connect().catch(error=>{const status=document.querySelector('.smv-status');if(status)status.textContent='Inline host connection unavailable: '+error.message;});
