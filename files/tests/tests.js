'use strict';
// Tests of the rules in js/core.js. Open tests/tests.html: every line must say "ok".
(async function () {
  const C = EMA.core;
  const results = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eq = (want, got) => {
    if (!same(want, got)) throw new Error(`expected ${JSON.stringify(want)} but got ${JSON.stringify(got)}`);
  };
  const close = (want, got, eps = 1e-9) => {
    if (got == null || Math.abs(want - got) > eps) throw new Error(`expected ${want} but got ${got}`);
  };
  const yes = (v, what = 'condition') => {
    if (!v) throw new Error(what + ' is not true');
  };
  const test = (name, f) => {
    try {
      f();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, why: e.message });
    }
  };
  const two = n => String(n).padStart(2, '0');
  const days = (n, year = 2025) => Array.from({ length: n }, (_, i) => `${year}-${two(1 + Math.floor(i / 28))}-${two(1 + i % 28)}`);
  const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const asset = (o = {}) => C.asset(Object.assign({ id: 'x', name: 'Test', symbol: 'TST', fast: 5, slow: 20 }, o));

  // Falls for 60 days, then rises: EMA 5 must cross above EMA 20 after the turn.
  const closes = seq(60, i => 200 - i).concat(seq(30, i => 141 + i * 3));
  const dates = days(closes.length);
  const a = asset();
  const upTo = n => C.bars(dates.slice(0, n), closes.slice(0, n), 'USD');

  test('emaMatchesHandCalculation', () => {
    eq([null, null, 2, 3, 4], C.ema([1, 2, 3, 4, 5], 3));
    eq([7, 8], C.ema([7, 8], 1));
  });

  test('crossesReportDirectionAndIgnoreTies', () => {
    eq([{ index: 2, up: true }, { index: 4, up: false }], C.findCrosses([1, 2, 3, 3, 2, 1], [2, 2, 2, 3, 3, 3]));
  });

  test('firstRunDoesNotAlertOnHistory', () => {
    const r = C.evaluate(a, upTo(closes.length), null);
    eq('above', r.entry.state);
    yes(r.entry.crossUp);
    eq([], r.alerts);
  });

  test('alertsExactlyOnceWhenTheCrossingBarArrives', () => {
    const full = C.evaluate(a, upTo(closes.length), null).entry;
    const i = dates.indexOf(full.crossDate);
    const before = C.evaluate(a, upTo(i), null).entry;
    eq('below', before.state);
    const onDay = C.evaluate(a, upTo(i + 1), before);
    eq(1, onDay.alerts.length);
    yes(onDay.alerts[0].up);
    eq([], C.evaluate(a, upTo(i + 2), onDay.entry).alerts);
    eq(1, C.evaluate(a, upTo(i + 3), before).alerts.length); // missed checks still caught
  });

  test('changingSettingsResetsInsteadOfAlerting', () => {
    const before = C.evaluate(a, upTo(40), null).entry;
    eq([], C.evaluate(asset({ fast: 3 }), upTo(closes.length), before).alerts);
  });

  test('newListingWaitsThenAlertsOnce', () => {
    const ant = asset({ id: 'ant', name: 'Anthropic', symbol: 'ANT' });
    const waiting = C.evaluate(ant, C.bars([], []), null).entry;
    eq('waiting', waiting.state);
    const first = C.evaluate(ant, C.bars(['2026-11-19'], [50]), waiting);
    eq('warming', first.entry.state);
    eq(21, first.entry.need);
    eq('listed', first.alerts[0].kind);
    eq([], C.evaluate(ant, C.bars(['2026-11-19', '2026-11-20'], [50, 52]), first.entry).alerts);
  });

  test('reportsEveryCrossingSinceTheLastCheck', () => {
    // Falls, rises, falls again: one crossing up and one down happen while no check runs.
    const wave = seq(60, i => 200 - i).concat(seq(30, i => 141 + i * 3), seq(40, i => 228 - i * 4));
    const d = days(wave.length);
    const before = C.evaluate(a, C.bars(d.slice(0, 40), wave.slice(0, 40), 'USD'), null).entry;
    const alerts = C.evaluate(a, C.bars(d, wave, 'USD'), before).alerts;
    eq([true, false], alerts.map(x => x.up));
    yes(alerts.every(x => x.kind === 'cross'));
    yes(alerts[0].date < alerts[1].date);
  });

  test('earlyWarningComesOnceBeforeTheCrossingAndCanBeSwitchedOff', () => {
    const crossDay = dates.indexOf(C.evaluate(a, upTo(closes.length), null).entry.crossDate);
    const run = nearPct => {
      let prev = null;
      const all = [];
      for (let n = 22; n <= closes.length; n++) {
        const r = C.evaluate(a, upTo(n), prev, nearPct);
        all.push(...r.alerts);
        prev = r.entry;
      }
      return all;
    };
    const on = run(5);
    eq(['near', 'cross'], on.map(x => x.kind));
    yes(on[0].up); // the fast average is below and would cross upwards
    yes(on[0].date < dates[crossDay]);
    yes(Math.abs(on[0].gap) <= 5);
    eq(['cross'], run(0).map(x => x.kind));
    eq('Test: EMA 5 is closing in on EMA 20', C.describe(on[0], a, 'USD').title);
  });

  test('trackRecordCountsWhatFollowedEachCrossing', () => {
    //       index: 0    1    2    3    4   5   6   7
    const prices = [100, 110, 121, 100, 90, 99, 50, 60];
    const crosses = [{ index: 0, up: true }, { index: 3, up: true }, { index: 4, up: false }, { index: 6, up: true }];
    const record = C.trackRecord(prices, crosses, [1, 2]);
    // One bar after the crossings above at 0, 3 and 6: +10%, -10%, +20%.
    eq(3, record.up[0].count);
    eq(2, record.up[0].higher);
    close(0.10, record.up[0].median);
    close(-0.10, record.up[0].worst);
    // Two bars after: +21% and -1%; the crossing at 6 has only one bar after it and is left out.
    eq(2, record.up[1].count);
    close(0.10, record.up[1].median); // the middle of two results is their average
    // One crossing below, at 4: +10% one bar later.
    eq({ bars: 1, count: 1, higher: 1, median: 99 / 90 - 1, worst: 99 / 90 - 1 }, record.down[0]);
    eq(0, C.trackRecord(prices, []).up[0].count);
  });

  test('smaIsThePlainAverage', () => eq([null, 1.5, 2.5, 3.5], C.sma([1, 2, 3, 4], 2)));

  test('rsiMatchesHandCalculation', () => {
    // Period 2 on 1, 2, 1, 2: first average gain 0.5 and loss 0.5 gives 50; then gain 0.75, loss 0.25 gives 75.
    eq([null, null, 50, 75], C.rsi([1, 2, 1, 2], 2));
    eq(100, C.rsi([1, 2, 3, 4], 2)[3]); // only gains
    eq(50, C.rsi([5, 5, 5, 5], 2)[3]); // no movement
  });

  test('macdIsZeroOnAFlatSeriesAndPositiveInARise', () => {
    const flat = C.macd(seq(40, () => 10));
    eq(null, flat.line[24]); // the slow EMA starts at index 25
    close(0, flat.line[25]);
    eq(null, flat.signal[32]); // the signal needs 9 values of the line
    close(0, flat.signal[33]);
    close(0, flat.hist[39]);
    yes(C.macd(seq(60, i => i)).line[59] > 0); // the fast average is above the slow one while prices climb
  });

  test('bollingerBandsAreTheAveragePlusAndMinusTwoDeviations', () => {
    const flat = C.bollinger(seq(5, () => 7), 3);
    eq([null, null, 7, 7, 7], flat.upper);
    eq(flat.upper, flat.lower); // no spread, no width
    const b = C.bollinger([1, 2, 3], 3); // mean 2, deviation sqrt(2/3)
    close(2 + 2 * Math.sqrt(2 / 3), b.upper[2]);
    close(2 - 2 * Math.sqrt(2 / 3), b.lower[2]);
  });

  test('rsiAlertFiresOnLeavingTheBandOnly', () => {
    const r = asset({ id: 'r', fast: 30, slow: 70, kind: 'rsi' });
    eq('TST|30|70|rsi', C.key(r));
    // Flat, a long rise (RSI goes to 100), then a long fall (RSI drops through 70 and then below 30).
    const c = seq(20, i => 100 + (i % 2)).concat(seq(20, i => 102 + i * 2), seq(40, i => 140 - i * 2));
    const crosses = C.crosses(r, c);
    eq([true, false], crosses.map(x => x.up)); // coming back inside the band is not an event
    const d = days(c.length, 2026);
    const at = crosses[0].index;
    const before = C.evaluate(r, C.bars(d.slice(0, at), c.slice(0, at)), null).entry;
    eq('between', before.state);
    const now = C.evaluate(r, C.bars(d.slice(0, at + 1), c.slice(0, at + 1)), before);
    eq('above', now.entry.state);
    eq(1, now.alerts.length);
    eq('Test: RSI rose above 70', C.describe(now.alerts[0], r, 'USD').title);
  });

  test('macdAlertFiresWhenTheLineCrossesItsSignal', () => {
    const m = asset({ id: 'm', fast: 12, slow: 26, kind: 'macd' });
    const c = seq(60, i => 100 + i * i * 0.05).concat(seq(30, i => 274 - i * 3));
    const crosses = C.crosses(m, c);
    yes(crosses.length > 0 && !crosses[crosses.length - 1].up); // the fall takes the line under its signal
    const d = days(c.length, 2026);
    const at = crosses[crosses.length - 1].index;
    const before = C.evaluate(m, C.bars(d.slice(0, at), c.slice(0, at)), null).entry;
    const now = C.evaluate(m, C.bars(d.slice(0, at + 1), c.slice(0, at + 1)), before);
    eq('below', now.entry.state);
    eq(['cross'], now.alerts.map(x => x.kind));
    eq('Test: MACD crossed below its signal line', C.describe(now.alerts[0], m, 'USD').title);
  });

  test('describeIsFactual', () => {
    const t = C.describe({ kind: 'cross', up: false, date: '2026-11-17', close: 1234.4 }, asset({ id: 'g', name: 'Gold', symbol: 'GC=F', fast: 50, slow: 200 }), 'USD');
    eq('Gold: EMA 50 crossed below EMA 200', t.title);
    eq('GC=F closed at 1,234 USD on 2026-11-17.', t.body);
  });

  // --- which bars count as finished. New York times: UTC-5, session 09:30 to 16:00 (14:30 to 21:00 UTC). ---
  const utc = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour, minute) / 1000;
  const chart = (times, values, price, priceAt, start, end, quote) => ({
    chart: {
      result: [{
        meta: { currency: 'USD', gmtoffset: -18000, regularMarketPrice: price, regularMarketTime: priceAt, currentTradingPeriod: { regular: { start, end } } },
        timestamp: times, indicators: { quote: [quote || { close: values }] }
      }], error: null
    }
  });
  // Monday 16, Tuesday 17 and Wednesday 18 November 2026.
  const d3 = [utc(16, 14, 30), utc(17, 14, 30), utc(18, 14, 30)];

  test('dailyDropsTheDayThatIsStillTrading', () => {
    const now = utc(18, 16);
    const b = C.parseChart(chart(d3, [100, 102, 104], 105, now, utc(18, 14, 30), utc(18, 21)), now);
    eq(['2026-11-16', '2026-11-17'], b.dates);
    yes(b.live);
    eq(105, b.price);
    eq(102, b.prev); // compared with Tuesday's close
    eq(21 * 3600, b.closeUtc);
  });

  test('dailyKeepsTheDayOnceTheSessionEnds', () => {
    const b = C.parseChart(chart(d3, [100, 102, 104], 104, utc(18, 21), utc(18, 14, 30), utc(18, 21)), utc(18, 21, 30));
    eq(['2026-11-16', '2026-11-17', '2026-11-18'], b.dates);
    yes(!b.live);
    eq(102, b.prev);
  });

  // Two weekly bars (Monday 9 and Monday 16) plus the "right now" row Yahoo adds for the running week.
  const weeks = [utc(9, 5), utc(16, 5), utc(18, 16)];

  test('weeklyDropsTheRunningWeekEvenWhenItArrivesTwice', () => {
    const b = C.parseChart(chart(weeks, [90, 95, 96], 96, utc(18, 16), utc(18, 14, 30), utc(18, 21)), utc(18, 16), '1wk');
    eq(['2026-11-09'], b.dates);
    eq([90], b.closes);
  });

  test('weeklyKeepsTheWeekFromSaturdayAndLabelsItByItsMonday', () => {
    const b = C.parseChart(chart(weeks, [90, 95, 96], 96, utc(20, 21), utc(20, 14, 30), utc(20, 21)), utc(21, 6), '1wk');
    eq(['2026-11-09', '2026-11-16'], b.dates);
    eq([90, 96], b.closes); // the later row of the same week wins
  });

  test('weeklyOnAnAllDayMarketWaitsForSunday', () => {
    // Bitcoin trades around the clock: its week is not finished on Saturday.
    const all = chart([utc(9, 0), utc(16, 0)], [1, 2], 2, utc(21, 6), utc(21, 0), utc(21, 23, 59));
    all.chart.result[0].meta.gmtoffset = 0;
    eq(['2026-11-09'], C.parseChart(all, utc(21, 6), '1wk').dates);
    eq(['2026-11-09', '2026-11-16'], C.parseChart(all, utc(23, 0, 5), '1wk').dates);
  });

  test('hourlyDropsTheRunningHourAndKeepsTheShortLastOne', () => {
    const hours = [utc(18, 14, 30), utc(18, 15, 30), utc(18, 16, 30)];
    const running = C.parseChart(chart(hours, [1, 2, 3], 3, utc(18, 16, 45), utc(18, 14, 30), utc(18, 21)), utc(18, 16, 45), '1h');
    eq(['2026-11-18 09:30', '2026-11-18 10:30'], running.dates);
    // The 15:30 bar is only 30 minutes long: it is final as soon as the session ends at 16:00.
    const closed = C.parseChart(chart([utc(18, 19, 30), utc(18, 20, 30)], [1, 2], 2, utc(18, 21), utc(18, 14, 30), utc(18, 21)), utc(18, 21, 5), '1h');
    eq(['2026-11-18 14:30', '2026-11-18 15:30'], closed.dates);
  });

  test('keepsOpenHighLowVolumeAndTodaysSession', () => {
    const now = utc(18, 16); // Wednesday's session is still open
    const b = C.parseChart(chart(d3, null, 105, now, utc(18, 14, 30), utc(18, 21),
      { open: [99, null, 103], high: [101, 103, 106], low: [98, 100, 102.5], close: [100, 102, 105], volume: [1000, 2000, 300] }), now);
    yes(C.full(b));
    eq([99, 102], b.opens); // a missing open falls back to that bar's close
    eq([101, 103], b.highs);
    eq([98, 100], b.lows);
    eq([1000, 2000], b.volumes);
    eq({ open: 103, high: 106, low: 102.5, volume: 300 }, b.day); // the running session, not among the finished bars
  });

  const catalog = await (await fetch('../data/catalog.json')).json();

  test('calculatedSeriesUsesTheLatestRateOnOrBeforeEachBar', () => {
    // Gold in dollars on four days; the exchange rate exists from the 2nd and has no bar on the 4th.
    const gold = C.bars(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], [10, 20, 30, 40], 'USD', {
      price: 50, prev: 40, live: true, opens: [9, 19, 29, 39], highs: [11, 21, 31, 41], lows: [8, 18, 28, 38], volumes: [1, 2, 3, 4]
    });
    const rate = C.bars(['2026-11-03', '2026-11-04'], [2, 3], 'THB', { price: 4 });
    const b = C.combine(gold, rate, 0.5, 'THB');
    eq(['2026-11-03', '2026-11-04', '2026-11-05'], b.dates); // the 2nd has no rate yet
    eq([20, 45, 60], b.closes); // 20x2x0.5, 30x3x0.5, and the 5th reuses the rate of the 4th
    eq([21, 46.5, 61.5], b.highs);
    eq([2, 3, 4], b.volumes); // volume is not a price and is left alone
    eq('THB', b.currency);
    close(100, b.price); // the live price uses the live rate: 50 x 4 x 0.5
    close(60, b.prev);
    close(0.47296, catalog.derived['GOLD-THB'].factor, 0.00001);
  });

  test('dailySettingsKeepTheirOldKey', () => {
    // Results saved before timeframes existed must still match daily crossings.
    const nvda = o => asset(Object.assign({ id: 'a', name: 'Nvidia', symbol: 'NVDA', fast: 50, slow: 200 }, o));
    eq('NVDA|50|200', C.key(nvda()));
    eq('NVDA|50|200|1wk', C.key(nvda({ tf: '1wk' })));
    eq('Nvidia: EMA 50 crossed above EMA 200 (weekly)', C.describe({ kind: 'cross', up: true, date: '2026-11-16', close: 150 }, nvda({ tf: '1wk' }), 'USD').title);
  });

  test('wordsForNumbersAndDates', () => {
    eq('1,234', C.money(1234.4));
    eq('12.35', C.money(12.345678));
    eq('+1.50%', C.signed(1.5));
    eq('-0.25%', C.signed(-0.25));
    eq('1.23M', C.compact(1234567));
    eq('6 Oct 2020', C.niceDate('2020-10-06'));
    eq('6 Oct 2020 14:30', C.niceDate('2020-10-06 14:30'));
    eq('week of 5 Oct 2020', C.barDate('2020-10-05', '1wk'));
    eq('2026-11-18', C.minusDays('2026-11-21', 3));
    eq('today', C.ago(C.today()));
  });

  test('quietHoursMayRunPastMidnight', () => {
    yes(C.quiet(23, 22, 7) && C.quiet(3, 22, 7) && !C.quiet(7, 22, 7) && !C.quiet(12, 22, 7));
    yes(C.quiet(13, 12, 14) && !C.quiet(14, 12, 14) && !C.quiet(5, 5, 5));
  });

  test('watchlistGroupsKeepTheirOrder', () => {
    const g = C.groups([asset({ id: '1', symbol: 'A' }), asset({ id: '2', symbol: 'B' }), asset({ id: '3', symbol: 'A', tf: '1wk' })]);
    eq(['A', 'B'], g.map(x => x.symbol));
    eq(['1', '3'], g[0].items.map(x => x.id));
  });

  const failed = results.filter(r => !r.ok);
  window.RESULT = { passed: results.length - failed.length, failed: failed.length, failures: failed };
  document.title = failed.length ? `${failed.length} FAILED` : `all ${results.length} passed`;
  document.body.innerHTML = `<h3>${document.title}</h3>` + results.map(r => `<div style="color:${r.ok ? 'inherit' : 'red'}">${r.ok ? 'ok' : 'FAILED'} &nbsp; ${r.name}${r.ok ? '' : ' &nbsp; ' + r.why}</div>`).join('');
})();
