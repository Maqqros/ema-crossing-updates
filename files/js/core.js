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
  // "rsi" (the 14-bar RSI leaving the band between the levels fast and slow, usually 30 and 70), "sma" (two simple
  // averages, otherwise like "ema") or "level" (the close crossing a fixed price: `fast` is 1 and `slow` is that price).
  C.asset = o => ({
    id: String(o.id), name: String(o.name), symbol: String(o.symbol), fast: Number(o.fast), slow: Number(o.slow),
    tf: o.tf || '1d', muted: !!o.muted, kind: o.kind || 'ema'
  });
  C.key = a => (a.tf === '1d' ? `${a.symbol}|${a.fast}|${a.slow}` : `${a.symbol}|${a.fast}|${a.slow}|${a.tf}`) + (a.kind === 'ema' ? '' : '|' + a.kind);
  C.validAsset = a => !!a.symbol.trim() && ['1d', '1wk', '1h'].includes(a.tf) && ['ema', 'sma', 'macd', 'rsi', 'level'].includes(a.kind) &&
    (a.kind === 'level' ? a.fast === 1 && Number.isFinite(a.slow) && a.slow > 0
      : a.fast >= 1 && a.slow > a.fast && a.slow <= 400 && (a.kind !== 'rsi' || a.slow < 100));
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
  C.need = a => a.kind === 'macd' ? a.slow + 9 : a.kind === 'rsi' ? 16 : a.kind === 'level' ? 2 : a.slow + 1;

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
    if (a.kind === 'level') return [closes, closes.map(() => a.slow)];
    if (a.kind === 'sma') return [C.sma(closes, a.fast), C.sma(closes, a.slow)];
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
    const avg = asset.kind === 'ema' || asset.kind === 'sma';
    const gap = avg && es !== 0 ? (ef - es) / es * 100 : null;
    let near = false;
    if (nearPct > 0 && avg && asset.tf !== '1h' && gap != null && n >= 4 && !(last && last.index >= n - 3)) {
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
  C.label = (period, kind = 'ema') => period <= 1 ? 'Price' : C.avgName(kind) + ' ' + period;
  /** "EMA" or "SMA": the kind of average a crossing watches. */
  C.avgName = kind => kind === 'sma' ? 'SMA' : 'EMA';
  /** A price level as typed: up to 2 decimals from 10 up, up to 4 below 10, without trailing zeros. */
  C.levelText = v => fixed(v, Math.abs(v) >= 10 ? 2 : 4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

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
    const avg = C.avgName(asset.kind);
    if (alert.kind === 'near') {
      const what = C.label(asset.fast, asset.kind);
      return {
        title: `${asset.name}: ${what} is closing in on ${avg} ${asset.slow}${frame}`,
        body: `${Math.abs(alert.gap).toFixed(1)}% ${alert.up ? 'below' : 'above'} it and narrowing. ${body} No crossing yet.`
      };
    }
    const word = alert.up ? 'above' : 'below';
    if (asset.kind === 'rsi') {
      return { title: alert.up ? `${asset.name}: RSI rose above ${asset.slow}${frame}` : `${asset.name}: RSI fell below ${asset.fast}${frame}`, body };
    }
    if (asset.kind === 'macd') return { title: `${asset.name}: MACD crossed ${word} its signal line${frame}`, body };
    if (asset.kind === 'level') return { title: `${asset.name}: closed ${word} ${C.levelText(asset.slow)}${frame}`, body };
    return {
      title: asset.fast <= 1 ? `${asset.name}: price closed ${word} ${avg} ${asset.slow}${frame}` : `${asset.name}: ${avg} ${asset.fast} crossed ${word} ${avg} ${asset.slow}${frame}`,
      body
    };
  };

  const framed = (tf, base) => tf === '1wk' ? 'Weekly ' + base : tf === '1h' ? 'Hourly ' + base : base;
  C.pairLabel = (fast, slow, tf = '1d', kind = 'ema') => framed(tf, fast <= 1 ? `Price / ${C.avgName(kind)} ${slow}` : `${C.avgName(kind)} ${fast} / ${slow}`);

  /** The name of one watched crossing, whatever its kind. */
  C.assetLabel = a => a.kind === 'rsi' ? framed(a.tf, `RSI ${a.fast} / ${a.slow}`) : a.kind === 'macd' ? framed(a.tf, `MACD ${a.fast} / ${a.slow}`)
    : a.kind === 'level' ? framed(a.tf, `Price level ${C.levelText(a.slow)}`) : C.pairLabel(a.fast, a.slow, a.tf, a.kind);

  C.crossText = (a, up) => {
    const word = up ? 'above' : 'below';
    const base = a.kind === 'rsi' ? (up ? `RSI rose above ${a.slow}` : `RSI fell below ${a.fast}`)
      : a.kind === 'macd' ? `MACD crossed ${word} its signal line`
        : a.kind === 'level' ? `Closed ${word} ${C.levelText(a.slow)}`
          : a.fast <= 1 ? `Price closed ${word} ${C.avgName(a.kind)} ${a.slow}` : `${C.avgName(a.kind)} ${a.fast} crossed ${word} ${C.avgName(a.kind)} ${a.slow}`;
    return a.tf === '1d' ? base : `${base} (${C.tfWord(a.tf)})`;
  };

  /** "Crossed above", or for RSI "Rose above 70". */
  C.eventWord = (a, up) => a.kind === 'rsi' ? (up ? `Rose above ${a.slow}` : `Fell below ${a.fast}`)
    : a.kind === 'level' ? (up ? 'Closed above' : 'Closed below') : up ? 'Crossed above' : 'Crossed below';
  C.afterWord = (a, up) => a.kind === 'rsi' ? (up ? `After rising above ${a.slow}` : `After falling below ${a.fast}`)
    : a.kind === 'level' ? (up ? 'After closing above' : 'After closing below') : up ? 'After crossing above' : 'After crossing below';

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
    return { price, prev, change, live: !!b.live, at: b.priceAt || 0, closeDate: b.dates[n - 1], currency: b.currency || '' };
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

  /**
   * Adds the bars of a short, recent download (`recent`) to the history kept on the phone (`saved`). Gives null when
   * the two do not fit together, and the whole history must be downloaded again instead: nothing saved, nothing
   * recent, a gap between them, a different currency or set of columns, or a close on a shared date that changed
   * (a split, a dividend adjustment or a correction rewrites past prices). The newest price and session come from `recent`.
   */
  C.topUp = (saved, recent, tolerance = 0.001) => {
    if (!saved || !recent || !saved.closes.length || !recent.closes.length) return null;
    if (saved.currency !== recent.currency || C.full(saved) !== C.full(recent)) return null;
    const first = recent.dates[0];
    const lastSaved = saved.dates[saved.dates.length - 1];
    if (first > lastSaved) return null; // a gap: some bars would be missing
    let shared = 0;
    const at = new Map(saved.dates.map((d, i) => [d, i]));
    for (let i = 0; i < recent.dates.length; i++) {
      const j = at.get(recent.dates[i]);
      if (j == null) continue;
      shared++;
      const a = saved.closes[j], b = recent.closes[i];
      if (Math.abs(a - b) > tolerance * Math.max(Math.abs(a), Math.abs(b), 1e-9)) return null;
    }
    if (!shared) return null;
    const keep = saved.dates.findIndex(d => d >= first);
    const head = keep < 0 ? saved.dates.length : keep;
    const join = name => saved[name].slice(0, head).concat(recent[name]);
    const full = C.full(saved);
    return C.bars(join('dates'), join('closes'), recent.currency, {
      closeUtc: recent.closeUtc, price: recent.price, prev: recent.prev, priceAt: recent.priceAt, live: recent.live, day: recent.day,
      opens: full ? join('opens') : [], highs: full ? join('highs') : [], lows: full ? join('lows') : [], volumes: full ? join('volumes') : []
    });
  };

  /** True during quiet hours that run from `from` o'clock until `to` o'clock. They may run past midnight (22 to 7). */
  C.quiet = (hour, from, to) => from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to;

  // --- the screener ---------------------------------------------------------------------------------

  /**
   * A speed limit: `wait()` resolves when the next request may start, never more than `perSec` a second.
   * `pause(ms)` holds every request back for a while (after the price source says "too many requests").
   * `now` and `sleep` are passed in so the tests can run it on a made-up clock.
   */
  C.pacer = (perSec, now = () => Date.now(), sleep = ms => new Promise(done => setTimeout(done, ms))) => {
    const gap = 1000 / Math.max(0.1, perSec);
    let next = 0;
    return {
      wait: async () => {
        const t = now();
        const at = Math.max(t, next);
        next = at + gap;
        if (at > t) await sleep(at - t);
      },
      pause: ms => {
        next = Math.max(next, now() + ms);
      }
    };
  };

  const SCAN_SYMBOL = /^[A-Z0-9][A-Z0-9.^=&-]{0,19}$|^\^[A-Z0-9.]{1,19}$/;

  /**
   * Reads the screener's list file: one symbol per line, Yahoo's spelling, with an optional name after a comma.
   * "[Name]" starts a named list, "#" starts a note. Gives {lists: [{name, items: [{symbol, name}]}],
   * symbols: [{symbol, name, lists}] (each symbol once), skipped: [{line, text, why}]}. Stops at `most` symbols.
   */
  C.parseScanList = (text, most = 1000) => {
    const lists = [], skipped = [], by = new Map();
    let current = null;
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      const head = /^\[(.+)\]$/.exec(line);
      if (head) {
        current = { name: head[1].trim(), items: [] };
        lists.push(current);
        return;
      }
      const cut = line.indexOf(',');
      const symbol = (cut < 0 ? line : line.slice(0, cut)).trim().toUpperCase();
      const name = cut < 0 ? '' : line.slice(cut + 1).trim();
      if (!SCAN_SYMBOL.test(symbol)) return skipped.push({ line: i + 1, text: raw.trim(), why: 'not a symbol' });
      if (!current) {
        current = { name: 'List', items: [] };
        lists.push(current);
      }
      let s = by.get(symbol);
      if (!s) {
        if (by.size >= most) return skipped.push({ line: i + 1, text: raw.trim(), why: `more than ${most} symbols` });
        s = { symbol, name: name || symbol, lists: [] };
        by.set(symbol, s);
      } else if (name && s.name === symbol) s.name = name;
      if (!current.items.some(x => x.symbol === symbol)) current.items.push({ symbol, name: name || symbol });
      if (!s.lists.includes(current.name)) s.lists.push(current.name);
    });
    return { lists: lists.filter(l => l.items.length), symbols: Array.from(by.values()), skipped };
  };

  /**
   * The starting history written by tools/make_scan_seed.py. Format 1 (pack 10 drafts): {c: currency, u: closeUtc,
   * s: first date, g: [days from each bar to the next], v: [closes]}. Format 2: the same c, u and s; g: the days
   * between bars as a text of base-36 digits (or a list); t: the price step; C: [closes in steps, the first whole
   * and each later one as the change from the day before]; O: [open - close], H: [high - max(open, close)],
   * L: [min(open, close) - low] in steps; w: the volume unit; V: [volumes in units].
   * Gives {built, symbols: {SYMBOL: {dates, closes, currency, closeUtc, opens, highs, lows, volumes}}}. Format 1,
   * or `full` false, gives no opens to volumes. A symbol whose arrays do not add up is left out.
   */
  C.readSeed = (json, full = true) => {
    if (!json || (json.format !== 1 && json.format !== 2) || !json.symbols) throw new Error('Not a starting history this version can read');
    const symbols = {};
    for (const symbol of Object.keys(json.symbols)) {
      const x = json.symbols[symbol];
      const gaps = !x ? null : typeof x.g === 'string' ? Array.from(x.g, ch => parseInt(ch, 36)) : x.g;
      const n = Array.isArray(gaps) && gaps.every(g => g > 0) ? gaps.length + 1 : 0;
      if (!n || typeof x.s !== 'string') continue;
      const two = json.format === 2;
      if (two ? !(x.t > 0) || ['C', 'O', 'H', 'L', 'V'].some(k => !Array.isArray(x[k]) || x[k].length !== n)
        : !Array.isArray(x.v) || x.v.length !== n) continue;
      let day = dayNumber(x.s);
      const dates = [x.s];
      for (const g of gaps) {
        day += g;
        dates.push(new Date(day * 86400000).toISOString().slice(0, 10));
      }
      const out = { dates, currency: x.c || '', closeUtc: typeof x.u === 'number' ? x.u : -1 };
      if (two) {
        // Dividing by a whole number keeps 12345 steps of 0.01 at 123.45, where multiplying gives 123.45000000000002.
        const per = x.t < 1 ? Math.round(1 / x.t) : 0;
        const price = k => per ? k / per : k * x.t;
        let k = 0;
        const steps = x.C.map(d => (k += d));
        out.closes = steps.map(price);
        if (full) {
          out.opens = steps.map((c, i) => price(c + x.O[i]));
          out.highs = steps.map((c, i) => price(Math.max(c, c + x.O[i]) + x.H[i]));
          out.lows = steps.map((c, i) => price(Math.min(c, c + x.O[i]) - x.L[i]));
          const unit = x.w > 0 ? x.w : 1;
          out.volumes = x.V.map(v => v * unit);
        }
      } else out.closes = x.v.map(Number);
      symbols[symbol] = out;
    }
    return { built: json.built || '', symbols };
  };

  /** Which market a symbol trades on, for the time of its scan: "th" (Thailand), "crypto", "futures" (=F and the
   * dollar index), "fx" (=X) or "us" (the rest). */
  C.marketOf = symbol => /\.BK$/.test(symbol) ? 'th' : /-USD$/.test(symbol) ? 'crypto'
    : /=F$/.test(symbol) || symbol === 'DX-Y.NYB' ? 'futures' : /=X$/.test(symbol) ? 'fx' : 'us';

  const dayNumber = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);

  /**
   * Weekly bars made from daily ones: the last close of each week, labelled with its Monday, as Yahoo labels them.
   * The latest week counts only once it is over: its last day is `weekEnd` (4 = Friday; 6 = Sunday for crypto) or later,
   * or it is not this week.
   */
  C.weekly = (daily, today = C.today(), weekEnd = 4) => {
    const dates = [], closes = [];
    let lastDay = null;
    for (let i = 0; i < daily.dates.length; i++) {
      const n = dayNumber(daily.dates[i]);
      const monday = n - mod(n + 3, 7);
      const label = new Date(monday * 86400000).toISOString().slice(0, 10);
      if (dates.length && dates[dates.length - 1] === label) closes[closes.length - 1] = daily.closes[i];
      else {
        dates.push(label);
        closes.push(daily.closes[i]);
      }
      lastDay = n;
    }
    if (dates.length && lastDay != null) {
      const weekday = mod(lastDay + 3, 7); // 0 = Monday
      const sameWeek = dayNumber(today) - mod(dayNumber(today) + 3, 7) === dayNumber(dates[dates.length - 1]);
      if (weekday < weekEnd && sameWeek) {
        dates.pop();
        closes.pop();
      }
    }
    return C.bars(dates, closes, daily.currency);
  };

  /** A scan rule as a watched crossing, so the same rules and words are used: {kind, fast, slow, tf}. */
  C.ruleAsset = (rule, symbol = '', name = '') => C.asset({ id: rule.id || C.ruleId(rule), name, symbol, fast: rule.fast, slow: rule.slow, tf: rule.tf, kind: rule.kind });
  C.ruleId = r => `${r.kind}-${r.fast}-${r.slow}-${r.tf}`;

  /**
   * The crossings of the scan rules in one symbol's daily history that happened in its last `withinBars` bars
   * (weekly rules: its last `withinWeeks` weeks). Gives [{rule, up, date, close}], the latest crossing per rule.
   */
  C.scanHits = (daily, rules, withinBars = 5, withinWeeks = 1, today = C.today(), weekEnd = 4) => {
    const out = [];
    if (!daily || daily.closes.length < 2) return out;
    let week = null;
    for (const rule of rules) {
      const bars = rule.tf === '1wk' ? (week || (week = C.weekly(daily, today, weekEnd))) : daily;
      const a = C.ruleAsset(rule);
      if (bars.closes.length < C.need(a)) continue;
      const crosses = C.crosses(a, bars.closes);
      const last = crosses[crosses.length - 1];
      if (!last || last.index < bars.closes.length - (rule.tf === '1wk' ? withinWeeks : withinBars)) continue;
      out.push({ rule, up: last.up, date: bars.dates[last.index], close: bars.closes[last.index] });
    }
    return out;
  };

  // Market clocks. Each market's close is kept in its own time zone, so clock changes there move it by themselves.
  const zoneFormat = new Map();
  /** The wall-clock time in time zone `tz` at the moment `ms`: {y, m, d, hh, mm, weekday (0 = Monday)}. */
  C.zoneParts = (ms, tz) => {
    let f = zoneFormat.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
      zoneFormat.set(tz, f);
    }
    const p = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
  };
  /** The moment, in ms, when the clock in `tz` shows y-m-d hh:mm. */
  C.zoneTime = (tz, y, m, d, hh, mm) => {
    const want = Date.UTC(y, m - 1, d, hh, mm);
    let t = want;
    for (let i = 0; i < 3; i++) {
      const p = C.zoneParts(t, tz);
      const shown = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
      if (shown === want) break;
      t += want - shown;
    }
    return t;
  };

  /**
   * The closes of one market around `nowMs`: `market` is {tz, close: "16:00", days: [0..6], 0 = Monday}.
   * A close of "24:00" is the midnight that ends that day, so the session keeps the date of the bar it finishes.
   * Gives {last: {date, at}, next: {date, at}}: the latest close at or before now, and the first one after it.
   */
  C.sessions = (nowMs, market) => {
    const [hh, mm] = market.close.split(':').map(Number);
    const days = market.days || [0, 1, 2, 3, 4];
    const p = C.zoneParts(nowMs, market.tz);
    const base = Date.UTC(p.y, p.m - 1, p.d);
    let last = null, next = null;
    for (let k = -8; k <= 8 && !next; k++) {
      const day = new Date(base + k * 86400000);
      const weekday = mod(Math.floor(day.getTime() / 86400000) + 3, 7);
      if (!days.includes(weekday)) continue;
      const at = C.zoneTime(market.tz, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm);
      const item = { date: day.toISOString().slice(0, 10), at };
      if (at <= nowMs) last = item;
      else next = item;
    }
    return { last, next };
  };

  EMA.core = C;
})(window.EMA);
