/* Run: node --test tests/tmdl-parser.test.cjs
   Direct unit coverage for js/tmdl-parser.js's parseAny/parseTMDL, independent
   of the app harness. Covers the database-name regression: a bare `database`
   line (current-generation TMDL/Fabric exports, no inline name) must not read
   its own indented `compatibilityLevel:` property as the model name. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '../Models/tools/viewer/js');

function parser() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  for (const file of ['util.js', 'snapshot.js', 'roles.js', 'tmdl-parser.js']) {
    vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), context, { filename: file });
  }
  return context.TMDLParser;
}

function file(name, text) { return { name, text }; }

test('a bare `database` line (no inline name) does not read its own compatibilityLevel property as the name', () => {
  const TMDLParser = parser();
  const files = [
    file('database.tmdl', 'database\n\tcompatibilityLevel: 1606\n'),
    file('model.tmdl', 'model Model\n\tculture: en-US\n'),
    file('table.tmdl', "table Sales\n\tcolumn Amount\n\t\tdataType: double\n"),
  ];
  const model = TMDLParser.parseTMDL(files);
  assert.equal(model.name, '', 'name should be empty, not "compatibilityLevel: 1606"');
  assert.equal(model.tables.length, 1);
});

test('an inline `database <Name>` line still parses correctly (older/common TMDL style)', () => {
  const TMDLParser = parser();
  const files = [
    file('database.tmdl', 'database My Model Name\n\tcompatibilityLevel: 1604\n'),
    file('table.tmdl', "table Sales\n\tcolumn Amount\n\t\tdataType: double\n"),
  ];
  const model = TMDLParser.parseTMDL(files);
  assert.equal(model.name, 'My Model Name');
});

test('the repo fixture (inline database name) still parses to its real name', () => {
  const TMDLParser = parser();
  const dir = path.join(__dirname, 'fixtures/Fixture Model.SemanticModel');
  const files = [];
  (function walk(d, base) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, base + e.name + '/');
      else if (/\.(tmdl|bim|json)$/i.test(e.name)) files.push(file(e.name, fs.readFileSync(p, 'utf8')));
    }
  })(dir, '');
  const model = TMDLParser.parseAny(files);
  assert.equal(model.name, 'Fixture Model');
  assert.ok(model.tables.length > 0);
});

test('names with an escaped apostrophe keep their measures and columns', () => {
  const TMDLParser = parser();
  const files = [
    file('model.tmdl', 'model Model\n\tculture: en-US\n'),
    file('table.tmdl', "table 'Owner''s Sales'\n\tmeasure 'Owner''s Total' = 42\n\tmeasure Plain = [Owner's Total] + 1\n\n\tcolumn 'It''s'\n\t\tdataType: string\n"),
  ];
  const model = TMDLParser.parseTMDL(files);
  const table = model.tables[0];
  assert.equal(table.name, "Owner's Sales");
  assert.deepEqual([...table.measures.map(m => m.name)], ["Owner's Total", 'Plain']);
  assert.deepEqual([...table.columns.map(c => c.name)], ["It's"]);
});

test('calculated columns, calculated tables and calculation items keep their DAX (TMDL)', () => {
  const TMDLParser = parser();
  const files = [
    file('model.tmdl', 'model Model\n\tculture: en-US\n'),
    file('sales.tmdl', [
      'table Sales', '\tcolumn Amount', '\t\tdataType: double', '',
      '\tcolumn Inline = [Amount] * 2', '\t\tdataType: double', '',
      '\tcolumn Banded =', '\t\t\t\tSWITCH(', '\t\t\t\t    TRUE(),', '\t\t\t\t    [Amount] > 5, "Big",', '\t\t\t\t    "Small"', '\t\t\t\t)',
      '\t\tdataType: string', '\t\tlineageTag: abc', '',
      '\tpartition Sales = m', '\t\tsource = let x = 1 in x', ''].join('\n')),
    file('top.tmdl', [
      'table Top', '\tcolumn Name', '\t\tdataType: string', '',
      '\tpartition Top = calculated', '\t\tmode: import', '\t\tsource =', '\t\t\t\tTOPN(', '\t\t\t\t    5,', '\t\t\t\t    Sales', '\t\t\t\t)', ''].join('\n')),
    file('time.tmdl', [
      'table Time', '\tcalculationGroup', '\t\tprecedence: 1', '',
      '\t\tcalculationItem Current = SELECTEDMEASURE()', '',
      '\t\tcalculationItem YTD =', '\t\t\t\tCALCULATE(', '\t\t\t\t    SELECTEDMEASURE(),', '\t\t\t\t    DATESYTD(Date[Date])', '\t\t\t\t)',
      '\t\t\tformatStringDefinition = "0.0"', '',
      '\tcolumn Name', '\t\tdataType: string', '\tpartition Time = calculationGroup', ''].join('\n')),
  ];
  const model = TMDLParser.parseTMDL(files);
  const by = n => model.tables.find(t => t.name === n);
  const cols = Object.fromEntries(by('Sales').columns.map(c => [c.name, c]));
  assert.equal(cols.Amount.dax, undefined);
  assert.equal(cols.Inline.dax, '[Amount] * 2');
  assert.equal(cols.Banded.dax, 'SWITCH(\n    TRUE(),\n    [Amount] > 5, "Big",\n    "Small"\n)');
  assert.equal(cols.Banded.dataType, 'string');
  assert.equal(by('Sales').dax, undefined);
  assert.equal(by('Top').dax, 'TOPN(\n    5,\n    Sales\n)');
  const items = by('Time').calcItems;
  assert.deepEqual([...items.map(i => i.name)], ['Current', 'YTD']);
  assert.equal(items[0].dax, 'SELECTEDMEASURE()');
  assert.equal(items[1].dax, 'CALCULATE(\n    SELECTEDMEASURE(),\n    DATESYTD(Date[Date])\n)');
  assert.equal(items[1].fmt, '"0.0"');
  assert.equal(by('Time').role, 'calcgroup');
});

test('calculated columns, calculated tables and calculation items keep their DAX (BIM)', () => {
  const TMDLParser = parser();
  const bim = { name: 'M', compatibilityLevel: 1601, model: { tables: [
    { name: 'Sales', columns: [{ name: 'Amount', dataType: 'double' }, { name: 'Dbl', type: 'calculated', dataType: 'double', expression: ['[Amount]', '* 2'] }],
      partitions: [{ source: { type: 'm', expression: 'let x = 1 in x' } }] },
    { name: 'Calc', columns: [{ name: 'V', dataType: 'string' }], partitions: [{ source: { type: 'calculated', expression: 'ROW("V", 1)' } }] },
    { name: 'Time', columns: [{ name: 'Name', dataType: 'string' }], calculationGroup: { calculationItems: [
      { name: 'Current', expression: 'SELECTEDMEASURE()' },
      { name: 'YTD', expression: ['CALCULATE(', 'SELECTEDMEASURE())'], formatStringDefinition: { expression: '"0.0"' } }] } },
  ], relationships: [] } };
  const model = TMDLParser.parseAny([file('model.bim', JSON.stringify(bim))]);
  const by = n => model.tables.find(t => t.name === n);
  assert.equal(by('Sales').columns[1].dax, '[Amount]\n* 2');
  assert.equal(by('Sales').columns[0].dax, undefined);
  assert.equal(by('Calc').dax, 'ROW("V", 1)');
  assert.equal(by('Time').calcItems[1].dax, 'CALCULATE(\nSELECTEDMEASURE())');
  assert.equal(by('Time').calcItems[1].fmt, '"0.0"');
});

test('``` fences around a multi-line measure are not part of its DAX', () => {
  const TMDLParser = parser();
  const files = [
    file('model.tmdl', 'model Model\n\tculture: en-US\n'),
    file('table.tmdl', 'table T\n\tmeasure A = ```\n\t\t\tCALCULATE (\n\t\t\t    [B],\n\t\t\t    T[x] = 1\n\t\t\t)\n\t\t\t```\n\t\tformatString: 0\n\n\tmeasure B = ```SUM ( T[x] )```\n\n\tmeasure C = 1 + 1\n'),
  ];
  const ms = TMDLParser.parseTMDL(files).tables[0].measures;
  assert.equal(ms[0].dax, 'CALCULATE (\n    [B],\n    T[x] = 1\n)');
  assert.equal(ms[0].fmt, '0');
  assert.equal(ms[1].dax, 'SUM ( T[x] )');
  assert.equal(ms[2].dax, '1 + 1');
});

test('unfence drops ``` fences that an older import left in a stored measure', () => {
  const { unfence } = parser();
  assert.equal(unfence('```\nSUM ( x )\n```'), 'SUM ( x )');
  assert.equal(unfence('SUM ( x )'), 'SUM ( x )');
  assert.equal(unfence(undefined), '');
});

test('relationship identities preserve escaped names and distinguish parallel edges', () => {
  const p=parser();
  const model=p.parseTMDL([
    file('model.tmdl','model Model\n'),
    file('A.tmdl','table A\n\tcolumn ID\n\t\tdataType: int64\n'),
    file('B.tmdl','table B\n\tcolumn ID\n\t\tdataType: int64\n'),
    file('relationships.tmdl',"relationship '''Quoted'''\n\tfromColumn: A.ID\n\ttoColumn: B.ID\nrelationship Other\n\tfromColumn: A.ID\n\ttoColumn: B.ID\n")
  ],{strictRelationships:true});
  assert.deepEqual(Array.from(model.relationships,r=>r.name),["'Quoted'",'Other']);
});

test('table-group annotations survive TMDL and BIM without borrowing measure display folders', () => {
  const p=parser();const m=p.parseTMDL([file('T.tmdl',`table Sales
\tannotation TabularEditor_TableGroup = "Revenue ""Core"""
\tcolumn Amount
\t\tdataType: double
\tmeasure Total = SUM(Sales[Amount])
\t\tdisplayFolder: Other Folder
\tpartition Sales = calculated
\t\tsource = {1}
`)]);
  assert.equal(m.tables[0].tableGroup,'Revenue "Core"');assert.equal(m.tables[0].domain,'Revenue "Core"');
  const b=p.parseBIM({model:{tables:[{name:'Sales',annotations:[{name:'TabularEditor_TableGroup',value:'Revenue'}],columns:[{name:'Amount'}],partitions:[{source:{type:'calculated',expression:'{1}'}}]}]}});
  assert.equal(b.tables[0].tableGroup,'Revenue');assert.equal(b.tables[0].domain,'Revenue');
  const noGroup=p.parseBIM({model:{tables:[{name:'T',columns:[{name:'a'},{name:'b'}],measures:[{name:'M',expression:'1',displayFolder:'Finance'}]}]}});
  assert.notEqual(noGroup.tables[0].domain,'Finance');
});

test('source grouping captures SQL database and Fabric navigation identities', () => {
  const p=parser();const parse=expression=>p.parseBIM({model:{tables:[{name:'T',columns:[{name:'x'}],partitions:[{source:{type:'m',expression}}]}]}}).tables[0].source;
  assert.equal(parse('let Source = Sql.Database("host", "db1"), T = Source{[Schema="gold",Item="Sales"]}[Data] in T').database,'db1');
  const s=parse('let Source = PowerPlatform.Dataflows(null), W = Source{[workspaceId="w1"]}[Data], D = W{[dataflowId="d1"]}[Data], T = D{[entity="Sales"]}[Data] in T');
  assert.equal(s.workspace,'w1');assert.equal(s.dataflow,'d1');
});

test('Python and browser parsers agree on table folders and connection grouping metadata', () => {
  const {spawnSync}=require('node:child_process');
  const input={model:{tables:[{name:'Fact',annotations:[{name:'TabularEditor_TableGroup',value:'Operations'}],columns:[{name:'Amount'}],partitions:[{source:{type:'m',expression:'let S = Sql.Database("server", "db"), T = S{[Schema="gold",Item="Sales"]}[Data] in T'}}]},
    {name:'Manual',annotations:[{name:'TabularEditor_TableGroup',value:'Operations'}],columns:[{name:'Value'}],partitions:[{source:{type:'m',expression:'#table({"Value"}, {{1}})'}}]}]}};
  const script=`import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('parser',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.parse_bim(json.load(sys.stdin))))`;
  const r=spawnSync('python3',['-c',script,path.join(jsDir,'../scripts/tmdl_to_model_data.py')],{input:JSON.stringify(input),encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const py=JSON.parse(r.stdout),browser=parser().parseBIM(input);
  for(let i=0;i<2;i++){
    assert.equal(py.tables[i].tableGroup,browser.tables[i].tableGroup);
    assert.equal(py.tables[i].domain,browser.tables[i].domain);
    assert.deepEqual(py.tables[i].source,JSON.parse(JSON.stringify(browser.tables[i].source)));
  }
});

test('Direct Lake entity partitions are a Direct Lake source, not a calculated table', () => {
  const entity = { name: 'F_Koszty', columns: [{ name: 'Id' }], partitions: [{ mode: 'directLake', source: { type: 'entity', entityName: 'F_Koszty', schemaName: 'dbo', expressionSource: 'DatabaseQuery' } }] };
  const calc = { name: 'Okres', columns: [{ name: 'Id' }], partitions: [{ source: { type: 'calculated', expression: 'DISTINCT(Date[Year])' } }] };
  const input = { model: { tables: [entity, calc] } };
  const bim = parser().parseBIM(input);
  assert.deepEqual(JSON.parse(JSON.stringify(bim.tables[0].source)), { kind: 'directlake', label: 'Direct Lake', detail: 'dbo.F_Koszty', schema: 'dbo', table: 'F_Koszty' });
  assert.equal(bim.tables[1].source.kind, 'calculated');
  const tmdl = parser().parseAny([file('definition/tables/F_Koszty.tmdl', "table F_Koszty\n\tcolumn Id\n\t\tdataType: int64\n\n\tpartition F_Koszty = entity\n\t\tmode: directLake\n\t\tsource\n\t\t\tentityName: F_Koszty\n\t\t\tschemaName: dbo\n\t\t\texpressionSource: DatabaseQuery\n")]);
  assert.equal(tmdl.tables[0].source.kind, 'directlake');
  assert.equal(tmdl.tables[0].source.detail, 'dbo.F_Koszty');
  const { spawnSync } = require('node:child_process');
  const script = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('parser',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.parse_bim(json.load(sys.stdin))))`;
  const r = spawnSync('python3', ['-c', script, path.join(jsDir, '../scripts/tmdl_to_model_data.py')], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).tables[0].source, JSON.parse(JSON.stringify(bim.tables[0].source)));
});
