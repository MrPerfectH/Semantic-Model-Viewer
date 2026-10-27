'use strict';
const fs=require('node:fs'),path=require('node:path');
function convert(output){
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'.claude-plugin/plugin.json'),'utf8'));
  const identity={name:manifest.name,version:manifest.version,description:manifest.description};
  fs.writeFileSync(path.join(output,'plugin.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',...identity,extensions:{'com.openai':{interface:{displayName:'Semantic Model Viewer',shortDescription:'Visual relationships and calculation dependencies for Power BI models',capabilities:['Read','Write']}}}},null,2)+'\n');
  fs.mkdirSync(path.join(output,'.codex-plugin'),{recursive:true});
  fs.writeFileSync(path.join(output,'.codex-plugin/plugin.json'),JSON.stringify({...identity,skills:'./skills/'},null,2)+'\n');
  for(const name of fs.readdirSync(path.join(output,'skills'))){
    if(name==='setup'){fs.rmSync(path.join(output,'skills',name),{recursive:true,force:true});continue;}
    const file=path.join(output,'skills',name,'SKILL.md');let text=fs.readFileSync(file,'utf8');
    text=text.replace(/^argument-hint:.*\n/gm,'').replace(/^disable-model-invocation:.*\n/gm,'');
    text=text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g,'<plugin-root>').replace(/\$ARGUMENTS/g,"the user's request").replace(/Claude Code/g,'Codex').replace(/\bClaude\b/g,'the agent');
    text=text.replace(/the the agent/g,'the agent');
    text=text.replace(/\/semantic-model-viewer:setup/g,'the optional CLI setup workflow');
    text=text.replace(/Otherwise use an installed `smv` command, or `node bin\/smv.cjs` from the Semantic Model Viewer checkout\./g,'Always use the bundled executable, not a global command.');
    const intro='Resolve <plugin-root> from the location of this loaded skill: start in the directory containing SKILL.md and go up two directory levels. Treat it as a filesystem path and quote it. Do not invent a host environment variable or guess a versioned cache directory. Invoke /bin/sh "<plugin-root>/bin/smv" on macOS/Linux, or "<plugin-root>/bin/smv.cmd" on Windows. No setup or global Node/CLI is needed in a complete portable package.\n\n';
    const end=text.indexOf('\n---',4)+4;text=text.slice(0,end)+'\n\n'+intro+text.slice(end);fs.writeFileSync(file,text);
  }
  fs.copyFileSync(path.join(output,'docs/codex-plugin.md'),path.join(output,'README.md'));
  const pkg=JSON.parse(fs.readFileSync(path.join(output,'package.json'),'utf8'));pkg.name='semantic-model-viewer-codex-plugin';fs.writeFileSync(path.join(output,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  return output;
}
if(require.main===module){try{const {values}=require('node:util').parseArgs({options:{out:{type:'string'}}});const output=values.out||'dist/codex-plugin';require('./build-claude-plugin.cjs').build(output);console.log(convert(path.resolve(output)));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={convert};
