'use strict';
// Additive synthetic expectations. Never edits/rebuilds the frozen 57056e2 corpus.
// No production imports, M evaluation, or source requests.
const fs=require('node:fs');
const path=require('node:path');
const e=name=>JSON.stringify(['expression','',name]);
const p=(table,name='Main')=>JSON.stringify(['partition',table,name]);
const status=name=>JSON.stringify(['table-status',name]);
const duplicate=(name,index)=>JSON.stringify(['metadata-occurrence',e(name),index]);
const cases={};
function add(name,connected,disconnected,labels={}) {
  cases[name]={fixture:name.startsWith('v2-')?'filters-v2/'+name:name,
    all:[...connected,...disconnected],connected,disconnected,
    counts:{all:connected.length+disconnected.length,connected:connected.length,disconnected:disconnected.length},labels};
}
add('a1-disconnected',[],['Sales','Customer','Product','Calendar','Rates','Budget'].map(n=>p(n)));
add('a2-parameter',['Server','Consumer1','Consumer2','Consumer3','Consumer4','Consumer5'].map(e),['LocalShadow','FunctionShadow','FieldOnly'].map(e));
add('a3-results',['Q1','Q2','Q3','MergeResult','AppendResult'].map(e),[e('Disconnected')]);
add('a4-occurrences',['Sales Raw','Quote"Query','Server','OccurrenceProbe'].map(e),[]);
for(const n of [300,301,350,1000]) add('a6-disconnected-'+n,[],Array.from({length:n},(_,i)=>e('Object'+String(i).padStart(4,'0'))));
add('a6-fanout-250',[e('Server'),...Array.from({length:250},(_,i)=>e('Fan'+String(i).padStart(3,'0')))],[]);
add('a7-uncertainty',[p('Sales','Current'),p('Sales','History'),e('RangeStart'),e('CycleA'),e('CycleB'),e('SelfCycle')],
  [p('NonM','Calc'),p('Missing'),p('Collision'),e('AmbiguousTable'),e('Collision'),e('AmbiguousName'),duplicate('Duplicate',0),duplicate('Duplicate',1),
    e('DuplicateConsumer'),e('Dynamic'),e('MissingRef'),e('Unsupported'),e('ParseFailure'),status('NoPartitions')]);
for(const name of ['a8-reset-a','a8-reset-b']) add(name,[p('SameTable'),e('SameIdentity')],[]);
add('a8-without-m',[],[status('SameTable')]);
add('a9-privacy',[],[e('UnsafeText')]);

// Explicit references to unavailable sources still resolve: connectivity is not state==='available'.
const unavailable={name:'Independent PQ filter unavailable inputs',model:{tables:[
  {name:'MissingInput',columns:[],partitions:[{name:'Main'}]},
  {name:'NonMInput',columns:[],partitions:[{name:'Main',source:{type:'calculated',expression:'ROW("ID",1)'}}]},
  {name:'NoPartitions',columns:[],partitions:[]}],expressions:[
  {name:'MissingConsumer',kind:'m',expression:'MissingInput'},
  {name:'NonMConsumer',kind:'m',expression:'NonMInput'},
  {name:'StandaloneSQL',kind:'m',expression:'Sql.Database("same-sql.pq-redesign.invalid","SameDB")'},
  {name:'UnusedParameter',kind:'m',expression:'"PQ_FILTER_UNUSED_ONLY" meta [IsParameterQuery=true]'},
  {name:'DynamicOnly',kind:'m',expression:'Expression.Evaluate("MissingInput", #shared)'}],relationships:[]}};
add('v2-unavailable-incidence',[p('MissingInput'),p('NonMInput'),e('MissingConsumer'),e('NonMConsumer')],
  [status('NoPartitions'),e('StandaloneSQL'),e('UnusedParameter'),e('DynamicOnly')]);
cases['v2-unavailable-incidence'].edges=[[p('MissingInput'),e('MissingConsumer')],[p('NonMInput'),e('NonMConsumer')]];
// Same table/expression IDs as a8-reset-a, but the ONLY edge disappears after replacement.
const replacement={name:'Independent PQ filter same-ID replacement',model:{tables:[{name:'SameTable',columns:[{name:'ID',dataType:'int64'}],
  partitions:[{name:'Main',source:{type:'m',expression:'"PQ_FILTER_REPLACEMENT_ONLY"'}}]}],
  expressions:[{name:'SameIdentity',kind:'m',expression:'"PQ_FILTER_NEW_IDENTITY_ONLY"'}],relationships:[]}};
