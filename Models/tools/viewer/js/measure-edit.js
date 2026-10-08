(function (g, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else g.SMVMeasureEdit = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
'use strict';

// Deliberately narrow source patcher: ordinary tab-indented TMDL measures only.
// The viewer's projection is never used to serialize the rest of the model.
function prepareDaxPatch(text, table, measure, dax) {
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
function prepareMeasurePatch(text, table, measure, dax, metadata) {
  if (metadata === undefined) return prepareDaxPatch(text, table, measure, dax);
  const keys = ['description', 'displayFolder', 'formatString'];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(k => !keys.includes(k))) throw new Error('Invalid measure metadata.');
  for (const key of Object.keys(metadata)) {
    const value = metadata[key];
    if (typeof value !== 'string' || value.length > 65536 || /[\u0000\r]/.test(value) || (key !== 'description' && /\n/.test(value))) throw new Error('Invalid ' + key + ' value. Use LF description lines and single-line folder/format values.');
  }
  // Locate through the same bounded expression validator; never serialize a projection.
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
  const unq = s => s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
  const i = lines.findIndex(l => { const m = /^\tmeasure\s+('(?:[^']|'')*'|[^'=\r\n]+?)\s*=/.exec(l); return m && unq(m[1].trim()) === measure; });
  if ([table, measure].some(n => typeof n !== 'string' || !n || /[\r\n\u0000]/.test(n))) throw new Error('Invalid measure identity.');
  const tables = lines.filter(l => /^\uFEFF?table\s/.test(l));
  if (tables.length !== 1 || unq(tables[0].replace(/^\uFEFF?table\s+/, '').trim()) !== table || i < 0) return null;
  if (lines.filter(l => { const m = /^\tmeasure\s+('(?:[^']|'')*'|[^'=\r\n]+?)\s*=/.exec(l); return m && unq(m[1].trim()) === measure; }).length !== 1) throw new Error('Duplicate measure declarations.');
  const probe = dax === undefined ? { original: '' } : prepareDaxPatch(text, table, measure, dax);
  let end = i + 1;
  while (end < lines.length && (!lines[end].trim() || /^\t\t/.test(lines[end]))) end++;
  let start = i;
  while (start > 0 && /^\t\/\/\//.test(lines[start - 1])) start--;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  let body = lines.slice(i, end);
  const before = lines.slice(start, end).join('');
  let comments = lines.slice(start, i).join('');
  if (Object.hasOwn(metadata, 'description')) {
    if (body.some(l => /^\t\tdescription[ \t]*:/i.test(l))) throw new Error('Unsupported description layout. Edit the source file instead.');
    comments = metadata.description ? metadata.description.split('\n').map(l => '\t///' + (l ? ' ' + l : '') + nl).join('') : '';
  }
  for (const key of ['displayFolder', 'formatString']) {
    if (!Object.hasOwn(metadata, key)) continue;
    if (key === 'formatString' && body.some(l => /^\t\tformatStringDefinition\b/i.test(l))) throw new Error('Dynamic format strings are unsupported. Edit the source file instead.');
    const re = new RegExp('^\\t\\t' + key + '[ \\t]*:', 'i');
    const hits = body.map((l, j) => re.test(l) ? j : -1).filter(j => j >= 0);
    if (hits.length > 1) throw new Error('Duplicate ' + key + ' properties.');
    if (hits.length && (!body[hits[0]].replace(/\r?\n$/, '').slice(body[hits[0]].indexOf(':') + 1).trim() || (body[hits[0] + 1] && /^\t{3}/.test(body[hits[0] + 1])))) throw new Error('Unsupported ' + key + ' layout. Edit the source file instead.');
    const value = metadata[key];
    const line = value ? '\t\t' + key + ': "' + value.replace(/"/g, '""') + '"' + nl : '';
    if (hits.length) body.splice(hits[0], 1, line);
    else if (line) {
      let at = body.length;
      while (at > 0 && !body[at - 1].trim()) at--;
      if (at && !/\n$/.test(body[at - 1])) body[at - 1] += nl;
      body.splice(at, 0, line);
    }
  }
  let next = lines.slice(0, start).join('') + comments + body.join('') + lines.slice(end).join('');
  if (dax !== undefined) next = prepareDaxPatch(next, table, measure, dax).text;
  return { text: next, original: probe.original, before, after: next.slice(lines.slice(0, start).join('').length, next.length - lines.slice(end).join('').length) };
}
return { prepareMeasurePatch };

});
