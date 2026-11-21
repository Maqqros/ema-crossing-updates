'use strict';
// The rules of the app, with no screen and no phone in them: averages, crossings, alerts, the reading of
// Yahoo's price data, and how numbers and dates are worded. Covered by tests/tests.js.
window.EMA = window.EMA || {};
(function (EMA) {
  const C = {};
  const mod = (a, b) => ((a % b) + b) % b;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // --- one watched crossing -------------------------------------------------------------------------
  // {id, name, symbol, fast, slow, tf, muted, kind}. `fast` 1 means the price itself. `tf` is "1d", "1wk" or "1h".
  // `kind` is "ema" (two averages), "macd" (the MACD line of fast and slow against its 9-bar signal line) or
  // "rsi" (the 14-bar RSI leaving the band between the levels fast and slow, usually 30 and 70).
  C.asset = o => ({
    id: String(o.id), name: String(o.name), symbol: String(o.symbol), fast: Number(o.fast), slow: Number(o.slow),
    tf: o.tf || '1d', muted: !!o.muted, kind: o.kind || 'ema'
  });
  C.key = a => (a.tf === '1d' ? `${a.symbol}|${a.fast}|${a.slow}` : `${a.symbol}|${a.fast}|${a.slow}|${a.tf}`) + (a.kind === 'ema' ? '' : '|' + a.kind);
  C.validAsset = a => !!a.symbol.trim() && a.fast >= 1 && a.slow > a.fast && a.slow <= 400 && ['1d', '1wk', '1h'].includes(a.tf) &&
    ['ema', 'macd', 'rsi'].includes(a.kind) && (a.kind !== 'rsi' || a.slow < 100);
  C.tfWord = tf => tf === '1wk' ? 'weekly' : tf === '1h' ? 'hourly' : 'daily';
  C.unit = tf => tf === '1wk' ? 'weeks' : tf === '1h' ? 'hours' : 'days';

  /** Every crossing watched on one symbol, in watchlist order: [{symbol, name, items}]. */
  C.groups = assets => {
    const out = [];
    const by = new Map();
    for (const a of assets) {
      let g = by.get(a.symbol);
      if (!g) {
        g = { symbol: a.symbol, name: a.name, items: [] };
        by.set(a.symbol, g);
        out.push(g);
      }
      g.items.push(a);
    }
    return out;
  };

  // --- price bars -----------------------------------------------------------------------------------
  // Finished bars, oldest first. `closeUtc` is the second of the UTC day at which the market's session ends.
  // `price` is the latest delayed price, `prev` the close to compare it with, `priceAt` its time in epoch seconds,
  // and `live` says the price is newer than the last finished bar. `day` is the latest session, finished or not.
  C.bars = (dates, closes, currency = '', more = {}) => Object.assign({
    dates, closes, currency, closeUtc: -1, price: null, prev: null, priceAt: 0, live: false,
    opens: [], highs: [], lows: [], volumes: [], day: null
  }, more);
  C.full = b => b.closes.length > 0 && b.opens.length === b.closes.length && b.highs.length === b.closes.length &&
    b.lows.length === b.closes.length && b.volumes.length === b.closes.length;

  // --- indicators -----------------------------------------------------------------------------------
  /** Exponential moving average, seeded with the simple average of the first `period` values. */
  C.ema = (values, period) => {
    if (period <= 1) return values.slice();
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    let prev = 0;
    for (let i = 0; i < period; i++) prev += values[i];
    prev /= period;
    out[period - 1] = prev;
    const k = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  };

  /** Indexes where `fast` moves from one side of `slow` to the other. Exact ties are ignored. */
  C.findCrosses = (fast, slow) => {
    const crosses = [];
    let lastSign = 0;
    for (let i = 0; i < fast.length; i++) {
      if (fast[i] == null || slow[i] == null) continue;
      const d = fast[i] - slow[i];
      const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
      if (sign === 0) continue;
      if (lastSign !== 0 && sign !== lastSign) crosses.push({ index: i, up: sign > 0 });
      lastSign = sign;
    }
    return crosses;
  };

  /** Simple moving average: the plain mean of the last `period` values. */
  C.sma = (values, period) => {
    const out = new Array(values.length).fill(null);
    if (period < 1) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  };

  /** Relative Strength Index, 0 to 100, with Wilder's smoothing. The first value is at index `period`. */
  C.rsi = (values, period = 14) => {
    const out = new Array(values.length).fill(null);
    if (values.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= period;
    loss /= period;
    const value = () => loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
    out[period] = value();
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(d, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = value();
    }
    return out;
  };

  /** MACD: the line (fast EMA minus slow EMA), its signal line (an EMA of the line) and their difference. */
  C.macd = (values, fast = 12, slow = 26, signal = 9) => {
    const f = C.ema(values, fast), s = C.ema(values, slow);
    const line = values.map((_, i) => f[i] == null || s[i] == null ? null : f[i] - s[i]);
    const start = line.findIndex(v => v != null);
    const sig = new Array(values.length).fill(null);
    if (start >= 0) {
      const smoothed = C.ema(line.slice(start), signal);
      for (let i = 0; i < smoothed.length; i++) sig[start + i] = smoothed[i];
    }
    const hist = values.map((_, i) => line[i] == null || sig[i] == null ? null : line[i] - sig[i]);
    return { line, signal: sig, hist };
  };

  /** Bollinger bands: the `period` average plus and minus `width` standard deviations. */
  C.bollinger = (values, period = 20, width = 2) => {
    const mid = C.sma(values, period);
    const upper = new Array(values.length).fill(null), lower = new Array(values.length).fill(null);
    for (let i = 0; i < values.length; i++) {
      const m = mid[i];
      if (m == null) continue;
      let sq = 0;
      for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) * (values[j] - m);
      const sd = Math.sqrt(sq / period);
      upper[i] = m + width * sd;
      lower[i] = m - width * sd;
    }
    return { upper, lower };
  };

  /** Bars needed before a crossing can be told. */
  C.need = a => a.kind === 'macd' ? a.slow + 9 : a.kind === 'rsi' ? 16 : a.slow + 1;

  /** The two lines whose crossing is watched. For RSI both are the RSI itself: it is compared with levels, not a line. */
  C.lines = (a, closes) => {
    if (a.kind === 'macd') {
      const m = C.macd(closes, a.fast, a.slow);
      return [m.line, m.signal];
    }
    if (a.kind === 'rsi') {
      const r = C.rsi(closes);
      return [r, r];
    }
    return [C.ema(closes, a.fast), C.ema(closes, a.slow)];
  };

  /**
   * Every event of one watched crossing, oldest first. For RSI an event is the RSI rising above the upper
   * level (`up`) or falling below the lower one; coming back inside the band is not an event.
   */
  C.crosses = (a, closes) => {
    if (a.kind !== 'rsi') {
      const l = C.lines(a, closes);
      return C.findCrosses(l[0], l[1]);
    }
    const r = C.rsi(closes);
    const out = [];
    let before = null;
    for (let i = 0; i < r.length; i++) {
      const v = r[i];
      if (v == null) continue;
      if (before != null) {
        if (before <= a.slow && v > a.slow) out.push({ index: i, up: true });
        if (before >= a.fast && v < a.fast) out.push({ index: i, up: false });
      }
      before = v;
    }
    return out;
  };

  /**
   * The current state of one asset, plus the alerts that are new since `prev` (this asset's result from the
   * previous check, or null on the first check). An alert is {kind, assetId, up, date, close, gap}: kind is
   * "cross", "listed" (first trading day) or "near" (the averages are closing in; `up` then says the crossing
   * would be upwards and `gap` is how far apart they are, in percent of the slow average).
   * An entry's state is "waiting", "warming", "above", "below" or, for an RSI inside its band, "between".
   */
  C.evaluate = (asset, bars, prev, nearPct = 0) => {
    const alerts = [];
    const key = C.key(asset);
    const n = bars.closes.length;
    if (n === 0) return { entry: { id: asset.id, key, state: 'waiting' }, alerts };

    const lastBar = bars.dates[n - 1];
    const close = bars.closes[n - 1];
    if (prev && prev.state === 'waiting' && String(prev.key || '').startsWith(asset.symbol + '|')) {
      alerts.push({ kind: 'listed', assetId: asset.id, up: true, date: lastBar, close, gap: 0 });
    }
    const [f, s] = C.lines(asset, bars.closes);
    const entry = { id: asset.id, key, state: 'warming', currency: bars.currency || '', lastBar, close, bars: n, need: C.need(asset) };
    const ef = f[n - 1], es = s[n - 1];
    if (n < entry.need || ef == null || es == null) return { entry, alerts };

    const crosses = C.crosses(asset, bars.closes);
    const last = crosses.length ? crosses[crosses.length - 1] : null;
    const rsi = asset.kind === 'rsi';
    entry.state = rsi ? (ef > asset.slow ? 'above' : ef < asset.fast ? 'below' : 'between') : (ef >= es ? 'above' : 'below');
    entry.emaFast = ef;
    entry.emaSlow = rsi ? null : es;
    entry.crossDate = last ? bars.dates[last.index] : null;
    entry.crossUp = last ? last.up : false;
    entry.crossClose = last ? bars.closes[last.index] : null;

    // Alert only on crossings newer than the last bar already processed with the same settings.
    const since = prev ? prev.lastBar : null;
    const known = !!prev && prev.key === key && since != null;
    let crossed = false;
    if (known) {
      // Every crossing since the last check, oldest first. A long gap is capped so it cannot flood the phone.
      for (const x of crosses.filter(x => bars.dates[x.index] > since).slice(-5)) {
        alerts.push({ kind: 'cross', assetId: asset.id, up: x.up, date: bars.dates[x.index], close: bars.closes[x.index], gap: 0 });
        crossed = true;
      }
    }

    // Early warning: the averages are within `nearPct` of each other and the gap is shrinking. Given once per
    // approach; it is armed again only after they drift apart or cross. Not for hourly bars, which would nag.
    const gap = asset.kind === 'ema' && es !== 0 ? (ef - es) / es * 100 : null;
    let near = false;
    if (nearPct > 0 && asset.kind === 'ema' && asset.tf !== '1h' && gap != null && n >= 4 && !(last && last.index >= n - 3)) {
      const f3 = f[n - 4], s3 = s[n - 4];
      const before = f3 != null && s3 != null && s3 !== 0 ? (f3 - s3) / s3 * 100 : null;
      const narrowing = before != null && before * gap > 0 && Math.abs(gap) < Math.abs(before);
      const wasNear = !!prev && prev.key === key && !!prev.near;
      const size = Math.abs(gap);
      near = (size <= nearPct && narrowing) || (wasNear && size <= nearPct * 1.5);
      if (near && !wasNear && known && !crossed) {
        alerts.push({ kind: 'near', assetId: asset.id, up: gap < 0, date: lastBar, close, gap });
      }
    }
    entry.near = near;
    entry.gap = gap;
    return { entry, alerts };
  };

  /**
   * The track record of a pair on one asset: for crossings above (`up`) and below (`down`), the outcome after
   * each horizon as {bars, count, higher, median, worst}. A crossing too recent to have that many bars after
   * it is left out.
   */
  C.trackRecord = (closes, crosses, horizons = [5, 20, 60]) => {
    const one = (up, h) => {
      const changes = crosses.filter(x => x.up === up && x.index + h < closes.length && closes[x.index] !== 0)
        .map(x => closes[x.index + h] / closes[x.index] - 1).sort((a, b) => a - b);
      if (!changes.length) return { bars: h, count: 0, higher: 0, median: 0, worst: 0 };
      const mid = Math.floor(changes.length / 2);
      const median = changes.length % 2 === 1 ? changes[mid] : (changes[mid - 1] + changes[mid]) / 2;
      return { bars: h, count: changes.length, higher: changes.filter(v => v > 0).length, median, worst: changes[0] };
    };
    return { up: horizons.map(h => one(true, h)), down: horizons.map(h => one(false, h)) };
  };

  /** One sentence for a notification on how earlier crossings in this direction went, or null when there were none. */
  C.recordLine = (asset, bars, up, horizon = 20) => {
    const o = C.trackRecord(bars.closes, C.crosses(asset, bars.closes), [horizon])[up ? 'up' : 'down'][0];
    if (!o || o.count === 0) return null;
    const times = o.count === 1 ? 'The 1 earlier time' : `The ${o.count} earlier times`;
    return `${times} this happened here, the price was higher ${horizon} ${C.unit(asset.tf)} later ${o.higher} time${o.higher === 1 ? '' : 's'}.`;
  };

  // --- words and numbers ----------------------------------------------------------------------------
  const fixed = (v, digits) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  C.money = v => Math.abs(v) >= 1000 ? fixed(v, 0) : fixed(v, 2);
  C.signed = (v, digits = 2) => (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
  C.label = period => period <= 1 ? 'Price' : 'EMA ' + period;

  /** 1,234,567 becomes "1.23M". For volumes, where the exact figure does not matter. */
  C.compact = v => {
    const a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  /** Notification title and body. Says what happened, never what to do. */
  C.describe = (alert, asset, currency) => {
    const px = (C.money(alert.close) + ' ' + (currency || '')).trim();
    if (alert.kind === 'listed') {
      return { title: `${asset.name} has started trading`, body: `${asset.symbol} first close: ${px} on ${alert.date}.` };
    }
    const frame = asset.tf === '1d' ? '' : ` (${C.tfWord(asset.tf)})`;
    const body = `${asset.symbol} closed at ${px} on ${alert.date}.`;
    if (alert.kind === 'near') {
      const what = asset.fast <= 1 ? 'Price' : 'EMA ' + asset.fast;
      return {
        title: `${asset.name}: ${what} is closing in on EMA ${asset.slow}${frame}`,
        body: `${Math.abs(alert.gap).toFixed(1)}% ${alert.up ? 'below' : 'above'} it and narrowing. ${body} No crossing yet.`
      };
    }
    const word = alert.up ? 'above' : 'below';
    if (asset.kind === 'rsi') {
      return { title: alert.up ? `${asset.name}: RSI rose above ${asset.slow}${frame}` : `${asset.name}: RSI fell below ${asset.fast}${frame}`, body };
    }
    if (asset.kind === 'macd') return { title: `${asset.name}: MACD crossed ${word} its signal line${frame}`, body };
    return {
      title: asset.fast <= 1 ? `${asset.name}: price closed ${word} EMA ${asset.slow}${frame}` : `${asset.name}: EMA ${asset.fast} crossed ${word} EMA ${asset.slow}${frame}`,
      body
    };
  };

  const framed = (tf, base) => tf === '1wk' ? 'Weekly ' + base : tf === '1h' ? 'Hourly ' + base : base;
  C.pairLabel = (fast, slow, tf = '1d') => framed(tf, fast <= 1 ? `Price / EMA ${slow}` : `EMA ${fast} / ${slow}`);

  /** The name of one watched crossing, whatever its kind. */
  C.assetLabel = a => a.kind === 'rsi' ? framed(a.tf, `RSI ${a.fast} / ${a.slow}`) : a.kind === 'macd' ? framed(a.tf, `MACD ${a.fast} / ${a.slow}`) : C.pairLabel(a.fast, a.slow, a.tf);

  C.crossText = (a, up) => {
    const word = up ? 'above' : 'below';
    const base = a.kind === 'rsi' ? (up ? `RSI rose above ${a.slow}` : `RSI fell below ${a.fast}`)
      : a.kind === 'macd' ? `MACD crossed ${word} its signal line`
        : a.fast <= 1 ? `Price closed ${word} EMA ${a.slow}` : `EMA ${a.fast} crossed ${word} EMA ${a.slow}`;
    return a.tf === '1d' ? base : `${base} (${C.tfWord(a.tf)})`;
  };

  /** "Crossed above", or for RSI "Rose above 70". */
  C.eventWord = (a, up) => a.kind === 'rsi' ? (up ? `Rose above ${a.slow}` : `Fell below ${a.fast}`) : up ? 'Crossed above' : 'Crossed below';
  C.afterWord = (a, up) => a.kind === 'rsi' ? (up ? `After rising above ${a.slow}` : `After falling below ${a.fast}`) : up ? 'After crossing above' : 'After crossing below';

  // --- dates ----------------------------------------------------------------------------------------
  const two = n => String(n).padStart(2, '0');
  C.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  };
  const parts = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };

  /** "2026-10-06" becomes "6 Oct", with the year when it is not this year. An hourly "2026-10-06 14:30" keeps its time. */
  C.niceDate = (iso, withYear = false) => {
    const p = parts(iso);
    if (!p || p[1] < 1 || p[1] > 12) return iso;
    const day = `${p[2]} ${MONTHS[p[1] - 1]}` + (withYear || p[0] !== new Date().getFullYear() ? ' ' + p[0] : '');
    return iso.length > 10 ? day + iso.substring(10) : day;
  };

  /** The date of a bar as shown to the user. A weekly bar is named after its Monday. */
  C.barDate = (iso, tf, withYear = true) => tf === '1wk' ? 'week of ' + C.niceDate(iso, withYear) : C.niceDate(iso, withYear);

  C.daysSince = iso => {
    const p = parts(iso), t = parts(C.today());
    if (!p) return Infinity;
    return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
  };

  C.ago = iso => {
    const d = C.daysSince(iso);
    if (d === Infinity) return '';
    if (d <= 0) return 'today';
    if (d === 1) return '1 day ago';
    if (d < 60) return `${d} days ago`;
    if (d < 730) return `${Math.floor(d / 30)} months ago`;
    return `${Math.floor(d / 365)} years ago`;
  };

  /** A moment on this phone's clock: "21 Nov 14:05", or only "14:05" when `short`. */
  C.stamp = (ms, short = false) => {
    const d = new Date(ms);
    const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
    return short ? time : `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
  };

  /** "Updated 14:05" for the last check, with the day when it was not today. */
  C.checkedText = t => {
    if (!t) return 'Not checked yet';
    return 'Updated ' + C.stamp(t, new Date(t).toDateString() === new Date().toDateString());
  };

  /** The day `days` before an ISO date, as an ISO date. */
  C.minusDays = (iso, days) => {
    const p = parts(iso);
    if (!p) return '';
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]) - days * 86400000).toISOString().slice(0, 10);
  };

  // --- the price ------------------------------------------------------------------------------------
  /** What to show as "the price": the latest delayed price when there is one, else the last finished close. */
  C.quoteOf = b => {
    if (!b || !b.closes.length) return null;
    const n = b.closes.length;
    const price = b.price != null ? b.price : b.closes[n - 1];
    const prev = b.price != null ? b.prev : (n >= 2 ? b.closes[n - 2] : null);
    const change = prev != null && prev !== 0 ? (price - prev) / prev * 100 : null;
    return { price, change, live: !!b.live, at: b.priceAt || 0, closeDate: b.dates[n - 1], currency: b.currency || '' };
  };

  /**
   * Reads one answer of Yahoo's chart service. Keeps finished bars only: the bar of a day, week or hour that is
   * still trading is dropped. Bars are labelled in the exchange's own time: "yyyy-MM-dd" (the Monday for weekly
   * bars) or "yyyy-MM-dd HH:mm".
   */
  C.parseChart = (json, nowSec, tf = '1d') => {
    const chart = json && json.chart;
    if (!chart) throw new Error('Unexpected answer from the price source');
    const results = chart.result;
    if (!results || !results.length) {
      const err = chart.error;
      if (err && err.code === 'Not Found') return C.bars([], []);
      throw new Error((err && err.description) || 'Price source returned no data');
    }
    const r = results[0];
    const meta = r.meta || {};
    const currency = meta.currency || '';
    const offset = meta.gmtoffset || 0;
    const regular = (meta.currentTradingPeriod && meta.currentTradingPeriod.regular) || null;
    const start = regular ? regular.start || 0 : 0;
    const end = regular ? regular.end || 0 : 0;
    const closeUtc = end > 0 ? mod(end, 86400) : -1;

    const ts = r.timestamp;
    const quote = r.indicators && r.indicators.quote && r.indicators.quote[0];
    if (!ts || !quote || !quote.close) return C.bars([], [], currency);
    const ok = v => typeof v === 'number' && isFinite(v);
    const num = (a, i, fallback) => a && ok(a[i]) ? a[i] : fallback;

    const times = [];
    const rows = []; // open, high, low, close, volume
    const count = Math.min(ts.length, quote.close.length);
    for (let i = 0; i < count; i++) {
      const c = quote.close[i];
      if (!ok(c)) continue;
      times.push(ts[i]);
      // A missing open, high or low falls back to the close, so a bar is never lost over it.
      rows.push([num(quote.open, i, c), num(quote.high, i, c), num(quote.low, i, c), c, num(quote.volume, i, 0)]);
    }
    const latest = rows.length ? rows[rows.length - 1] : null; // today's session, even while it is still trading

    // Start of the bar's week (Monday 00:00) in exchange-local seconds. 1 Jan 1970 was a Thursday.
    const mondayLocal = t => {
      const day = Math.floor((t + offset) / 86400);
      return (day - mod(day + 3, 7)) * 86400;
    };
    const unfinished = t => {
      // A market that trades around the clock closes its week on Sunday, the others on Friday.
      if (tf === '1wk') return nowSec < mondayLocal(t) - offset + (end - start >= 23 * 3600 ? 7 : 5) * 86400;
      // The last hour of a session can be shorter than 60 minutes: it is finished once the session ends.
      if (tf === '1h') return nowSec < t + 3600 && !(end > t && end <= nowSec);
      return !!regular && t >= start && nowSec < end;
    };
    // Yahoo can send the running period twice (its bar plus a "right now" row), so drop every unfinished row.
    while (times.length && unfinished(times[times.length - 1])) {
      times.pop();
      rows.pop();
    }

    const iso = sec => new Date(sec * 1000).toISOString();
    const byKey = new Map(); // one bar per label; the last one wins
    for (let i = 0; i < times.length; i++) {
      const t = iso(tf === '1wk' ? mondayLocal(times[i]) : times[i] + offset);
      byKey.set(tf === '1h' ? t.slice(0, 10) + ' ' + t.slice(11, 16) : t.slice(0, 10), rows[i]);
    }
    const dates = Array.from(byKey.keys());
    const kept = Array.from(byKey.values());
    const closes = kept.map(k => k[3]);

    // The latest (delayed) price, and the close it should be compared with.
    const price = ok(meta.regularMarketPrice) ? meta.regularMarketPrice : null;
    const priceAt = meta.regularMarketTime || 0;
    let prev = null, live = false;
    if (tf === '1d' && price != null && closes.length) {
      live = priceAt > 0 && iso(priceAt + offset).slice(0, 10) > dates[dates.length - 1];
      prev = live ? closes[closes.length - 1] : (closes.length >= 2 ? closes[closes.length - 2] : null);
    }
    return C.bars(dates, closes, currency, {
      closeUtc, price, prev, priceAt, live,
      opens: kept.map(k => k[0]), highs: kept.map(k => k[1]), lows: kept.map(k => k[2]), volumes: kept.map(k => k[4]),
      day: tf === '1d' && latest ? { open: latest[0], high: latest[1], low: latest[2], volume: latest[4] } : null
    });
  };

  /**
   * `base` priced in another currency: every bar is multiplied by `factor` and by the latest `rate` close on or
   * before that bar's date. Bars older than the first rate are dropped.
   */
  C.combine = (base, rate, factor, currency) => {
    if (!base.closes.length || !rate.closes.length) return C.bars([], [], currency);
    const dates = [], mult = [], keep = [];
    let j = -1;
    for (let i = 0; i < base.dates.length; i++) {
      const day = base.dates[i].slice(0, 10);
      while (j + 1 < rate.dates.length && rate.dates[j + 1].slice(0, 10) <= day) j++;
      if (j < 0) continue;
      keep.push(i);
      dates.push(base.dates[i]);
      mult.push(rate.closes[j] * factor);
    }
    if (!keep.length) return C.bars([], [], currency);
    const scaled = values => keep.map((k, i) => values[k] * mult[i]);
    const now = (rate.price != null ? rate.price : rate.closes[rate.closes.length - 1]) * factor;
    const full = C.full(base);
    return C.bars(dates, scaled(base.closes), currency, {
      closeUtc: base.closeUtc, price: base.price != null ? base.price * now : null,
      prev: base.prev != null ? base.prev * mult[mult.length - 1] : null, priceAt: base.priceAt, live: base.live,
      opens: full ? scaled(base.opens) : [], highs: full ? scaled(base.highs) : [], lows: full ? scaled(base.lows) : [],
      volumes: full ? keep.map(k => base.volumes[k]) : [],
      day: base.day ? { open: base.day.open * now, high: base.day.high * now, low: base.day.low * now, volume: base.day.volume } : null
    });
  };

  /** True during quiet hours that run from `from` o'clock until `to` o'clock. They may run past midnight (22 to 7). */
  C.quiet = (hour, from, to) => from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to;

  EMA.core = C;
})(window.EMA);
