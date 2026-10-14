/* Lossless source rename planner. Supported input: complete original TMDL file set.
 * Unsupported BIM, perspectives/cultures and unknown name-bearing syntax block saves.
 * DAX lexical references are resolved against declarations; ambiguous bare names block.
 * This checks source references, not engine or report equivalence. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ModelRename = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var identifier = "(?:'(?:[^']|'')*'|[\\p{L}_][\\p{L}\\p{M}\\p{N}_ ]*)";
    function decode(s) { s = s.trim(); return s[0] === "'" ? s.slice(1, -1).replace(/''/g, "'") : s; }
    function quote(s) { return "'" + s.replace(/'/g, "''") + "'"; }
    function same(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
    function lex(text) {
        var re = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|--[^\r\n]*|"(?:[^"]|"")*"|'(?:[^']|'')*'|\[(?:[^\]]|\]\])*\]|[\p{L}_][\p{L}\p{M}\p{N}_]*|\s+|./gu;
        var tokens = [], m;
        while ((m = re.exec(text))) {
            if (/^\s+$/.test(m[0]) || /^(\/\*|\/\/|--|\")/.test(m[0])) continue;
            tokens.push({ value: m[0], start: m.index, end: re.lastIndex });
        }
        return tokens;
    }
    function blockCommentState(text, open) {
        for (var i=0;i<text.length;i++) {
            if (open) { if (text.slice(i,i+2)==='*/') {open=false;i++;} continue; }
            if (text.slice(i,i+2)==='/*') {open=true;i++;continue;}
            if (text.slice(i,i+2)==='//' || text.slice(i,i+2)==='--') break;
            if (text[i]==='"' || text[i] === "'") {
                var delimiter=text[i];
                while (++i<text.length) { if(text[i]===delimiter){if(text[i+1]===delimiter)i++;else break;} }
            }
        }
        return open;
    }
    function planModelRename(files, request) {
        var blockers = [], diagnostics = [], output = [], changes = [], objects = [], parsed = [];
        if (!request || !['table', 'column', 'measure'].includes(request.kind)) return { files: [], changes: [], diagnostics: [], blockers: ['Unsupported rename kind.'] };
        var r = request;
        if (typeof r.newName !== 'string' || !r.newName.trim() || /[\r\n\x00-\x1f]/.test(r.newName)) blockers.push('New name must be nonempty and contain no control characters.');
        if (same(r.name, r.newName)) blockers.push('New name must differ beyond letter case.');
        (files || []).forEach(function (file) {
            if (/\.bim$/i.test(file.path)) { blockers.push('BIM source renaming is unsupported.'); return; }
            if (!/\.tmdl$/i.test(file.path)) return;
            var lines = [], offset = 0, table = null, expression = null, mBlock = null;
            file.text.split(/(?<=\n)/).forEach(function (raw) {
                var line = raw.replace(/[\r\n]+$/, ''), indent = (line.match(/^\s*/) || [''])[0].length;
                var trimmed = line.trim();
                if (mBlock && trimmed && indent <= mBlock.indent) mBlock = null;
                if (mBlock) { lines.push({text: line, offset: offset, table: table, skip: true}); offset += raw.length; return; }
                if (/^expression\s+.+\s*=/.test(trimmed) || /^partition\s+.*=\s*m\s*$/.test(trimmed)) {
                    mBlock = {indent: indent}; expression = null;
                    lines.push({text: line, offset: offset, table: table, skip: true}); offset += raw.length; return;
                }
                var declaration = new RegExp('^\\s*(table|column|measure)\\s+(' + identifier + ')(?=\\s*=|\\s*$)', 'u').exec(line);
                if (/^\s*(table|column|measure)\s+/.test(line) && !declaration) blockers.push(file.path + ': unsupported object declaration syntax.');
                if (declaration) {
                    declaration[2] = declaration[2].trimEnd();
                    var name = decode(declaration[2]);
                    if (declaration[1] === 'table') table = name;
                    objects.push({ kind: declaration[1], table: table, name: name, path: file.path, start: offset + line.indexOf(declaration[2]), end: offset + line.indexOf(declaration[2]) + declaration[2].length });
                }
                var permission = new RegExp('^\\s*tablePermission\\s+(' + identifier + ')\\s*$', 'u').exec(line);
                if (permission) table = decode(permission[1]);
                if (/^(perspective|culture)\s+/.test(trimmed)) blockers.push(file.path + ': perspectives/translations require a dedicated reference parser.');
                if (expression && expression.fenced && trimmed === '```') { lines.push({text:line,offset:offset,table:table,dax:true,begin:0,expression:expression}); expression=null; offset+=raw.length; return; }
                if (expression && !expression.fenced && !expression.comment && trimmed && (indent <= expression.indent || (!expression.calculated && (/^[A-Za-z][A-Za-z0-9]*\s*:/.test(trimmed) || /^(formatStringDefinition|annotation|lineageTag)\b/.test(trimmed))))) expression = null;
                var exprStart = /^(measure|column|calculationItem)\s+/.test(trimmed) && line.includes('=');
                exprStart = exprStart || /^(filterExpression|formatStringDefinition|expression)\s*=/.test(trimmed);
                if (/^partition\s+.*=\s*calculated\s*$/.test(trimmed)) expression = { indent: indent, calculated: true };
                var sourceStart = expression && expression.calculated && /^source\s*=/.test(trimmed);
                var dax = false, begin = 0;
                if (exprStart || sourceStart) { expression = { indent: indent, fenced: /```\s*$/.test(line) }; dax = true; begin = line.indexOf('=') + 1; }
                else if (expression && !expression.calculated && (!trimmed || indent > expression.indent || trimmed === '```')) dax = true;
                if (dax && expression) expression.comment=blockCommentState(line.slice(begin), expression.comment);
                lines.push({ text: line, offset: offset, table: table, dax: dax, begin: begin, expression: dax ? expression : null });
                offset += raw.length;
            });
            if (expression && (expression.fenced || expression.comment)) blockers.push(file.path + ': unterminated DAX fence or comment.');
            parsed.push({ file: file, lines: lines });
        });
        var targets = objects.filter(function (o) { return o.kind === r.kind && same(o.name, r.name) && (r.kind === 'table' || same(o.table, r.table)); });
        if (targets.length !== 1) blockers.push('Target must resolve to exactly one original declaration.');
        objects.forEach(function (o) {
            if (same(o.name, r.newName) && ((r.kind === 'table' && o.kind === 'table') || (r.kind === 'measure' && o.kind === 'measure') || (r.kind !== 'table' && o.kind !== 'table' && same(o.table, r.table)))) blockers.push('New name collides with an existing object.');
        });
        parsed.forEach(function (entry) {
            var patches = [];
            function patch(start, end, text) { if (!patches.some(function (p) { return p.start === start && p.end === end; })) patches.push({ start: start, end: end, text: text }); }
            targets.filter(function (o) { return o.path === entry.file.path; }).forEach(function (o) { patch(o.start, o.end, quote(r.newName)); });
            var processingLines = [];
            entry.lines.forEach(function (line) {
                var previous = processingLines[processingLines.length - 1];
                if (line.dax && previous && previous.dax && previous.expression === line.expression) previous.text += entry.file.text.slice(previous.offset + previous.text.length, line.offset) + line.text;
                else processingLines.push(Object.assign({}, line));
            });
            processingLines.forEach(function (line) {
                if (line.skip) return;
                if (line.dax) {
                    var tokens = lex(line.text.slice(line.begin)), vars = new Set();
                    tokens.forEach(function (t, i) { if (same(t.value, 'VAR') && tokens[i + 1]) vars.add(tokens[i + 1].value.toLowerCase()); });
                    var hasVirtualColumns = tokens.some(function(t,i) { return /^(SELECTCOLUMNS|ADDCOLUMNS|ROW|SUMMARIZE|SUMMARIZECOLUMNS|GROUPBY)$/i.test(t.value) && tokens[i+1] && tokens[i+1].value === '('; });
                    if (r.kind === 'table' && vars.has(r.name.toLowerCase())) blockers.push(entry.file.path + ': table name collides with a local DAX variable; scope cannot be proven.');
                    tokens.forEach(function (t, i) {
                        var next = tokens[i + 1], prev = tokens[i - 1];
                        var value = t.value[0] === "'" ? decode(t.value) : t.value;
                        if (r.kind === 'table' && same(value, r.name) && (t.value[0] === "'" || !vars.has(value.toLowerCase())) && (!next || next.value !== '(') && t.value[0] !== '[') patch(line.offset + line.begin + t.start, line.offset + line.begin + t.end, quote(r.newName));
                        if (r.kind === 'table' || t.value[0] !== '[') return;
                        var member = t.value.slice(1, -1).replace(/\]\]/g, ']');
                        if (!same(member, r.name)) return;
                        var qualified = prev && (prev.value[0] === "'" || /^[\p{L}_]/u.test(prev.value)) && !/^(RETURN|IN|AND|OR|NOT|VAR)$/i.test(prev.value);
                        if (qualified && prev.value[0] !== "'" && vars.has(prev.value.toLowerCase())) { blockers.push(entry.file.path + ': variable-qualified member cannot be resolved safely.'); return; }
                        if (!qualified && hasVirtualColumns) { blockers.push(entry.file.path + ': bare reference may refer to a virtual DAX column; scope cannot be proven.'); return; }
                        var candidates = objects.filter(function (o) { return o.kind !== 'table' && same(o.name, member) && (qualified ? same(o.table, decode(prev.value)) : (o.kind === 'measure' || same(o.table, line.table))); });
                        if (!candidates.length) { blockers.push(entry.file.path + ': unresolved DAX reference ' + t.value); return; }
                        if (candidates.length > 1) { blockers.push(entry.file.path + ': ambiguous DAX reference ' + t.value); return; }
                        if (candidates.length === 1 && candidates[0].kind === r.kind && same(candidates[0].table, r.table)) patch(line.offset + line.begin + t.start, line.offset + line.begin + t.end, '[' + r.newName.replace(/\]/g, ']]') + ']');
                    });
                    return;
                }
                var structural = new RegExp('^(\\s*(?:fromColumn|toColumn)\\s*:\\s*)(' + identifier + ')\\.(' + identifier + ')\\s*$', 'u').exec(line.text);
                if (structural) {
                    structural[2]=structural[2].trimEnd(); structural[3]=structural[3].trimEnd();
                    var tableName = decode(structural[2]), columnName = decode(structural[3]);
                    if (r.kind === 'table' && same(tableName, r.name)) patch(line.offset + structural[1].length, line.offset + structural[1].length + structural[2].length, quote(r.newName));
                    if (r.kind === 'column' && same(tableName, r.table) && same(columnName, r.name)) { var start = line.offset + structural[1].length + structural[2].length + 1; patch(start, start + structural[3].length, quote(r.newName)); }
                    return;
                }
                var binding = new RegExp('^(\\s*(?:sortByColumn|column)\\s*:\\s*)(' + identifier + ')\\s*$', 'u').exec(line.text);
                if (binding) binding[2]=binding[2].trimEnd();
                if (binding && r.kind === 'column' && same(line.table, r.table) && same(decode(binding[2]), r.name)) patch(line.offset + binding[1].length, line.offset + binding[1].length + binding[2].length, quote(r.newName));
                var ref = new RegExp('^(\\s*(?:ref table|tablePermission)\\s+)(' + identifier + ')\\s*$', 'u').exec(line.text);
                if (ref) ref[2]=ref[2].trimEnd();
                if (ref && r.kind === 'table' && same(decode(ref[2]), r.name)) patch(line.offset + ref[1].length, line.offset + ref[1].length + ref[2].length, quote(r.newName));
                if (/^\s*(fromColumn|toColumn|sortByColumn|column)\s*:/.test(line.text) && !structural && !binding) blockers.push(entry.file.path + ': unsupported structural binding.');
                if (/^\s*(object|detailRowsDefinition|alternateOf|groupByColumns|variation)\b/.test(line.text)) blockers.push(entry.file.path + ': unsupported name-bearing construct.');
            });
            if (patches.length) {
                patches.sort(function (a, b) { return b.start - a.start; });
                var text = entry.file.text;
                patches.forEach(function (p) { text = text.slice(0, p.start) + p.text + text.slice(p.end); });
                output.push({ path: entry.file.path, text: text, original: entry.file.text });
                changes.push({ path: entry.file.path, kind: 'model', count: patches.length });
            }
        });
        blockers = Array.from(new Set(blockers));
        return { files: blockers.length ? [] : output, changes: blockers.length ? [] : changes, diagnostics: diagnostics, blockers: blockers, objects: objects.map(function (o) { return {kind:o.kind,table:o.table,name:o.name}; }) };
    }
    function listObjects(files) {
        return planModelRename(files, {kind:'table',name:'__smv_inventory_probe__',newName:'__smv_inventory_destination__'}).objects || [];
    }
    return { planModelRename: planModelRename, listObjects: listObjects };
}));
