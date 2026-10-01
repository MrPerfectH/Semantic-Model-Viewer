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
