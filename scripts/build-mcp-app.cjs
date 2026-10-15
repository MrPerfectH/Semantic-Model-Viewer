'use strict';
const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../integrations/mcp/app-entry.js')],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',outfile:path.join(__dirname,'../integrations/mcp/app.bundle.js'),legalComments:'eof'});
