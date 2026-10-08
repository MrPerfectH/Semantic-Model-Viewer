/* Narrow byte-preserving TMDL relationship patcher, shared by native and browser hosts. */
(function (g) {
  'use strict';
  const atom = "(?:'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_ -]*)";
  const unquote = s => s[0] === "'" ? s.slice(1, -1).replace(/''/g, "'") : s;
  const quote = s => "'" + s.replace(/'/g, "''") + "'";
  const ref = s => { const m = new RegExp('^(' + atom + ')\\.(' + atom + ')$').exec(s); if (!m) throw Error('Unsupported relationship endpoint layout.'); return [unquote(m[1]), unquote(m[2])]; };
  const keys = ['fromColumn','toColumn','fromCardinality','toCardinality','crossFilteringBehavior','isActive'];
  function prepareRelationshipPatch(files, request, newId) {
    const r = request;
    if (!r || [r.fromTable,r.fromColumn,r.toTable,r.toColumn].some(s => typeof s !== 'string' || !s || /[\r\n\x00]/.test(s))) throw Error('Select existing table and column endpoints.');
    if (!['one','many'].includes(r.fromCardinality) || !['one','many'].includes(r.toCardinality) || !['oneDirection','bothDirections'].includes(r.crossFilteringBehavior) || typeof r.isActive !== 'boolean') throw Error('Unsupported relationship settings.');
    if (r.crossFilteringBehavior === 'oneDirection' && r.fromCardinality === 'one') throw Error('One-to-one requires both directions; one-to-many must place the many side at From for one direction.');
    if (r.fromTable === r.toTable) throw Error('Self relationships are unsupported.');
    if (r.relationshipId != null && (typeof r.relationshipId !== 'string' || !r.relationshipId)) throw Error('Invalid relationship identity.');
    const columns = new Map(), relationships = []; let source = null;
    for (const f of files) {
      const text = f.text.replace(/^\uFEFF/, '');
      if (/\.bim$/i.test(f.path)) throw Error('Only TMDL models can be edited.');
      const table = new RegExp('^table (' + atom + ')\\r?$', 'm').exec(text);
      if (table) {
        const name = unquote(table[1]); if (columns.has(name)) throw Error('Duplicate table declarations.');
        const names = [...text.matchAll(new RegExp('^\\tcolumn (' + atom + ')(?:\\s*=.*)?\\r?$', 'gm'))].map(m => unquote(m[1]));
        if (new Set(names).size !== names.length) throw Error('Duplicate column declarations.'); columns.set(name, new Set(names));
      }
      if (/(?:^|\n)[ \t]*relationship\s/.test(text) || /(?:^|\/)relationships\.tmdl$/i.test(f.path)) {
        if (source || f.path !== 'definition/relationships.tmdl') throw Error('Unsupported relationship source layout.'); source = f;
        const lines = f.text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean); let current = null, offset = 0;
        for (const line of lines) {
          const t = line.replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
          const header = /^relationship ([A-Za-z0-9_-]+)$/.exec(t);
          if (header) { if (current) current.end = offset; current = { id:header[1], start:offset, end:f.text.length, props:{}, lines:[] }; relationships.push(current); }
          else if (t.trim() && !/^\s*\/\//.test(t)) {
            const prop = /^\t([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/.exec(t);
            // Scalar unknown properties are preserved, but nested/fenced/annotation layouts fail closed.
            if (!current || !prop || /```/.test(t) || Object.hasOwn(current.props, prop[1])) throw Error('Unsupported relationship source layout.');
            current.props[prop[1]] = prop[2]; current.lines.push({key:prop[1],start:offset,end:offset+line.length,line});
          }
          offset += line.length;
        }
      }
    }
    for (const [t,c] of [[r.fromTable,r.fromColumn],[r.toTable,r.toColumn]]) if (!columns.get(t)?.has(c)) throw Error('Selected endpoint does not exist in the TMDL model.');
    const ids = new Set();
    for (const rel of relationships) {
      if (ids.has(rel.id)) throw Error('Duplicate relationship identities.'); ids.add(rel.id);
      rel.from = ref(rel.props.fromColumn || ''); rel.to = ref(rel.props.toColumn || '');
      if (!columns.get(rel.from[0])?.has(rel.from[1]) || !columns.get(rel.to[0])?.has(rel.to[1])) throw Error('Existing relationship endpoint is unresolved.');
      if (!['one','many'].includes(rel.props.fromCardinality || 'many') || !['one','many'].includes(rel.props.toCardinality || 'one') || !['oneDirection','bothDirections'].includes(rel.props.crossFilteringBehavior || 'oneDirection') || !['true','false'].includes(rel.props.isActive || 'true')) throw Error('Existing relationship settings are unsupported.');
    }
    for (const rel of relationships) {
      if ((rel.props.crossFilteringBehavior || 'oneDirection') === 'oneDirection' && (rel.props.fromCardinality || 'many') === 'one') throw Error('Existing relationship cardinality/direction combination is unsupported.');
    }
    const pair = (a,b) => JSON.stringify([a,b].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))));
    const pairs = new Set();
    for (const rel of relationships) { const p=pair(rel.from,rel.to); if (pairs.has(p)) throw Error('Duplicate relationship endpoint pairs.'); pairs.add(p); }
    const target = relationships.find(x => x.id === r.relationshipId);
    if (r.relationshipId != null && !target) throw Error('Relationship identity is missing from source.');
    const rest = relationships.filter(x => x !== target), wanted = pair([r.fromTable,r.fromColumn],[r.toTable,r.toColumn]);
    if (rest.some(x => pair(x.from,x.to) === wanted)) throw Error('Duplicate relationship endpoint pair.');
    // Conservative boundary: no new active edge within an already connected active component.
    if (r.isActive) {
      const seen = new Set([r.fromTable]); let changed = true;
      while (changed) { changed=false; for (const x of rest.filter(x=>x.props.isActive !== 'false')) { if (seen.has(x.from[0]) !== seen.has(x.to[0])) { seen.add(x.from[0]); seen.add(x.to[0]); changed=true; } } }
      if (seen.has(r.toTable)) throw Error('Potential active-path ambiguity. Make this relationship inactive or edit source with engine validation.');
    }
    const id = target ? target.id : newId;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || (!target && ids.has(id))) throw Error('Invalid new relationship identity.');
    const values = {fromColumn:quote(r.fromTable)+'.'+quote(r.fromColumn),toColumn:quote(r.toTable)+'.'+quote(r.toColumn),fromCardinality:r.fromCardinality,toCardinality:r.toCardinality,crossFilteringBehavior:r.crossFilteringBehavior,isActive:String(r.isActive)};
    const original = source ? source.text : '', nl = original.includes('\r\n') ? '\r\n' : '\n';
    if (/\r(?!\n)/.test(original) || (/\r\n/.test(original) && /(?<!\r)\n/.test(original))) throw Error('Mixed source line endings are unsupported.');
    let before = '', after, text;
    if (target) {
      before = original.slice(target.start,target.end); after=before;
      const patches = target.lines.filter(x=>keys.includes(x.key)).sort((a,b)=>b.start-a.start);
      for (const p of patches) { const start=p.start-target.start,end=p.end-target.start; const prefix=/^\t\w+:[ \t]*/.exec(p.line)[0]; after=after.slice(0,start)+prefix+values[p.key]+(/\r?\n$/.test(p.line)?nl:'')+after.slice(end); }
      const missing=keys.filter(k=>!Object.hasOwn(target.props,k));
      if(missing.length) {
        const tail=/(?:[ \t]*(?:\/\/[^\r\n]*)?(?:\r\n|\n))*$/.exec(after)[0];
        const body=after.slice(0,after.length-tail.length);
        after=body+(body.endsWith('\n')?'':nl)+missing.map(k=>'\t'+k+': '+values[k]+nl).join('')+tail;
      }
      text=original.slice(0,target.start)+after+original.slice(target.end);
    } else { after='relationship '+id+nl+keys.map(k=>'\t'+k+': '+values[k]+nl).join(''); text=original+(original && !original.endsWith('\n')?nl:'')+(original?nl:'')+after; }
    return {path:'definition/relationships.tmdl',text,before,after,relationshipId:id,validation:'Metadata only; engine ambiguity, key uniqueness and data types are not validated.'};
  }
  const api={prepareRelationshipPatch}; if(typeof module!=='undefined'&&module.exports) module.exports=api; g.SMVRelationshipEdit=api;
})(typeof window!=='undefined'?window:globalThis);
