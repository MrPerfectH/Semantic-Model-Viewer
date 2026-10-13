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
