'use strict';
const fs=require('node:fs');const path=require('node:path');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validate(data){
  if(!data||data.version!==1||!Array.isArray(data.columns)||!data.columns.length||!Array.isArray(data.rows))throw new Error('Dataset needs version 1, columns and rows');
  if(data.rows.length>10000)throw new Error('Dataset exceeds 10000 rows; aggregate or select fewer rows upstream');
  const names=new Set();
  data.columns.forEach(c=>{if(!c||typeof c.name!=='string'||!c.name||names.has(c.name)||!['string','number','boolean'].includes(c.type))throw new Error('Dataset column needs a unique name and string, number or boolean type');names.add(c.name);if(c.unit!==undefined&&typeof c.unit!=='string')throw new Error('Column unit must be a string');});
  data.rows.forEach((row,i)=>{if(!Array.isArray(row)||row.length!==data.columns.length)throw new Error('Dataset row '+i+' has wrong column count');row.forEach((v,j)=>{if(v===null)return;const type=data.columns[j].type;if(type==='number' ? !((typeof v==='number'&&Number.isFinite(v))||(typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v))) : typeof v!==type)throw new Error('Dataset row '+i+', column '+data.columns[j].name+' has invalid '+type);});});
  const origin=data.origin||{kind:'imported'};
  if(!['query','imported','illustrative'].includes(origin.kind))throw new Error('Origin kind must be query, imported or illustrative');
  for(const key of ['tool','query','model','modelRevision','executedAt'])if(origin[key]!==undefined&&origin[key]!==null&&typeof origin[key]!=='string')throw new Error('Origin '+key+' must be a string or null');
  if(origin.executedAt!=null&&!Number.isFinite(Date.parse(origin.executedAt)))throw new Error('Invalid execution time');
  return {...data,origin:{...origin,executedAt:origin.executedAt??null}};
}
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'&&!cell&&!closed)quoted=true;
    else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}
    else {if(closed||c==='"')throw new Error('Malformed CSV quoting');cell+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote');if(cell||row.length||closed){row.push(cell);rows.push(row);}return rows;
}
function fromCSV(text,metadata){
  const rows=parseCSV(text.replace(/^\uFEFF/,'')),header=rows.shift();
  if(!metadata?.columns || !header || JSON.stringify(header)!==JSON.stringify(metadata.columns.map(c=>c.name)))throw new Error('CSV header must match metadata columns in order');
  return validate({...metadata,version:1,rows:rows.map((r,i)=>r.map((v,j)=>{const c=metadata.columns[j];if(!c)throw new Error('Extra CSV field at row '+i);if(v===''&&c.type!=='string')return null;if(c.type==='number')return v;if(c.type==='boolean'){if(!['true','false'].includes(v))throw new Error('CSV boolean must be true or false');return v==='true';}return v;}))});
}
function load(input,base){
  if(typeof input==='string'){const p=path.resolve(base,input);if(fs.statSync(p).size>8*1024*1024)throw new Error('Dataset exceeds 8 MiB');return validate(JSON.parse(fs.readFileSync(p,'utf8')));}
  return validate(input);
}
function display(v){return v===null?'No value':String(v);}
function render(data,options={}){
  data=validate(data);const mode=options.render||'table',limit=options.limit??30;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Display limit must be 1 to 100');
  if(!['table','scalar','bars'].includes(mode))throw new Error('Result render must be scalar, table or bars');
  let body='';
  if(mode==='scalar'){
    if(data.rows.length!==1||data.columns.length!==1)throw new Error('Scalar rendering requires one row and one column');
    body='<p class="result-scalar">'+esc(display(data.rows[0][0]))+' <small>'+esc(data.columns[0].unit||'')+'</small></p>';
  }else if(mode==='bars'){
    if(data.columns.length!==2||data.columns[0].type!=='string'||data.columns[1].type!=='number')throw new Error('Bars require a label column then a numeric column');
    const rows=data.rows.slice(0,limit),max=Math.max(1,...rows.map(r=>Math.abs(Number(r[1]))));
    body='<div class="bars">'+rows.map(r=>{const n=r[1]===null?null:Number(r[1]);if(n!==null&&!Number.isFinite(n))throw new Error('Chart number is outside display range');const w=n===null?0:Math.abs(n)/max*50;return '<div class="bar-row"><span>'+esc(r[0])+'</span><div class="bar-track"><i style="left:'+(n<0?50-w:50)+'%;width:'+w+'%"></i></div><span>'+esc(display(r[1]))+' '+esc(data.columns[1].unit||'')+'</span></div>';}).join('')+'</div>';
  }else body='<div class="result-scroll"><table><thead><tr>'+data.columns.map(c=>'<th>'+esc(c.name)+(c.unit?' ('+esc(c.unit)+')':'')+'</th>').join('')+'</tr></thead><tbody>'+data.rows.slice(0,limit).map(row=>'<tr>'+row.map(v=>'<td>'+esc(display(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  if(data.rows.length>limit&&mode!=='scalar')body+='<p>Showing '+limit+' of '+data.rows.length+' rows. Complete data is in the manifest.</p>';
  const label={query:'Query result supplied by another tool',imported:'Imported saved values',illustrative:'Illustrative values'}[data.origin.kind];
  return '<section class="result"><p><strong>'+label+'</strong></p>'+body+'<details><summary>Source and scope</summary><pre>'+esc(JSON.stringify(data.origin,null,2))+'</pre></details></section>';
}
// Rational decimal arithmetic: exact input decimals, one explicit half-away-from-zero
// rounding at the final display boundary. No JavaScript or model expressions execute.
function rational(value){const text=String(value);if(!/^-?\d+(\.\d+)?$/.test(text))throw new Error('Calculation needs plain decimal values (no exponent notation)');const places=(text.split('.')[1]||'').length;return {n:BigInt(text.replace('.','')),d:10n**BigInt(places)};}
function add(a,b){return {n:a.n*b.d+b.n*a.d,d:a.d*b.d};}
function sub(a,b){return {n:a.n*b.d-b.n*a.d,d:a.d*b.d};}
function mul(a,b){return {n:a.n*b.n,d:a.d*b.d};}
function div(a,b){if(b.n===0n)throw new Error('Division by zero');return {n:a.n*b.d,d:a.d*b.n};}
function decimal(r,places){let n=r.n,d=r.d;if(d<0n){n=-n;d=-d;}const negative=n<0n;if(negative)n=-n;const scale=10n**BigInt(places);let v=n*scale/d;if((n*scale%d)*2n>=d)v++;const s=v.toString().padStart(places+1,'0');return (negative&&v!==0n?'-':'')+(places?s.slice(0,-places)+'.'+s.slice(-places):s);}
function calculate(definitions,datasets){
  const result=Object.create(null),visiting=new Set();
  function run(id){
    if(Object.hasOwn(result,id))return result[id];if(visiting.has(id))throw new Error('Calculation cycle at '+id);const def=Object.hasOwn(definitions,id)?definitions[id]:null;if(!def)throw new Error('Missing calculation '+id);visiting.add(id);
    if(!['sum','subtract','multiply','divide','ratio','percentChange'].includes(def.op)||!Array.isArray(def.inputs)||!def.inputs.length)throw new Error('Invalid calculation '+id);
    if(def.op!=='sum'&&def.inputs.length!==2)throw new Error(def.op+' requires two inputs');
    const places=def.decimals??2;if(!Number.isInteger(places)||places<0||places>12)throw new Error('Calculation decimals must be 0 to 12');
    const inputs=def.inputs.map(input=>{
      if(input.calculation){const prev=run(input.calculation);return {reference:{calculation:input.calculation},value:prev.value,unit:prev.unit,origin:{kind:'calculated',calculation:input.calculation},exactValue:prev.exact?{numerator:String(prev.exact.n),denominator:String(prev.exact.d)}:null,exact:prev.exact};}
      if(Object.hasOwn(input,'value')){if(input.kind!=='illustrative')throw new Error('Constants must have kind illustrative');return {reference:{kind:'illustrative',value:input.value},value:input.value,unit:input.unit||'',origin:{kind:'illustrative'}};}
      const data=datasets[input.dataset];if(!data)throw new Error('Missing dataset '+input.dataset);const col=data.columns.findIndex(c=>c.name===input.column);if(col<0||data.columns[col].type!=='number'||!Number.isInteger(input.row)||input.row<0||input.row>=data.rows.length)throw new Error('Invalid calculation input '+JSON.stringify(input));return {reference:{dataset:input.dataset,row:input.row,column:input.column},value:data.rows[input.row][col],unit:data.columns[col].unit||'',origin:data.origin};
    });
    let unit=inputs[0].unit;
    if(['sum','subtract','ratio','percentChange'].includes(def.op)&&inputs.some(x=>x.unit!==unit))throw new Error('Incompatible calculation units');
    if(def.op==='multiply'){if(inputs[0].unit&&inputs[1].unit)throw new Error('Multiply supports at most one dimensional input');unit=inputs[0].unit||inputs[1].unit;}
    if(def.op==='divide'){if(inputs[1].unit&&inputs[0].unit!==inputs[1].unit)throw new Error('Incompatible division units');unit=inputs[1].unit?'':inputs[0].unit;}
    if(def.op==='ratio')unit='';if(def.op==='percentChange')unit='%';
    let exact=null,value=null;
    if(inputs.every(x=>x.value!==null)){
      const terms=inputs.map(x=>x.exact||rational(x.value));
      if(def.op==='sum')exact=terms.reduce(add,{n:0n,d:1n});
      if(def.op==='subtract')exact=sub(...terms);if(def.op==='multiply')exact=mul(...terms);
      if(['divide','ratio'].includes(def.op))exact=div(...terms);
      if(def.op==='percentChange')exact=mul(div(sub(terms[1],terms[0]),terms[0]),{n:100n,d:1n});
      value=decimal(exact,places);
    }
    const entry={op:def.op,inputs:inputs.map(({exact,...x})=>x),value,unit,decimals:places,rounding:'half away from zero; final display only'};
    Object.defineProperty(entry,'exact',{value:exact,enumerable:false});result[id]=entry;visiting.delete(id);return entry;
  }
  Object.keys(definitions).forEach(run);return result;
}
function renderCalculation(c){
  const values=c.inputs.map(x=>display(x.value)+(x.unit?' '+x.unit:'')+(x.exactValue?' (unrounded value used)':''));
  const symbols={sum:' + ',subtract:' − ',multiply:' × ',divide:' ÷ ',ratio:' ÷ '};
  const formula=c.op==='percentChange'?'('+values[1]+' − '+values[0]+') ÷ '+values[0]+' × 100':values.join(symbols[c.op]);
  return '<section class="result"><p><strong>Calculated here · '+esc(c.op)+'</strong></p><p>'+esc(formula)+'</p><p class="result-scalar">= '+esc(display(c.value))+' '+esc(c.unit)+'</p><details><summary>Inputs and calculation</summary><pre>'+esc(JSON.stringify(c,null,2))+'</pre></details></section>';
}
function guarded(fn,code){return function(...args){try{return fn(...args);}catch(e){e.code=e.code||code;throw e;}};}
module.exports={validate:guarded(validate,'DATASET_INVALID'),load:guarded(load,'DATASET_INVALID'),parseCSV:guarded(parseCSV,'DATASET_INVALID'),fromCSV:guarded(fromCSV,'DATASET_INVALID'),render:guarded(render,'DATASET_INVALID'),calculate:guarded(calculate,'CALCULATION_INVALID'),renderCalculation};
