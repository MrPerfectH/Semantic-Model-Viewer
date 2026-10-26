#!/usr/bin/env node
'use strict';
const args=process.argv.slice(2);
require('../Models/tools/viewer/scripts/cli/main.cjs').main(args).catch(error => {
  const structured=args.includes('--json')||['inspect','discover','results'].includes(args[0])||(args[0]==='explain'&&args[1]==='validate');
  if(structured)process.stderr.write(JSON.stringify({ok:false,error:{code:error.code||'INVALID_INPUT',message:error.message,details:error.details||{}}})+'\n');
  else console.error('smv: ' + error.message);
  process.exitCode = 1;
});
