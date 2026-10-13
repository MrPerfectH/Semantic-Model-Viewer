/* Optional appearance, shared by the browser, VS Code and portable snapshots. */
(function (g) {
  'use strict';
  var KEY = 'smv-theme', current = 'classic';
  function normalize(value) { return value === 'spellbook' ? value : 'classic'; }
  function apply(value) {
    current = normalize(value);
    g.document.documentElement.setAttribute('data-theme', current);
    var meta = g.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current === 'spellbook' ? '#632d32' : '#4f46e5');
  }
  function init() { apply(g.U.store.get(KEY, 'classic')); }
  function set(value) { apply(value); g.U.store.set(KEY, current); }

  /* Legacy panels use inline styles. Give their neutral surfaces semantic tokens
     at creation time, with the original value as fallback for Classic. Domain,
     syntax, warning and selection colors deliberately keep their meaning. */
  var surfaces = {
    '#fff':'surface', '#ffffff':'surface',
    '#fcfcfd':'surface', '#f8fafc':'soft', '#f8faff':'soft', '#f8f9fb':'soft',
    '#f4f5f7':'paper', '#f4f6f9':'soft', '#f3f5f8':'soft',
    '#eef0f3':'soft', '#eef1f4':'soft', '#eef2f8':'soft', '#f1f3f6':'soft'
  };
  var inks = {
    '#1f2430':'ink', '#273142':'ink', '#334155':'ink', '#3a414d':'ink', '#3a4d67':'ink',
    '#5b6472':'muted', '#6b7280':'muted', '#65748a':'muted', '#52647d':'muted',
    '#7a828f':'muted', '#8b92a0':'muted', '#9aa1ad':'muted', '#a9afba':'muted'
  };
  var lines = /#(?:e3e6ea|e4e7ec|dfe3e9|dfe6ef|dbe3ee|e6e8ec|eef0f3|dce0e6|e2e7ee)\b/gi;
  function inlineStyle(style) {
    return style.replace(/(^|;)\s*(background(?:-color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?)\s*:\s*([^;]+)/gi,
      function (all, separator, property, value) {
        var trimmed = value.trim(), map = property.indexOf('background') === 0 ? surfaces : property === 'color' ? inks : null;
        var token = map && map[trimmed.toLowerCase()];
        if (token) return separator + property + ':var(--smv-' + token + ',' + trimmed + ')';
        if (property.indexOf('border') === 0) return separator + property + ':' + value.replace(lines, function (color) { return 'var(--smv-line,' + color + ')'; });
        return all;
      });
  }
  g.ViewerTheme = { init:init, set:set, get:function () { return current; }, normalize:normalize, inlineStyle:inlineStyle };
})(window);
