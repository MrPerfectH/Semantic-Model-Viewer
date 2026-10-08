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
