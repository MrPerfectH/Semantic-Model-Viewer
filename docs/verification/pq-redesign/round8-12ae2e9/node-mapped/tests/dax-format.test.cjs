/* Run with node --test tests/dax-format.test.cjs. Pure functions, no browser. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const F = require(path.join(__dirname, '../Models/tools/viewer/js/dax-format.js'));

const text = (dax, style) => F.toText(F.format(dax, { style }));
const sample = 'VAR x = CALCULATE(SUM(Sales[Amount]), FILTER(ALL(\'Date\'), \'Date\'[Year] = 2020), Sales[Region] = "EU") RETURN SWITCH(TRUE(), x > 10, DIVIDE(x, [Total], 0), x < -1, -1, BLANK())';

test('long style keeps short calls on one line and splits long ones', () => {
  assert.equal(text(sample, 'long'), [
    'VAR x =',
    '    CALCULATE (',
    '        SUM ( Sales[Amount] ),',
    "        FILTER ( ALL ( 'Date' ), 'Date'[Year] = 2020 ),",
    '        Sales[Region] = "EU"',
    '    )',
    'RETURN',
    '    SWITCH ( TRUE (), x > 10, DIVIDE ( x, [Total], 0 ), x < -1, -1, BLANK () )',
  ].join('\n'));
});

test('short style puts every argument of a multi-argument call on its own line', () => {
  const out = text('DIVIDE(SUM(Sales[A]), [B], 0)', 'short');
  assert.equal(out, ['DIVIDE (', '    SUM ( Sales[A] ),', '    [B],', '    0', ')'].join('\n'));
});

test('operators, unary signs, comments and strings survive formatting', () => {
  assert.equal(text('[A]+[B]*2-SUM(T[x])', 'long'), '[A] + [B] * 2 - SUM ( T[x] )');
  assert.equal(text('-1 + -[A]', 'long'), '-1 + -[A]');
  assert.equal(text('"a ] // b" & [A]', 'long'), '"a ] // b" & [A]');
  assert.match(text('// note\nSUM(T[x])', 'long'), /^\/\/ note\nSUM \( T\[x\] \)$/);
});

test('formatting never changes the tokens of the formula', () => {
  const strip = dax => F.tokenize(dax).map(t => t.v.replace(/\s+/g, '')).join('').replace(/;/g, ',').toUpperCase();
  for (const style of ['long', 'short']) assert.equal(strip(text(sample, style)), strip(sample));
});

const MODEL = {
  '[Profit]': { name: 'Profit', dax: '[Revenue] - 10' },
  '[Revenue]': { name: 'Revenue', dax: 'SUM(Sales[Amount])' },
  '[Loop]': { name: 'Loop', dax: '[Loop] + 1' },
  '[Empty]': { name: 'Empty', dax: '' },
};
const resolve = ref => MODEL[ref] || null;

test('inlining splices measure bodies in parentheses, with fold regions and ghost labels', () => {
  const r = F.formatInlined('DIVIDE([Profit], [Revenue])', 'Margin', resolve, { style: 'long' });
  assert.equal(r.count, 2);
  assert.deepEqual(Array.from(r.cycles), []);
  assert.equal(F.toText(r), 'DIVIDE (\n    (\n        ( SUM ( Sales[Amount] ) )\n        - 10\n    ),\n    ( SUM ( Sales[Amount] ) )\n)');
  const measures = Array.from(r.regions).filter(x => x.kind === 'measure').map(x => x.name);
  assert.deepEqual(measures.sort(), ['Profit', 'Revenue', 'Revenue']);
  for (const region of r.regions) {
    assert.ok(region.to >= region.from && region.closePart >= 0);
    assert.match(r.lines[region.openLine].parts[region.openPart].v, /\($/);
    assert.ok(region.openLine === region.from + (region.kind === 'measure' ? 1 : 0));
    assert.match(r.lines[region.to].parts[region.closePart].v, /\)$/);
  }
  assert.ok(r.lines.some(line => line.parts.some(part => part.ghost && part.k === 'inl')));
});

test('a measure that loops back stays a reference, and empty measures are not inlined', () => {
  const loop = F.formatInlined('[Loop] * 2', 'Top', resolve, { style: 'long' });
  assert.deepEqual(Array.from(loop.cycles), ['Loop']);
  assert.ok(F.toText(loop).includes('[Loop]'));
  const self = F.formatInlined('[Loop]', 'Loop', resolve, { style: 'long' });
  assert.deepEqual(Array.from(self.cycles), ['Loop']);
  const empty = F.formatInlined('[Empty] + 1', 'Top', resolve, { style: 'long' });
  assert.equal(empty.count, 0); assert.equal(F.toText(empty), '[Empty] + 1');
});

test('a diamond of measures hits the size cap instead of exploding', () => {
  const big = {};
  for (let i = 0; i < 20; i++) big['[M' + i + ']'] = { name: 'M' + i, dax: '[M' + (i + 1) + '] + [M' + (i + 1) + '] + ' + 'X'.repeat(50) };
  big['[M20]'] = { name: 'M20', dax: '1' };
  const r = F.formatInlined('[M0]', 'Top', ref => big[ref] || null, { style: 'long' });
  assert.equal(r.capped, true);
});

test('malformed DAX does not throw', () => {
  for (const dax of ['', '(((', 'SUM(', ')))', '"open string', 'VAR', 'RETURN RETURN', '[A', '/* open comment']) {
    assert.doesNotThrow(() => F.toText(F.format(dax, { style: 'long' })), dax);
  }
});

test('an inlined measure puts its label on one line and the "(" on the next, and each level has its own depth', () => {
  const r = F.formatInlined('1 + [Profit]', 'Margin', resolve, { style: 'long' });
  const label = r.lines.findIndex(l => l.parts.some(p => p.k === 'inl' && p.v === '[Profit]'));
  assert.equal(r.lines[label].parts.at(-1).ghost, true);
  assert.equal(r.lines[label + 1].parts[0].v, '(');
  assert.equal(F.toText(r), '1\n+ (\n    ( SUM ( Sales[Amount] ) )\n    - 10\n)');   // the operator keeps its "(" in the copied text
  const depths = Array.from(r.regions).filter(x => x.kind === 'measure').map(x => [x.name, x.depth]);
  assert.deepEqual(depths.sort(), [['Profit', 1], ['Revenue', 2]]);
  const chips = r.lines.flatMap(l => l.parts).filter(p => p.k === 'inl' && p.depth);
  assert.deepEqual(chips.map(p => p.depth).sort(), [1, 2]);
});

test('a block comment that spans lines is printed one line per source line', () => {
  const r = F.format('CALCULATE ( /* a\n   b */ [X], 1 )', { style: 'long' });
  assert.ok(r.lines.every(l => l.parts.every(p => !/\n/.test(p.v))));
  assert.match(F.toText(r), /\/\* a\n\s+b \*\//);
});

test('deep nesting does not push short calls onto many lines', () => {
  let dax = 'IF ( OR ( kp = 130, kp = 131 ), 12.0, 1.0 )';
  for (let i = 0; i < 12; i++) dax = 'CALCULATE ( ' + dax + ', Date[Y] = 1, Date[M] = 2 )';
  const deep = F.toText(F.format(dax, { style: 'long' })).split('\n');
  assert.ok(deep.some(l => /^IF \( OR \( kp = 130, kp = 131 \), 12\.0, 1\.0 \),?$/.test(l.trim())), deep.join('\n'));
});
