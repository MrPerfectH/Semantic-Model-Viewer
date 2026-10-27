'use strict';
// Public metadata API shared by editor tools and the terminal adapters. Source
// records come from the host; this API does not launch processes or write files.
const crypto=require('node:crypto');
const path=require('node:path');
const cli=path.resolve(__dirname,'../../Models/tools/viewer/scripts/cli');
const modelAPI=require(path.join(cli,'model.cjs'));
const query=require(path.join(cli,'query.cjs'));
function loadRecords(files,{name,identity='host:model'}={}){
  if(!Array.isArray(files)||!files.length||files.some(f=>!f||typeof f.name!=='string'||typeof f.text!=='string'))throw new Error('Expected model file records with name and text');
  const context=modelAPI.runtime(),parsed=modelAPI.readRecords(context,files,name);
  const sha256=crypto.createHash('sha256').update(JSON.stringify(files.map(f=>[f.path||f.name,f.text]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
  return {context,...parsed,source:identity,sourceIdentity:{kind:'host-records',source:identity,contentHash:sha256},sourceContentHash:sha256};
}
function focus(loaded,table){
  if(typeof table!=='string'||!table.trim())throw new Error('A table name is required');
  const found=loaded.model.tables.find(t=>t.name.toLowerCase()===table.toLowerCase());
  if(!found)throw new Error('Unknown table: '+table);
  return {...loaded,table:found};
}
function relations(loaded,table,options={}){return query.focused(loaded.source,table,'relations',{...options,loaded:focus(loaded,table)});}
function dependents(loaded,table,options={}){return query.focused(loaded.source,table,'dependents',{...options,loaded:focus(loaded,table)});}
function plan(loaded,options){return require(path.join(cli,'questions.cjs')).build(loaded.source,{...options,loaded:focus(loaded,options.table)});}
function render(loaded,view){return require(path.join(cli,'explain.cjs')).prepare(loaded.source,view,{loaded,sourceContentHash:loaded.sourceContentHash,sourceIdentity:loaded.sourceIdentity});}
function inspect(loaded,table){
  if(table)return {table:loaded.context.Snapshots.modelData(loaded.model).tables.find(t=>t.name===focus(loaded,table).table.name),relations:relations(loaded,table),dependents:dependents(loaded,table)};
  return {name:loaded.model.name,tables:loaded.model.tables.map(t=>({name:t.name,columns:t.columns.length,measures:t.measures.length})),relationships:loaded.model.relationships.length,sourceIdentity:loaded.sourceIdentity};
}
module.exports={loadRecords,focus,relations,dependents,plan,render,inspect};
