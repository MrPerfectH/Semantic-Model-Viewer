'use strict';
const path = require('node:path').posix;

// Parse JSON while retaining the exact source range of every scalar. Replacements
// change only known reference tokens, leaving formatting and display text intact.
function parseLossless(text) {
  JSON.parse(text);
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  function value() {
    ws(); const start = i;
    if (text[i] === '{') {
      i++; const children = {}; ws();
      while (text[i] !== '}') {
        const key = value(); if (typeof key.value !== 'string') throw Error('Invalid JSON key');
        ws(); if (text[i++] !== ':') throw Error('Missing colon');
        if (Object.hasOwn(children, key.value)) throw Error('Duplicate JSON key');
        children[key.value] = value(); ws();
        if (text[i] === '}') break;
        if (text[i++] !== ',') throw Error('Missing comma');
      }
      i++; return {start,end:i,children,value:Object.fromEntries(Object.entries(children).map(([k,v])=>[k,v.value]))};
    }
    if (text[i] === '[') {
      i++; const children = []; ws();
      while (text[i] !== ']') { children.push(value()); ws(); if (text[i] === ']') break; if (text[i++] !== ',') throw Error('Missing comma'); }
      i++; return {start,end:i,children,value:children.map(v=>v.value)};
    }
    if (text[i] === '"') {
      i++; while (i < text.length) { if (text[i] === '\\') {i+=2;continue;} if (text[i++] === '"') break; }
    } else { while (i < text.length && !/[\s,}\]]/.test(text[i])) i++; }
    if (i === start) throw Error('Invalid JSON');
    return {start,end:i,value:JSON.parse(text.slice(start,i))};
  }
  const root = value(); ws(); if (i !== text.length) throw Error('Trailing JSON'); return root;
}
// Reference shapes follow Microsoft's semanticQuery/1.3.0 schema; queryRefs
// arrays follow visualConfiguration/2.0.0. PBIR-Legacy is intentionally blocked.
const normalize = p => path.normalize(p.replace(/\\/g,'/')).replace(/^\.\//,'');
function planReportRename(files, modelBinding, rename) {
  const result = {changes:[],diagnostics:[],blockers:[]};
  const block = (file,code,message) => result.blockers.push({path:file,code,message});
  if (!['table','column','measure','hierarchy'].includes(rename.kind)) {block('', 'unsupported-kind','Unsupported report rename kind');return result;}
  const selected = normalize(modelBinding.relativeSemanticModelPath);
  const reports = new Map();
  for (const file of files) {
    const match = normalize(file.path).match(/^(.*\.Report)(?:\/|$)/i);
    if (match) { const list=reports.get(match[1]) || [];list.push(file);reports.set(match[1],list); }
  }
  for (const [directory, reportFiles] of reports) {
    const binding = reportFiles.find(f=>normalize(f.path)===directory+'/definition.pbir');
    if (!binding) {block(directory,'missing-binding','Report has no definition.pbir binding');continue;}
    let ref;
    try {ref=parseLossless(binding.text).value.datasetReference;} catch {block(binding.path,'invalid-binding','Invalid report binding JSON');continue;}
    if (!ref?.byPath?.path || ref.byConnection) {block(binding.path,'external-binding','Report binding cannot be verified as a local model');continue;}
    if (normalize(path.join(directory,ref.byPath.path)) !== selected) {result.diagnostics.push({path:binding.path,code:'unrelated-report',message:'Report targets another model; unchanged'});continue;}
    if (reportFiles.some(f=>normalize(f.path)===directory+'/report.json')) {block(directory,'legacy-report','PBIR-Legacy reports cannot be safely edited');continue;}
    for (const file of reportFiles) {
      if (!normalize(file.path).startsWith(directory+'/definition/') || !file.path.endsWith('.json')) continue;
      let root;try {root=parseLossless(file.text);} catch {block(file.path,'invalid-json','Invalid report definition JSON');continue;}
      const edits = new Map(); const aliases = new Map(); const references = new Map(); const understood = new Set();
      const visit = (node,fn) => {fn(node); if(node.children) Object.values(node.children).forEach(n=>visit(n,fn));};
      const replace = (node,value) => {if(node && node.value!==value) edits.set(node.start,{start:node.start,end:node.end,text:JSON.stringify(value)});};
      visit(root,n=>{
        const v=n.value;
        if (!v || Array.isArray(v) || typeof v!=='object') return;
        if (typeof v.Name==='string' && typeof v.Entity==='string') {
          if(aliases.has(v.Name) && aliases.get(v.Name)!==v.Entity) block(file.path,'ambiguous-alias','Semantic query alias resolves to multiple tables');
          aliases.set(v.Name,v.Entity); understood.add(n.children.Entity.start);
        }
        if(v.SourceRef?.Entity) understood.add(n.children.SourceRef.children.Entity.start);
        for(const type of ['Measure','Column','Hierarchy']) {const key=type==='Hierarchy'?'Hierarchy':'Property';if(v[type]?.[key]) understood.add(n.children[type].children[key].start);}
      });
      function entity(expr) {const s=expr?.SourceRef;return s?.Entity || aliases.get(s?.Source);}
      visit(root,n=>{
        const v=n.value;if (!v || typeof v!=='object' || Array.isArray(v)) return;
        if (rename.kind==='table' && v.SourceRef?.Entity===rename.table) replace(n.children.SourceRef.children.Entity,rename.newName);
        if (rename.kind==='table' && v.Entity===rename.table && typeof v.Name==='string') replace(n.children.Entity,rename.newName);
        for (const type of ['Measure','Column','Hierarchy']) {
          const typed=v[type];if(!typed) continue;
          const resolved=entity(typed.Expression); const targetProperty=typed[type==='Hierarchy'?'Hierarchy':'Property'];
          if(!resolved && (targetProperty===rename.name || rename.kind==='table')) block(file.path,'unresolved-source','Typed reference has an unresolved source alias');
          if(resolved!==rename.table) continue;
          const targetKind=type.toLowerCase(); const propertyKey=type==='Hierarchy'?'Hierarchy':'Property'; const property=typed[propertyKey];
          if ((rename.kind===targetKind && property===rename.name) || rename.kind==='table') {
            const old=rename.table+'.'+property;
            const next=(rename.kind==='table'?rename.newName:rename.table)+'.'+(rename.kind==='table'?property:rename.newName);
            references.set(old,next);
            const alias=typed.Expression?.SourceRef?.Source;
            if(alias && rename.kind!== 'table') references.set(alias+'.'+property,alias+'.'+rename.newName);
            if(rename.kind===targetKind) replace(n.children[type].children[propertyKey],rename.newName);
          }
        }
      });
      if(rename.kind!=='table') references.set(rename.table+'.'+rename.name,rename.table+'.'+rename.newName);
      function rewriteQueryRef(value, depth=0) {
        if(typeof value!=='string' || depth>8) return null;
        if(references.has(value)) return references.get(value);
        const wrapper=/^(Sum|Min|Max|CountNonNull|Count|Avg|Average|Median|DistinctCount|StandardDeviation|Variance)\((.*)\)$/.exec(value);
        if(wrapper) {const inner=rewriteQueryRef(wrapper[2],depth+1);return inner===null?null:wrapper[1]+'('+inner+')';}
        if(rename.kind==='table' && value.startsWith(rename.table+'.')) return rename.newName+value.slice(rename.table.length);
        return null;
      }
      function rewriteRef(node) {
        const next=rewriteQueryRef(node.value);
        if(next!==null) replace(node,next);
        else if(typeof node.value==='string' && (node.value.includes(rename.table+'.'+rename.name) || (rename.kind==='table' && node.value.includes(rename.table+'.')) || [...references.keys()].some(key=>node.value.includes(key)))) block(file.path,'unknown-query-reference','Compound query reference cannot be safely renamed');
      }
      visit(root,n=>{
        if (!n.children || Array.isArray(n.children)) return;
        for(const [key,child] of Object.entries(n.children)) {
          if(key==='queryRefs' && Array.isArray(child.children)) child.children.forEach(rewriteRef);
          if(typeof child.value!=='string') continue;
          if(['queryRef','QueryRef'].includes(key)) rewriteRef(child);
          // Select.Name is a query reference only when this same object contains
          // a typed semantic expression; display names elsewhere are untouched.
          if(key==='Name' && ['Measure','Column','Hierarchy','Aggregation'].some(type=>n.value[type])) rewriteRef(child);
          if (['Dax','DAX','Expression','expression'].includes(key) && (child.value.includes('['+rename.name+']') || child.value.includes(rename.table))) block(file.path,'embedded-expression','Embedded expression requires semantic DAX analysis');
          if (['Property','Entity','Hierarchy'].includes(key) && (child.value===rename.name || child.value===rename.table) && !edits.has(child.start)) {
            // References to other objects remain untouched. A typed reference is
            // understood; untyped object references must not be silently skipped.
            if (!understood.has(child.start)) block(file.path,'unknown-reference','Untyped matching report property cannot be safely renamed');
          }
        }
      });
      const sorted=[...edits.values()].sort((a,b)=>b.start-a.start);let text=file.text;
      for(const edit of sorted) text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
      if(text!==file.text) result.changes.push({path:file.path,original:file.text,text});
    }
  }
  return result;
}
module.exports={planReportRename};
