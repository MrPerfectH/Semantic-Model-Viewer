'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {values}=require('node:util').parseArgs({options:{archive:{type:'string'},url:{type:'string'},out:{type:'string'}}});
try{
 if(!values.archive||!values.url||!values.out)throw new Error('Provide --archive, --url and --out');
 const url=new URL(values.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('Use an immutable public HTTPS archive URL without credentials, query or fragment');
 const bytes=fs.readFileSync(values.archive);if(bytes.length>256*1024*1024)throw new Error('Archive exceeds Claude download limit');
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const catalog={name:'semantic-model-tools',owner:{name:'MrPerfectH',url:'https://github.com/MrPerfectH'},plugins:[{name:'semantic-model-viewer',source:{source:'archive',url:url.href,sha256},description:'Visual model diagrams with the bundled CLI and private runtime.'}]};
 fs.mkdirSync(path.dirname(path.resolve(values.out)),{recursive:true});fs.writeFileSync(values.out,JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({path:path.resolve(values.out),sha256,bytes:bytes.length,note:'Prepared catalog only; verify the published archive URL before rolling it out.'}));
}catch(error){console.error(error.message);process.exitCode=1;}
