'use strict';
// What the app keeps on the phone, and the start-up that every copy of the pack goes through.
(function (EMA) {
  const host = EMA.host, C = EMA.core;
  const S = {};

  const SETTINGS = { theme: 'dark', details: true, chart: [], nearOn: true, nearPct: 1, quietOn: false, quietFrom: 22, quietTo: 7 };

  /** The watchlist: one item per watched crossing. Before the user changes anything it is the starting list. */
  S.assets = () => {
    const list = host.get('assets', null);
    return (Array.isArray(list) ? list : EMA.catalog.defaults).map(C.asset);
  };
  S.saveAssets = list => host.set('assets', list);

  /**
   * The watchlists: [{id, name, symbols}], each an ordered choice of the assets in `assets`. An asset may be on several.
   * `assets` stays the one list of everything watched (and alerted on), so a pack from before watchlists still reads it.
   * Before the user makes a second list there is one, "Watchlist", holding every asset in its present order.
   * Repairs what it reads: unknown symbols are dropped, and an asset on no list goes on the first one.
   */
  S.lists = assets => {
    const symbols = C.groups(assets).map(g => g.symbol);
    const known = new Set(symbols);
    const saved = host.get('lists', null);
    const lists = (Array.isArray(saved) ? saved : [])
      .filter(l => l && typeof l.id === 'string' && l.id && typeof l.name === 'string' && Array.isArray(l.symbols))
      .map(l => ({ id: l.id, name: l.name.trim() || 'Watchlist', symbols: Array.from(new Set(l.symbols.filter(x => known.has(x)))) }))
      .filter((l, i, all) => all.findIndex(o => o.id === l.id) === i);
    if (!lists.length) lists.push({ id: 'main', name: 'Watchlist', symbols: [] });
    const placed = new Set([].concat(...lists.map(l => l.symbols)));
    for (const x of symbols) if (!placed.has(x)) lists[0].symbols.push(x);
    return lists;
  };
  S.saveLists = lists => host.set('lists', lists);
  /** The watchlist on screen, by its id. */
  S.currentList = () => host.get('currentList', '') || '';
  S.setCurrentList = id => host.set('currentList', id);

  /** The last result of each crossing, by its id. */
  S.entries = () => host.get('entries', {}) || {};
  S.saveEntries = map => host.set('entries', map);

  /** Alerts already sent, newest first: {date, title, symbol, up, kind}. */
  S.history = () => host.get('history', []) || [];
  S.addHistory = item => host.set('history', [item].concat(S.history()).slice(0, 50));

  /** Price history of one symbol and timeframe, kept so the screens can draw charts without the network. */
  S.bars = (symbol, tf = '1d') => {
    const b = host.get('bars:' + symbol + '|' + tf, null);
    return b && Array.isArray(b.closes) ? C.bars(b.dates, b.closes, b.currency, b) : null;
  };
  S.saveBars = (symbol, tf, bars) => {
    if (bars.closes.length) host.set('bars:' + symbol + '|' + tf, bars);
  };

  /** {theme, details, chart, nearOn, nearPct, quietOn, quietFrom, quietTo, updateUrl} */
  S.settings = () => Object.assign({}, SETTINGS, { updateUrl: EMA.catalog.updateUrl || '' }, host.get('settings', {}));
  S.setSettings = patch => host.set('settings', Object.assign(S.settings(), patch));

  S.lastChecked = () => host.get('lastChecked', 0) || 0;
  S.setLastChecked = t => host.set('lastChecked', t);

  /** Notifications kept for after quiet hours: {title, body, route}. */
  S.hold = item => host.set('held', (host.get('held', []) || []).concat([item]));
  S.takeHeld = () => {
    const out = host.get('held', []) || [];
    if (out.length) host.remove('held');
    return out;
  };

  /** The symbols one placed widget shows. Empty means every asset on the watchlist. */
  S.widgetSymbols = id => host.get('widget:' + id, []) || [];
  S.setWidgetSymbols = (id, symbols) => host.set('widget:' + id, symbols);

  /** What the last look at the update server found: {checked, status, name, notes, engine}. */
  S.update = () => host.get('update', {}) || {};
  S.setUpdate = o => host.set('update', o);

  /** Takes over what versions 1.0 and 1.1 saved, once, so nothing is lost and no alert is repeated or missed. */
  S.migrate = () => {
    if (host.get('migrated', false)) return;
    const old = host.legacy();
    const parse = (text, fallback) => {
      try {
        return JSON.parse(text);
      } catch (e) {
        return fallback;
      }
    };
    // The old watchlist and history are also kept as they were, untouched, in case the takeover goes wrong.
    if (typeof old.assets === 'string') host.set('before12', { assets: old.assets, history: old.history || null });
    let taken = true;
    if (typeof old.assets === 'string') {
      const list = parse(old.assets, null);
      if (Array.isArray(list)) S.saveAssets(list.map(C.asset));
      else taken = false;
    }
    if (typeof old.entries === 'string') {
      const map = parse(old.entries, {});
      for (const id of Object.keys(map)) {
        delete map[id].seriesClose;
        delete map[id].seriesFast;
        delete map[id].seriesSlow;
      }
      S.saveEntries(map);
    }
    if (typeof old.history === 'string') {
      const list = parse(old.history, []);
      host.set('history', list.map(p => ({
        date: p.date, title: p.title, symbol: p.symbol || '', up: 'up' in p ? !!p.up : String(p.title).includes(' above '), kind: p.kind || 'cross'
      })));
    }
    if (typeof old.held === 'string') {
      host.set('held', parse(old.held, []).map(h => ({ title: h[0], body: h[1], route: h[2] ? 'd:' + h[2] : 'home' })));
    }
    const patch = {};
    for (const k of ['theme', 'details', 'nearOn', 'quietOn', 'quietFrom', 'quietTo', 'updateUrl']) if (k in old) patch[k] = old[k];
    if ('nearPct' in old) patch.nearPct = Math.round(old.nearPct * 100) / 100;
    if (typeof old.chart === 'string') patch.chart = old.chart.split(',').filter(Boolean);
    if (Object.keys(patch).length) host.set('settings', Object.assign({}, host.get('settings', {}), patch));
    // The time of the last check is not taken over: the saved prices are not either, so the first start fetches them all.
    for (const k of Object.keys(old)) {
      if (k.startsWith('widget_') && old[k]) S.setWidgetSymbols(k.slice(7), String(old[k]).split(',').filter(Boolean));
    }
    host.set('migrated', true);
    if (taken) host.legacyClear();
  };

  EMA.store = S;

  const text = async path => {
    const r = await fetch(path);
    if (!r.ok) throw new Error(path + ' is missing from the pack');
    return r.text();
  };
  EMA.text = text;

  /** Loads the pack's lists and its file list, and takes over old data. Every copy of the pack starts with this. */
  EMA.boot = async () => {
    EMA.catalog = JSON.parse(await text('data/catalog.json'));
    EMA.pack = JSON.parse(await text('pack.json'));
    S.migrate();
  };
})(window.EMA);
