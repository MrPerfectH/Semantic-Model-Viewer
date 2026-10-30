'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const modelAPI=require('./model.cjs');
const comparison=require('../../js/measure-comparison.js');
function build(source,options={}){
  if(!options.measure||!options.with)throw new Error('compare requires --measure <first> and --with <second>');
  const loaded=options.loaded||(()=>{const context=modelAPI.runtime();return {context,...modelAPI.readModel(context,source)};})();
  const maxMeasures=options.maxMeasures===undefined?200:options.maxMeasures;
  if(!Number.isInteger(maxMeasures)||maxMeasures<1||maxMeasures>200)throw new Error('maxMeasures must be 1 to 200');
  const analysis=comparison.analyze(loaded.model,options.measure,options.with,{maxMeasures});
  const spec={version:1,left:analysis.roots[0],right:analysis.roots[1],maxMeasures};
  return {source:options.loaded?loaded.source:path.resolve(source),identity:spec,modelHash:crypto.createHash('sha256').update(JSON.stringify(loaded.context.Snapshots.modelData(loaded.model))).digest('hex'),analysis,counts:analysis.counts,warnings:analysis.warnings,legend:analysis.basis,
    views:[{key:'comparison',label:analysis.roots[0].name+' vs '+analysis.roots[1].name,answer:analysis.summary,view:{version:2,mode:'measures',comparison:spec,banner:false}}]};
}
async function compare(source,options){return require('./show.cjs').show(source,options,build(source,options));}
module.exports={build,compare};
