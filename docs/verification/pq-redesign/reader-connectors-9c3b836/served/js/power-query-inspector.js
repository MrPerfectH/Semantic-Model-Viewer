/* pq-workspace/2: exact read-only presentation. Resolved reference ranges and
 * row identity come exclusively from coordinator context. Never analyze M. */
(function (g) {
  'use strict';
  function mount(host, options) {
    options = options || {};
    var doc = host.ownerDocument, win = doc.defaultView || g;
    var context = null, generation, selected = null, opened = false, wrap = true, alive = true, suspended = false;
    var focusControls = null, focusBox = null, controlsVersion = 0, controlsOff = [], controlEntries = [];
    var expanded = false, readerDialog = null, readerBody = null, codeCard = null, codeSlot = null, expandButton = null, readerReturn = null, readerLauncher = null;
    var epoch = 0, contentVersion = 0, row = null, codeScroll = null, focusEntries = [], contentOff = [], jobs = new Set();
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    var root = el('section', 'pqi'); root.setAttribute('aria-label', 'Selected Power Query details'); root.hidden = true; host.appendChild(root);
    function current(gen, id) { return alive && context && generation === gen && selected === id && opened && !suspended; }
    function on(target, name, callback) { target.addEventListener(name, callback); contentOff.push(function () { target.removeEventListener(name, callback); }); }
    function emit(name, payload) { if (alive && context && !suspended && generation === payload.generation && typeof options[name] === 'function') options[name](payload); }
    function cancelRestores() { epoch++; jobs.forEach(function (job) { win.cancelAnimationFrame(job.frame); job.resolve(); }); jobs.clear(); }
    function clearContent() { setExpanded(false, false); readerDialog = readerBody = codeCard = codeSlot = expandButton = readerReturn = readerLauncher = null; clearControlDOM(); focusBox = null; contentVersion++; contentOff.forEach(function (off) { off(); }); contentOff = []; focusEntries = []; codeScroll = wrapButton = null; row = null; root.replaceChildren(); }
    function clear() { cancelRestores(); clearContent(); context = null; generation = undefined; selected = null; opened = false; wrap = true; focusControls = null; root.hidden = true; root.scrollLeft = root.scrollTop = 0; }
    function lookup(id) { return context && context.byNodeId && context.byNodeId.get(id); }
    function descriptor(kind, occurrence) { var value = { kind: kind, nodeId: selected }; if (occurrence) { value.at = occurrence.at; value.end = occurrence.end; } return value; }
    function record(element, kind, occurrence) { var d = descriptor(kind, occurrence); focusEntries.push({ element: element, descriptor: d }); return element; }
    function sameFocus(a, b) { return !!a && !!b && a.kind === b.kind && a.nodeId === b.nodeId && (a.kind !== 'reference' || (a.at === b.at && a.end === b.end)); }
    function applyFocus(d) {
      if (!alive || !context || suspended || !opened || !d || d.nodeId !== selected) return false;
      var entry = focusEntries.find(function (v) { return sameFocus(v.descriptor, d); }); if (!entry) return false;
      var details = entry.element.closest('details'); if (details) details.open = true; entry.element.focus({ preventScroll: true }); return true;
    }
    function focus(d) { cancelRestores(); return applyFocus(d); }
    // Stable module-owned section keys, independent of display text or focus
    // mode. Optional sections are captured/restored only when they exist.
    var disclosureSections = { provenance: '.pqi-provenance', analysis: '.pqi-analysis-details' };
    function captureDisclosures() {
      var value = {};
      Object.keys(disclosureSections).forEach(function (key) { var section = root.querySelector(disclosureSections[key]); if (section) value[key] = !!section.open; });
      return value;
    }
    function copyDisclosures(state) {
      var value = {};
      Object.keys(disclosureSections).forEach(function (key) { if (state && Object.prototype.hasOwnProperty.call(state, key) && typeof state[key] === 'boolean') value[key] = state[key]; });
      return value;
    }
    function restoreDisclosures(value) {
      Object.keys(value).forEach(function (key) { var section = root.querySelector(disclosureSections[key]); if (section) section.open = value[key]; });
    }
    function captureViewState() {
      var active = focusEntries.find(function (entry) { return entry.element === doc.activeElement; });
      return { codeX: codeScroll ? codeScroll.scrollLeft : 0, codeY: codeScroll ? codeScroll.scrollTop : 0, inspectorX: root.scrollLeft, inspectorY: root.scrollTop, wrap: wrap, focus: active ? Object.assign({}, active.descriptor) : null, disclosures: captureDisclosures(), expanded: expanded };
    }
    function scrollValue(v) { return Number.isFinite(v) ? Math.max(0, v) : 0; }
    function restoreViewState(state) {
      cancelRestores(); if (!state || !alive || !context || !opened || suspended) return Promise.resolve();
      var gen = generation, id = selected, version = epoch;
      // Retain values/descriptors only, never a prior DOM element or source row.
      var value = { codeX: scrollValue(state.codeX), codeY: scrollValue(state.codeY), inspectorX: scrollValue(state.inspectorX), inspectorY: scrollValue(state.inspectorY), wrap: !!state.wrap, focus: state.focus ? Object.assign({}, state.focus) : null, disclosures: copyDisclosures(state.disclosures), expanded: typeof state.expanded === 'boolean' ? state.expanded : expanded };
      return new Promise(function (resolve) {
        var job = { resolve: resolve, frame: 0 }; jobs.add(job);
        job.frame = win.requestAnimationFrame(function () {
          if (!current(gen, id) || epoch !== version) { jobs.delete(job); resolve(); return; }
          job.frame = win.requestAnimationFrame(function () {
            jobs.delete(job);
            if (current(gen, id) && epoch === version) {
              restoreDisclosures(value.disclosures); setExpanded(value.expanded, false);
              // Native dialog autofocus may synchronously navigate/reset too.
              if (!current(gen, id) || epoch !== version) { resolve(); return; }
              wrap = value.wrap;
              if (codeScroll) { codeScroll.classList.toggle('pqi-wrap', wrap); updateWrapLabel(); }
              // Disclosures (and any focused control's ancestor) must be open
              // before scroll assignment, or the browser clamps to a short range.
              if (value.focus) applyFocus(value.focus);
              // Focusing can synchronously trigger a later host navigation.
              if (current(gen, id) && epoch === version) {
                if (codeScroll) { codeScroll.scrollLeft = value.codeX; codeScroll.scrollTop = value.codeY; }
                root.scrollLeft = value.inspectorX; root.scrollTop = value.inspectorY;
              }
            }
            resolve();
          });
        });
      });
    }
    var wrapButton = null;
    function updateWrapLabel() { if (wrapButton) { wrapButton.textContent = wrap ? 'Unwrap lines' : 'Wrap lines'; wrapButton.setAttribute('aria-pressed', String(wrap)); } }
    function clearControlDOM() {
      controlsVersion++; controlsOff.forEach(function (off) { off(); }); controlsOff = [];
      focusEntries = focusEntries.filter(function (entry) { return !controlEntries.includes(entry); }); controlEntries = [];
      if (focusBox) focusBox.replaceChildren();
    }
    function renderFocusControls() {
      if (!focusBox || !row) return; var saved = captureViewState().focus; clearControlDOM();
      var settings = focusControls || { mode: 'dim', direction: 'connected', depth: 1, relatedCount: 0, missingCount: 0, removableCount: 0 };
      var gen = generation, id = selected, version = controlsVersion;
      function listen(e, event, fn) { e.addEventListener(event, fn); controlsOff.push(function () { e.removeEventListener(event, fn); }); }
      function control(e, kind) { record(e, kind); controlEntries.push(focusEntries[focusEntries.length - 1]); return e; }
      function valid() { return current(gen, id) && version === controlsVersion; }
      function change(values) { if (valid()) emit('onFocusChange', Object.assign({ generation: gen, nodeId: id, mode: settings.mode, direction: settings.direction, depth: settings.depth }, values)); }
      focusBox.appendChild(el('h3', '', 'Canvas focus'));
      var modes = el('div', 'ex-focus-options'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Unrelated queries');
      [['dim', 'Dim unrelated'], ['hide', 'Hide unrelated']].forEach(function (pair) { var b = control(g.WorkspaceUI.button(doc, { text: pair[1] }), 'focus-' + pair[0]); b.setAttribute('aria-pressed', String(settings.mode === pair[0])); listen(b, 'click', function () { change({ mode: pair[0] }); }); modes.appendChild(b); }); focusBox.appendChild(modes);
      var details = el('div', 'pqi-reference-options'); focusBox.appendChild(details);
      details.appendChild(el('p', 'ex-muted', 'Follows resolved query references. Static uncertainty remains; hidden objects stay in this layout.'));
      function selector(kind, label, choices, value, toValue) {
        var e = control(el('select'), kind); e.setAttribute('aria-label', label); choices.forEach(function (pair) { var option = el('option', '', pair[1]); option.value = pair[0]; e.appendChild(option); }); e.value = String(value === Infinity ? 'all' : value); listen(e, 'change', function () { var values = {}; values[kind === 'focus-direction' ? 'direction' : 'depth'] = toValue(e.value); change(values); }); var labelElement = el('label', 'pqi-option-label', label); labelElement.appendChild(e); details.appendChild(labelElement);
      }
      selector('focus-direction', 'Query reference direction', [['inputs','Inputs'],['consumers','Consumers'],['connected','All connected']], settings.direction, function (v) { return v; });
      selector('focus-depth', 'Query reference distance', [['0','Selected only'],['1','Direct only'],['2','Up to 2 connections'],['all','Direct + indirect']], settings.depth, function (v) { return v === 'all' ? Infinity : Number(v); });
      details.appendChild(el('p', 'ex-related-count', settings.relatedCount + ' related · ' + settings.missingCount + ' to add'));
      function action(name, text, disabled) { var b = control(g.WorkspaceUI.button(doc, { text: text }), name); b.disabled = disabled; listen(b, 'click', function () { if (!b.disabled && valid()) emit('onMembershipAction', { generation: gen, nodeId: id, action: name }); }); details.appendChild(b); }
      action('add-related', 'Add ' + settings.missingCount + ' related to canvas', !settings.missingCount);
      action('remove-unrelated', 'Remove ' + settings.removableCount + ' unrelated from layout', !settings.removableCount);
      action('remove-selected', 'Remove this object from layout', false);
      if (saved && controlEntries.some(function (entry) { return sameFocus(entry.descriptor, saved); })) applyFocus(saved);
    }
    function setFocusControls(settings) {
      if (!alive) return;
      if (!settings) focusControls = null;
      else {
        var mode = settings.mode, direction = settings.direction, depth = settings.depth;
        if (!['dim', 'hide'].includes(mode) || !['inputs', 'consumers', 'connected'].includes(direction) || ![0,1,2,Infinity].includes(depth)) return;
        function count(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
        focusControls = { mode: mode, direction: direction, depth: depth, relatedCount: count(settings.relatedCount), missingCount: count(settings.missingCount), removableCount: count(settings.removableCount) };
      }
      renderFocusControls();
    }
    function close(reason) { if (!alive || !context || !opened || suspended) return; cancelRestores(); setExpanded(false, false); opened = false; root.hidden = true; emit('onClose', { generation: generation, reason: reason }); }
    function cosmeticRanges(code) {
      var out = [], re = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|#"(?:[^"]|"")*"|"(?:[^"]|"")*"|\b(?:let|in|each|if|then|else|try|otherwise|error|as|is|type|meta|nullable|optional|true|false|null|and|or|not)\b|\b[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+/gu, match;
      while ((match = re.exec(code))) { var raw = match[0], cls = raw.startsWith('//') || raw.startsWith('/*') ? 'pqi-comment' : raw[0] === '"' ? 'pqi-string' : raw.startsWith('#"') ? '' : raw.includes('.') ? 'pqi-function' : 'pqi-keyword'; out.push({ at: match.index, end: re.lastIndex, cls: cls }); }
      return out;
    }
    function validOccurrences(source, occurrences) {
      if (!Array.isArray(occurrences || []) || (occurrences || []).some(function (r) { return !r; })) return null;
      var sorted = (occurrences || []).slice().sort(function (a, b) { return a.at - b.at; }), end = -1;
      var valid = sorted.every(function (r) { var okay = r && Number.isInteger(r.at) && Number.isInteger(r.end) && r.at >= 0 && r.at < r.end && r.end <= source.length && r.at >= end && !!lookup(r.targetId); end = r.end; return okay; });
      return valid ? sorted : null;
    }
    function setExpanded(value, focusReturn) {
      value = !!value; var gen = generation, id = selected;
      if (value && (!alive || !context || !opened || suspended || !readerDialog || !codeCard)) return false;
      if (value === expanded) return true;
      if (value) {
        readerReturn = { x: root.scrollLeft, y: root.scrollTop, codeX: codeScroll.scrollLeft, codeY: codeScroll.scrollTop };
        readerBody.appendChild(codeCard); expanded = true; expandButton.hidden = true;
        if (typeof readerDialog.showModal === 'function') readerDialog.showModal(); else readerDialog.open = true;
        if (focusReturn && current(gen, id)) applyFocus(descriptor('reader-close'));
      } else {
        expanded = false;
        if (readerDialog) { if (typeof readerDialog.close === 'function' && readerDialog.open) readerDialog.close(); else readerDialog.open = false; }
        if (codeCard && codeSlot) codeSlot.appendChild(codeCard); if (expandButton) expandButton.hidden = false;
        if (readerReturn && codeScroll) { codeScroll.scrollLeft = readerReturn.codeX; codeScroll.scrollTop = readerReturn.codeY; root.scrollLeft = readerReturn.x; root.scrollTop = readerReturn.y; }
        readerReturn = null; if (focusReturn) applyFocus(descriptor('expand'));
      }
      return true;
    }
    function createReader(card) {
      codeCard = card; readerDialog = el('dialog', 'pqi-reader'); readerDialog.setAttribute('aria-label', 'Expanded read-only M for ' + row.node.label);
      var header = el('header', 'pqi-reader-header'), title = el('h2', '', row.node.label + ' · M source');
      var closeReader = record(el('button', 'pqi-button', 'Close expanded reader'), 'reader-close'); closeReader.type = 'button';
      header.appendChild(title); header.appendChild(closeReader); readerDialog.appendChild(header); readerBody = el('div', 'pqi-reader-body'); readerDialog.appendChild(readerBody); root.appendChild(readerDialog);
      var gen = generation, id = selected, version = contentVersion;
      function dismiss(e) { if (!current(gen, id) || version !== contentVersion) return; e.preventDefault(); e.stopPropagation(); cancelRestores(); setExpanded(false, true); }
      on(closeReader, 'click', dismiss); on(readerDialog, 'cancel', dismiss);
      on(readerDialog, 'keydown', function (e) {
        if (!expanded || !current(gen, id) || version !== contentVersion) return;
        if (e.key === 'Escape') { dismiss(e); return; }
        if (e.key !== 'Tab') return;
        var entries = Array.from(readerDialog.querySelectorAll('button,[tabindex]')).filter(function (element) { return !element.hidden && !element.disabled; }).map(function (element) { return { element: element }; });
        var at = entries.findIndex(function (entry) { return entry.element === doc.activeElement; });
        if (at < 0 || (!e.shiftKey && at === entries.length - 1) || (e.shiftKey && at === 0)) { e.preventDefault(); var target = entries[e.shiftKey ? entries.length - 1 : 0]; if (target) target.element.focus({ preventScroll: true }); }
      });
    }
    function renderCode(source, occurrences, parent) {
      var refs = validOccurrences(source, occurrences);
      if (!refs) { parent.appendChild(el('p', 'pqi-review', 'Reference ranges could not be displayed safely. Inspect source / metadata.')); refs = []; }
      var bar = el('div', 'pqi-code-bar'), caption = el('span', 'pqi-section-label', 'M · READ ONLY');
      var copy = record(el('button', 'pqi-button', 'Copy M'), 'copy'); copy.type = 'button'; copy.setAttribute('aria-label', 'Copy exact M source');
      wrapButton = record(el('button', 'pqi-button'), 'wrap'); wrapButton.type = 'button'; updateWrapLabel();
      var status = el('span', 'pqi-copy-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      expandButton = record(el('button', 'pqi-button pqi-open-query', 'Open full query'), 'expand'); expandButton.type = 'button'; expandButton.setAttribute('aria-haspopup', 'dialog');
      readerLauncher.appendChild(expandButton);
      readerLauncher.appendChild(el('span', 'pqi-reader-hint', 'M source · ' + source.split(/\r\n|\r|\n/).length + ' lines · opens in a wide reader'));
      bar.appendChild(caption); bar.appendChild(copy); bar.appendChild(wrapButton); parent.appendChild(bar); parent.appendChild(status);
      codeScroll = record(el('div', 'pqi-code-scroll' + (wrap ? ' pqi-wrap' : '')), 'code'); codeScroll.tabIndex = 0; codeScroll.setAttribute('aria-label', 'Read-only M source with line numbers'); parent.appendChild(codeScroll);
      var gen = generation, id = selected, version = contentVersion;
      createReader(parent);
      on(expandButton, 'click', function () { if (!current(gen, id) || contentVersion !== version) return; cancelRestores(); setExpanded(true, true); });
      on(copy, 'click', function () {
        if (!current(gen, id) || contentVersion !== version) return;
        var clipboard = win.navigator && win.navigator.clipboard, copyEpoch = epoch;
        if (!clipboard || !clipboard.writeText) { status.textContent = 'Copy unavailable. Select the source and copy with your keyboard.'; return; }
        var completion;
        try { completion = clipboard.writeText(source); } catch (_) { completion = Promise.reject(new Error('Clipboard unavailable')); }
        Promise.resolve(completion).then(function () { if (current(gen, id) && contentVersion === version && epoch === copyEpoch) status.textContent = 'Copied exact M'; }, function () { if (current(gen, id) && contentVersion === version && epoch === copyEpoch) status.textContent = 'Copy unavailable. Select the source and copy with your keyboard.'; });
      });
      on(wrapButton, 'click', function () { if (!current(gen, id)) return; cancelRestores(); wrap = !wrap; codeScroll.classList.toggle('pqi-wrap', wrap); updateWrapLabel(); });
      var cosmetic = cosmeticRanges(source), refIndex = 0, colorIndex = 0, at = 0, lineNumber = 1;
      // Logical source lines retain their original terminators. Gutter is a
      // separate sibling, excluded from Copy and selectable source text.
      while (at <= source.length) {
        var nl = /\r\n|\r|\n/g; nl.lastIndex = at; var match = nl.exec(source), lineEnd = match ? nl.lastIndex : source.length;
        var line = el('div', 'pqi-line'), number = el('span', 'pqi-line-number', String(lineNumber++)), code = el('code', 'pqi-source-line'); number.setAttribute('aria-hidden', 'true'); code.dataset.sourceLine = 'true';
        line.appendChild(number); line.appendChild(code); codeScroll.appendChild(line);
        var cursor = at;
        while (cursor < lineEnd) {
          while (refIndex < refs.length && refs[refIndex].end <= cursor) refIndex++;
          while (colorIndex < cosmetic.length && cosmetic[colorIndex].end <= cursor) colorIndex++;
          var reference = refs[refIndex], color = cosmetic[colorIndex];
          if (reference && reference.at <= cursor && reference.end > cursor) {
            var last = Math.min(lineEnd, reference.end), target = lookup(reference.targetId), cls = 'pqi-reference' + (target.node.kind === 'parameter' ? ' pqi-parameter-reference' : '');
            var button = record(el('button', cls, source.slice(cursor, last)), 'reference', reference); button.type = 'button'; button.title = 'Show ' + target.node.label + ' on the canvas'; button.setAttribute('aria-label', 'Show ' + target.node.label + ' referenced by ' + row.node.label);
            (function (r, b) { on(b, 'click', function () { if (current(gen, id) && contentVersion === version) emit('onNavigate', { generation: gen, sourceId: id, targetId: r.targetId, occurrence: { at: r.at, end: r.end } }); }); })(reference, button);
            code.appendChild(button); cursor = last; continue;
          }
          var to = lineEnd; if (reference && reference.at > cursor) to = Math.min(to, reference.at);
          var style = ''; if (color && color.at <= cursor && color.end > cursor) { to = Math.min(to, color.end); style = color.cls; } else if (color && color.at > cursor) to = Math.min(to, color.at);
          code.appendChild(el('span', style, source.slice(cursor, to))); cursor = to;
        }
        if (!match) break; at = lineEnd;
      }
    }
    function provenance(value) { if (value === null || value === undefined) return ''; if (typeof value === 'string') return value; try { return JSON.stringify(value); } catch (_) { return String(value); } }
    function renderIssues(issues, parent) {
      var uncertainty = [], other = [];
      (issues || []).forEach(function (issue) { if (issue.kind === 'analysis-notice') return; (issue.kind === 'analysis-uncertainty' ? uncertainty : other).push(issue); });
      other.forEach(function (issue) { var severity = ['metadata-warning', 'duplicate-identity', 'no-reference-range', 'presentation-diagnostic'].includes(issue.kind) ? 'pqi-review' : issue.kind === 'cycle' ? 'pqi-cycle-note' : 'pqi-neutral'; parent.appendChild(el('p', severity, issue.message)); });
      if (uncertainty.length) { var details = el('details', 'pqi-analysis-details'); details.appendChild(el('summary', '', 'Static analysis details · ' + uncertainty.length)); uncertainty.forEach(function (issue) { details.appendChild(el('p', '', issue.message)); }); parent.appendChild(details); }
    }
    function render() {
      clearContent(); wrapButton = null; row = lookup(selected); root.hidden = !opened || suspended || !row;
      if (!row) return;
      var head = el('header', 'pqi-header'), name = el('div', 'pqi-heading'); name.appendChild(el('h2', 'pqi-title', row.node.label));
      var closeButton = record(el('button', 'pqi-close', '×'), 'close'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Close query details'); head.appendChild(name); head.appendChild(closeButton); root.appendChild(head);
      var gen = generation, id = selected; on(closeButton, 'click', function () { if (current(gen, id)) close('close'); });
      var chrome = row.chrome || {}; head.style.background = chrome.headerTint || '#f8fafc'; if (chrome.fact) name.style.color = '#fff'; name.appendChild(el('p', 'pqi-subtitle', chrome.subtitle || row.node.subtitle));
      var counts = el('div', 'pqi-counts'); counts.appendChild(el('span', '', (row.inputIds || []).length + ' inputs')); counts.appendChild(el('span', '', (row.consumerIds || []).length + ' consumers')); head.appendChild(counts);
      if (typeof row.code === 'string') { readerLauncher = el('div', 'pqi-reader-launcher'); root.appendChild(readerLauncher); }
      focusBox = el('section', 'ex-related pqi-focus'); focusBox.setAttribute('aria-label', 'Explore related queries'); root.appendChild(focusBox); renderFocusControls();
      var provenanceBox = el('details', 'pqi-provenance'); provenanceBox.appendChild(el('summary', '', 'Metadata and provenance')); root.appendChild(provenanceBox);
      var metadata = el('dl', 'pqi-metadata');
      [['Kind', row.classification || row.node.kind], ['Type', row.type], ['Basis', provenance(row.basis)]].forEach(function (pair) { if (!pair[1]) return; metadata.appendChild(el('dt', '', pair[0])); metadata.appendChild(el('dd', '', pair[1])); }); provenanceBox.appendChild(metadata);
      renderIssues(row.issues, root);
      if (row.code === null || typeof row.code !== 'string') root.appendChild(el('p', 'pqi-neutral', row.state === 'non-m' ? 'This source is not M.' : row.state === 'no-partitions' ? 'Partition metadata was not supplied.' : 'M source metadata is unavailable.'));
      else { codeSlot = el('div', 'pqi-reader-slot'); var card = el('section', 'pqi-code-card mv-dax-card'); root.appendChild(codeSlot); codeSlot.appendChild(card); renderCode(row.code, row.occurrences, card); }
      if (!(row.inputIds || []).length && !(row.consumerIds || []).length) root.appendChild(el('p', 'pqi-empty-reference', 'No query references resolved.'));
    }
    function select(id, config) {
      if (!alive) return; cancelRestores(); var next = id !== null && lookup(id) ? id : null, nextOpen = !!next && (!config || config.open !== false);
      var different = next !== selected || (next && row !== lookup(next)); selected = next; opened = nextOpen;
      if (!nextOpen) setExpanded(false, false);
      if (different || !next) { root.scrollLeft = root.scrollTop = 0; render(); } else root.hidden = !opened || suspended;
    }
    function setContext(next) {
      if (!alive) return; var fresh = !context || !next || next.generation !== generation;
      if (fresh) clear(); if (!next) return; context = next; generation = next.generation;
      if (selected && !lookup(selected)) select(null, { open: false });
      else if (selected && row !== lookup(selected)) { var saved = captureViewState(); cancelRestores(); render(); if (opened && !suspended) restoreViewState(saved); }
    }
    function keydown(e) { if (e.key === 'Escape' && opened && !suspended) { e.preventDefault(); e.stopPropagation(); if (expanded) { cancelRestores(); setExpanded(false, true); } else close('escape'); } }
    root.addEventListener('keydown', keydown);
    function suspend(value) { if (!alive) return; cancelRestores(); if (value) setExpanded(false, false); suspended = !!value; root.hidden = suspended || !opened || !row; }
    function destroy() { if (!alive) return; clear(); alive = false; root.removeEventListener('keydown', keydown); options = {}; root.remove(); }
    setContext(options.context || null);
    return { setContext: setContext, select: select, setFocusControls: setFocusControls, captureViewState: captureViewState, restoreViewState: restoreViewState, focus: focus, suspend: suspend, destroy: destroy };
  }
  g.PowerQueryInspector = { version: 2, mount: mount };
})(window);
