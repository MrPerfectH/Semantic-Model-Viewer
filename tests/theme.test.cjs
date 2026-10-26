const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Models/tools/viewer');

function runtime(stored = {}) {
  const attrs = {}, storage = new Map(Object.entries(stored));
  const context = {document:{documentElement:{setAttribute:(k,v)=>attrs[k]=v},querySelector:()=>null,getElementById:()=>null},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}, Map, Set};
  context.window = context;
  vm.createContext(context);
  for (const file of ['util','snapshot','theme']) vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),context);
  return {context,storage,attrs};
}

test('appearance persists, normalizes unknown values, and restores Classic',()=>{
  const {context:c,storage,attrs}=runtime({'smv-theme':'unknown'});
  c.ViewerTheme.init();assert.equal(attrs['data-theme'],'classic');
  c.ViewerTheme.set('spellbook');assert.equal(storage.get('smv-theme'),'spellbook');
  c.ViewerTheme.init();assert.equal(attrs['data-theme'],'spellbook');
  c.ViewerTheme.set('classic');assert.equal(attrs['data-theme'],'classic');
});

test('snapshot appearance is isolated from recipient storage and old snapshots default to Classic',()=>{
  const {context:c,storage,attrs}=runtime({'smv-theme':'classic'});
  const seed=c.Snapshots.seedStorage({settings:{theme:'spellbook'}});
  c.U.store.useMemory(seed);c.ViewerTheme.init();
  assert.equal(attrs['data-theme'],'spellbook');
  c.ViewerTheme.set('classic');c.ViewerTheme.set('spellbook');
  assert.equal(storage.get('smv-theme'),'classic');
  assert.equal(c.Snapshots.seedStorage({})['smv-theme'],'classic');
});

test('legacy neutral tokens retain original fallback and semantic colors',()=>{
  const {context:c}=runtime();
  const css=c.ViewerTheme.inlineStyle('background:#fff;color:#1f2430;border:1px solid #e4e7ec;');
  assert.match(css,/background:var\(--smv-surface,#fff\)/);
  assert.match(css,/color:var\(--smv-ink,#1f2430\)/);
  assert.match(css,/border:1px solid var\(--smv-line,#e4e7ec\)/);
  const semantic='background:#2563eb;color:#fff;border-color:#dc2626;';
  assert.equal(c.ViewerTheme.inlineStyle(semantic),semantic);
});

test('Spellbook palette preserves axes and Classic preference without mutating source colors',()=>{
  const {context:c,storage}=runtime({'smv-palette':'vivid'});
  const base={domain:{Commercial:'#0d9488',Vena:'#7c3aed'},schema:{finance:'#2563eb'},source:{other:'#64748b',calculated:'#c026d3'},list:['#2563eb'],edge:{out:'#2563eb',in:'#0d9488'},fallback:'#64748b'};
  const original=JSON.stringify(base);
  c.ViewerTheme.init();assert.equal(c.ViewerTheme.palette(base),base);
  c.ViewerTheme.set('spellbook');const themed=c.ViewerTheme.palette(base);
  for(const axis of ['domain','schema','source'])assert.deepEqual(Object.keys(themed[axis]),Object.keys(base[axis]));
  assert.notEqual(themed.domain.Commercial,themed.domain.Vena);
  assert.equal(themed.domain.Commercial,themed.list[0], 'group names no longer have project-specific palette rules');
  assert.notEqual(themed.edge.in,themed.edge.out);
  assert.ok(themed.list.every(color=>/^#[0-9a-f]{6}$/.test(color)));
  assert.equal(JSON.stringify(base),original);assert.equal(storage.get('smv-palette'),'vivid');
  c.ViewerTheme.set('classic');assert.equal(c.ViewerTheme.palette(base),base);
});

test('VS Code automatic palettes retain distinct hues instead of passing map indices as contrast settings',()=>{
  const {context:c}=runtime();c.SMVHost={kind:'vscode',theme:'dark'};c.document.body={};
  c.getComputedStyle=()=>({getPropertyValue:()=> '#1e1e1e'});
  const base={domain:{},schema:{},source:{},edge:{},list:['#4f8ff7','#18b9a6','#9b7bf0'],fallback:'#8896aa'};
  const result=c.ViewerTheme.palette(base);
  assert.equal(new Set(result.list).size,3);assert.ok(result.list.every(c=>c!=='#ffffff'));
});