add('v2-same-ids-no-edge',[],[p('SameTable'),e('SameIdentity')]);
cases['v2-same-ids-no-edge'].edges=[];

// Display labels are expected presentation labels, never parsed from runtime IDs.
for(const c of Object.values(cases)) for(const id of c.all) {
  const [kind,a,b]=JSON.parse(id);
  c.labels[id]=kind==='expression'?b:kind==='partition'?(a==='Sales'&&b!=='Main'?a+' / '+b:a):kind==='metadata-occurrence'?'Duplicate':a;
}
const q=e('Q1'),merge=e('MergeResult'),single=e('Disconnected');
const step=(id,category,search,selectedId,extra={})=>({id,category,search,selectedId,inspectorId:selectedId,...extra});
const workflows={
  combined:{fixture:'a3-results',steps:[
    step('entry','all','',null),
    step('select-merge','all','',merge),
    step('search-q1','all','Q1',merge),
    step('connected-search-q1','connected','Q1',merge),
    step('disconnected-empty-search','disconnected','Q1',merge,{hiddenByFilter:true,zeroResults:true}),
    step('show-all-selected','all','',merge,{revealedId:merge,focusedId:merge,autoFitCalls:0}),
    step('connected-before-reference','connected','Merge',merge),
    step('reference-excluded-by-search','all','',q,{revealedId:q,focusedId:q,announcement:'Filters cleared to show referenced query',historyDelta:1}),
    step('back-reference','connected','Merge',merge,{restoreFrom:'connected-before-reference',historyDelta:-1}),
    step('hide-selected-for-reference','disconnected','',merge,{hiddenByFilter:true}),
    step('reference-excluded-by-category','all','',q,{revealedId:q,focusedId:q,announcement:'Filters cleared to show referenced query',historyDelta:1}),
    step('back-hidden-reference','disconnected','',merge,{hiddenByFilter:true,restoreFrom:'hide-selected-for-reference',historyDelta:-1}),
    step('reset-filters','all','',merge,{preserveFrom:'back-hidden-reference',autoFitCalls:0}),
    step('select-standalone','all','',single),
    step('hide-standalone','connected','Merge',single,{hiddenByFilter:true}),
    step('library-excluded-by-search','all','',q,{revealedId:q,focusedId:q,announcement:'Filters cleared to show referenced query',historyDelta:1}),
    step('back-hidden-library','connected','Merge',single,{hiddenByFilter:true,restoreFrom:'hide-standalone',historyDelta:-1}),
    step('reset-hidden-filters','all','',single,{preserveFrom:'back-hidden-library',autoFitCalls:0})]},
  disconnected:{fixture:'a1-disconnected',steps:[
    step('six-entry','all','',null),step('six-connected-empty','connected','',null,{zeroResults:true}),
    step('six-disconnected','disconnected','',null),step('six-search-sales','disconnected','Sales',p('Sales')),
    step('six-hide-selected','connected','Sales',p('Sales'),{hiddenByFilter:true,zeroResults:true}),
    step('six-show-all','all','',p('Sales'),{revealedId:p('Sales'),focusedId:p('Sales'),autoFitCalls:0})]},
  fanout:{fixture:'a6-fanout-250',steps:[step('fanout-entry','all','',null),
    step('fanout-last-search','connected','Fan249',e('Fan249')),
    step('fanout-server-search','connected','Server',e('Server')),
    step('fanout-empty-category','disconnected','',e('Server'),{hiddenByFilter:true,zeroResults:true}),
    step('fanout-reset','all','',e('Server'),{preserveFrom:'fanout-empty-category',autoFitCalls:0})]}
};
function artifacts(){return {
  'expected.json':JSON.stringify({contract:'pq-workspace/2',addendum:'filter-20261009',baseCorpusCommit:'57056e2d0633e7bf522a145b0d09c7ac976452db',
    caveat:'No resolved incident query references does not prove independence.',cases,workflows},null,2)+'\n',
  'v2-unavailable-incidence/model.bim':JSON.stringify(unavailable,null,2)+'\n',
  'v2-same-ids-no-edge/model.bim':JSON.stringify(replacement,null,2)+'\n'
};}
if(require.main===module){let bad=false;for(const [name,text] of Object.entries(artifacts())){const file=path.join(__dirname,name);
  if(process.argv.includes('--check')){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(Buffer.from(text))){console.error('Mismatch: '+name);bad=true;}}
  else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}}
  if(bad)process.exitCode=1;else console.log('Additive filter fixtures '+(process.argv.includes('--check')?'match':'written')+'.');
}
module.exports={artifacts};
