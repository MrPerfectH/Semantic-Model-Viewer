/* Optional appearance, shared by the browser, VS Code and portable snapshots. */
(function (g) {
  'use strict';
  var KEY = 'smv-theme', current = 'classic';
  function normalize(value) { return value === 'spellbook' ? value : 'classic'; }
  function hosted() { return g.SMVHost && g.SMVHost.kind === 'vscode'; }
  function dark() { return hosted() && ['dark', 'high-contrast'].indexOf(g.SMVHost.theme) >= 0; }
  function apply(value) {
    current = normalize(value);
    // Keep the portable preference for export, without applying Spellbook over VS Code.
    g.document.documentElement.setAttribute('data-theme', hosted() ? 'vscode' : current);
    var meta = g.document.querySelector('meta[name="theme-color"]');
    if (meta && !hosted()) meta.setAttribute('content', current === 'spellbook' ? '#632d32' : '#4f46e5');
  }
  function init() { apply(g.U.store.get(KEY, 'classic')); }
  function set(value) { apply(value); g.U.store.set(KEY, current); if (g.app && g.app.refreshAppearance) g.app.refreshAppearance(); }
  function syncHost() {
    if (!hosted()) return;
    g.document.documentElement.setAttribute('data-host', 'vscode');
    g.document.documentElement.setAttribute('data-vscode-theme', g.SMVHost.theme);
    apply(current);
    if (g.app && g.app.refreshAppearance) g.app.refreshAppearance();
  }
  function paint(name, fallback) {
    if (!hosted() || !g.getComputedStyle || !g.document.body) return fallback;
    return g.getComputedStyle(g.document.body).getPropertyValue('--smv-' + name).trim() || fallback;
  }
  function rgb(value) {
    var hex = /^#([\da-f]{6}|[\da-f]{3})$/i.exec(value);
    if (hex) {
      var h = hex[1]; if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
      return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
    }
    var parts = /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i.exec(value);
    return parts ? parts.slice(1, 4).map(Number) : null;
  }
  function luminance(c) {
    return c.map(function (v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); })
      .reduce(function (sum, v, i) { return sum + v * [.2126, .7152, .0722][i]; }, 0);
  }
  function hex(c) { return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
  function contrastText(background, fallback) {
    var c = rgb(background);
    return hosted() && c ? (luminance(c) > .179 ? '#000000' : '#ffffff') : fallback;
  }
  // Diagram tinting and Canvas2D require hex, rather than CSS var() expressions.
  function readable(value, surface, minimum) {
    var c = rgb(value), bg = rgb(paint(surface || 'surface', dark() ? '#1e1e1e' : '#ffffff'));
    if (!c || !bg || !hosted()) return value;
    var base = c.slice(), bgL = luminance(bg), target = bgL < .179 ? 255 : 0;
    for (var i = 0; i <= 20; i++) {
      var l = luminance(c);
      if ((Math.max(l, bgL) + .05) / (Math.min(l, bgL) + .05) >= (minimum || 4.5)) break;
      c = base.map(function (v) { return Math.round(v + (target - v) * (i + 1) / 21); });
    }
    return hex(c);
  }


  /* The theme owns presentation, not the saved Classic palette preference. Return
     real hex colors because diagram tinting and Canvas2D need numeric RGB values. */
  var pigments = ['#806679', '#68734d', '#80612f', '#713b43', '#76614c', '#53624b', '#98634e', '#67576e'];
  function palette(base) {
    if (hosted()) {
      var hostPalette = {};
      ['domain', 'schema', 'source', 'edge'].forEach(function (axis) {
        hostPalette[axis] = {};
        Object.keys(base[axis]).forEach(function (key) { hostPalette[axis][key] = readable(base[axis][key]); });
      });
      // Relationship strokes sit on the canvas, not on cards. Give the default
      // neutral a stronger canvas contrast so thin paths remain visible in dark themes.
      hostPalette.edge.base = readable('#a8b7c9', 'paper', 4.5);
      hostPalette.edge.lock = hex(rgb(paint('ink', dark() ? '#ffffff' : '#1f2430')) || [31,36,48]);
      hostPalette.edge.marked = readable('#b4584f');
      hostPalette.list = base.list.map(function(colour){return readable(colour);}); hostPalette.fallback = readable(base.fallback);
      return hostPalette;
    }
    if (current !== 'spellbook') return base;
    var result = {domain:{}, schema:{}, source:{}, list:pigments.slice(),
      edge:{base:'#a08045',out:'#68734d',in:'#806679',hop:'#a08045',pin:'#713b43',lock:'#713b43',marked:'#98634e'}, fallback:'#76614c'};
    var domains = {};
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
  var hostSurfaces = {'#1f2430':'soft', '#1d2330':'soft', '#fff7e8':'soft', '#fff4f2':'soft', '#fef3c7':'soft', '#ecfdf5':'soft'};
  var hostInks = {'#182943':'ink', '#172b4d':'ink', '#1f2937':'ink', '#253247':'ink', '#263951':'ink', '#53647c':'muted', '#b3b9c2':'muted'};
  function inlineStyle(style) {
    var host = hosted(), background = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style);
    var bg = background && background[1].trim(), inverted = host && bg && hostSurfaces[bg.toLowerCase()];
    return style.replace(/(^|;)\s*(background(?:-color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?)\s*:\s*([^;]+)/gi,
      function (all, separator, property, value) {
        var trimmed = value.trim(), map = property.indexOf('background') === 0 ? surfaces : property === 'color' ? inks : null;
        var token = map && map[trimmed.toLowerCase()];
        if (host && !token) {
          if (property.indexOf('background') === 0) token = hostSurfaces[trimmed.toLowerCase()];
          else if (property === 'color') token = hostInks[trimmed.toLowerCase()] || (inverted && /^#fff(?:fff)?$/i.test(trimmed) ? 'ink' : null);
        }
        if (token) return separator + property + ':var(--smv-' + token + ',' + trimmed + ')';
        if (host && property === 'color' && /^#fff(?:fff)?$/i.test(trimmed) && bg) {
          var variable = /^var\(--smv-([\w-]+)/.exec(bg);
          return separator + property + ':' + contrastText(variable ? paint(variable[1], '') : bg, trimmed);
        }
        if (host && property === 'color' && /^#[\da-f]{3,6}$/i.test(trimmed)) return separator + property + ':' + readable(trimmed);
        if (property.indexOf('border') === 0) return separator + property + ':' + value.replace(lines, function (color) { return 'var(--smv-line,' + color + ')'; });
        return all;
      });
  }
  function inlineHTML(html) {
    return !hosted() ? html : html.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, function (all, quote, style) {
      return 'style=' + quote + inlineStyle(style) + quote;
    });
  }
  g.ViewerTheme = { init:init, set:set, get:function () { return current; }, normalize:normalize, palette:palette, inlineStyle:inlineStyle, inlineHTML:inlineHTML, syncHost:syncHost, paint:paint, contrastText:contrastText };
  syncHost();
})(window);
