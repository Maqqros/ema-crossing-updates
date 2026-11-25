'use strict';
// The chart on the asset screen: price as a line or candles with both EMAs, crossings ringed, and strips for
// volume, RSI and MACD. Drag to read a bar, pinch or use the buttons to zoom.
(function (EMA) {
  const C = EMA.core, U = EMA.ui, h = U.h;
  const M = () => EMA.model;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const money = v => v == null ? '–' : C.money(v);

  function line(ctx, from, to, x, y, value) {
    ctx.beginPath();
    let pen = false;
    for (let i = from; i <= to; i++) {
      const v = value(i);
      if (v == null) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v));
      pen = true;
    }
  }

  function drawPrice(cv, d) {
    const p = U.pen(cv);
    const { bars, from, to, fast, slow, extras, crosses, candles, scrub } = d;
    if (!p || to - from < 1) return;
    const ctx = p.ctx, w = p.w, closes = bars.closes;
    const col = { up: U.color('up'), down: U.color('down'), fast: U.color('fast'), slow: U.color('slow'), muted: U.color('muted'), surface: U.color('surface'), grid: U.color('outline-variant') };
    const priceIsFast = !fast;
    let lo = Infinity, hi = -Infinity;
    const see = v => {
      if (v != null) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    };
    for (let i = from; i <= to; i++) {
      if (candles) {
        see(bars.highs[i]);
        see(bars.lows[i]);
      } else see(closes[i]);
      see(slow[i]);
      if (fast) see(fast[i]);
      for (const o of extras) see(o.values[i]);
    }
    if (hi <= lo) {
      hi += 1;
      lo -= 1;
    }
    const padV = 12, hgt = p.h - 2 * padV;
    // Candles have a width, so the first and last one are moved in from the edges by half of it.
    const slot = w / (to - from + 1);
    const edge = candles ? slot / 2 : 0;
    const x = i => edge + (i - from) / (to - from) * (w - 2 * edge);
    const y = v => padV + (hi - v) / (hi - lo) * hgt;

    ctx.lineWidth = 1;
    ctx.strokeStyle = col.grid;
    for (let k = 0; k <= 2; k++) {
      const gy = y(lo + (hi - lo) * k / 2);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
    ctx.lineJoin = ctx.lineCap = 'round';
    if (candles) {
      const body = clamp(slot * 0.7, 1, 10);
      for (let i = from; i <= to; i++) {
        const open = bars.opens[i], close = closes[i];
        ctx.strokeStyle = ctx.fillStyle = close >= open ? col.up : col.down;
        ctx.lineWidth = Math.min(1, body);
        ctx.beginPath();
        ctx.moveTo(x(i), y(bars.highs[i]));
        ctx.lineTo(x(i), y(bars.lows[i]));
        ctx.stroke();
        const top = y(Math.max(open, close));
        ctx.fillRect(x(i) - body / 2, top, body, Math.max(1, y(Math.min(open, close)) - top));
      }
    } else {
      const priceColor = priceIsFast ? col.fast : col.muted;
      line(ctx, from, to, x, y, i => closes[i]);
      ctx.lineTo(w, p.h);
      ctx.lineTo(0, p.h);
      ctx.closePath();
      const shade = ctx.createLinearGradient(0, 0, 0, p.h);
      shade.addColorStop(0, priceColor);
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = priceIsFast ? 0.14 : 0.1;
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.globalAlpha = priceIsFast ? 1 : 0.7;
      ctx.strokeStyle = priceColor;
      ctx.lineWidth = priceIsFast ? 2 : 1.25;
      line(ctx, from, to, x, y, i => closes[i]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const o of extras) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(o.dashed ? [4, 4] : []);
      line(ctx, from, to, x, y, i => o.values[i]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = col.slow;
    line(ctx, from, to, x, y, i => slow[i]);
    ctx.stroke();
    if (fast) {
      ctx.strokeStyle = col.fast;
      line(ctx, from, to, x, y, i => fast[i]);
      ctx.stroke();
    }

    ctx.font = '500 11px Roboto, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= 2; k++) {
      const v = lo + (hi - lo) * k / 2;
      const text = C.money(v);
      const tw = ctx.measureText(text).width, th = 14;
      const top = k === 2 ? y(v) + 3 : y(v) - th - 3;
      // A patch of card colour behind the number keeps it readable where a line runs through it.
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col.surface;
      ctx.fillRect(w - tw - 4, top, tw + 4, th);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.muted;
      ctx.fillText(text, w - tw, top + 1);
    }

    const fastAt = i => fast ? fast[i] : closes[i];
    for (const c of crosses) {
      if (c.index <= from || c.index > to) continue;
      const s0 = slow[c.index - 1], s1 = slow[c.index];
      const f0 = fastAt(c.index - 1), f1 = fastAt(c.index);
      if (s0 == null || s1 == null || f0 == null || f1 == null) continue;
      const d0 = f0 - s0, d1 = f1 - s1;
      const t = d0 !== d1 ? clamp(d0 / (d0 - d1), 0, 1) : 0;
      const cx = x(c.index - 1) + t * (x(c.index) - x(c.index - 1)), cy = y(s0 + t * (s1 - s0));
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = col.surface;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = c.up ? col.up : col.down;
      ctx.stroke();
    }

    if (scrub != null && scrub >= from && scrub <= to) {
      const sx = x(scrub);
      ctx.lineWidth = 1;
      ctx.strokeStyle = U.color('outline');
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, p.h);
      ctx.stroke();
      const dot = (v, color) => {
        if (v == null) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, y(v), 4, 0, Math.PI * 2);
        ctx.fill();
      };
      dot(closes[scrub], candles ? U.color('on-surface') : (priceIsFast ? col.fast : col.muted));
      dot(slow[scrub], col.slow);
      if (fast) dot(fast[scrub], col.fast);
    }
  }

  /** Volume of each bar: green when the bar closed at or above its open, red when below. */
  function drawVolume(cv, d) {
    const p = U.pen(cv);
    const { bars, from, to, scrub } = d;
    if (!p || to - from < 1) return;
    let top = 0;
    for (let i = from; i <= to; i++) if (bars.volumes[i] > top) top = bars.volumes[i];
    if (top <= 0) return;
    const ctx = p.ctx;
    const slot = p.w / (to - from + 1);
    const width = clamp(slot * 0.7, 1, 10);
    const up = U.color('up'), down = U.color('down');
    for (let i = from; i <= to; i++) {
      const hgt = bars.volumes[i] / top * p.h;
      ctx.globalAlpha = i === scrub ? 1 : 0.55;
      ctx.fillStyle = bars.closes[i] >= bars.opens[i] ? up : down;
      ctx.fillRect((i - from) * slot + (slot - width) / 2, p.h - hgt, width, hgt);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = U.color('outline-variant');
    ctx.fillRect(0, p.h - 1, p.w, 1);
  }

  /** RSI from 0 to 100 with the 30 to 70 zone shaded. */
  function drawRsi(cv, d, rsi) {
    const p = U.pen(cv);
    const { from, to, scrub } = d;
    if (!p || to - from < 1) return;
    const ctx = p.ctx;
    const x = i => (i - from) / (to - from) * p.w;
    const y = v => (100 - v) / 100 * p.h;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = U.color('variant');
    ctx.fillRect(0, y(70), p.w, y(30) - y(70));
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = U.color('down');
    ctx.fillRect(0, y(70), p.w, 1);
    ctx.fillStyle = U.color('up');
    ctx.fillRect(0, y(30), p.w, 1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ctx.fillStyle = U.color('primary');
    ctx.lineWidth = 1.75;
    ctx.lineJoin = ctx.lineCap = 'round';
    line(ctx, from, to, x, y, i => rsi[i]);
    ctx.stroke();
    if (scrub != null && scrub >= from && scrub <= to) {
      if (rsi[scrub] != null) {
        ctx.beginPath();
        ctx.arc(x(scrub), y(rsi[scrub]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = U.color('outline');
      ctx.fillRect(x(scrub), 0, 1, p.h);
    }
  }

  /** MACD: bars for the difference, the line in the fast colour and its signal line in the slow colour. */
  function drawMacd(cv, d, macd) {
    const p = U.pen(cv);
    const { from, to, scrub } = d;
    if (!p || to - from < 1) return;
    let reach = 0;
    for (let i = from; i <= to; i++) {
      for (const v of [macd.line[i], macd.signal[i], macd.hist[i]]) if (v != null && Math.abs(v) > reach) reach = Math.abs(v);
    }
    if (reach <= 0) return;
    const ctx = p.ctx;
    const slot = p.w / (to - from + 1);
    const width = clamp(slot * 0.7, 1, 10);
    const zero = p.h / 2;
    const x = i => slot / 2 + (i - from) / (to - from) * (p.w - slot);
    const y = v => zero - v / reach * (zero - 2);
    const up = U.color('up'), down = U.color('down');
    ctx.globalAlpha = 0.55;
    for (let i = from; i <= to; i++) {
      const v = macd.hist[i];
      if (v == null) continue;
      ctx.fillStyle = v >= 0 ? up : down;
      ctx.fillRect(x(i) - width / 2, Math.min(y(v), zero), width, Math.max(1, Math.abs(y(v) - zero)));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = U.color('outline-variant');
    ctx.fillRect(0, zero, p.w, 1);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [values, color] of [[macd.line, U.color('fast')], [macd.signal, U.color('slow')]]) {
      ctx.strokeStyle = color;
      line(ctx, from, to, x, y, i => values[i]);
      ctx.stroke();
    }
    if (scrub != null && scrub >= from && scrub <= to) {
      ctx.fillStyle = U.color('outline');
      ctx.fillRect(x(scrub), 0, 1, p.h);
    }
  }

  /**
   * The chart card of one asset. `st` is kept by the caller between redraws: {range, zoom}.
   * An RSI or MACD alert has no averages of its own to draw on the price: the chart shows EMA 50 / 200 with it,
   * opens that indicator's strip, and marks the alert's own events on the price.
   */
  EMA.chart = (bars, chosen, st) => {
    const model = M();
    const asset = chosen.kind === 'ema' ? chosen : Object.assign({}, chosen, { kind: 'ema', fast: 50, slow: 200 });
    const n = bars.closes.length;
    const ranges = EMA.catalog.ranges[asset.tf] || EMA.catalog.ranges['1d'];
    if (st.range == null || st.range >= ranges.length) st.range = asset.tf === '1h' ? 2 : 1;
    const details = !!model.settings.details;
    const opts = new Set((details ? model.settings.chart || [] : []).concat(chosen.kind === 'ema' ? [] : [chosen.kind]));
    const rich = details && C.full(bars); // open, high, low, volume and candles are shown
    const candles = opts.has('candles') && rich;
    const priceIsFast = asset.fast <= 1;
    const fast = C.ema(bars.closes, asset.fast);
    const slow = C.ema(bars.closes, asset.slow);
    const crosses = C.crosses(chosen, bars.closes);
    const bands = opts.has('bands') ? C.bollinger(bars.closes) : null;
    const rsi = opts.has('rsi') ? C.rsi(bars.closes) : null;
    const macd = opts.has('macd') ? C.macd(bars.closes) : null;
    const smaFast = opts.has('sma') && asset.fast > 1 ? C.sma(bars.closes, asset.fast) : null;
    const smaSlow = opts.has('sma') ? C.sma(bars.closes, asset.slow) : null;
    const extras = [];
    if (bands) extras.push({ values: bands.upper, color: U.color('tertiary'), dashed: false }, { values: bands.lower, color: U.color('tertiary'), dashed: false });
    if (smaFast) extras.push({ values: smaFast, color: U.color('fast'), dashed: true });
    if (smaSlow) extras.push({ values: smaSlow, color: U.color('slow'), dashed: true });

    const rangeStart = () => {
      const cut = C.minusDays(bars.dates[n - 1], ranges[st.range][1]);
      const i = bars.dates.findIndex(d => d >= cut);
      return clamp(i, 0, n - 2);
    };
    let from = rangeStart();
    let scrub = null;
    const first = () => st.zoom ? clamp(Math.round(st.zoom[0]), 0, n - 2) : from;
    const end = () => st.zoom ? clamp(Math.round(st.zoom[0] + st.zoom[1]), first() + 1, n - 1) : n - 1;

    /** Scales the view around `center` (0 = left edge, 1 = right edge) and slides it by `pan` widths. */
    const transform = (scale, pan, center) => {
      const start = st.zoom ? st.zoom[0] : from;
      const length = st.zoom ? st.zoom[1] : n - 1 - from;
      const newLength = clamp(length / scale, Math.min(10, n - 1), n - 1);
      st.zoom = [clamp(start + center * length - center * newLength - pan * newLength, 0, n - 1 - newLength), newLength];
      paint();
    };

    // The parts that change while a finger is on the chart.
    const head = h('div', { class: 't-label-m muted' });
    const legend = h('div', { class: 'legend' });
    const ohlc = h('div', { class: 't-label-m muted mt6' });
    const extraLine = h('div', { class: 't-label-m muted mt4' });
    const price = h('canvas', { class: 'price mt12' });
    const volume = h('canvas', { class: 'volume' });
    const rsiLabel = h('div', { class: 't-label-m muted mt10' });
    const rsiPane = h('canvas', { class: 'pane' });
    const macdLabel = h('div', { class: 't-label-m muted mt10' });
    const macdPane = h('canvas', { class: 'pane' });
    const dateFrom = h('span'), dateTo = h('span');
    const reset = U.btn('Reset zoom', () => {
      st.zoom = null;
      paint();
    }, 'text');
    // The pan bar: the whole price history in small, with a window over the part the chart shows. Drag the window
    // to slide along the history; tap elsewhere on the bar to jump there.
    const navLine = h('canvas', { class: 'navline' });
    const navWin = h('div', { class: 'navwin' });
    const nav = h('div', { class: 'navbar mt8', role: 'slider', 'aria-label': 'Pan through time' }, navLine, navWin);
    let navDrawn = '';
    function paintNav(a, b) {
      const w = nav.clientWidth;
      if (!w || n < 2) return;
      const key = w + '|' + n + '|' + U.color('muted');
      if (key !== navDrawn) {
        const p = U.pen(navLine);
        if (p) {
          navDrawn = key;
          const lo = Math.min(...bars.closes), hi = Math.max(...bars.closes), span = hi > lo ? hi - lo : 1;
          const ctx = p.ctx;
          ctx.strokeStyle = U.color('muted');
          ctx.lineWidth = 1.25;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          bars.closes.forEach((v, i) => {
            const x = i / (n - 1) * p.w, y = 4 + (hi - v) / span * (p.h - 8);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
      }
      navWin.style.left = (a / (n - 1) * 100) + '%';
      navWin.style.width = Math.max((b - a) / (n - 1) * 100, 2) + '%';
    }
    let panFrom = null;
    const panTo = start => {
      const length = st.zoom ? st.zoom[1] : n - 1 - from;
      st.zoom = [clamp(start, 0, n - 1 - length), length];
      paint();
    };
    nav.addEventListener('pointerdown', e => {
      const r = nav.getBoundingClientRect();
      const a = first(), b = end();
      const at = (e.clientX - r.left) / r.width * (n - 1);
      // Outside the window: centre the window on the tap first, then drag from there.
      if (at < a || at > b) panTo(at - (b - a) / 2);
      panFrom = { x: e.clientX, start: st.zoom ? st.zoom[0] : from, width: r.width };
      try {
        nav.setPointerCapture(e.pointerId);
      } catch (err) {
        // Pointer capture is only a help.
      }
      nav.classList.add('held');
      e.preventDefault();
    });
    nav.addEventListener('pointermove', e => {
      if (!panFrom) return;
      panTo(panFrom.start + (e.clientX - panFrom.x) / panFrom.width * (n - 1));
    });
    const panEnd = () => {
      panFrom = null;
      nav.classList.remove('held');
    };
    nav.addEventListener('pointerup', panEnd);
    nav.addEventListener('pointercancel', panEnd);

    const item = (color, label, value) => h('div', { class: 'hrow' }, h('i', { style: 'background:' + color }),
      h('div', null, h('div', { class: 't-label-s muted' }, label), h('div', { class: 't-body-m', style: 'font-weight:600' }, money(value))));

    function paint() {
      const a = first(), b = end();
      const at = scrub == null ? n - 1 : clamp(scrub, a, b);
      head.textContent = scrub == null ? `Latest ${C.tfWord(asset.tf)} close · ${C.barDate(bars.dates[n - 1], asset.tf)}` : C.barDate(bars.dates[at], asset.tf);
      legend.replaceChildren(
        item(priceIsFast ? U.color('fast') : U.color('muted'), candles ? 'Close' : 'Price', bars.closes[at]),
        priceIsFast ? '' : item(U.color('fast'), 'EMA ' + asset.fast, fast[at]),
        item(U.color('slow'), 'EMA ' + asset.slow, slow[at]));
      if (rich) {
        ohlc.textContent = `Open ${C.money(bars.opens[at])}   High ${C.money(bars.highs[at])}   Low ${C.money(bars.lows[at])}` +
          (bars.volumes[at] > 0 ? `   Vol ${C.compact(bars.volumes[at])}` : '');
      }
      if (extras.length) {
        const parts = [];
        if (smaFast) parts.push(`SMA ${asset.fast} ${money(smaFast[at])}`);
        if (smaSlow) parts.push(`SMA ${asset.slow} ${money(smaSlow[at])}`);
        if (bands) parts.push(`Bands ${money(bands.lower[at])} to ${money(bands.upper[at])}`);
        extraLine.textContent = parts.join('   ');
      }
      const d = { bars, from: a, to: b, fast: priceIsFast ? null : fast, slow, extras, crosses, candles, scrub };
      drawPrice(price, d);
      let hasVolume = false;
      if (rich) for (let i = a; i <= b && !hasVolume; i++) hasVolume = bars.volumes[i] > 0;
      volume.style.display = hasVolume ? '' : 'none';
      if (hasVolume) drawVolume(volume, d);
      if (rsi) {
        rsiLabel.textContent = 'RSI 14' + (rsi[at] == null ? '' : '   ' + rsi[at].toFixed(1));
        drawRsi(rsiPane, d, rsi);
      }
      if (macd) {
        macdLabel.textContent = 'MACD 12, 26, 9' + (macd.line[at] == null ? '' : '   ' + C.money(macd.line[at]) + (macd.signal[at] == null ? '' : '   signal ' + C.money(macd.signal[at])));
        drawMacd(macdPane, d, macd);
      }
      dateFrom.textContent = C.niceDate(bars.dates[a], true);
      dateTo.textContent = C.niceDate(bars.dates[b], true);
      reset.style.display = st.zoom ? '' : 'none';
      paintNav(a, b);
    }

    // One finger reads the bar under it; two fingers pinch to zoom and slide along the history.
    let pinch = null, zooming = false;
    const indexAt = clientX => {
      const r = price.getBoundingClientRect();
      const a = first(), b = end();
      return clamp(a + Math.round((clientX - r.left) / r.width * (b - a)), a, b);
    };
    const measure = touches => {
      const r = price.getBoundingClientRect();
      const x0 = touches[0].clientX, x1 = touches[1].clientX;
      return { dist: Math.max(8, Math.hypot(x1 - x0, touches[1].clientY - touches[0].clientY)), mid: ((x0 + x1) / 2 - r.left) / r.width, width: r.width };
    };
    const touch = e => {
      if (e.touches.length >= 2) {
        const now = measure(e.touches);
        zooming = true;
        scrub = null;
        if (pinch) transform(now.dist / pinch.dist, now.mid - pinch.mid, clamp(now.mid, 0, 1)); else paint();
        pinch = now;
        if (e.cancelable) e.preventDefault();
      } else if (e.touches.length === 1 && !zooming) {
        pinch = null;
        scrub = indexAt(e.touches[0].clientX);
        paint();
      }
    };
    const lift = e => {
      pinch = null;
      if (e.touches.length === 0) {
        zooming = false;
        scrub = null;
        paint();
      }
    };
    price.addEventListener('touchstart', touch, { passive: false });
    price.addEventListener('touchmove', touch, { passive: false });
    price.addEventListener('touchend', lift);
    price.addEventListener('touchcancel', lift);
    // A mouse does the same as one finger (used when the pack is looked at on a PC).
    price.addEventListener('mousemove', e => {
      scrub = indexAt(e.clientX);
      paint();
    });
    price.addEventListener('mouseleave', () => {
      scrub = null;
      paint();
    });

    const card = U.card(null,
      head,
      details ? h('div', { class: 'scroller mt8' }, EMA.catalog.chartOptions.filter(o => o[0] !== 'candles' || C.full(bars))
        .map(o => U.chip(o[1], opts.has(o[0]), () => model.toggleChart(o[0])))) : null,
      legend, rich ? ohlc : null, extras.length ? extraLine : null,
      price, volume,
      rsi ? [rsiLabel, rsiPane] : null,
      macd ? [macdLabel, macdPane] : null,
      h('div', { class: 'hrow between t-label-s muted mt6' }, dateFrom, h('span', null, 'Drag to inspect · pinch to zoom'), dateTo),
      nav,
      h('div', { class: 'hrow end' }, reset,
        U.btn('Zoom out', () => transform(1 / 1.5, 0, 1), 'text'), U.btn('Zoom in', () => transform(1.5, 0, 1), 'text')));
    const picker = h('div', { class: 'mt4' }, U.seg(ranges.map((r, i) => [i, r[0]]), st.range, i => {
      st.range = i;
      st.zoom = null; // picking a range clears the zoom
      EMA.draw();
    }));
    // Painted as soon as the screen is in place, so the chart has its final height before scroll is put back.
    if (EMA.afterDraw) EMA.afterDraw.push(paint);
    else requestAnimationFrame(paint);
    if (window.ResizeObserver) new ResizeObserver(() => paint()).observe(price);
    return h('div', null, card, picker);
  };
})(window.EMA);
