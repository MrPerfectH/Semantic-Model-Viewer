/* Shared presentation leaf. No model lookup, graph, state or source evaluation.
 * Card anatomy follows Tables makeCard; callers own geometry and interactions. */
(function (g) {
  'use strict';
  function color(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#8896aa'; }
  function tint(value, alpha) { var c = color(value); return 'rgba(' + [1, 3, 5].map(function (at) { return parseInt(c.slice(at, at + 2), 16); }).join(',') + ',' + alpha + ')'; }
  function cardStyles(options) {
    var o = options || {}, c = color(o.color), background = o.headerTint || (o.fact ? '#1d2330' : tint(c, 0.1));
    return {
      card: 'position:absolute;width:252px;background:#fff;border:1px solid ' + tint(c, 0.35) + ';border-radius:' + (o.fact ? '7px' : '13px') + ';box-shadow:0 1px 2px rgba(20,30,50,.05),0 4px 12px rgba(20,30,50,.07);font-family:"IBM Plex Sans",sans-serif;overflow:hidden;transition:box-shadow .15s,opacity .15s,border-color .15s;',
      head: 'display:flex;align-items:flex-start;gap:9px;padding:10px 11px 10px 12px;cursor:grab;border-left:4px solid ' + c + ';background:' + background + ';',
      badge: 'font:700 8.5px/1 "IBM Plex Mono",monospace;letter-spacing:.4px;padding:4px 5px;border-radius:4px;flex:none;color:#fff;background:' + c + ';margin-top:1px;',
      titleWrap: 'flex:1;min-width:0;',
      title: 'font:600 13.5px/1.2 "IBM Plex Sans",sans-serif;letter-spacing:-.2px;color:' + (o.fact ? '#fff' : '#1f2430') + ';',
      subtitle: 'font:500 10px/1.4 "IBM Plex Mono",monospace;color:' + (o.fact ? 'rgba(255,255,255,.85)' : c) + ';margin-top:3px;',
      meta: 'display:flex;align-items:center;gap:6px;padding:9px 11px 10px 16px;border-top:1px solid #eef0f3;',
      chip: 'font:500 10px/1 "IBM Plex Mono",monospace;background:#f3f5f8;border-radius:5px;padding:4px 7px;'
    };
  }
  function createCardChrome(doc, options) {
    var o = options || {}, styles = cardStyles(o);
    function part(tag, cls, style, text) { var e = doc.createElement(tag); e.className = cls; e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; }
    var card = part('div', 'wui-card', styles.card), head = part('div', 'wui-card-head', styles.head), badge = part('span', 'wui-card-badge', styles.badge, o.badge || 'Q');
    var titleWrap = part('div', 'wui-card-title-wrap', styles.titleWrap), title = part('div', 'wui-card-title', styles.title, o.label || ''), subtitle = part('div', 'wui-card-subtitle', styles.subtitle, o.subtitle || '');
    title.title = o.label || ''; badge.title = o.badgeTitle || ''; subtitle.title = o.subtitle || '';
    titleWrap.appendChild(title); titleWrap.appendChild(subtitle); head.appendChild(badge); head.appendChild(titleWrap); card.appendChild(head);
    var meta = part('div', 'wui-card-meta', styles.meta);
    (o.chips || []).forEach(function (chip) { var e = part('span', 'wui-card-chip', styles.chip), count = part('b', '', 'font-weight:600;color:#5b6472;', String(chip.value)), label = part('span', '', 'color:#9aa1ad;', ' ' + chip.label); e.appendChild(count); e.appendChild(label); meta.appendChild(e); });
    card.appendChild(meta); return { card: card, head: head, badge: badge, titleWrap: titleWrap, title: title, subtitle: subtitle, meta: meta };
  }
  function button(doc, options) {
    var o = options || {}, e = doc.createElement('button'); e.type = 'button'; e.className = 'ex-button'; e.textContent = o.text || ''; if (o.label) e.setAttribute('aria-label', o.label); if (o.onClick) e.addEventListener('click', o.onClick); return e;
  }
  g.WorkspaceUI = { version: 1, cardStyles: cardStyles, createCardChrome: createCardChrome, button: button };
})(window);
