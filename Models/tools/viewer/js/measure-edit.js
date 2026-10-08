(function (g, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else g.SMVMeasureEdit = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
'use strict';

// Deliberately narrow source patcher: ordinary tab-indented TMDL measures only.
// The viewer's projection is never used to serialize the rest of the model.
function prepareMeasurePatch(text, table, measure, dax) {
  if (typeof dax !== 'string' || !dax.trim() || dax.length > 1024 * 1024 || /[\u0000\r]/.test(dax)) throw new Error('Enter a non-empty DAX formula using LF line endings.');
  if ([table, measure].some(n => typeof n !== 'string' || !n || /[\r\n\u0000]/.test(n))) throw new Error('Invalid measure identity.');
  const name = s => s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
  const tables = lines.filter(l => /^\uFEFF?table\s/.test(l)).map(l => l.replace(/^\uFEFF?table\s+/, '').trim());
  if (tables.length !== 1 || name(tables[0]) !== table) return null;
  const hits = [];
  lines.forEach((l, i) => {
    const m = /^\tmeasure\s+('(?:[^']|'')*'|[^'=\r\n]+?)\s*=([^\r\n]*)/.exec(l);
    if (m && name(m[1].trim()) === measure) hits.push({ i, inline: m[2].trim() });
  });
  if (!hits.length) return null;
  if (hits.length !== 1) throw new Error('Duplicate measure declarations.');
  const { i, inline } = hits[0];
  let end = i + 1;
  while (end < lines.length && /^\t{3}/.test(lines[end])) end++;
  if (inline.includes('```') || lines.slice(i + 1, end).some(l => l.includes('```')) || (end < lines.length && /^\t\t\S/.test(lines[end]) && !/^\t\t(?:[A-Za-z][\w]*\s*:|annotation\s|isHidden\s*$)/.test(lines[end].trimEnd()))) throw new Error('This expression uses an unsupported TMDL layout. Edit the source file instead.');
  if (inline && end > i + 1) throw new Error('This expression uses an unsupported TMDL layout.');
  let boundary = end;
  while (boundary < lines.length && !lines[boundary].trim()) boundary++;
  if (boundary > end && boundary < lines.length && /^\t{3}/.test(lines[boundary])) throw new Error('This expression uses an unsupported TMDL layout.');
  const original = inline || lines.slice(i + 1, end).map(l => l.replace(/^\t{3}/, '').replace(/\r?\n$/, '')).join('\n');
  if (!original.trim()) throw new Error('This expression uses an unsupported TMDL layout.');
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const header = /^(\tmeasure\s+(?:'(?:[^']|'')*'|[^'=\r\n]+?)\s*=)/.exec(lines[i])[1];
  const replacement = header + nl + dax.split('\n').map(l => '\t\t\t' + l).join(nl) + (end < lines.length || /\n$/.test(lines[end - 1]) ? nl : '');
  return { text: lines.slice(0, i).join('') + replacement + lines.slice(end).join(''), original };
}
return { prepareMeasurePatch };
});
