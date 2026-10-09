#!/usr/bin/env node
'use strict';
require('../Models/tools/viewer/scripts/cli/main.cjs').main(process.argv.slice(2)).catch(error => {
  console.error('smv: ' + error.message);
  process.exitCode = 1;
});
