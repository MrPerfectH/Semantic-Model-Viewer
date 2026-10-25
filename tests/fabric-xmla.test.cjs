'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const executable = path.join(__dirname,'../tools/fabric/xmla/publish',process.platform+'-'+process.arch,process.platform==='win32'?'Smv.Fabric.Xmla.exe':'Smv.Fabric.Xmla');
test('published XMLA helper rejects invalid requests without leaking credentials or paths', {skip:!fs.existsSync(executable)&&'Build platform XMLA helper first'},()=>{
 const result=spawnSync(executable,[],{input:JSON.stringify({workspaceId:'invalid',modelId:'invalid',accessToken:'synthetic-secret-token'}),encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);
 const body=JSON.parse(result.stdout);
 assert.equal(body.error.code,'XmlaUnavailable');
 assert.doesNotMatch(result.stdout,/synthetic-secret-token|System\.|\/home\/|StackTrace/);
 assert.equal(result.stderr,'');
});

test('XMLA child receives the discovered model name as well as REST identifiers', {skip:process.platform==='win32'&&'Executable fixture uses a Unix shebang'}, async()=>{
 const os=require('node:os');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'smv-xmla-catalog-test-'));
 const executable=path.join(directory,'helper');
 fs.writeFileSync(executable,`#!/usr/bin/env node
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const request=JSON.parse(input);process.stdout.write(JSON.stringify({transport:'xmla',coverage:'consumer-metadata',warnings:['Expressions withheld'],parts:[{path:'model.bim',content:JSON.stringify({model:{name:request.modelName,tables:[]}})}]}));});
`,{mode:0o755});
 try {
  const result=await require('../tools/fabric/xmla.cjs').createXmlaReader({executable})({workspaceId:'workspace-id',workspaceName:'Showcase workspace',modelId:'rest-model-id',modelName:'Sales model',accessToken:'synthetic-token'});
  assert.equal(JSON.parse(result.parts[0].content).model.name,'Sales model');
  assert.equal(result.coverage,'consumer-metadata');assert.ok(result.warnings.includes('Expressions withheld'));
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('consumer metadata mapping preserves visible schema and marks unavailable definitions', t=>{
 const dotnet=process.env.SMV_DOTNET || 'dotnet';
 const sdk=spawnSync(dotnet,['--list-sdks'],{encoding:'utf8',timeout:10000});
 if(sdk.status!==0 || !/8\.0\./.test(sdk.stdout || '')) {t.skip('.NET 8 SDK required for consumer mapping fixture');return;}
 const run=spawnSync(dotnet,['run','--project',path.join(__dirname,'fixtures/fabric-consumer/ConsumerMapping.csproj'),'--configuration','Release'],{encoding:'utf8',timeout:120000});
 assert.equal(run.status,0,run.stderr || run.stdout);
 assert.match(run.stdout,/12 mapper checks passed/);
 const result=JSON.parse(run.stdout.split('\n').find(line=>line.startsWith('{')));
 require('../Models/tools/viewer/js/roles.js');require('../Models/tools/viewer/js/tmdl-parser.js');
 const model=globalThis.TMDLParser.parseAny(result.parts.map(part=>({path:part.path,name:path.basename(part.path),text:part.content})));
 assert.equal(model.tables.length,2);assert.equal(model.relationships.length,1);
 assert.equal(result.coverage,'consumer-metadata');
});
