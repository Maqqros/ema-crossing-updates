'use strict';
// The screener: once after each market closes, it brings the prices of every symbol in data/scan.txt up to date
// and finds the ones whose averages crossed in the last few days. It also runs without a screen.
//
// Prices of scanned symbols are kept apart from the watchlist's, under "scan:<symbol>", dates and closes only.
// The first scan of a symbol downloads 5 years; later scans add the last month (pack 9's top-up), and each symbol
// is downloaded whole again about every two weeks, or at once when past prices changed (a split).
(function (EMA) {
  const host = EMA.host, C = EMA.core, S = EMA.store, K = EMA.check;
  const Z = {};
  const DAY = 86400000;
  const cfg = () => EMA.catalog.scan || {};
  // The scan goes slower than the app's overall limit of 5 a second, to be gentle on the home connection's address.
  let pacer = null;
  const slow = () => pacer || (pacer = C.pacer(cfg().perSecond || 2));
  /** Until when the scan leaves Yahoo alone after being told to slow down. Kept, so no restart cuts it short. */
  Z.coolUntil = () => host.get('scanCoolUntil', 0) || 0;
  const coolMs = () => (cfg().coolMinutes || 30) * 60000;

  // --- what is saved ---
  /** {scanOn, rules: [{kind, fast, slow, tf, on}], days, notify}: the user's choices, starting from the catalog's. */
  Z.settings = () => {
    const saved = host.get('scanSettings', {}) || {};
    const rules = Array.isArray(saved.rules) && saved.rules.length ? saved.rules : (cfg().rules || []);
    return {
      scanOn: saved.scanOn !== false, notify: saved.notify !== false, days: saved.days || 5,
      rules: rules.map(r => ({ kind: r.kind || 'ema', fast: Number(r.fast), slow: Number(r.slow), tf: r.tf === '1wk' ? '1wk' : '1d', on: !!r.on }))
        .filter(r => C.validAsset(C.ruleAsset(r, 'X')))
    };
  };
  Z.saveSettings = patch => host.set('scanSettings', Object.assign(Z.settings(), patch));
  Z.activeRules = () => Z.settings().rules.filter(r => r.on).map(r => Object.assign({ id: C.ruleId(r) }, r));

  /** Saved prices of one scanned symbol: {dates, closes, currency, closeUtc, fullAt, price, prev}. */
  Z.bars = symbol => {
    const b = host.get('scan:' + symbol, null);
    return b && Array.isArray(b.closes) ? C.bars(b.dates, b.closes, b.currency, b) : null;
  };
  const slim = (b, fullAt) => ({
    dates: b.dates, closes: b.closes.map(v => Number(v.toPrecision(7))), currency: b.currency, closeUtc: b.closeUtc,
    price: b.price, prev: b.prev, priceAt: b.priceAt, live: b.live, fullAt
  });

  /** Per market: {day (the session date last scanned), at, scanned, failed: [{symbol, error}], cursor, started}. */
  Z.state = () => host.get('scanState', {}) || {};
  const saveState = (market, patch) => host.set('scanState', Object.assign(Z.state(), { [market]: Object.assign({}, Z.state()[market] || {}, patch) }));

  /** The crossings found by the last scans: {at, hits: [...]}, kept with when each one was first seen. */
  Z.results = () => host.get('scanResults', { at: 0, hits: [] }) || { at: 0, hits: [] };

  // --- the list ---
  let list = null;
  /** The list file, read once: {lists, symbols, skipped} (see C.parseScanList). */
  Z.list = async () => {
    if (list) return list;
    try {
      list = C.parseScanList(await EMA.text('data/scan.txt'));
    } catch (e) {
      list = { lists: [], symbols: [], skipped: [], missing: true };
    }
    return list;
  };
  Z.symbolsOf = (all, market) => all.symbols.filter(s => C.marketOf(s.symbol) === market);

  // --- prices ---
  const hash = text => {
    let x = 0;
    for (let i = 0; i < text.length; i++) x = (x * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(x);
  };

  /** Brings one symbol's saved prices up to date: a short top-up when possible, else the whole 5 years. */
  Z.update = async symbol => {
    const saved = Z.bars(symbol);
    const every = (cfg().fullEveryDays || 14) * DAY;
    if (saved && saved.fullAt && Date.now() - saved.fullAt < every) {
      await slow().wait();
      const r = await K.fetch(symbol, '1d', true);
      const recent = C.bars(r.dates, r.closes, r.currency, { closeUtc: r.closeUtc, price: r.price, prev: r.prev, priceAt: r.priceAt, live: r.live });
      const merged = C.topUp(saved, recent);
      if (merged) {
        host.set('scan:' + symbol, slim(merged, saved.fullAt));
        return merged;
      }
    }
    await slow().wait();
    const bars = await K.fetch(symbol, '1d');
    // The first downloads all happen on one day; dating some of them back spreads the later full downloads over two weeks.
    const fullAt = saved ? Date.now() : Date.now() - (hash(symbol) % 14) * DAY;
    if (bars.closes.length) host.set('scan:' + symbol, slim(bars, fullAt));
    return bars;
  };

  // --- finding crossings ---
  /** The crossings of the active rules in every saved symbol, newest first. Reads only what is saved. */
  Z.evaluate = async () => {
    const all = await Z.list();
    const st = Z.settings();
    const rules = Z.activeRules();
    const before = Z.results();
    const seen = new Map(before.hits.map(x => [x.symbol + '|' + x.rule + '|' + x.date, x.seen]));
    const hits = [];
    for (const s of all.symbols) {
      const bars = Z.bars(s.symbol);
      if (!bars) continue;
      const market = (cfg().markets || {})[C.marketOf(s.symbol)] || {};
      for (const x of C.scanHits(bars, rules, st.days, x0(st.days), C.today(), market.weekEnd || 4)) {
        const key = s.symbol + '|' + x.rule.id + '|' + x.date;
        const q = C.quoteOf(bars);
        hits.push({
          symbol: s.symbol, name: s.name, lists: s.lists, rule: x.rule.id, kind: x.rule.kind, fast: x.rule.fast, slow: x.rule.slow, tf: x.rule.tf,
          up: x.up, date: x.date, close: x.close, currency: bars.currency, price: q ? q.price : null, change: q ? q.change : null,
          trend: bars.closes.slice(-60), seen: seen.get(key) || Date.now()
        });
      }
    }
    hits.sort((p, q) => (p.date < q.date ? 1 : p.date > q.date ? -1 : p.symbol < q.symbol ? -1 : 1));
    const out = { at: Date.now(), hits };
    host.set('scanResults', out);
    // The very first results are all new; they are shown, but not announced.
    return { results: out, fresh: before.at ? hits.filter(x => !seen.has(x.symbol + '|' + x.rule + '|' + x.date)) : [] };
  };
  // A weekly rule looks back over the weeks that hold the same number of days: 5 days is 1 week, 10 is 2.
  const x0 = days => Math.max(1, Math.round(days / 5));

  // --- one market's scan ---
  /**
   * Scans the symbols of one market. In the background (`foreground` false) it first makes sure the market has
   * closed today and was not closed for a holiday, stops after a few minutes and carries on in a later run.
   * `progress(done, total)` is told as it goes. Gives {ok, status, scanned, failed} or null when a price check is running.
   */
  Z.run = async (market, { foreground = false, progress = () => {} } = {}) => {
    const m = (cfg().markets || {})[market];
    const all = await Z.list();
    const symbols = Z.symbolsOf(all, market);
    if (!m || !symbols.length) return { ok: true, status: 'empty', scanned: 0, failed: 0 };
    if (Date.now() < Z.coolUntil()) return { ok: false, status: 'cooling', scanned: 0, failed: 0 };
    if (!host.lock('check')) return null;
    const started = Date.now();
    try {
      const st = Z.state()[market] || {};
      const session = C.sessions(Date.now(), m).last;
      if (!foreground) {
        if (st.day === session.date && !st.cursor) return { ok: true, status: 'done', scanned: 0, failed: 0 };
        if (!st.cursor) {
          const open = await Z.traded(market, symbols, session);
          if (open === 'notYet') return { ok: true, status: 'notYet', scanned: 0, failed: 0 };
          if (open === 'holiday') {
            saveState(market, { day: session.date, at: Date.now(), holiday: true });
            return { ok: true, status: 'holiday', scanned: 0, failed: 0 };
          }
        }
      }
      const limit = foreground ? Infinity : started + (cfg().runSeconds || 360) * 1000;
      const queue = symbols.slice(foreground ? 0 : (st.cursor || 0));
      const total = symbols.length;
      let done = total - queue.length, failed = (foreground || !st.cursor) ? [] : (st.failed || []), throttles = 0, stopped = '';
      if (!st.cursor || foreground) saveState(market, { started, failed: [] });
      const worker = async () => {
        while (queue.length && !stopped) {
          if (Date.now() > limit) {
            stopped = 'time';
            break;
          }
          const s = queue.shift();
          try {
            await Z.update(s.symbol);
            throttles = 0;
          } catch (e) {
            if (e.throttled && ++throttles >= 3) {
              stopped = 'throttled';
              host.set('scanCoolUntil', Date.now() + coolMs());
            }
            failed.push({ symbol: s.symbol, error: e.message || 'Lookup failed' });
          }
          done++;
          if (done % 25 === 0) saveState(market, { cursor: done, failed });
          progress(done, total);
        }
      };
      await Promise.all([worker(), worker()]);
      if (stopped) {
        saveState(market, { cursor: done, failed });
        return { ok: false, status: stopped, scanned: done, failed: failed.length };
      }
      saveState(market, { day: session.date, at: Date.now(), cursor: 0, scanned: total, failed, holiday: false });
      // Prices of symbols no longer on the list are thrown away.
      const wanted = new Set(all.symbols.map(s => s.symbol));
      for (const key of host.keys('scan:')) if (!wanted.has(key.slice(5))) host.remove(key);
      return { ok: true, status: 'scanned', scanned: total, failed: failed.length };
    } finally {
      host.unlock('check');
      // A price check that found the scan running is done straight after it.
      if (host.get('checkWaiting', false)) {
        host.remove('checkWaiting');
        host.schedule({ name: 'ema-check-after-scan', kind: 'once', delaySec: 15, job: 'check', replace: true });
      }
    }
  };

  /**
   * Did this market trade in its latest session? Asks for the short history of up to three reference symbols
   * (the market's index, then two of its largest shares), stopping at the first that answers. Gives "open",
   * "notYet" (no bar yet, within 3 hours of the close: try again soon) or "holiday". When none of them answers,
   * it says "open": a scan that finds nothing new costs less than a scan that is wrongly skipped.
   */
  Z.traded = async (market, symbols, session) => {
    const m = cfg().markets[market];
    const refs = (m.refs || (m.ref ? [m.ref] : [])).concat(symbols.slice(0, 2).map(s => s.symbol)).slice(0, 3);
    for (const ref of refs) {
      let bars;
      try {
        await slow().wait();
        bars = await K.fetch(ref, '1d', true);
      } catch (e) {
        if (e.throttled) throw e;
        continue;
      }
      if (!bars.closes.length) continue;
      const latest = bars.dates[bars.dates.length - 1];
      if (latest >= session.date) return 'open';
      return bars.live || Date.now() - session.at < 3 * 3600000 ? 'notYet' : 'holiday';
    }
    return 'open';
  };

  // --- telling the user ---
  /** One notification for new crossings. Before the notice hour (07:00) it waits until then, so a night scan wakes nobody. */
  async function tell(fresh) {
    if (!fresh.length || !Z.settings().notify) return;
    const ups = fresh.filter(x => x.up).length, downs = fresh.length - ups;
    const names = Array.from(new Set(fresh.map(x => x.name))).slice(0, 4).join(', ');
    const note = {
      title: fresh.length === 1 ? `Scan: ${fresh[0].name} crossed ${fresh[0].up ? 'up' : 'down'}` : `Scan: ${fresh.length} new crossings`,
      body: `${ups} up, ${downs} down. ${names}${fresh.length > 4 ? ' and more' : ''}.`, route: 'scan'
    };
    const hour = cfg().noticeHour == null ? 7 : cfg().noticeHour;
    const now = new Date();
    if (now.getHours() < hour) {
      const pending = host.get('scanNote', null);
      host.set('scanNote', pending ? merge(pending, note, fresh.length) : Object.assign({ count: fresh.length }, note));
      const at = new Date(now);
      at.setHours(hour, 0, 0, 0);
      host.schedule({ name: 'ema-scan-note', kind: 'once', delaySec: Math.round((at - now) / 1000), job: 'scan-note', network: false, replace: true });
    } else K.deliver(note.title, note.body, note.route);
  }
  const merge = (a, b, more) => {
    const count = (a.count || 1) + more;
    return { count, title: `Scan: ${count} new crossings`, body: 'Open the Scan tab to see them.', route: 'scan' };
  };
  /** Shows a notification that waited for the morning. */
  Z.deliverNote = () => {
    const note = host.get('scanNote', null);
    if (!note) return;
    host.remove('scanNote');
    K.deliver(note.title, note.body, note.route);
  };

  // --- when to run ---
  /** Plans the next scan of every market on the list, a little after its own close. Safe to call any time. */
  Z.schedule = async () => {
    const all = await Z.list();
    const on = Z.settings().scanOn;
    const st = Z.state();
    for (const market of Object.keys(cfg().markets || {})) {
      const name = 'ema-scan-' + market;
      if (!on || !Z.symbolsOf(all, market).length) {
        host.cancel(name);
        continue;
      }
      const s = C.sessions(Date.now(), cfg().markets[market]);
      const after = (cfg().afterCloseMinutes || 20) * 60000;
      const mine = st[market] || {};
      // A close that passed without a finished scan (the phone was off, or a scan was cut short) is scanned soon.
      const behind = s.last && mine.day !== s.last.date && Date.now() - s.last.at < 20 * 3600000;
      let at = behind ? Math.max(Date.now() + 60000, s.last.at + after) : s.next.at + after;
      // After Yahoo asked the app to slow down, nothing starts the scan again before the cool-off ends.
      if (Z.coolUntil() > Date.now()) at = Math.max(at, Z.coolUntil() + 60000);
      host.schedule({ name, kind: 'once', delaySec: Math.max(60, Math.round((at - Date.now()) / 1000)), job: 'scan:' + market, replace: true });
    }
  };

  /** The background job "scan:<market>": scans, tells the user what is new, and plans the next run. */
  Z.job = async market => {
    if (!Z.settings().scanOn) return 'ok';
    let r;
    try {
      r = await Z.run(market);
    } catch (e) {
      if (!e.throttled) throw e;
      host.set('scanCoolUntil', Date.now() + coolMs());
      r = { ok: false, status: 'throttled', scanned: 0, failed: 0 };
    }
    const m = cfg().markets[market];
    if (r === null) {
      // A price check is running: try again in five minutes.
      host.schedule({ name: 'ema-scan-' + market, kind: 'once', delaySec: 300, job: 'scan:' + market, replace: true });
      return 'ok';
    }
    if (r.status === 'scanned') {
      const { fresh } = await Z.evaluate();
      await tell(fresh);
      host.emit('scanned');
    }
    if (r.status === 'time') {
      host.schedule({ name: 'ema-scan-' + market, kind: 'once', delaySec: 60, job: 'scan:' + market, replace: true });
    } else if (r.status === 'throttled' || r.status === 'cooling') {
      const wait = Math.max(60, Math.round((Z.coolUntil() - Date.now()) / 1000) + 60);
      host.schedule({ name: 'ema-scan-' + market, kind: 'once', delaySec: wait, job: 'scan:' + market, replace: true });
    } else if (r.status === 'notYet') {
      const s = C.sessions(Date.now(), m);
      host.schedule({ name: 'ema-scan-' + market, kind: 'once', delaySec: 1200, job: 'scan:' + market, replace: true });
      host.log(`scan ${market}: session of ${s.last.date} not finished yet`);
    } else await Z.schedule();
    return 'ok';
  };

  /** Scans every market now, with the app open. */
  Z.runAll = async progress => {
    const all = await Z.list();
    const markets = Object.keys(cfg().markets || {}).filter(m => Z.symbolsOf(all, m).length);
    const total = all.symbols.length;
    let before = 0, scanned = 0, failed = 0;
    for (const market of markets) {
      let r;
      try {
        r = await Z.run(market, { foreground: true, progress: done => progress(before + done, total) });
      } catch (e) {
        if (!e.throttled) throw e;
        host.set('scanCoolUntil', Date.now() + coolMs());
        return { ok: false, status: 'throttled', scanned, failed };
      }
      if (r === null) return null;
      if (r.status === 'cooling') return { ok: false, status: 'cooling', scanned, failed };
      before += Z.symbolsOf(all, market).length;
      scanned += r.scanned;
      failed += r.failed;
      if (r.status === 'throttled') return { ok: false, status: 'throttled', scanned, failed };
    }
    const { fresh } = await Z.evaluate();
    await Z.schedule();
    return { ok: true, status: 'scanned', scanned, failed, fresh: fresh.length };
  };

  /** Throws away every saved scan price and result. */
  Z.clear = () => {
    for (const key of host.keys('scan:')) host.remove(key);
    host.remove('scanResults');
    host.remove('scanState');
  };

  /** Roughly how much the scan keeps on the phone, in bytes. */
  Z.size = () => host.keys('scan:').reduce((n, key) => n + (host.raw(key) || '').length, 0);

  EMA.scan = Z;
})(window.EMA);
