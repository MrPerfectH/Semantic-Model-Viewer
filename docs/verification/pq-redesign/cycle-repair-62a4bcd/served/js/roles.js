/* Table role rules — one engine shared by the browser parser, the app and (mirrored) the
   Python build script. A rule is { role, name, sides, measures, kind }; every non-empty
   condition must hold (AND); the first matching rule wins; a rule with no conditions is
   the fallback. The SMV_Role annotation is not a rule — it always wins, so a role pinned
   in the model can never be undone by a rule set. Keep DEFAULT_RULES identical to
   scripts/tmdl_to_model_data.py. */
(function (g) {
  'use strict';

  var ROLES = ['fact', 'dim', 'helper', 'standalone'];
  var STRUCTURAL = { calcgroup: 1, fieldparam: 1, measures: 1 };

  var DEFAULT_RULES = [
    { role: 'fact',       name: '(^|[._])(fact|fct)_', sides: '',           measures: '', kind: '' },
    { role: 'dim',        name: '(^|[._])dim_',        sides: '',           measures: '', kind: '' },
    { role: 'helper',     name: '',                    sides: 'none',       measures: '', kind: 'manual' },
    { role: 'helper',     name: '',                    sides: 'none',       measures: '', kind: 'calculated' },
    { role: 'standalone', name: '',                    sides: 'none',       measures: '', kind: '' },
    { role: 'fact',       name: '',                    sides: 'many',       measures: '', kind: '' },
    { role: 'dim',        name: '',                    sides: 'one',        measures: '', kind: '' },
    { role: 'fact',       name: '',                    sides: 'mostlyMany', measures: '', kind: '' },
    { role: 'dim',        name: '',                    sides: 'mostlyOne',  measures: '', kind: '' },
    { role: 'dim',        name: '',                    sides: '',           measures: '', kind: '' }
  ];

  var SIDES = {
    '':           { label: 'any relationships',            test: function () { return true; } },
    none:         { label: 'no relationships',             test: function (s) { return s.many + s.one === 0; } },
    many:         { label: 'only on the many side',        test: function (s) { return s.many > 0 && s.one === 0; } },
    one:          { label: 'only on the one side',         test: function (s) { return s.one > 0 && s.many === 0; } },
    both:         { label: 'on both sides',                test: function (s) { return s.many > 0 && s.one > 0; } },
    mostlyMany:   { label: 'more many than one',           test: function (s) { return s.many > s.one; } },
    mostlyOne:    { label: 'more one than many',           test: function (s) { return s.one > s.many; } }
  };
  var MEASURES = {
    '':   { label: 'any measures', test: function (n) { return true; } },
    any:  { label: 'has measures', test: function (n) { return n > 0; } },
    none: { label: 'no measures',  test: function (n) { return n === 0; } }
  };
  var KINDS = {
    '':         { label: 'any source',       test: function (k) { return true; } },
    source:     { label: 'from a source',    test: function (k) { return k !== 'manual' && k !== 'calculated'; } },
    manual:     { label: 'manual table',     test: function (k) { return k === 'manual'; } },
    calculated: { label: 'calculated table', test: function (k) { return k === 'calculated'; } }
  };

  /* {name: {many, one}} — which side of its relationships each table sits on */
  function sidesOf(rels) {
    var s = {};
    var tick = function (n, card) { s[n] = s[n] || { many: 0, one: 0 }; s[n][card === 'one' ? 'one' : 'many']++; };
    (rels || []).forEach(function (r) { tick(r.from, r.fromCard || 'many'); tick(r.to, r.toCard || 'one'); });
    return s;
  }

  function nameRe(rule) {
    if (!rule.name) return null;
    if (rule._re === undefined || rule._reSrc !== rule.name) {
      try { rule._re = new RegExp(rule.name, 'i'); } catch (e) { rule._re = null; }
      rule._reSrc = rule.name;
    }
    return rule._re;
  }

  /* sig = { name, sourceTable, kind, sides:{many,one}, measureCount } */
  function matches(rule, sig) {
    var re = nameRe(rule);
    if (rule.name && !(re && (re.test(sig.sourceTable || '') || re.test(sig.name || '')))) return false;
    if (!(SIDES[rule.sides || ''] || SIDES['']).test(sig.sides)) return false;
    if (!(MEASURES[rule.measures || ''] || MEASURES['']).test(sig.measureCount || 0)) return false;
    if (!(KINDS[rule.kind || ''] || KINDS['']).test(sig.kind || '')) return false;
    return true;
  }

  /* -> { role, via } where via is 'annotation', a rule index, or 'none' */
  function classify(sig, rules, ann) {
    var a = String(ann || '').toLowerCase();
    if (ROLES.indexOf(a) >= 0) return { role: a, via: 'annotation' };
    rules = rules || DEFAULT_RULES;
    for (var i = 0; i < rules.length; i++) if (matches(rules[i], sig)) return { role: rules[i].role, via: i };
    return { role: 'unknown', via: 'none' };
  }

  function sigOf(t, sides) {
    return { name: t.name, sourceTable: (t.source && t.source.table) || '', kind: (t.source && t.source.kind) || '',
      sides: sides[t.name] || { many: 0, one: 0 }, measureCount: t.measureCount != null ? t.measureCount : (t.measures || []).length };
  }

  function describe(rule) {
    var parts = [];
    if (rule.name) parts.push('name ~ /' + rule.name + '/');
    if (rule.sides) parts.push(SIDES[rule.sides] ? SIDES[rule.sides].label : rule.sides);
    if (rule.measures) parts.push(MEASURES[rule.measures] ? MEASURES[rule.measures].label : rule.measures);
    if (rule.kind) parts.push(KINDS[rule.kind] ? KINDS[rule.kind].label : rule.kind);
    return parts.length ? parts.join(' · ') : 'everything else';
  }

  function clean(rules) {
    return (rules || []).map(function (r) {
      return { role: ROLES.indexOf(r.role) >= 0 ? r.role : 'dim', name: String(r.name || ''), sides: SIDES[r.sides] ? r.sides : '',
        measures: MEASURES[r.measures] ? r.measures : '', kind: KINDS[r.kind] ? r.kind : '' };
    });
  }

  // Patch only a table-level annotation; preserve expressions and child annotations verbatim.
  function patchTMDL(text, name, role) {
    if (role !== 'auto' && ROLES.indexOf(role) < 0) throw new Error('Invalid table role.');
    var lines = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
    var headers = [];
    lines.forEach(function (line, i) {
      var m = line.match(/^table\s+('(?:[^']|'')*'|[^\r\n]+?)\s*(?:\r?\n)?$/);
      if (m) {
        var n = m[1]; if (n[0] === "'") n = n.slice(1, -1).replace(/''/g, "'");
        headers.push({name:n, index:i});
      }
    });
    var matches = headers.filter(function (h) { return h.name === name; });
    if (!matches.length) return null;
    if (headers.length !== 1) throw new Error('Expected one table per TMDL file.');
    var hits = [];
    lines.forEach(function (line, i) { if (/^\tannotation\s+SMV_Role\s*=/i.test(line)) hits.push(i); });
    if (hits.length > 1) throw new Error('Duplicate SMV_Role annotations. Resolve them before saving.');
    var nl = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    if (hits.length) {
      var idx = hits[0], ending = (lines[idx].match(/\r?\n$/) || [''])[0];
      lines[idx] = role === 'auto' ? '' : '\tannotation SMV_Role = ' + role + ending;
    } else if (role !== 'auto') {
      var h = matches[0].index;
      if (!/\n$/.test(lines[h])) lines[h] += nl;
      lines.splice(h + 1, 0, '\tannotation SMV_Role = ' + role + nl);
    }
    return lines.join('');
  }

  g.Roles = { patchTMDL: patchTMDL, ROLES: ROLES, STRUCTURAL: STRUCTURAL, DEFAULT_RULES: DEFAULT_RULES, SIDES: SIDES, MEASURES: MEASURES, KINDS: KINDS,
    sidesOf: sidesOf, sigOf: sigOf, classify: classify, describe: describe, clean: clean,
    defaults: function () { return clean(DEFAULT_RULES); } };
})(typeof window !== 'undefined' ? window : globalThis);
