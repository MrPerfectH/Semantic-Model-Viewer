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
  for (const file of ['util.js', 'snapshot.js', 'roles.js', 'usage-adapter.js', 'tmdl-parser.js']) {
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

test('measure multiline descriptions and quoted metadata parse correctly',()=>{
 const model=parser().parseTMDL([file('table.tmdl','table T\n\t/// First\n\t///\n\t/// Third\n\tmeasure M = 1\n\t\tdisplayFolder: "A\\B"\n\t\tformatString: "0 ""units"""\n')]);
 const m=model.tables[0].measures[0]; assert.equal(m.description,'First\n\nThird'); assert.equal(m.folder,'A\\B'); assert.equal(m.fmt,'0 "units"');
});

const { prepareMeasurePatch } = require('../vscode-extension/src/measure-edit');
function measureFrom(text, name = 'M') {
  return parser().parseTMDL([file('T.tmdl', text.replace(/^\uFEFF/, ''))]).tables[0].measures.find(m => m.name === name);
}

test('displayed DAX excludes nested children and parse-patch-reparse preserves their exact bytes', () => {
  for (const expression of ['1', '\r\n\t\t\tVAR x = 1\r\n\t\t\tRETURN x']) {
    const header = '\uFEFFtable T\r\n\tmeasure M = ' + expression + '\r\n';
    const children = '\t\tFormatString : "0"\r\n\t\tformatStringDefinition =\r\n\t\t\texpression = "0.00"\r\n\r\n\t\tannotation Child =\r\n\t\t\tNested payload\r\n\t\tDISPLAYFOLDER : " Folder "\r\n';
    const neighbor = '\r\n\t/// Next description\r\n\tmeasure N =\r\n\t\t\t2\r\n\t\tannotation Next =\r\n\t\t\tOther payload\r\n';
    const source = header + children + neighbor;
    const displayed = measureFrom(source);
    assert.equal(displayed.dax, expression === '1' ? '1' : 'VAR x = 1\nRETURN x');
    assert.equal(displayed.folder, ' Folder '); assert.equal(displayed.fmt, '0');
    const reviewed = prepareMeasurePatch(source, 'T', 'M', displayed.dax + '\n+ 1');
    assert.equal(reviewed.text, '\uFEFFtable T\r\n\tmeasure M =\r\n' + (displayed.dax + '\n+ 1').split('\n').map(l => '\t\t\t' + l).join('\r\n') + '\r\n' + children + neighbor);
    assert.equal(measureFrom(reviewed.text).dax, displayed.dax + '\n+ 1');
    assert.equal(measureFrom(reviewed.text, 'N').dax, '2');
  }
});

test('a first depth-two annotation stops expression continuation permanently for that measure', () => {
  const source = 'table T\n\tmeasure M =\n\t\t\t1\n\t\tannotation Note =\n\t\t\tPayload\n\n\t\tformatStringDefinition =\n\t\t\texpression = "0"\n\t\tformatString: 0\n';
  const m = measureFrom(source); assert.equal(m.dax, '1');
  const result = prepareMeasurePatch(source, 'T', 'M', m.dax + ' + 2');
  assert.equal(result.text, source.replace('\t\t\t1\n', '\t\t\t1 + 2\n'));
  assert.equal(measureFrom(result.text).dax, '1 + 2');
});

test('case and colon variants decode scalars and metadata removal round trips through the patcher', () => {
  const source = 'table T\n\tmeasure M = 1\n\t\tDisplayFolder \t: " My ""Folder"" "\n\t\tFORMATSTRING : "0 ""units"""\n\t\tDescription : "Quoted ""description"""\n';
  const initial = measureFrom(source);
  assert.equal(initial.folder, ' My "Folder" '); assert.equal(initial.fmt, '0 "units"'); assert.equal(initial.description, 'Quoted "description"');
  const result = prepareMeasurePatch(source, 'T', 'M', undefined, { displayFolder: '', formatString: '0.00' });
  const refreshed = measureFrom(result.text);
  assert.equal(refreshed.folder, ''); assert.equal(refreshed.fmt, '0.00'); assert.equal(refreshed.dax, '1');
  assert.ok(result.text.endsWith('\t\tDescription : "Quoted ""description"""\n'));
});

test('first dynamic child is excluded from DAX while existing source patch layout guard remains', () => {
  const source = 'table T\n\tmeasure M = 1\n\t\tformatStringDefinition =\n\t\t\texpression = "0.00"\n';
  const m = measureFrom(source); assert.equal(m.dax, '1');
  assert.throws(() => prepareMeasurePatch(source, 'T', 'M', m.dax + ' + 1'), /unsupported/);
  const edited = prepareMeasurePatch(source, 'T', 'M', undefined, { displayFolder: 'New' });
  assert.ok(edited.text.includes(source.slice(source.indexOf('\t\tformatStringDefinition'))));
  assert.equal(measureFrom(edited.text).dax, '1'); assert.equal(measureFrom(edited.text).folder, 'New');
});

test('relationship projection retains source identity including a BOM first declaration', () => {
  const model = parser().parseTMDL([
    file('A.tmdl', 'table A\n\tcolumn Id\n'), file('B.tmdl', 'table B\n\tcolumn Id\n'),
    file('relationships.tmdl', '\uFEFFrelationship stable-id\n\tfromColumn: A.Id\n\ttoColumn: B.Id\n')
  ]);
  assert.equal(model.relationships[0].name, 'stable-id');
});

test('relationship properties project case-insensitive keys, colon whitespace and supported enum values', () => {
  const files = [file('A.tmdl', 'table A\n\tcolumn Id\n'), file('B.tmdl', 'table B\n\tcolumn Id\n'),
    file('relationships.tmdl', 'relationship stable\n\tFROMCOLUMN \t: A.Id\n\tToColumn : B.Id\n\tFromCardinality : ONE\n\tToCardinality: MANY\n\tIsActive : FALSE\n\tCrossFilteringBehavior : BOTHDIRECTIONS\n')];
  const r = parser().parseTMDL(files).relationships[0];
  assert.equal(r.name, 'stable'); assert.equal(r.from, 'A'); assert.equal(r.to, 'B');
  assert.equal(r.fromCard, 'one'); assert.equal(r.toCard, 'many'); assert.equal(r.inactive, true); assert.equal(r.both, true);
  const unknown = parser().parseTMDL(files.map(f => ({ ...f, text: f.text.replace('BOTHDIRECTIONS', 'Automatic') }))).relationships[0];
  assert.equal(unknown.crossFilteringBehavior, 'Automatic');
});

test('source projection to existing form settings to patch and reparse retains relationship semantics', () => {
  const { prepareRelationshipPatch } = require('../Models/tools/viewer/js/relationship-edit');
  const files = [{name:'A.tmdl',path:'definition/tables/A.tmdl',text:'table A\n\tcolumn Id\n\tcolumn Other\n'},
    {name:'B.tmdl',path:'definition/tables/B.tmdl',text:'table B\n\tcolumn Id\n'},
    {name:'relationships.tmdl',path:'definition/relationships.tmdl',text:'relationship stable\n\tFromColumn : A.Id\n\tToColumn : B.Id\n\tFromCardinality : one\n\tToCardinality : many\n\tIsActive : false\n\tCrossFilteringBehavior : bothDirections\n\tCustomScalar: untouched\n'}];
  const p = parser(), original = p.parseTMDL(files).relationships[0];
  // Mirror the existing form's projected defaults; user changes only From column.
  const patch = prepareRelationshipPatch(files, {relationshipId:original.name,fromTable:original.from,fromColumn:'Other',toTable:original.to,toColumn:original.toCol,
    fromCardinality:original.fromCard,toCardinality:original.toCard,isActive:!original.inactive,crossFilteringBehavior:original.both?'bothDirections':'oneDirection'}, 'unused');
  const result = p.parseTMDL(files.map(f => f.path===patch.path?{...f,text:patch.text}:f)).relationships[0];
  for (const key of ['name','fromCard','toCard','inactive','both']) assert.equal(result[key],original[key],key);
  assert.equal(result.fromCol,'Other'); assert.ok(patch.text.includes('\tCustomScalar: untouched\n'));
  assert.ok(patch.text.includes('\tIsActive : false\n')); assert.ok(patch.text.includes('\tCrossFilteringBehavior : bothDirections\n'));
});
