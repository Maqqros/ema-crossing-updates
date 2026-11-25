'use strict';
// What the screens show and what the user can do to it. Screens read from here and call these actions;
// `EMA.draw()` puts the result on the screen.
(function (EMA) {
  const host = EMA.host, C = EMA.core, S = EMA.store, K = EMA.check, U = EMA.ui;
  const M = {
    assets: [], lists: [], listId: '', entries: {}, bars: new Map(), history: [], lastChecked: 0, settings: {}, update: {},
    checking: false, updating: false, allowed: true,
    /** Hours without any check before the app was opened, when that was 12 or more; null when all is well or dismissed. */
    staleHours: null
  };
  const draw = () => EMA.draw();

  /** Reads everything again from what is saved on the phone. */
  M.reload = () => {
    M.assets = S.assets();
    M.lists = S.lists(M.assets);
    const id = S.currentList();
    M.listId = M.lists.some(l => l.id === id) ? id : M.lists[0].id;
    M.entries = S.entries();
    M.history = S.history();
    M.lastChecked = S.lastChecked();
    M.settings = S.settings();
    M.update = S.update();
    M.allowed = host.notificationsAllowed();
    const bars = new Map();
    for (const a of M.assets) {
      for (const tf of ['1d', a.tf]) {
        const key = a.symbol + '|' + tf;
        if (!bars.has(key)) {
          const b = S.bars(a.symbol, tf);
          if (b) bars.set(key, b);
        }
      }
    }
    M.bars = bars;
  };

  /** Every watched asset, on any watchlist. */
  M.allGroups = () => C.groups(M.assets);
  /** The watchlist on screen. */
  M.list = () => M.lists.find(l => l.id === M.listId) || M.lists[0];
  /** The assets of the watchlist on screen, in its order. */
  M.groups = () => {
    const by = new Map(M.allGroups().map(g => [g.symbol, g]));
    return M.list().symbols.map(x => by.get(x)).filter(Boolean);
  };
  M.onList = symbol => M.list().symbols.includes(symbol);
  /** The watchlists an asset is on. */
  M.listsOf = symbol => M.lists.filter(l => l.symbols.includes(symbol));
  M.barsOf = (symbol, tf = '1d') => M.bars.get(symbol + '|' + tf) || null;
  M.has = symbol => M.assets.some(a => a.symbol === symbol);
  /** The saved result of a crossing, when it was made with the crossing's present settings. */
  M.entryOf = a => {
    const e = M.entries[a.id];
    return e && e.key === C.key(a) ? e : null;
  };
  M.dark = () => M.settings.theme === 'light' ? false : M.settings.theme === 'system' ? !!host.info.dark : true;

  /** Checks every asset now. A quiet check only speaks up when there is something new. */
  M.refresh = async (quiet = false) => {
    if (M.checking) return;
    M.checking = true;
    draw();
    let sent;
    try {
      sent = await K.run();
    } catch (e) {
      host.log('check failed: ' + e);
      sent = -1;
    }
    M.reload();
    M.checking = false;
    if (sent !== null) {
      if (sent < 0) U.toast("Couldn't reach the price source. Check your connection.");
      else if (sent > 0) U.toast(sent === 1 ? '1 new crossing. See Alerts.' : `${sent} new crossings. See Alerts.`);
      else if (!quiet) U.toast('Up to date. No new crossings.');
    }
    draw();
  };

  async function save(next, symbol) {
    M.assets = next;
    S.saveAssets(next);
    K.schedule(); // hourly crossings are checked more often
    draw();
    if (symbol && !(await K.prime(symbol))) U.toast(`Couldn't load prices for ${symbol}. Pull down on the watchlist to try again.`);
    M.reload();
    K.widgets();
    draw();
  }

  const newId = () => 'a' + Date.now() + Math.floor(Math.random() * 1000);

  /** Keeps the watchlists, and puts `assets` in their order (first list first), so widgets follow it too. */
  function saveLists(next) {
    M.lists = next;
    S.saveLists(next);
    const order = Array.from(new Set([].concat(...next.map(l => l.symbols))));
    const sorted = [].concat(...order.map(x => M.assets.filter(a => a.symbol === x)), M.assets.filter(a => !order.includes(a.symbol)));
    if (sorted.map(a => a.id).join() !== M.assets.map(a => a.id).join()) {
      M.assets = sorted;
      S.saveAssets(sorted);
    }
    draw();
    K.widgets();
  }
  const withList = (id, f) => M.lists.map(l => l.id === id ? Object.assign({}, l, { symbols: f(l.symbols) }) : l);

  /** Puts an asset on the watchlist on screen (or on `listId`). A new symbol starts with EMA 50 / 200. */
  M.add = (name, symbol, listId = M.listId) => {
    const next = withList(listId, list => list.includes(symbol) ? list : list.concat([symbol]));
    if (M.has(symbol)) return saveLists(next);
    M.lists = next;
    S.saveLists(next);
    save(M.assets.concat([C.asset({ id: newId(), name, symbol, fast: 50, slow: 200 })]), symbol);
  };

  /** Turns one crossing on or off for a symbol. */
  M.toggle = (symbol, fast, slow, tf = '1d', kind = 'ema') => {
    const mine = M.assets.filter(a => a.symbol === symbol);
    if (!mine.length) return;
    const on = mine.find(a => a.fast === fast && a.slow === slow && a.tf === tf && a.kind === kind);
    if (on) {
      if (mine.length === 1) return U.toast('Keep at least one crossing, or remove the asset.');
      save(M.assets.filter(a => a.id !== on.id), null);
    } else {
      const at = M.assets.map(a => a.symbol).lastIndexOf(symbol);
      const next = M.assets.slice();
      next.splice(at + 1, 0, C.asset({ id: newId(), name: mine[0].name, symbol, fast, slow, tf, kind }));
      save(next, symbol);
    }
  };

  M.rename = (symbol, name) => {
    const clean = name.trim();
    if (clean) save(M.assets.map(a => a.symbol === symbol ? Object.assign({}, a, { name: clean }) : a), null);
  };

  /** Silences or restores the notifications of one crossing. */
  M.toggleMute = id => save(M.assets.map(a => a.id === id ? Object.assign({}, a, { muted: !a.muted }) : a), null);

  /** Stops watching an asset: takes it off every watchlist and ends its alerts. */
  M.remove = symbol => {
    M.lists = M.lists.map(l => Object.assign({}, l, { symbols: l.symbols.filter(x => x !== symbol) }));
    S.saveLists(M.lists);
    save(M.assets.filter(a => a.symbol !== symbol), null);
  };

  /** Takes an asset off one watchlist only. It must stay on at least one: removing it altogether is `remove`. */
  M.takeOff = (symbol, listId = M.listId) => {
    if (M.listsOf(symbol).filter(l => l.id !== listId).length === 0) return false;
    saveLists(withList(listId, list => list.filter(x => x !== symbol)));
    return true;
  };

  /** Moves an asset from the watchlist on screen to another one. */
  M.moveTo = (symbol, listId) => {
    if (listId === M.listId) return;
    const next = withList(listId, list => list.includes(symbol) ? list : list.concat([symbol]));
    saveLists(next.map(l => l.id === M.listId ? Object.assign({}, l, { symbols: l.symbols.filter(x => x !== symbol) }) : l));
  };

  /** Puts the watchlist on screen in the order of `symbols`. */
  M.setOrder = symbols => {
    const want = symbols.filter(x => M.onList(x));
    saveLists(withList(M.listId, list => want.concat(list.filter(x => !want.includes(x)))));
  };

  // --- the watchlists themselves ---
  M.switchList = id => {
    if (!M.lists.some(l => l.id === id)) return;
    M.listId = id;
    S.setCurrentList(id);
    draw();
  };

  /** Makes a new, empty watchlist and shows it. */
  M.newList = name => {
    const clean = name.trim();
    if (!clean) return;
    const id = 'l' + Date.now() + Math.floor(Math.random() * 1000);
    saveLists(M.lists.concat([{ id, name: clean, symbols: [] }]));
    M.switchList(id);
  };

  M.renameList = (id, name) => {
    const clean = name.trim();
    if (clean) saveLists(M.lists.map(l => l.id === id ? Object.assign({}, l, { name: clean }) : l));
  };

  /** The assets that are on this watchlist and no other: deleting the list stops watching them. */
  M.onlyOn = id => {
    const list = M.lists.find(l => l.id === id);
    return list ? list.symbols.filter(x => M.listsOf(x).length === 1) : [];
  };

  /** Deletes a watchlist. The last one cannot be deleted. Assets only on it stop being watched. */
  M.deleteList = id => {
    if (M.lists.length < 2) return;
    const gone = M.onlyOn(id);
    const next = M.lists.filter(l => l.id !== id);
    if (M.listId === id) {
      M.listId = next[0].id;
      S.setCurrentList(M.listId);
    }
    M.lists = next;
    S.saveLists(next);
    if (gone.length) save(M.assets.filter(a => !gone.includes(a.symbol)), null);
    else draw();
  };

  /** Moves an asset up (-1) or down (+1) in the watchlist. */
  M.move = (symbol, by) => {
    const order = M.groups().map(g => g.symbol);
    const i = order.indexOf(symbol), j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    order[i] = order[j];
    order[j] = symbol;
    M.setOrder(order);
  };

  M.set = patch => {
    S.setSettings(patch);
    M.settings = S.settings();
    EMA.theme();
    draw();
  };

  M.toggleChart = id => {
    const on = M.settings.chart || [];
    M.set({ chart: on.includes(id) ? on.filter(x => x !== id) : on.concat([id]) });
  };

  M.dismissStale = () => {
    M.staleHours = null;
    draw();
  };

  /** Asks Android for the notification permission. With `settings` it opens the phone's settings when Android will not ask again. */
  M.askNotifications = async settings => {
    await host.call('askNotifications', { settings });
    M.allowed = host.notificationsAllowed();
    draw();
  };

  /** Every crossing of the watched pairs in the last `days` days, newest first, read from the saved prices. */
  M.recentCrossings = days => {
    const out = [];
    for (const a of M.assets) {
      const b = M.barsOf(a.symbol, a.tf);
      if (!b) continue;
      const crosses = C.crosses(a, b.closes);
      for (let i = crosses.length - 1; i >= 0; i--) {
        const x = crosses[i];
        const date = b.dates[x.index];
        if (C.daysSince(date) > days) break;
        const title = C.describe({ kind: 'cross', up: x.up, date, close: b.closes[x.index] }, a, b.currency).title;
        const notified = M.history.some(p => p.symbol === a.symbol && p.date === date && p.title === title);
        out.push({ asset: a, date, up: x.up, close: b.closes[x.index], currency: b.currency, notified });
      }
    }
    return out.sort((p, q) => (p.date < q.date ? 1 : p.date > q.date ? -1 : 0));
  };

  // --- backup ---
  /** The watchlist and the settings as one text, for a backup file. */
  M.exportJson = () => {
    const s = M.settings;
    return JSON.stringify({
      app: 'EMA Crossing', format: 1, assets: M.assets, lists: M.lists,
      settings: {
        theme: s.theme, details: s.details, chart: (s.chart || []).join(','), nearOn: s.nearOn, nearPct: s.nearPct,
        quietOn: s.quietOn, quietFrom: s.quietFrom, quietTo: s.quietTo
      }
    }, null, 2);
  };

  /** Replaces the watchlist and settings with a backup. Gives the number of crossings restored, or -1 if the text is not a backup. */
  M.importJson = text => {
    const list = [];
    let s = null, lists = null;
    try {
      const root = JSON.parse(text);
      if (root.app !== 'EMA Crossing') return -1;
      for (const o of root.assets) {
        if (o.id == null || o.name == null || o.symbol == null) return -1;
        const a = C.asset(o);
        if (C.validAsset(a) && !list.some(x => x.id === a.id)) list.push(a);
      }
      s = root.settings || null;
      lists = Array.isArray(root.lists) ? root.lists : null;
    } catch (e) {
      return -1;
    }
    if (!list.length) return -1;
    if (s) {
      const now = M.settings;
      const pick = (name, type) => typeof s[name] === type ? s[name] : now[name];
      S.setSettings({
        theme: ['dark', 'light', 'system'].includes(s.theme) ? s.theme : now.theme, details: pick('details', 'boolean'),
        chart: typeof s.chart === 'string' ? s.chart.split(',').filter(Boolean) : now.chart,
        nearOn: pick('nearOn', 'boolean'), nearPct: pick('nearPct', 'number'), quietOn: pick('quietOn', 'boolean'),
        quietFrom: (pick('quietFrom', 'number') + 24) % 24, quietTo: (pick('quietTo', 'number') + 24) % 24
      });
    }
    S.saveAssets(list);
    // A backup from before watchlists has none: then every asset goes on one list.
    S.saveLists(lists || []);
    S.saveLists(S.lists(list));
    K.schedule();
    M.reload();
    EMA.theme();
    M.checking = false;
    M.refresh(true); // loads prices for everything that was restored; never alerts on old crossings
    return list.length;
  };

  M.saveBackup = async () => {
    const r = await host.call('saveFile', { name: 'ema-crossing-backup.json', mime: 'application/json', text: M.exportJson() });
    if (!r.cancelled) U.toast(r.ok ? 'Backup saved.' : 'The backup could not be saved.');
  };

  M.restoreBackup = async () => {
    const r = await host.call('pickFile', { mimes: ['application/json', 'text/plain', 'application/octet-stream'] });
    if (r.cancelled) return;
    const restored = r.ok ? M.importJson(r.text) : -1;
    U.toast(restored < 0 ? 'That file is not an EMA Crossing backup.' : `Restored ${restored} crossings. Loading prices…`);
  };

  // --- updates from a server ---
  M.chooseUpdateUrl = text => {
    const url = text.trim().replace(/\/+$/, '');
    S.setSettings({ updateUrl: url });
    S.setUpdate({});
    M.settings = S.settings();
    M.update = {};
    if (!url) {
      U.toast('Updates from a server are off.');
      draw();
    } else M.checkUpdates(false);
  };

  /** Looks for a newer pack. When one arrived, the app starts again with it and then says what is new. */
  M.checkUpdates = async (quiet = false) => {
    if (M.updating || !M.settings.updateUrl) return;
    M.updating = true;
    draw();
    const r = await K.update();
    M.updating = false;
    M.update = S.update();
    if (r && r.ok && r.status === 'updated') {
      host.set('flash', r.message);
      host.reload();
      return;
    }
    if (r && (!quiet || (r.ok && r.quietWorthy))) U.toast(r.message);
    draw();
  };

  M.installEngine = async () => {
    const e = M.update.engine;
    if (!e || M.updating) return;
    M.updating = true;
    draw();
    const r = await host.call('installEngine', { url: M.settings.updateUrl, apk: e.apk, sha256: e.sha256 });
    M.updating = false;
    if (!r.ok) U.toast(r.error || 'The update could not be downloaded.');
    draw();
  };

  // --- articles ---
  let articles = null;
  /** The articles in the pack, newest first: {name, number, title, date, lead, body}. Null until they are read. */
  M.articles = () => articles;
  M.loadArticles = async () => {
    if (articles) return articles;
    const names = Object.keys(EMA.pack.files || {}).map(p => /^articles\/(.+)\.md$/.exec(p)).filter(Boolean).map(m => m[1]).sort().reverse();
    const out = [];
    for (const name of names) {
      try {
        const lines = (await EMA.text(`articles/${name}.md`)).split('\n').map(l => l.trimEnd()).filter(l => l.trim());
        const head = lines.find(l => l.startsWith('# '));
        if (!head) continue;
        const date = lines.find(l => l.startsWith('Date:'));
        const rest = lines.filter(l => !l.startsWith('# ') && !l.startsWith('Date:'));
        out.push({
          name, number: (/^([0-9]{3})-/.exec(name) || [])[1] || '', title: head.slice(2), date: date ? date.slice(5).trim() : '',
          lead: rest.find(l => !l.startsWith('#') && !l.startsWith('- ')) || '', body: rest
        });
      } catch (e) {
        // An article that cannot be read is left out of the list.
      }
    }
    articles = out;
    return out;
  };

  EMA.model = M;
})(window.EMA);
