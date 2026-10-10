'use strict';
// CDP transport only. Fresh isolated profile; authorized fallback after recorded T3 interaction failure.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
async function open(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pq-independent-d3d8360-'));
 const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Chrome launch timeout')),15000);child.stderr.on('data',b=>{s+=b;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('error',reject);});
 const targets=await(await fetch('http://127.0.0.1:'+new URL(endpoint).port+'/json/list')).json();
 const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let seq=0;const pending=new Map(),events=[];
 socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(!r.id){events.push(r);return;}const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async(expression,label)=>{const start=Date.now();while(Date.now()-start<15000){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out '+label);};
 const click=async expression=>{
   await evaluate('document.fonts.ready');await settle();
   const b=await evaluate(`(()=>{const e=(${expression});if(!e)throw Error('Missing click target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
   if(b.w<=0||b.h<=0)throw Error('Hidden click target');await send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x,y:b.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x,y:b.y,button:'left',clickCount:1});
 };
 const key=async(key,code=key,modifiers=0)=>{const vk={Enter:13,Tab:9,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35}[key]||0;await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});};
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 async function close(){socket.close();for(const p of pending.values())clearTimeout(p.timer);child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});}
 return {send,evaluate,until,click,key,settle,events,close};
}
module.exports={open};
