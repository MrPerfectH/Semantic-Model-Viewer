/* Tiny DOM helpers — replaces the prototype's support.js reactive runtime with plain DOM. */
(function (g) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function applyProps(node, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'style') node.style.cssText = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'cls') node.className = v;
      else if (k === 'ref') v(node);
      else if (k === 'data') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
  }

  function add(node, kids) {
    if (kids == null || kids === false) return;
    if (Array.isArray(kids)) { kids.forEach(function (k) { add(node, k); }); return; }
    node.appendChild(typeof kids === 'string' || typeof kids === 'number'
      ? document.createTextNode(String(kids)) : kids);
  }

  /* el('div', {style:'…', onClick:fn}, [children]) */
  function el(tag, props, kids) {
    var node = document.createElement(tag);
    applyProps(node, props);
    add(node, kids);
    return node;
  }

  /* sv('path', {d:'…'}) — SVG element with attributes */
  function sv(tag, attrs, kids) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'style') node.style.cssText = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    });
    add(node, kids);
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* source details come from a user-supplied model file — never inject them raw */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tint(hex, a) {
    var h = String(hex).replace('#', '');
    var r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')';
  }

  var memoryStore = null, storageAdapter = null;
  function readStored(k) { return memoryStore ? (memoryStore.has(k) ? memoryStore.get(k) : null) : storageAdapter ? storageAdapter.get(k) : localStorage.getItem(k); }
  function writeStored(k,v) { if(memoryStore) memoryStore.set(k,String(v)); else if(storageAdapter) storageAdapter.set(k,v); else localStorage.setItem(k,v); }
  var store = {
    // A portable snapshot must not depend on or overwrite the recipient's browser state.
    useAdapter: function (adapter) { storageAdapter = adapter; memoryStore = null; },
    useMemory: function (seed) { memoryStore = new Map(Object.entries(seed || {})); },
    get: function (k, d) { try { var v = readStored(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { writeStored(k, v); } catch (e) { } },
    del: function (k) { try { if(memoryStore) memoryStore.delete(k); else if(storageAdapter) storageAdapter.del(k); else localStorage.removeItem(k); } catch (e) { } },
    getJSON: function (k, d) { try { return JSON.parse(readStored(k)) || d; } catch (e) { return d; } },
    setJSON: function (k, v, onFail) { try { writeStored(k, JSON.stringify(v)); } catch (e) { if (onFail) onFail(e); } }
  };

  /* Inline SVG icon sources copied verbatim from the prototype. */
  var ICON = {
    eyeOff: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
    bars: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="8" y1="17" x2="8" y2="11"></line><line x1="12" y1="17" x2="12" y2="7"></line><line x1="16" y1="17" x2="16" y2="13"></line></svg>',
    chevDown: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>',
    chevRight: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"></path></svg>',
    key: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="#e08a00" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4"></circle><path d="m10.3 12.7 7-7"></path><path d="m15 6 3 3"></path><path d="m12.5 8.5 2.5 2.5"></path></svg>',
    eyeSlashCol: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c7ccd4" stroke-width="2" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"></path><path d="m2 2 20 20"></path></svg>',
    refresh: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:1px;"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg>',
    plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
    folder: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>',
    camera: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>',
    arrange: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"></path></svg>',
    dot3: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M5 12h-.01M19 12h.01"></path></svg>',
    focus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"></path></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa1ad" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5 11-11"></path></svg>',
    lock: '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
    logo: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><path d="M10 6.5h4a3 3 0 0 1 3 3V14"></path></svg>'
  };

  function icon(name, size, color) {
    return ICON[name].replace(/\{s\}/g, size == null ? 12 : size).replace(/\{c\}/g, color || 'currentColor');
  }

  g.U = { el: el, sv: sv, clear: clear, esc: esc, tint: tint, store: store, icon: icon, ICON: ICON, SVGNS: SVGNS };
})(window);
