/* Explicit acceptance of the local metadata service; run with a candidate server.
 * node tests/pq38-transport.cjs http://127.0.0.1:8938
 * Only reads the independently authored synthetic fixture. Never executes M.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const root=path.join(__dirname,'acceptance-fixtures/pq38'),dir=path.join(root,'PQ38.SemanticModel');
 const route=new URL('/api/model',process.argv[2]||'http://127.0.0.1:8938');route.searchParams.set('path',dir);
 const response=await fetch(route),body=await response.json();assert.equal(response.status,200);
 const raw=fs.readFileSync(path.join(dir,'definition/tables/Sales.tmdl'),'utf8');
 const transport=body.files.find(f=>f.name==='Sales.tmdl').text;
 const g={console};g.window=g;vm.createContext(g);
 for(const name of ['util','roles','tmdl-parser'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/'+name+'.js'),'utf8'),g);
 const expected=JSON.parse(fs.readFileSync(path.join(root,'oracle/expected.json'))).main;
 const actual=g.TMDLParser.parseTMDL(body.files).powerQuery.nodes.find(n=>n.name==="Main 'quoted'").code;
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 console.log(JSON.stringify({route:String(route),rawEqual:raw===transport,codeEqual:actual===expected,rawSHA256:hash(raw),transportSHA256:hash(transport),expectedCodeSHA256:hash(expected),actualCodeSHA256:hash(actual),rawCRLF:(raw.match(/\r\n/g)||[]).length,transportCRLF:(transport.match(/\r\n/g)||[]).length,expectedCodeBytes:Buffer.byteLength(expected),actualCodeBytes:Buffer.byteLength(actual)},null,2));
 assert.equal(transport,raw,'service response must preserve exact fixture text');
 assert.equal(actual,expected,'transported metadata must preserve decoded M');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
