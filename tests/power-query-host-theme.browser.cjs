// Native VS Code injects this global code rule before the viewer stylesheet.
// Exercise the real cascade with both host themes, including a late-injected rule.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const chrome=[process.env.CHROME_PATH,'/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(p=>fs.existsSync(p));
async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-snapshot-'));
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + output)), 15000);
    child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome exited during startup: ' + code + ' ' + output)); });
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  let id = 0; const waiting = new Map(); const downloads = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!data.id) {
    if (data.method === 'Browser.downloadWillBegin') downloads.set(data.params.guid, {...data.params,state:'inProgress'});
    if (data.method === 'Browser.downloadProgress') downloads.set(data.params.guid, {...downloads.get(data.params.guid),...data.params});
    return;
  } const promise = waiting.get(data.id); if (!promise) return; waiting.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; waiting.set(seq, {resolve,reject}); socket.send(JSON.stringify({id:seq,method,params})); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception)); return result.result.value; };
  return { send, evaluate, downloads, async close() { socket.close(); child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); fs.rmSync(profile, {recursive:true,force:true}); } };
}
test('Power Query source lines keep their reader background under VS Code host themes',{skip:!chrome&&'Chrome unavailable'},async t=>{
 const b=await openBrowser();t.after(()=>b.close());
 const css=fs.readFileSync(process.env.PQ_HOST_CSS||path.join(__dirname,'../Models/tools/viewer/power-query-inspector.css'),'utf8');
 for(const background of ['rgb(38, 38, 38)','rgb(235, 235, 235)']){
  const result=await b.evaluate(`(()=>{
   document.body.innerHTML='<div class="pqi-code-scroll"><div class="pqi-line"><code class="pqi-source-line">let Source = 1 in Source</code></div></div>';
   document.head.innerHTML='';
   const own=document.createElement('style');own.textContent=${JSON.stringify(css)};document.head.append(own);
   const host=document.createElement('style');host.textContent='code{color:var(--vscode-textPreformat-foreground);background-color:var(--vscode-textPreformat-background);padding:1px 3px;border-radius:4px}';document.head.append(host);
   document.documentElement.style.setProperty('--vscode-textPreformat-background',${JSON.stringify(background)});
   document.documentElement.style.setProperty('--vscode-textPreformat-foreground','#ddd');
   const style=getComputedStyle(document.querySelector('.pqi-source-line'));
   return {background:style.backgroundColor,color:style.color,radius:style.borderRadius,padding:style.padding};
  })()`);
  assert.deepEqual(result,{background:'rgba(0, 0, 0, 0)',color:'rgb(51, 65, 85)',radius:'0px',padding:'0px 12px'});
 }
});
