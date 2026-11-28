'use strict';
// The work that also runs without a screen: fetching prices, finding new crossings, sending notifications,
// drawing the home-screen widgets, and looking for a newer pack.
(function (EMA) {
  const host = EMA.host, C = EMA.core, S = EMA.store;
  const K = {};
  const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  const yahoo = { 'User-Agent': UA, Accept: 'application/json' };
  // Never more than 5 requests a second to Yahoo, from the price check, the scan and search alike.
  // Each running copy of the pack has its own pacer, so the price check and the scan share a lock and never overlap.
  const pacer = C.pacer(5);
  K.pacer = pacer;
  /** An error from the price source saying "too many requests". Every request waits a minute after one. */
  const throttled = () => {
    pacer.pause(60000);
    const e = new Error('The price source asked the app to slow down');
    e.throttled = true;
    return e;
  };

  /** Finished bars of one symbol from Yahoo Finance. Empty bars when the symbol has no prices yet (before a listing). */
  async function fetchOne(symbol, tf, short = false) {
    // `short` is true for the catalog's short range, or a range of its own ("3mo").
    const range = typeof short === 'string' ? short : short ? ((EMA.catalog.recent || {})[tf] || '1mo') : (EMA.catalog.history || {})[tf] || '5y';
    let last = 'No price data';
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = `https://${attempt % 2 === 0 ? 'query1' : 'query2'}.finance.yahoo.com/v8/finance/chart/` +
        `${encodeURIComponent(symbol)}?range=${range}&interval=${tf}&includePrePost=false`;
      await pacer.wait();
      const r = await host.call('http', { url, headers: yahoo, timeoutMs: 20000 });
      if (r.ok && r.status === 429) throw throttled();
      try {
        if (!r.ok) throw new Error(r.error || 'No connection');
        if (r.status === 404) return C.bars([], []);
        if (r.status !== 200) throw new Error('Price source answered HTTP ' + r.status);
        return C.parseChart(JSON.parse(r.text), Math.floor(Date.now() / 1000), tf);
      } catch (e) {
        last = e.message || String(e);
        await sleep(1200 * (attempt + 1));
      }
    }
    throw new Error(last);
  }

  /** One series: straight from Yahoo, or one the app works out itself from two of them (see "derived" in the catalog). */
  K.fetch = async (symbol, tf = '1d', short = false) => {
    const d = (EMA.catalog.derived || {})[symbol];
    if (!d) return fetchOne(symbol, tf, short);
    const base = await fetchOne(d.base, tf, short);
    // Hourly bars of two markets carry different local clocks, so they are priced with each day's rate.
    const rate = await fetchOne(d.rate, tf === '1h' ? '1d' : tf, short);
    return C.combine(base, rate, d.factor, d.currency);
  };

  /** Looks an asset up by name or symbol: [{symbol, name, detail}]. Throws when the search cannot be reached. */
  K.search = async query => {
    await pacer.wait();
    const r = await host.call('http', {
      url: 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=12&newsCount=0&listsCount=0',
      headers: yahoo, timeoutMs: 15000
    });
    if (!r.ok || r.status !== 200) throw new Error('Search is not reachable');
    const out = [];
    for (const q of JSON.parse(r.text).quotes || []) {
      if (!q.symbol || q.quoteType === 'OPTION') continue;
      const name = String(q.shortname || q.longname || q.symbol).trim().replace(/\s+/g, ' ');
      out.push({ symbol: q.symbol, name, detail: [q.symbol, q.exchDisp, q.typeDisp].filter(Boolean).join(' · ') });
    }
    return out;
  };

  /**
   * The price history of one symbol: the saved one topped up with a short download of the latest bars. The whole
   * history is downloaded again when nothing is saved, once it is a week old (catalog "fullEveryDays"), or when the
   * latest bars do not fit the saved ones (see C.topUp). `fullAt` records when it was last downloaded whole.
   */
  K.history = async (symbol, tf) => {
    const saved = S.bars(symbol, tf);
    const days = EMA.catalog.fullEveryDays || 7;
    if (saved && saved.fullAt && Date.now() - saved.fullAt < days * 86400000) {
      const merged = C.topUp(saved, await K.fetch(symbol, tf, true));
      if (merged) {
        merged.fullAt = saved.fullAt;
        return merged;
      }
    }
    const bars = await K.fetch(symbol, tf);
    bars.fullAt = Date.now();
    return bars;
  };

  /** Downloads every wanted "symbol|tf", four at a time, and saves what arrives. Gives {bars} or {error} for each. */
  async function download(wanted) {
    const got = new Map();
    const queue = wanted.slice();
    const worker = async () => {
      while (queue.length) {
        const key = queue.shift();
        const cut = key.lastIndexOf('|');
        const symbol = key.slice(0, cut), tf = key.slice(cut + 1);
        try {
          const bars = await K.history(symbol, tf);
          S.saveBars(symbol, tf, bars);
          got.set(key, { bars });
        } catch (e) {
          host.log(`no prices for ${key}: ${e.message}`);
          got.set(key, { error: e.message || 'Lookup failed' });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return got;
  }

  // --- notifications ---
  const quietNow = () => {
    const s = S.settings();
    return s.quietOn && C.quiet(new Date().getHours(), s.quietFrom, s.quietTo);
  };

  /** One check a minute after quiet hours end, which also delivers what was held. */
  function scheduleQuietEnd() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(S.settings().quietTo, 1, 0, 0);
    if (end <= now) end.setDate(end.getDate() + 1);
    host.schedule({ name: 'ema-quiet-end', kind: 'once', delaySec: Math.round((end - now) / 1000), replace: true });
  }

  /** Shows an alert now, or keeps it until quiet hours end. */
  const deliver = K.deliver = (title, body, route) => {
    if (quietNow()) {
      S.hold({ title, body, route });
      scheduleQuietEnd();
    } else host.notify({ title, body, route });
  };

  /** Shows what was kept during quiet hours, once they are over. */
  K.flushHeld = () => {
    if (quietNow()) return;
    for (const h of S.takeHeld()) host.notify(h);
  };

  /** The regular check: every 3 hours, or every hour while an hourly crossing is watched. */
  K.schedule = () => {
    const m = EMA.catalog.checkMinutes || { normal: 180, hourly: 60 };
    host.schedule({ name: 'ema-check', kind: 'periodic', minutes: S.assets().some(a => a.tf === '1h') ? m.hourly : m.normal });
  };

  /** One extra check ten minutes after the next market close, so a daily crossing is reported soon after it is final. */
  function scheduleAfterClose(closes) {
    if (!closes.length) return;
    const now = Math.floor(Date.now() / 1000);
    const midnight = now - (now % 86400);
    let next = Infinity;
    for (const s of new Set(closes)) {
      let t = midnight + s + 600;
      if (t <= now + 120) t += 86400;
      if (t < next) next = t;
    }
    // The name carries the target minute: asking again for the same close changes nothing.
    host.schedule({ name: 'ema-close-' + Math.floor(next / 60), kind: 'once', delaySec: next - now, replace: false });
  }

  // --- the check ---
  /** Fills in results for crossings the user just added, from saved prices when possible. Never alerts. */
  K.prime = async symbol => {
    const mine = S.assets().filter(a => a.symbol === symbol);
    const missing = mine.filter(a => (S.entries()[a.id] || {}).key !== C.key(a));
    // The daily prices are always kept: the watchlist shows the price from them.
    const frames = Array.from(new Set(missing.map(a => a.tf).concat(['1d']))).filter(tf => !S.bars(symbol, tf));
    const got = await download(frames.map(tf => symbol + '|' + tf));
    const entries = S.entries();
    let ok = true;
    for (const a of missing) {
      const bars = S.bars(symbol, a.tf) || (got.get(symbol + '|' + a.tf) || {}).bars;
      if (!bars) {
        ok = false;
        continue;
      }
      entries[a.id] = C.evaluate(a, bars, null).entry;
    }
    S.saveEntries(entries);
    return ok;
  };

  /**
   * Checks every crossing once. Gives the number of alerts sent, -1 when every lookup failed, or null when
   * another copy of the pack is already checking.
   */
  K.run = async () => {
    if (!host.lock('check')) {
      // Another copy is checking, or a scan is running: the scan runs this check as soon as it ends (see scan.js).
      host.set('checkWaiting', true);
      return null;
    }
    host.remove('checkWaiting');
    try {
      K.flushHeld();
      const assets = S.assets();
      const before = S.entries();
      const wanted = new Set();
      for (const a of assets) {
        wanted.add(a.symbol + '|1d');
        wanted.add(a.symbol + '|' + a.tf);
      }
      const got = await download(Array.from(wanted));
      const st = S.settings();
      const nearPct = st.nearOn ? st.nearPct : 0;

      const after = {};
      const listed = new Set();
      let sent = 0, failures = 0;
      for (const asset of assets) {
        const prev = before[asset.id] || null;
        const result = got.get(asset.symbol + '|' + asset.tf) || {};
        if (!result.bars) {
          failures++;
          // Keep the last good result so one bad lookup never causes a missed or repeated alert.
          const error = result.error || 'Lookup failed';
          after[asset.id] = prev ? Object.assign({}, prev, { error }) : { id: asset.id, key: '', state: 'error', error };
          continue;
        }
        const { entry, alerts } = C.evaluate(asset, result.bars, prev, nearPct);
        after[asset.id] = entry;
        for (const a of alerts) {
          if (asset.muted) continue; // tracked and shown in the app, but silent
          if (a.kind === 'listed') {
            if (listed.has(asset.symbol)) continue;
            listed.add(asset.symbol);
          }
          const words = C.describe(a, asset, entry.currency);
          const record = a.kind === 'cross' ? C.recordLine(asset, result.bars, a.up) : null;
          deliver(words.title, record ? words.body + ' ' + record : words.body, 'd:' + asset.symbol);
          S.addHistory({ date: a.date, title: words.title, symbol: asset.symbol, up: a.up, kind: a.kind });
          sent++;
        }
      }
      // A crossing added while this check was running keeps the result it was given then.
      const now = S.entries();
      for (const a of S.assets()) if (!(a.id in after) && now[a.id]) after[a.id] = now[a.id];
      S.saveEntries(after);
      // Saved prices of assets that are no longer watched are thrown away.
      for (const key of host.keys('bars:')) if (!wanted.has(key.slice(5))) host.remove(key);
      const allFailed = assets.length > 0 && failures === assets.length;
      if (!allFailed) S.setLastChecked(Date.now());
      scheduleAfterClose(Array.from(got.values()).map(r => r.bars ? r.bars.closeUtc : -1).filter(s => s >= 0));
      K.widgets();
      return allFailed ? -1 : sent;
    } finally {
      host.unlock('check');
      host.emit('checked');
    }
  };

  // --- widgets ---
  /** Redraws every placed widget from what is saved on the phone. */
  K.widgets = () => {
    const placed = host.widgets();
    if (!placed.length) return;
    const entries = S.entries();
    const lines = C.groups(S.assets()).slice(0, 40).map(g => {
      const states = g.items.map(a => (entries[a.id] && entries[a.id].key === C.key(a)) ? entries[a.id].state : null);
      const bars = S.bars(g.symbol);
      return {
        symbol: g.symbol, name: g.name, up: states.filter(s => s === 'above').length, down: states.filter(s => s === 'below').length,
        quote: C.quoteOf(bars), trend: bars ? bars.closes.slice(-60) : []
      };
    });
    const checked = S.lastChecked();
    // The arrows for an asset's crossings: green up, red down, with counts when there is more than one.
    const arrows = l => {
      const many = l.up + l.down > 1;
      const out = [];
      if (l.up > 0) out.push([many ? '↑' + l.up : '↑', 'up']);
      if (l.down > 0) out.push([(out.length ? ' ' : '') + (many ? '↓' + l.down : '↓'), 'down']);
      return out;
    };
    const change = (l, digits) => l.quote && l.quote.change != null ? [[C.signed(l.quote.change, digits), l.quote.change >= 0 ? 'up' : 'down']] : [];
    const spark = l => l.trend.length >= 2 ? { v: l.trend, color: l.trend[l.trend.length - 1] >= l.trend[0] ? 'up' : 'down' } : null;
    const within = (v, lo, hi) => v >= lo && v <= hi;

    for (const w of placed) {
      // Each widget shows its own choice of assets; with no choice, or none of them left, it shows all.
      const chosen = S.widgetSymbols(w.id);
      let mine = lines.filter(l => chosen.includes(l.symbol));
      if (!mine.length) mine = lines;
      let spec;
      if (w.kind === 'one') {
        const l = mine[0];
        if (!l) spec = { mode: 'one', route: 'home', name: 'Open the app to add assets' };
        else {
          spec = { mode: 'one', route: 'd:' + l.symbol, name: l.name, state: arrows(l), price: l.quote ? C.money(l.quote.price) : '', change: change(l, 2) };
          // The trend line is left out when the widget is one row high.
          if (!within(w.h, 1, 99) && spark(l)) Object.assign(spec, { spark: spark(l), sparkW: w.w > 0 ? w.w - 24 : 140, sparkH: w.h > 0 ? w.h - 72 : 60 });
        }
      } else if (w.kind === 'strip') {
        const fit = w.w <= 0 ? 4 : Math.max(1, Math.min(8, Math.floor(w.w / 80)));
        spec = {
          mode: 'strip', route: 'home',
          // A long name would be cut to a few letters, so the symbol stands in for it.
          cells: mine.slice(0, fit).map(l => {
            const text = arrows(l);
            for (const piece of change(l, 1)) text.push([(text.length ? ' ' : '') + piece[0], piece[1]]);
            return { route: 'd:' + l.symbol, name: l.name.length <= 10 ? l.name : l.symbol, text };
          })
        };
      } else if (w.kind === 'list') {
        // A narrow widget drops the trend line first, then the price.
        const narrow = within(w.w, 1, 259);
        spec = {
          mode: 'list', route: 'home', note: !checked || within(w.w, 1, 199) ? '' : C.stamp(checked),
          fit: w.h <= 0 ? 4 : Math.max(1, Math.min(12, Math.floor((w.h - 52) / 28))),
          rows: mine.map(l => {
            const row = { route: 'd:' + l.symbol, name: l.name, state: arrows(l), change: change(l, 2) };
            if (narrow) row.sparkGone = true; else if (spark(l)) row.spark = spark(l);
            if (!within(w.w, 1, 189)) row.price = l.quote ? C.money(l.quote.price) : '';
            return row;
          })
        };
      } else {
        spec = { mode: 'strip', route: 'home', cells: [], empty: 'Not in use' };
      }
      host.setWidget(w.id, spec);
    }
  };

  // --- a newer pack ---
  const articleOf = path => (/^articles\/(.+)\.(md|html)$/.exec(path) || [])[1];

  /**
   * Asks the update server for a newer pack. With `background` it asks at most every 12 hours.
   * Gives null when there was nothing to do, else {ok, status, message}: `message` is one sentence for the user.
   * With `retry`, a version this phone set aside is deleted, downloaded again and tried once more.
   */
  K.update = async ({ background = false, retry = false } = {}) => {
    const url = S.settings().updateUrl;
    if (!url) return null;
    if (background && Date.now() - (S.update().checked || 0) < 12 * 3600000) return null;
    const r = await host.call(retry ? 'retryPack' : 'updatePack', { url });
    if (!r.ok && retry && /does not know/.test(r.error || '')) return { ok: false, message: 'Retry update needs a newer engine than the one on this phone.' };
    if (!r.ok) return { ok: false, message: "Couldn't read the update server: " + (r.error || 'no answer') };
    const engine = r.engine && r.engine.versionCode > host.info.shellCode ? r.engine : null;
    S.setUpdate({ checked: Date.now(), status: r.status, name: r.name || '', notes: r.notes || '', engine });
    const parts = [];
    if (r.status === 'updated') {
      const had = new Set(Object.keys(EMA.pack.files || {}).map(articleOf).filter(Boolean));
      const touched = new Set((r.changed || []).map(articleOf).filter(Boolean));
      const added = Array.from(touched).filter(n => !had.has(n)).length;
      const corrected = touched.size - added;
      if (added) parts.push(added === 1 ? '1 new article' : `${added} new articles`);
      if (corrected) parts.push(corrected === 1 ? '1 article corrected' : `${corrected} articles corrected`);
      if ((r.changed || []).some(p => !articleOf(p))) parts.push('the app was updated');
      if (!parts.length) parts.push('the app was updated');
    }
    if (r.status === 'bad') parts.push('the newest update on the server did not start on this phone, so the app stays on the version that works');
    if (r.status === 'engine') parts.push('this update needs a new version of the engine');
    else if (engine) parts.push(`engine ${engine.versionName} is available`);
    const message = parts.length ? parts.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : 'Nothing new on the server.';
    return { ok: true, status: r.status, message, quietWorthy: parts.length > 0 };
  };

  EMA.check = K;
})(window.EMA);
