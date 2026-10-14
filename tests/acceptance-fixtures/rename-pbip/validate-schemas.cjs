/* Optional development-only validation; install Ajv in a temporary directory. */
const fs=require('node:fs'),path=require('node:path'),Ajv=require('ajv');
const base='https://developer.microsoft.com/json-schemas/';
const ajv=new Ajv({strict:false,allErrors:true,loadSchema:async uri=>{const url=uri.replace(base,'https://raw.githubusercontent.com/microsoft/json-schemas/main/');const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r.json();}});
async function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())await walk(f);else if(/\.(json|pbir|pbip|pbism)$/.test(f)){const data=JSON.parse(fs.readFileSync(f));let schema=data.$schema;if(f.endsWith('.pbip'))schema=base+'fabric/pbip/pbipProperties/1.0.0/schema.json';if(f.endsWith('.pbism'))schema=base+'fabric/item/semanticModel/definitionProperties/1.0.0/schema.json';if(!schema)continue;const validate=await ajv.compileAsync({$ref:schema});if(!validate(data)){console.error(f,JSON.stringify(validate.errors,null,2));process.exitCode=1;}else console.log('VALID',f);}}}
walk(process.argv[2] || __dirname).catch(e=>{console.error(e);process.exitCode=1});
