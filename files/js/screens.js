'use strict';
// The screens: the four tabs, the asset screen, adding an asset, reordering, the change log, an article,
// and the choice of assets for a home-screen widget.
(function (EMA) {
  const host = EMA.host, C = EMA.core, S = EMA.store, K = EMA.check, U = EMA.ui, M = EMA.model, h = U.h;
  const V = {};
  const go = route => EMA.go(route);
  const st = { tab: 0, detail: {}, charts: {}, add: null, typedUrl: null, news: null, article: null, widget: null };
  V.state = st;
  const two = n => String(n).padStart(2, '0');

  // --- watchlist: hold a card and drag it to reorder; pull down to check prices ---
  let lifted = false, dragEndedAt = 0;

  function attachDrag(body) {
    let timer = 0, card = null, startX = 0, startY = 0, baseTop = 0;
    const cards = () => Array.from(body.querySelectorAll('[data-symbol]'));
    const cancel = () => {
      clearTimeout(timer);
      timer = 0;
    };
    body.addEventListener('touchstart', e => {
      cancel();
      const c = e.touches.length === 1 ? e.target.closest('[data-symbol]') : null;
      if (!c) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        timer = 0;
        card = c;
        lifted = true;
        baseTop = c.getBoundingClientRect().top;
        c.classList.add('lifted');
        c.style.transform = 'scale(1.02)';
        host.haptic();
      }, 450);
    }, { passive: true });
    body.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (!lifted) {
        if (timer && Math.hypot(t.clientX - startX, t.clientY - startY) > 10) cancel();
        return;
      }
      if (e.cancelable) e.preventDefault(); // keeps the list from scrolling while a card is held
      const want = baseTop + (t.clientY - startY);
      const middle = want + card.offsetHeight / 2;
      const list = cards();
      const i = list.indexOf(card);
      const half = el => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };
      if (list[i + 1] && middle > half(list[i + 1])) list[i + 1].after(card);
      else if (list[i - 1] && middle < half(list[i - 1])) list[i - 1].before(card);
      card.style.transform = '';
      card.style.transform = `translateY(${want - card.getBoundingClientRect().top}px) scale(1.02)`;
    }, { passive: false });
    const end = () => {
      cancel();
      if (!lifted) return;
      lifted = false;
      card.classList.remove('lifted');
      card.style.transform = '';
      card = null;
      dragEndedAt = Date.now(); // letting go after a hold must not also count as a tap on the card
      const order = cards().map(c => c.dataset.symbol);
      if (order.join('\n') !== M.groups().map(g => g.symbol).join('\n')) M.setOrder(order);
    };
    body.addEventListener('touchend', end);
    body.addEventListener('touchcancel', end);
  }

  function attachPull(body, wrap, onRefresh) {
    const mark = h('div', { class: 'pull' }, U.icon('refresh', 20));
    wrap.appendChild(mark);
    let y0 = null, dy = 0;
    body.addEventListener('touchstart', e => {
      y0 = body.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      dy = 0;
    }, { passive: true });
    body.addEventListener('touchmove', e => {
      if (y0 == null || lifted) return;
      dy = e.touches[0].clientY - y0;
      const show = dy > 12 && body.scrollTop <= 0;
      mark.style.display = show ? 'flex' : 'none';
      if (show) {
        mark.style.transform = `translateY(${Math.min(dy * 0.4, 72)}px) rotate(${dy * 2}deg)`;
        mark.style.opacity = String(Math.min(1, dy / 130));
      }
    }, { passive: true });
    const end = () => {
      mark.style.display = 'none';
      if (y0 != null && dy > 130 && !lifted && body.scrollTop <= 0) onRefresh();
      y0 = null;
    };
    body.addEventListener('touchend', end);
    body.addEventListener('touchcancel', end);
  }

  function assetCard(g) {
    const bars = M.barsOf(g.symbol);
    const quote = C.quoteOf(bars);
    const live = g.items.map(a => [a, M.entryOf(a)]);
    const recent = bars ? bars.closes.slice(-60) : [];
    const kids = [h('div', { class: 'hrow' },
      h('div', { class: 'grow' }, h('div', { class: 't-title-m one-line' }, g.name), h('div', { class: 't-body-s muted' }, g.symbol)),
      quote && recent.length >= 2 ? U.spark(recent, recent[recent.length - 1] >= recent[0]) : null,
      quote ? h('div', { class: 'right' }, h('div', { class: 't-title-m' }, C.money(quote.price)),
        quote.change != null ? h('div', { class: 't-label-m ' + (quote.change >= 0 ? 'up' : 'down') }, C.signed(quote.change)) : null) : null)];

    if (live.every(x => !x[1])) {
      kids.push(h('div', { class: 't-body-s muted mt12' }, M.checking ? 'Loading prices…' : 'No data yet. Pull down to refresh.'));
    } else if (live.some(x => x[1] && x[1].state === 'waiting')) {
      kids.push(h('div', { class: 'mt12' }, U.pill('Not trading yet')),
        h('div', { class: 't-body-s muted mt8' }, "You'll get an alert on its first trading day."));
    } else {
      const pills = [];
      if (live.length <= 3) {
        for (const [a, e] of live) {
          // An RSI alert shows the RSI itself in place of its two levels.
          const name = C.assetLabel(a);
          const label = a.kind === 'rsi' && e && e.emaFast != null ? name.slice(0, name.indexOf('RSI')) + 'RSI ' + e.emaFast.toFixed(0) : name;
          if (e && e.state === 'above') pills.push(U.pill('↑ ' + label, 'up'));
          else if (e && e.state === 'below') pills.push(U.pill('↓ ' + label, 'down'));
          else pills.push(U.pill(label));
        }
      } else {
        // Too many to name each one: count them, the asset screen has the detail.
        const count = f => live.filter(x => f(x[1])).length;
        const ups = count(e => e && e.state === 'above'), downs = count(e => e && e.state === 'below'), rest = count(e => !e || e.state === 'warming');
        if (ups > 0) pills.push(U.pill(`↑ ${ups} above`, 'up'));
        if (downs > 0) pills.push(U.pill(`↓ ${downs} below`, 'down'));
        if (rest > 0) pills.push(U.pill(`${rest} collecting data`));
      }
      if (live.some(x => x[1] && x[1].near)) pills.push(U.pill('Closing in', 'strong'));
      kids.push(h('div', { class: 'wrapflow mt12' }, pills));
      const dated = live.filter(x => x[1] && x[1].crossDate).sort((p, q) => (p[1].crossDate < q[1].crossDate ? 1 : -1));
      if (dated.length) {
        const [a, e] = dated[0];
        const fresh = C.daysSince(e.crossDate) <= 7;
        kids.push(h('div', { class: 'hrow gap8 mt10' }, fresh ? U.pill('NEW', 'new') : null,
          h('div', { class: 't-body-s grow' + (fresh ? '' : ' muted') }, `${C.crossText(a, e.crossUp)} · ${C.barDate(e.crossDate, a.tf, false)} · ${C.ago(e.crossDate)}`)));
      }
    }
    if (g.items.some(a => M.entries[a.id] && M.entries[a.id].error)) {
      kids.push(h('div', { class: 't-body-s err mt8' }, "Couldn't update this one. Showing the last saved result."));
    }
    return h('div', { class: 'card', role: 'button', 'data-symbol': g.symbol, onclick: () => { if (Date.now() - dragEndedAt > 400) go('d:' + g.symbol); } }, kids);
  }

  function watchlist(wrap) {
    const groups = M.groups();
    const kids = [];
    if (!M.allowed) {
      kids.push(h('div', { class: 'card note hrow', style: 'padding:8px 8px 8px 16px' },
        h('div', { class: 't-body-m grow' }, "Notifications are off, so alerts can't reach you."),
        U.btn('Turn on', () => M.askNotifications(true), 'text')));
    }
    if (M.staleHours != null) {
      const span = M.staleHours >= 48 ? `${Math.floor(M.staleHours / 24)} days` : `${M.staleHours} hours`;
      kids.push(h('div', { class: 'card warn', style: 'padding:12px 8px 4px 16px' },
        h('div', { class: 't-body-m' }, `No price check ran for ${span} before you opened the app. ` +
          'The phone may be stopping background checks, so alerts can arrive late. Setting battery use to Unrestricted usually fixes it.'),
        h('div', { class: 'hrow end' }, U.btn('Dismiss', M.dismissStale, 'text'), U.btn('Battery settings', () => host.open('battery'), 'text'))));
    }
    if (!groups.length) {
      kids.push(U.empty('Your watchlist is empty', 'Add an asset to get an alert when its moving averages cross.', U.btn('Add asset', () => go('add'))));
    }
    for (const g of groups) kids.push(assetCard(g));
    if (groups.length > 1) kids.push(h('div', { class: 't-body-s muted center' }, 'Hold a card and drag it to reorder.'));
    const body = h('div', { class: 'body list fabbed', 'data-keep': 'watch' }, kids);
    attachDrag(body);
    attachPull(body, wrap, () => M.refresh(false));
    return body;
  }

  // --- alerts ---
  const alertRow = (up, title, sub, tag, onClick) => h('div', { class: 'card tight hrow', role: onClick ? 'button' : null, onclick: onClick },
    h('div', { class: 'dot ' + (up ? 'up' : 'down') }, up ? '↑' : '↓'),
    h('div', { class: 'grow', style: 'margin-left:12px' }, h('div', { class: 't-body-l' }, title), h('div', { class: 't-body-s muted' }, sub)),
    tag ? h('div', { style: 'margin-left:8px' }, U.pill(tag)) : null);

  function alerts() {
    const recent = M.recentCrossings(30);
    // Notifications whose crossing is no longer in the 30-day list.
    const older = M.history.filter(p => !recent.some(r => r.asset.symbol === p.symbol && r.date === p.date));
    if (!recent.length && !older.length) {
      return h('div', { class: 'body' }, U.empty('No crossings in the last 30 days', 'When one happens on your watchlist you get a notification, and it is listed here.'));
    }
    const kids = [h('div', { class: 'listhead' }, 'Last 30 days')];
    if (!recent.length) kids.push(h('div', { class: 't-body-m muted' }, 'No crossings on your watchlist in the last 30 days.'));
    for (const r of recent) {
      kids.push(alertRow(r.up, `${r.asset.name}: ${C.crossText(r.asset, r.up)}`,
        `${C.barDate(r.date, r.asset.tf)} · ${C.ago(r.date)} · at ${C.money(r.close)} ${r.currency}`.trim(),
        r.notified ? 'Notified' : null, () => go('d:' + r.asset.symbol)));
    }
    if (older.length) {
      kids.push(h('div', { class: 'listhead' }, 'Earlier notifications'));
      for (const p of older) {
        kids.push(alertRow(p.up, p.title, `${C.niceDate(p.date, true)} · ${C.ago(p.date)}`, null, p.symbol && M.has(p.symbol) ? () => go('d:' + p.symbol) : null));
      }
    }
    return h('div', { class: 'body list tight', 'data-keep': 'alerts' }, kids);
  }

  // --- articles ---
  function articles() {
    const list = M.articles();
    if (!list) {
      M.loadArticles().then(EMA.draw);
      return h('div', { class: 'body' });
    }
    if (!list.length) {
      return h('div', { class: 'body' }, U.empty('Nothing to read yet', 'Articles on what the price history shows will appear here. They arrive with an update.'));
    }
    return h('div', { class: 'body list', 'data-keep': 'articles' },
      list.map(a => {
        const label = [a.number ? 'No. ' + a.number : '', a.date ? C.niceDate(a.date, true) : ''].filter(Boolean).join('  ·  ');
        return h('div', { class: 'card', role: 'button', onclick: () => go('a:' + a.name) },
          label ? h('div', { class: 't-label-m muted', style: 'margin-bottom:4px' }, label) : null,
          h('div', { class: 't-title-l' }, a.title),
          h('div', { class: 't-body-m muted mt6', style: 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden' }, a.lead));
      }),
      h('div', { class: 't-body-s muted' }, 'Articles describe what happened in past prices. They are not advice to buy or sell.'));
  }

  // --- settings ---
  const settingsCard = (title, body, ...kids) => U.card(null, h('div', { class: 't-title-m' }, title), h('div', { class: 't-body-m muted mt4 pre' }, body), ...kids);

  function updatesCard() {
    const s = M.settings, u = M.update;
    const typed = st.typedUrl != null ? st.typedUrl : s.updateUrl;
    const same = text => text.trim().replace(/\/+$/, '') === s.updateUrl;
    const save = U.btn('Save', () => {
      const text = st.typedUrl != null ? st.typedUrl : s.updateUrl;
      st.typedUrl = null;
      M.chooseUpdateUrl(text);
    }, 'outline', same(typed));
    const kids = [
      h('label', { class: 'field mt12' }, h('span', null, 'Server address'),
        h('input', {
          id: 'updateUrl', type: 'url', value: typed, placeholder: 'https://…', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
          oninput: e => {
            st.typedUrl = e.target.value;
            save.disabled = same(st.typedUrl);
          }
        })),
      h('div', { class: 'hrow gap mt8' }, save, U.btn(M.updating ? 'Working…' : 'Check now', () => M.checkUpdates(false), 'outline', !s.updateUrl || M.updating))
    ];
    if (s.updateUrl) {
      kids.push(h('div', { class: 't-body-s muted mt8' }, u.checked ? `Last checked ${C.stamp(u.checked)}.` : 'Not checked yet.'));
    }
    if (u.status === 'engine') {
      kids.push(h('div', { class: 't-body-m mt12' }, 'The newest update on the server needs a newer engine than this one. Install the new engine to get it.'));
    }
    if (u.engine) {
      kids.push(h('div', { class: 't-title-s mt12' }, `Engine ${u.engine.versionName} is available`),
        h('div', { class: 'mt8' }, U.btn('Download and install', M.installEngine, '', M.updating)),
        h('div', { class: 't-body-s muted mt6' }, 'Android asks you to confirm. The first time, it also asks you to allow this app to install updates.'));
    }
    return settingsCard('Updates from a server',
      'New screens, features, fixes and articles arrive on their own, with nothing to install. Leave the address empty to switch this off.', ...kids);
  }

  function settings() {
    const s = M.settings;
    const hourRow = (label, hour, set) => h('div', { class: 'hrow' },
      h('div', { class: 't-body-m grow' }, label), U.btn('Earlier', () => set((hour + 23) % 24), 'text'),
      h('div', { class: 't-title-m' }, two(hour) + ':00'), U.btn('Later', () => set((hour + 1) % 24), 'text'));
    const cards = [
      settingsCard('Appearance', "Dark is the default. System follows the phone's own light or dark setting.",
        h('div', { class: 'mt12' }, U.seg([['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], s.theme, theme => M.set({ theme }))),
        h('div', { class: 'mt12' }, U.switchRow('Price details', 'Open, high, low, volume and candles on the asset screen. Turn off for a plainer screen.', s.details, details => M.set({ details })))),
      settingsCard('Notifications', M.allowed ? 'On. You get a notification when a crossing happens.' : "Off. Alerts can't reach you until you turn them on.",
        h('div', { class: 'mt16' }, U.switchRow('Early warnings', 'A notice before a crossing, when the two averages are close and still closing in. Daily and weekly crossings only.', s.nearOn, nearOn => M.set({ nearOn }))),
        s.nearOn ? h('div', { class: 'mt8' }, U.seg((EMA.catalog.nearSteps || [0.5, 1, 2]).map(p => [p, `Within ${p}%`]), s.nearPct, nearPct => M.set({ nearPct }))) : null,
        h('div', { class: 'mt12' }, U.switchRow('Quiet hours', 'Notifications are held during these hours and delivered when they end. Nothing is lost.', s.quietOn, quietOn => M.set({ quietOn }))),
        s.quietOn ? [hourRow('From', s.quietFrom, quietFrom => M.set({ quietFrom })), hourRow('Until', s.quietTo, quietTo => M.set({ quietTo }))] : null,
        h('div', { class: 'mt8' }, M.allowed
          ? U.btn('Send test notification', () => host.notify({ title: 'Test alert', body: 'Notifications from EMA Crossing are working on this phone.', route: 'home' }), 'outline')
          : U.btn('Turn on notifications', () => M.askNotifications(true)))),
      settingsCard('Background checks',
        'Prices are checked about every 3 hours while the phone is online (every hour if you watch an hourly crossing), ' +
        `and again about ten minutes after each market closes. ${C.checkedText(M.lastChecked)}.\n\n` +
        "Some phones stop background work to save battery. If alerts arrive late, set this app's battery use to Unrestricted.",
        h('div', { class: 'mt12' }, U.btn('Open battery settings', () => host.open('battery'), 'outline'))),
      settingsCard('Backup',
        'Save your watchlist, every crossing and these settings to one file, or bring them back from it. ' +
        'Restoring replaces what is on this phone. Alert history is not included.',
        h('div', { class: 'hrow gap mt12' }, U.btn('Save backup', M.saveBackup, 'outline'), U.btn('Restore', M.restoreBackup, 'outline'))),
      updatesCard(),
      settingsCard('Home-screen widget',
        'See your watchlist without opening the app: long-press an empty spot on the home screen, choose Widgets, and pick EMA Crossing. ' +
        'There are three: the watchlist, one asset, and a one-line strip. Long-press a placed widget to resize it or to choose which assets it shows.'),
      settingsCard('About the data',
        'Prices come from Yahoo Finance and are delayed. A crossing counts only once its day, week or hour has closed.\n\n' +
        'Alerts describe what happened. They are not advice to buy or sell.'),
      h('div', null, U.btn("What's new in this version", () => go('news'), 'outline')),
      h('div', { class: 't-body-s muted', style: 'padding-left:4px;white-space:pre-line' },
        `EMA Crossing version ${EMA.pack.name || host.info.shellName} · engine ${host.info.shellName}
Pack ${EMA.pack.version} · id ${EMA.pack.id || 'none'}${EMA.pack.built ? ' · built ' + EMA.pack.built : ''}`)
    ];
    return h('div', { class: 'body list', 'data-keep': 'settings' }, cards);
  }

  // --- the four tabs ---
  V.home = () => {
    const tab = st.tab;
    const wrap = h('div', { class: 'wrap' });
    const body = tab === 0 ? watchlist(wrap) : tab === 1 ? alerts() : tab === 2 ? articles() : settings();
    if (tab === 0 && M.checking) wrap.appendChild(h('div', { class: 'progress' }));
    wrap.appendChild(body);
    if (tab === 0) wrap.appendChild(h('button', { class: 'fab', onclick: () => go('add') }, U.icon('add'), 'Add asset'));
    const tabs = [['list', 'Watchlist'], ['bell', 'Alerts'], ['info', 'Articles'], ['settings', 'Settings']];
    return h('div', { class: 'screen' },
      h('div', { class: 'top' },
        h('div', { class: 'titles' }, h('div', { class: 't-headline' }, tabs[tab][1]),
          tab === 0 ? h('div', { class: 't-body-s muted' }, C.checkedText(M.lastChecked)) : null),
        tab === 0 ? U.iconBtn('refresh', 'Check prices now', () => M.refresh(false), { disabled: M.checking }) : null,
        tab === 0 ? U.iconBtn('more', 'More', e => U.menu(e.currentTarget, [['Reorder list', () => go('order')]])) : null),
      wrap,
      h('div', { class: 'nav' }, tabs.map((t, i) => h('button', {
        class: i === tab ? 'on' : '', onclick: () => {
          st.tab = i;
          EMA.draw();
        }
      }, h('div', { class: 'ind' }, U.icon(t[0])), t[1]))));
  };

  // --- reorder with arrows ---
  V.order = () => {
    const groups = M.groups();
    return h('div', { class: 'screen' }, U.subTop('Reorder list', () => go('home')),
      h('div', { class: 'body end', style: 'padding:0 0 24px', 'data-keep': 'order' }, groups.map((g, i) => h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('div', { class: 't-body-l one-line', style: 'font-weight:500' }, g.name), h('div', { class: 't-body-m muted' }, g.symbol)),
        U.iconBtn('up', `Move ${g.name} up`, () => M.move(g.symbol, -1), { disabled: i === 0 }),
        U.iconBtn('down', `Move ${g.name} down`, () => M.move(g.symbol, 1), { disabled: i === groups.length - 1 })))));
  };

  // --- the change log ---
  V.news = () => {
    if (!st.news) {
      st.news = [];
      EMA.text('data/changelog.md').then(t => {
        st.news = t.split('\n').map(l => l.trimEnd()).filter(l => l.trim() && !l.startsWith('# '));
        EMA.draw();
      }).catch(() => {
        st.news = ['The change log could not be read.'];
        EMA.draw();
      });
    }
    return h('div', { class: 'screen' }, U.subTop("What's new", () => go('home')),
      h('div', { class: 'body end', style: 'padding:0 20px 32px', 'data-keep': 'news' }, U.md(st.news, 'Version ')));
  };

  // --- one article: the full version with its figures is a web page beside the text file ---
  V.article = name => {
    const list = M.articles();
    if (!list) {
      M.loadArticles().then(EMA.draw);
      return h('div', { class: 'screen' }, U.subTop('Article', () => go('home')));
    }
    const a = list.find(x => x.name === name);
    const dark = M.dark();
    if (!st.article || st.article.name !== name || st.article.dark !== dark) {
      st.article = { name, dark, page: undefined };
      const mine = st.article;
      EMA.text(`articles/${name}.html`).then(t => {
        mine.page = t.replace('<html', `<html data-theme="${dark ? 'dark' : 'light'}"`);
      }).catch(() => {
        mine.page = null;
      }).then(() => {
        if (st.article === mine) EMA.draw();
      });
    }
    const top = U.subTop(a && a.number ? 'Article ' + a.number : 'Article', () => go('home'));
    if (!a) return h('div', { class: 'screen' }, top, h('div', { class: 'body' }, U.empty('This article is no longer in the app', 'Go back to see what there is to read.')));
    const page = st.article.page;
    // While the page is shown it is left alone: drawing it again would lose the reader's place.
    EMA.keep = `a:${name}:${dark}:${page === undefined ? 0 : 1}`;
    if (page === undefined) return h('div', { class: 'screen' }, top);
    if (page) {
      // The page runs in a sandbox: its own script draws the figures, and it cannot leave the article.
      return h('div', { class: 'screen' }, top, h('iframe', { class: 'reader', sandbox: 'allow-scripts', srcdoc: page }));
    }
    return h('div', { class: 'screen' }, top, h('div', { class: 'body end', style: 'padding:0 20px 40px' },
      h('div', { class: 't-headline-m' }, a.title),
      a.date ? h('div', { class: 't-title-s muted mt8' }, (a.number ? `No. ${a.number}  ·  ` : '') + C.niceDate(a.date, true)) : null,
      U.md(a.body)));
  };

  // --- adding an asset ---
  V.add = () => {
    const a = st.add || (st.add = { query: '', results: null, busy: false, failed: false, timer: 0, seq: 0 });
    const list = h('div', { class: 'body end', style: 'padding:8px 0 24px' });
    const trail = h('div', { class: 'trail' });
    const input = h('input', {
      id: 'q', type: 'text', value: a.query, placeholder: 'Search a name or symbol', autocapitalize: 'off', autocomplete: 'off',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search'
    });
    const pick = hit => {
      if (!M.has(hit.symbol)) M.add(hit.name, hit.symbol);
      go('d:' + hit.symbol);
    };
    const row = hit => h('div', { class: 'row', role: 'button', onclick: () => pick(hit) },
      h('div', { class: 'grow' }, h('div', { class: 't-body-l one-line', style: 'font-weight:500' }, hit.title || hit.name), h('div', { class: 't-body-m muted one-line' }, hit.detail)),
      h('div', { class: M.has(hit.symbol) ? 'up' : 'primary' }, U.icon(M.has(hit.symbol) ? 'check' : 'add')));
    const header = text => h('div', { class: 'listhead', style: 'margin:16px 16px 4px' }, text);
    const note = text => h('div', { class: 't-body-m muted', style: 'padding:16px' }, text);

    const fill = () => {
      const typed = a.query.trim();
      trail.replaceChildren(a.busy ? h('div', { class: 'spinner' }) : a.query ? U.iconBtn('close', 'Clear', () => {
        input.value = a.query = '';
        typedChanged();
        input.focus();
      }) : '');
      if (a.results == null) return list.replaceChildren(header('Popular'), ...EMA.catalog.popular.map(row));
      const kids = [];
      if (a.failed) kids.push(note("Search isn't reachable right now. Check your connection."));
      else if (!a.results.length && !a.busy) kids.push(note(`Nothing found for “${typed}”.`));
      // Series the app calculates itself are not in the search service: match them here.
      const low = typed.toLowerCase();
      for (const symbol of Object.keys(EMA.catalog.derived || {})) {
        const d = EMA.catalog.derived[symbol];
        if (d.name.toLowerCase().includes(low) || (d.words || '').includes(low)) kids.push(row({ symbol, name: d.name, detail: `Calculated · ${d.base} in ${d.currency}` }));
      }
      for (const hit of a.results) kids.push(row(hit));
      // A company that is about to list has no search result yet, but can still be watched.
      const symbol = typed.toUpperCase();
      if (!a.busy && !a.failed && !a.results.length && /^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
        kids.push(header('Not listed yet?'), row({ symbol, name: symbol, title: `Watch “${symbol}” anyway`, detail: 'You get an alert on its first trading day' }));
      }
      list.replaceChildren(...kids);
    };
    const typedChanged = () => {
      const typed = a.query.trim();
      clearTimeout(a.timer);
      a.failed = false;
      const seq = ++a.seq;
      if (!typed) {
        a.results = null;
        a.busy = false;
        return fill();
      }
      a.busy = true;
      fill();
      a.timer = setTimeout(async () => { // wait for a pause in typing
        let results = [], failed = false;
        try {
          results = await K.search(typed);
        } catch (e) {
          failed = true;
        }
        if (seq !== a.seq) return;
        Object.assign(a, { results, failed, busy: false });
        fill();
      }, 350);
    };
    input.addEventListener('input', () => {
      a.query = input.value;
      typedChanged();
    });
    fill();
    if (!a.opened) {
      a.opened = true;
      setTimeout(() => input.focus(), 60);
    }
    return h('div', { class: 'screen' }, U.subTop('Add asset', () => go('home')),
      h('div', { class: 'search' }, h('div', { class: 'lead' }, U.icon('search')), input, trail), list);
  };

  // --- the asset screen ---
  const stat = (label, value) => h('div', { class: 'stat' }, h('div', { class: 't-label-s muted' }, label || ' '), h('div', { class: 't-body-m one-line', style: 'font-weight:600' }, value || ' '));

  function priceHeader(q) {
    return [h('div', { class: 'hrow bottom', style: 'padding-top:4px' },
      h('div', { class: 't-display' }, C.money(q.price)),
      h('div', { class: 't-title-m muted', style: 'margin:0 0 6px 8px;font-weight:500' }, q.currency),
      q.change != null ? h('div', { class: 't-title-m ' + (q.change >= 0 ? 'up' : 'down'), style: 'margin:0 0 6px 12px;font-weight:500' }, C.signed(q.change)) : null),
    h('div', { class: 't-body-s muted', style: 'margin-bottom:16px' },
      q.live && q.at > 0 ? 'Delayed price · ' + C.stamp(q.at * 1000) : 'Close on ' + C.niceDate(q.closeDate, true))];
  }

  /** The latest session's open, high, low and volume, the previous close, and the 52-week range. From daily bars. */
  function daySummary(bars) {
    if (!bars || !C.full(bars)) return null;
    const n = bars.closes.length;
    const day = bars.day || { open: bars.opens[n - 1], high: bars.highs[n - 1], low: bars.lows[n - 1], volume: bars.volumes[n - 1] };
    const prev = bars.price != null ? bars.prev : (n >= 2 ? bars.closes[n - 2] : null);
    const year = Math.max(0, n - 252);
    const high52 = Math.max(Math.max(...bars.highs.slice(year)), day.high);
    const low52 = Math.min(Math.min(...bars.lows.slice(year)), day.low);
    return U.card({ style: 'margin-bottom:12px' },
      h('div', { class: 'hrow' }, stat('Open', C.money(day.open)), stat('High', C.money(day.high)), stat('Low', C.money(day.low)), stat('Prev close', prev == null ? '–' : C.money(prev))),
      h('div', { class: 'hrow mt12' }, stat('Volume', day.volume > 0 ? C.compact(day.volume) : '–'), stat('52-wk high', C.money(high52)), stat('52-wk low', C.money(low52)), stat('', '')));
  }

  function crossingRow(a, e, selected, showChoice, onPick) {
    const state = e ? e.state : null;
    const settled = state === 'above' || state === 'below';
    let title;
    if (a.kind === 'rsi' && e && e.emaFast != null && (settled || state === 'between')) {
      title = `RSI ${e.emaFast.toFixed(0)} · ` + (state === 'above' ? `above ${a.slow}` : state === 'below' ? `below ${a.fast}` : `between ${a.fast} and ${a.slow}`);
    } else if (a.kind === 'rsi') title = `RSI ${a.fast} / ${a.slow}`;
    else if (a.kind === 'macd') title = settled ? `MACD is ${state} its signal line` : `MACD ${a.fast} / ${a.slow}`;
    else title = settled ? `${C.label(a.fast)} is ${state} EMA ${a.slow}` : C.pairLabel(a.fast, a.slow);
    const closes = `${C.tfWord(a.tf)} closes`;
    const lead = a.tf === '1d' ? '' : closes[0].toUpperCase() + closes.slice(1) + ' · ';
    let sub;
    if (!e) sub = 'Loading…';
    else if (state === 'waiting') sub = 'Starts when the asset begins trading';
    else if (state === 'warming') sub = `Needs ${Math.max(1, e.need - e.bars)} more ${closes} before it can be tracked`;
    else if (e.crossDate && a.kind === 'rsi') sub = `${lead}Last ${e.crossUp ? 'rose above ' + a.slow : 'fell below ' + a.fast} on ${C.barDate(e.crossDate, a.tf)} · ${C.ago(e.crossDate)}`;
    else if (e.crossDate) sub = `${lead}Since ${C.barDate(e.crossDate, a.tf)} · ${C.ago(e.crossDate)}`;
    else sub = `${lead}No crossing in the price history`;
    return h('div', { class: 'card tight outlined hrow' + (selected && showChoice ? ' sel' : ''), role: showChoice ? 'button' : null, onclick: showChoice ? onPick : null },
      h('div', { class: 'dot ' + (!settled ? '' : state === 'above' ? 'up' : 'down') }, !settled ? '•' : state === 'above' ? '↑' : '↓'),
      h('div', { class: 'grow', style: 'margin-left:12px' },
        h('div', { class: 't-body-l', style: 'font-weight:600' }, title),
        h('div', { class: 't-body-s muted' }, a.muted ? 'Muted · ' + sub : sub),
        e && e.near && e.gap != null ? h('div', { class: 't-body-s primary' }, `Closing in: ${Math.abs(e.gap).toFixed(1)}% apart`) : null),
      h('button', {
        class: 'iconbtn ' + (a.muted ? 'muted' : 'primary'), style: a.muted ? 'opacity:.4' : null,
        'aria-label': a.muted ? 'Muted. Tap to get notifications again' : 'Notifications on. Tap to mute',
        onclick: ev => {
          ev.stopPropagation();
          M.toggleMute(a.id);
        }
      }, U.icon('bell')),
      showChoice ? h('div', { class: 't-label-m ' + (selected ? 'primary' : 'muted') }, selected ? 'On chart' : 'Show') : null);
  }

  /** What the price did after this pair's earlier crossings on this asset. Counts are always shown with the shares. */
  function trackRecord(bars, asset) {
    const crosses = C.crosses(asset, bars.closes);
    const record = C.trackRecord(bars.closes, crosses);
    const pct = v => C.signed(v * 100, 1);
    const kids = [];
    for (const up of [true, false]) {
      const total = crosses.filter(x => x.up === up).length;
      kids.push(h('div', { class: 't-body-l ' + (up ? 'up' : 'down'), style: `font-weight:600;margin:${up ? 0 : 14}px 0 4px` },
        `${up ? '↑' : '↓'} ${C.afterWord(asset, up)} · ${total} time${total === 1 ? '' : 's'}`));
      if (total === 0) {
        kids.push(h('div', { class: 't-body-m muted' }, 'Has not happened in the price history the app holds.'));
        continue;
      }
      for (const o of record[up ? 'up' : 'down']) {
        kids.push(h('div', { class: 'hrow t-body-m', style: 'padding:3px 0;align-items:flex-start' },
          h('div', { class: 'muted', style: 'width:104px;flex:none' }, `${o.bars} ${C.unit(asset.tf)} later`),
          h('div', { class: 'grow' }, o.count === 0 ? 'too recent to tell' : `higher ${o.higher} of ${o.count} · middle ${pct(o.median)} · worst ${pct(o.worst)}`)));
      }
    }
    kids.push(h('div', { class: 't-body-s muted mt12' },
      "What this asset's own price did after earlier crossings, in the history the app holds. " +
      'A handful of events proves little, and none of it says what happens next.'));
    return [h('div', { class: 'section' }, `How it went before · ${C.assetLabel(asset)}`), U.card(null, kids)];
  }

  function renameDialog(g) {
    const input = h('input', { id: 'rename', type: 'text', value: g.name, maxlength: 40, autocomplete: 'off' });
    U.dialog(close => ({
      title: 'Rename',
      body: h('label', { class: 'field' }, h('span', null, 'Name shown in the list and in alerts'), input),
      actions: [['Cancel', close], ['Save', () => {
        if (!input.value.trim()) return;
        close();
        M.rename(g.symbol, input.value);
      }]]
    }));
  }

  function removeDialog(g) {
    U.dialog(close => ({
      title: `Remove ${g.name}?`,
      body: h('div', { class: 't-body-m muted' }, 'You will stop getting alerts for it.'),
      actions: [['Keep', close], ['Remove', () => {
        close();
        M.remove(g.symbol);
        go('home');
      }, 'danger']]
    }));
  }

  function customDialog(g, frame) {
    const digits = e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
    };
    const fast = h('input', { id: 'fast', type: 'text', inputmode: 'numeric', oninput: digits });
    const slow = h('input', { id: 'slow', type: 'text', inputmode: 'numeric', oninput: digits });
    U.dialog(close => ({
      title: `Custom ${C.tfWord(frame)} crossing`,
      body: h('div', null,
        h('div', { class: 't-body-m muted' }, `Both count ${C.unit(frame)}. The slow EMA must be longer than the fast one, up to 400.`),
        h('div', { class: 'hrow gap mt12', style: 'align-items:flex-start' },
          h('label', { class: 'field grow' }, h('span', null, 'Fast EMA'), fast, h('small', null, '1 = price')),
          h('label', { class: 'field grow' }, h('span', null, 'Slow EMA'), slow, h('small', null, 'e.g. 21')))),
      actions: [['Cancel', close], ['Add crossing', () => {
        const f = parseInt(fast.value, 10), s = parseInt(slow.value, 10);
        if (!(f >= 1 && s > f && s <= 400)) return U.toast('The slow EMA must be longer than the fast one, up to 400.');
        close();
        if (!g.items.some(a => a.kind === 'ema' && a.fast === f && a.slow === s && a.tf === frame)) M.toggle(g.symbol, f, s, frame);
      }]]
    }));
  }

  V.detail = symbol => {
    const g = M.groups().find(x => x.symbol === symbol);
    if (!g) {
      setTimeout(() => go('home'), 0);
      return h('div', { class: 'screen' });
    }
    const d = st.detail[symbol] || (st.detail[symbol] = { selected: g.items[0].id, frame: '1d' });
    const asset = g.items.find(a => a.id === d.selected) || g.items[0];
    const quote = C.quoteOf(M.barsOf(symbol));
    const bars = M.barsOf(symbol, asset.tf);
    const has = bars && bars.closes.length >= 2;
    const waiting = g.items.some(a => (M.entryOf(a) || {}).state === 'waiting');
    const derived = (EMA.catalog.derived || {})[symbol];
    const cat = EMA.catalog;
    const kids = [];

    if (quote) kids.push(priceHeader(quote));
    if (derived) kids.push(h('div', { class: 't-body-s muted', style: 'margin-bottom:12px' }, derived.note));
    if (M.settings.details) kids.push(daySummary(M.barsOf(symbol)));
    if (has) {
      const key = symbol + '|' + asset.tf;
      kids.push(EMA.chart(bars, asset, st.charts[key] || (st.charts[key] = {})));
    } else {
      kids.push(U.card(null, waiting
        ? U.empty('Not trading yet', `No prices exist for ${symbol}. You'll get an alert on its first trading day, and the chart starts then.`)
        : U.empty(`Loading ${C.tfWord(asset.tf)} prices…`, 'If nothing appears, go back and pull down on the watchlist to refresh.')));
    }

    // The chart above changes height with the crossing shown, so the list is held where it was under the finger.
    const listTop = () => {
      const el = document.getElementById('crossings');
      return el ? el.getBoundingClientRect().top : null;
    };
    kids.push(h('div', { class: 'section', id: 'crossings' }, 'Crossings you are alerted on'),
      h('div', { class: 'list tight' }, g.items.map(a => crossingRow(a, M.entryOf(a), a.id === asset.id, g.items.length > 1, () => {
        const before = listTop();
        d.selected = a.id;
        EMA.draw();
        const after = listTop();
        const body = document.querySelector('[data-keep]');
        if (before != null && after != null && body) body.scrollTop += after - before;
      }))));
    if (has) kids.push(trackRecord(bars, asset));

    const mine = g.items.filter(a => a.tf === d.frame && a.kind === 'ema');
    const shown = cat.presets.concat(mine.map(a => [a.fast, a.slow]).filter(p => !cat.presets.some(q => q[0] === p[0] && q[1] === p[1])));
    kids.push(h('div', { class: 'section' }, 'Add or remove crossings'),
      U.seg(cat.frames, d.frame, frame => {
        d.frame = frame;
        EMA.draw();
      }),
      h('div', { class: 'wrapflow mt8' },
        shown.map(p => U.chip(C.pairLabel(p[0], p[1]), mine.some(a => a.fast === p[0] && a.slow === p[1]), () => M.toggle(symbol, p[0], p[1], d.frame))),
        U.chip('Custom', false, () => customDialog(g, d.frame), 'add')),
      h('div', { class: 'wrapflow mt8' }, cat.indicators.map(([kind, lo, hi]) => U.chip(kind === 'rsi' ? `RSI ${lo} / ${hi}` : `MACD ${lo} / ${hi}`,
        g.items.some(a => a.tf === d.frame && a.kind === kind && a.fast === lo && a.slow === hi), () => M.toggle(symbol, lo, hi, d.frame, kind)))),
      h('div', { class: 't-body-s muted mt8' }, 'RSI alerts when the 14-bar RSI rises above 70 or falls below 30. MACD alerts when the MACD line crosses its signal line.'),
      h('div', { class: 't-body-s muted mt8' }, d.frame === '1wk' ? "Weekly crossings use each week's final close. They are slower and give fewer false signals."
        : d.frame === '1h' ? 'Hourly crossings use each finished hour of regular trading, and are checked about once an hour.'
          : 'EMA 50 / 200 is the classic golden cross and death cross. "Price / EMA" alerts when the closing price itself crosses that average.'));

    if (has) {
      const crosses = C.crosses(asset, bars.closes);
      kids.push(h('div', { class: 'section' }, `Past crossings · ${C.assetLabel(asset)}`),
        U.card({ style: 'padding:6px 16px' },
          crosses.length ? null : h('div', { class: 't-body-m muted', style: 'padding:10px 0' }, 'No crossing in the price history available.'),
          crosses.slice(-8).reverse().map(c => h('div', { class: 'hrow', style: 'padding:10px 0' },
            h('div', { class: c.up ? 'up' : 'down', style: 'width:24px;font-weight:700' }, c.up ? '↑' : '↓'),
            h('div', { class: 'grow' }, h('div', { class: 't-body-m' }, C.eventWord(asset, c.up)), h('div', { class: 't-body-s muted' }, C.barDate(bars.dates[c.index], asset.tf))),
            h('div', { class: 't-body-m', style: 'font-weight:500' }, C.money(bars.closes[c.index]))))));
    }
    return h('div', { class: 'screen' },
      U.subTop(g.name, () => go('home'), g.symbol, [U.iconBtn('edit', 'Rename', () => renameDialog(g)), U.iconBtn('delete', 'Remove asset', () => removeDialog(g))]),
      h('div', { class: 'body end', style: 'padding-bottom:calc(32px + var(--ib))', 'data-keep': 'd:' + symbol }, kids));
  };

  // --- choosing the assets of a home-screen widget ---
  V.widget = () => {
    const info = host.info.widgetSetup;
    const single = info.kind === 'one';
    const assets = M.groups();
    if (!st.widget) {
      const saved = S.widgetSymbols(info.id).filter(s => assets.some(g => g.symbol === s));
      st.widget = new Set(single ? (saved.length ? saved.slice(0, 1) : assets.slice(0, 1).map(g => g.symbol)) : saved);
    }
    const chosen = st.widget;
    const tick = (on, round) => h('div', { class: 'check' + (round ? ' round' : '') + (on ? ' on' : '') }, on && !round ? U.icon('check', 16) : null);
    const line = (title, sub, on, onClick) => h('div', { class: 'row', role: 'button', onclick: onClick }, tick(on, single),
      h('div', { class: 'grow' }, h('div', { class: 't-body-l one-line', style: 'font-weight:500' }, title), h('div', { class: 't-body-m muted one-line' }, sub)));
    const rows = [];
    if (!single) {
      rows.push(line('Every asset', 'Follows your watchlist as it changes', chosen.size === 0, () => {
        chosen.clear();
        EMA.draw();
      }));
    }
    if (!assets.length) rows.push(h('div', { class: 't-body-m muted', style: 'padding:16px' }, 'Your watchlist is empty. Open the app to add assets.'));
    for (const g of assets) {
      rows.push(line(g.name, g.symbol, chosen.has(g.symbol), () => {
        if (single) {
          chosen.clear();
          chosen.add(g.symbol);
        } else if (chosen.has(g.symbol)) chosen.delete(g.symbol); else chosen.add(g.symbol);
        EMA.draw();
      }));
    }
    return h('div', { class: 'screen' },
      h('div', { class: 'top' }, h('div', { class: 'titles' }, h('div', { class: 't-title-l' }, single ? 'Choose an asset' : 'Choose assets'))),
      h('div', { class: 't-body-m muted', style: 'padding:8px 16px' }, single ? 'This widget shows one asset.' : 'This widget shows only the assets you tick. Each widget keeps its own list.'),
      h('div', { class: 'body', style: 'padding:0 0 16px', 'data-keep': 'widget' }, rows),
      h('div', { style: 'padding:16px 16px calc(16px + var(--ib))' }, h('button', {
        class: 'btn', style: 'width:100%', disabled: single && chosen.size === 0, onclick: () => {
          S.setWidgetSymbols(info.id, assets.map(g => g.symbol).filter(s => chosen.has(s)));
          K.widgets();
          host.finish(true);
        }
      }, 'Done')));
  };

  EMA.screens = V;
})(window.EMA);
