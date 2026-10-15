'use strict';
const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../Models/tools/viewer/scripts/cli/mcp-app-entry.js')],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',outfile:path.join(__dirname,'../Models/tools/viewer/scripts/cli/mcp-app.bundle.js'),legalComments:'eof'});
