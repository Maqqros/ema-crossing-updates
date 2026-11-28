'use strict';
// The live price of the one symbol whose page is open. One connection at a time, opened when the page opens and
// closed when it closes or the app is hidden. Crypto comes from Binance's trade stream, everything else from Yahoo's
// price stream. Every price keeps its own time, because some markets arrive late (measured on 26 Nov 2026 from
// Thailand: Binance about 0.07 s, Yahoo EUR/USD about 1 s, the dollar index 10 minutes, the SET index 15 minutes,
// PTT.BK 30 minutes). Nothing here is saved: a live price is only shown, never used for crossings or alerts.
(function (EMA) {
  const L = { off: false };
  let symbol = null, socket = null, latest = null, retry = 0, timer = 0, shown = 0, later = 0;
  const listeners = [];

  /** Where the live price of a symbol comes from: {kind, url, label, ...}, or null when there is none. */
  L.sourceOf = s => {
    if (!s || ((EMA.catalog && EMA.catalog.derived) || {})[s]) return null; // worked out from two series: no stream
    const coin = /^([A-Z0-9]+)-USD$/.exec(s);
    if (coin) {
      const pair = coin[1].toLowerCase() + 'usdt';
      return { kind: 'binance', url: `wss://stream.binance.com:9443/ws/${pair}@trade`, label: `Binance ${coin[1]}/USDT` };
    }
    return { kind: 'yahoo', url: 'wss://streamer.finance.yahoo.com/?version=2', label: 'Yahoo' };
  };

  // --- Yahoo's messages: base64 of a protobuf record. Field 1 is the symbol, 2 the price (float32), 3 the time
  // (zigzag varint, milliseconds). Other fields are skipped.
  L.readYahoo = b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    let i = 0;
    const varint = () => {
      let out = 0, mult = 1, b;
      do {
        if (i >= bytes.length) throw new Error('cut short');
        b = bytes[i++];
        out += (b & 0x7f) * mult;
        mult *= 128;
      } while (b & 0x80);
      return out;
    };
    const out = { id: '', price: null, at: 0 };
    while (i < bytes.length) {
      const key = varint(), field = Math.floor(key / 8), type = key & 7;
      if (type === 0) {
        const v = varint();
        if (field === 3) out.at = v % 2 === 0 ? v / 2 : -(v + 1) / 2;
      } else if (type === 1) i += 8;
      else if (type === 2) {
        const n = varint();
        if (field === 1) out.id = new TextDecoder().decode(bytes.subarray(i, i + n));
        i += n;
      } else if (type === 5) {
        if (field === 2) out.price = view.getFloat32(i, true);
        i += 4;
      } else throw new Error('unknown field type ' + type);
    }
    return out;
  };

  /** A float32 price rounded back to the digits it was sent with (7 significant digits). */
  const tidy = v => Number(v.toPrecision(7));

  /** The latest live price of `s`: {price, at (ms), source}, or null. */
  L.priceOf = s => latest && latest.symbol === s ? latest : null;
  /** Called with the symbol each time a new price arrives (at most once a second). */
  L.onPrice = f => listeners.push(f);

  function got(price, at, source) {
    if (!(price > 0) || !(at > 0)) return;
    if (latest && latest.symbol === symbol && at < latest.at) return;
    latest = { symbol, price, at, source };
    retry = 0;
    // A busy stream (thousands of trades a minute) is shown at most once a second, and the last price always is.
    const wait = shown + 1000 - Date.now();
    if (wait > 0) {
      if (!later) later = setTimeout(tell, wait);
      return;
    }
    tell();
  }
  function tell() {
    clearTimeout(later);
    later = 0;
    shown = Date.now();
    if (latest && latest.symbol === symbol) listeners.forEach(f => f(symbol));
  }

  function close() {
    clearTimeout(timer);
    timer = 0;
    if (socket) {
      const s = socket;
      socket = null;
      s.onclose = s.onmessage = s.onerror = null;
      try {
        s.close(1000);
      } catch (e) {
        // already closed
      }
    }
  }

  function open() {
    close();
    const src = L.sourceOf(symbol);
    if (!src || L.off || document.visibilityState === 'hidden') return;
    const mine = symbol;
    let ws;
    try {
      ws = new WebSocket(src.url);
    } catch (e) {
      EMA.host.log('live: ' + e);
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (src.kind === 'yahoo') ws.send(JSON.stringify({ subscribe: [mine] }));
    };
    ws.onmessage = e => {
      if (symbol !== mine) return;
      try {
        const m = JSON.parse(e.data);
        if (src.kind === 'binance') got(parseFloat(m.p), m.T, src.label);
        else if (m.message) {
          const q = L.readYahoo(m.message);
          if (q.id === mine && q.price != null) got(tidy(q.price), q.at, src.label);
        }
      } catch (err) {
        EMA.host.log('live: unreadable message: ' + err);
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      // Try again a few times, waiting longer each time; the page can be opened again to start afresh.
      if (retry < 4) timer = setTimeout(open, [2, 5, 15, 60][retry++] * 1000);
    };
  }

  /** Follows the live price of `s` (null stops). Called after every draw; does nothing when nothing changed. */
  L.follow = s => {
    if (s === symbol) return;
    symbol = s;
    retry = 0;
    if (s) open();
    else close();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') close();
    else if (symbol && !socket) {
      retry = 0;
      open();
    }
  });

  /** "37.20 at 15:09 · 30 min behind" style note, for a live price that is `ms` old. */
  L.behind = ms => ms < 60000 ? '' : ms < 3600000 ? `${Math.floor(ms / 60000)} min behind` : `${Math.floor(ms / 3600000)} h behind`;

  EMA.live = L;
})(window.EMA);
