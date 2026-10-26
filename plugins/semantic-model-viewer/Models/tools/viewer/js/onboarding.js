/* Optional contextual help. Never navigates, selects objects or changes a layout. */
(function (g) {
  'use strict';
  var KEY = 'smv_onboarding_v1';
  var tips = {
    welcome: ['Welcome to Semantic Model Viewer', 'Start with one question: how do these tables connect, or what feeds this measure? Enable short tips as you explore. You can skip them and restart anytime through Help.', '[data-onboarding-help]'],
    tables: ['Add a table', 'In the Tables library, search for a table and use its + button to add it to your canvas. Select the table to explore its relationships. If the library is hidden, use Show the table library.', '#table-library'],
    relationships: ['Explore a relationship', 'Select a table, then use Explore filter paths in the inspector to choose direction and distance. Add related tables to see their lines; select a line for relationship details. A model without relationships has no paths to follow.', '#drawer'],
    measures: ['Follow a measure', 'Search the Measures list and select a measure. Dependencies shows what feeds it and what depends on it; select a reference to compare DAX. If this model has no measures, try the demo or another model.', '.mv-search'],
    sharing: ['Share an offline snapshot', 'Save snapshot downloads an interactive HTML copy. It includes the full model metadata, DAX and available Power Query definitions, even for tables outside this view. Share it only with the intended audience. Your source model is not changed.', '.ex-snapshot-export']
  };
  function Onboarding(app) {
    this.app = app;
    var saved = U.store.getJSON(KEY, {});
    this.progress = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    this.seen = this.progress.seen && typeof this.progress.seen === 'object' ? this.progress.seen : {};
    this.card = null;
    var self = this;
    g.addEventListener('resize', function () { self.position(); });
    document.addEventListener('scroll', function () { self.position(); }, true);
    document.addEventListener('focusin', function (e) {
      if (e.target.matches && e.target.matches('.ex-snapshot-export')) self.offer('sharing');
    });
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest('.ex-snapshot-export')) self.offer('sharing');
    });
  }
  Onboarding.prototype.save = function () {
    this.progress.seen = this.seen;
    U.store.setJSON(KEY, this.progress); // store catches denied/quota errors; memory still works
  };
  Onboarding.prototype.restart = function () {
    if (this.app.snapshotMode) return;
    this.close(false);
    this.progress = {}; this.seen = {}; this.save();
    this.show('welcome', true);
  };
  Onboarding.prototype.offer = function (id) {
    if (this.app.snapshotMode || !this.app.state.loaded || this.progress.enabled !== true || this.seen[id] || this.card) return;
    this.show(id, false);
  };
  Onboarding.prototype.update = function () {
    if (this.app.snapshotMode) { this.close(false); return; }
    var context = this.app.modelKey + ':' + this.app.state.viewMode;
    if (this.context && context !== this.context) this.close(false);
    this.context = context;
    if (!this.app.state.loaded || !this.app.modelKey) return;
    if (this.id === 'tables' && this.app.state.selected) this.close(false);
    if (!this.progress.welcomed) { this.show('welcome', false); return; }
    if (this.app.state.viewMode === 'graph') {
      this.offer(this.app.state.selected ? 'relationships' : 'tables');
    } else if (this.app.state.viewMode === 'measures') this.offer('measures');
    this.position();
  };
  Onboarding.prototype.show = function (id, focus) {
    if (this.app.snapshotMode || this.card) return;
    var self = this, tip = tips[id], el = U.el;
    this.id = id; this.returnFocus = document.activeElement;
    if (id === 'welcome') this.progress.welcomed = true;
    else this.seen[id] = true;
    this.save();
    var card = this.card = el('section', {cls:'smv-guide', role:'region', 'aria-live':'polite', 'aria-labelledby':'smv-guide-title'});
    var title = el('h2', {id:'smv-guide-title', tabindex:'-1', text:tip[0]});
    card.appendChild(title);
    card.appendChild(el('p', {text:tip[1]}));
    var actions = el('div', {cls:'smv-guide-actions'});
    if (id === 'welcome') actions.appendChild(el('button', {cls:'ex-button ex-primary', text:'Show tips', onClick:function () {
      self.progress.enabled = true; self.save(); self.close(true); self.update();
    }}));
    actions.appendChild(el('button', {cls:'ex-button', text:id === 'welcome' ? 'Skip tour' : 'Close', onClick:function () {
      if (id === 'welcome') { self.progress.enabled = false; self.save(); }
      self.close(true);
    }}));
    if (id !== 'welcome') actions.appendChild(el('button', {cls:'ex-button', text:'Skip remaining tips', onClick:function () {
      self.progress.enabled = false; self.save(); self.close(true);
    }}));
    card.appendChild(actions);
    card.addEventListener('keydown', function (e) {
      e.stopPropagation(); // viewer shortcuts must not act while reading help
      if (e.key === 'Escape') { e.preventDefault(); self.close(true); }
    });
    document.body.appendChild(card);
    this.position();
    if (focus) title.focus(); // automatic tips never steal focus or block the workspace
  };
  Onboarding.prototype.close = function (restore) {
    if (!this.card) return;
    var hadFocus = this.card.contains(document.activeElement);
    this.card.remove(); this.card = null;
    if (restore && hadFocus) {
      var target = this.returnFocus;
      if (!target || !target.isConnected || target === document.body) target = document.querySelector('[data-onboarding-help]');
      if (target) target.focus();
    }
  };
  Onboarding.prototype.position = function () {
    if (!this.card) return;
    var target = document.querySelector(tips[this.id][2]);
    var rect = target && target.getClientRects().length ? target.getBoundingClientRect() : null;
    var card = this.card, width = card.offsetWidth, height = card.offsetHeight;
    var x = rect ? rect.right + 12 : g.innerWidth - width - 12;
    if (x + width > g.innerWidth - 12) x = rect ? rect.left - width - 12 : x;
    var y = rect ? rect.top : 80;
    card.style.left = Math.max(12, Math.min(x, g.innerWidth - width - 12)) + 'px';
    card.style.top = Math.max(12, Math.min(y, g.innerHeight - height - 12)) + 'px';
  };
  g.ViewerOnboarding = Onboarding;
})(window);
