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
  function set(value) { apply(value); g.U.store.set(KEY, current); if (g.app && g.app.refreshAppearance) g.app.refreshAppearance(); }


  /* The theme owns presentation, not the saved Classic palette preference. Return
     real hex colors because diagram tinting and Canvas2D need numeric RGB values. */
  var pigments = ['#806679', '#68734d', '#80612f', '#713b43', '#76614c', '#53624b', '#98634e', '#67576e'];
  function palette(base) {
    if (current !== 'spellbook') return base;
    var result = {domain:{}, schema:{}, source:{}, list:pigments.slice(),
      edge:{base:'#a08045',out:'#68734d',in:'#806679',hop:'#a08045',pin:'#713b43',lock:'#713b43',marked:'#98634e'}, fallback:'#76614c'};
    var domains = {'Finance / Supply':'#806679',Commercial:'#68734d',Vena:'#67576e',
      'Profit & Loss':'#80612f','Core Dims':'#76614c','Scenario / Helper':'#98634e',
      'Calc Groups':'#80612f','Field Params':'#53624b',Measures:'#713b43',Other:'#76614c'};
    ['domain','schema','source'].forEach(function(axis) {
      Object.keys(base[axis]).forEach(function(key,i) { result[axis][key] = axis === 'domain' ? domains[key] || pigments[i % pigments.length] : pigments[i % pigments.length]; });
    });
    return result;
  }

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
  g.ViewerTheme = { init:init, set:set, get:function () { return current; }, normalize:normalize, palette:palette, inlineStyle:inlineStyle };
})(window);
