'use strict';
// Start-up of the app on screen: which screen is showing, drawing it, and reacting to what the engine reports.
(function (EMA) {
  const host = EMA.host, U = EMA.ui, M = EMA.model, K = EMA.check, V = EMA.screens;
  let route = 'home'; // "home", "add", "order", "news", "a:<article>", "d:<symbol>" or "widget" ("scan" opens the Scan tab)
  let drawn = null;

  const view = () => route === 'widget' ? V.widget() : route === 'add' ? V.add() : route === 'order' ? V.order() : route === 'news' ? V.news()
    : route.startsWith('a:') ? V.article(route.slice(2)) : route.startsWith('d:') ? V.detail(route.slice(2)) : V.home();

  // --- holding the screen still ---
  // Every change draws the whole screen again. Whatever was tapped is put back exactly where it was,
  // so the page never moves under the finger, whatever grew or shrank above it.
  let tap = null; // {keep, chain: [{path, tag, top}] from the tapped element up to the scrolling body, at}
  const pathOf = (el, body) => {
    const path = [];
    while (el && el !== body) {
      const parent = el.parentElement;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.children, el));
      el = parent;
    }
    return el === body ? path : null;
  };
  const follow = (body, path) => {
    let el = body;
    for (const i of path) {
      el = el.children[i];
      if (!el) return null;
    }
    return el;
  };
  document.addEventListener('click', e => {
    const target = e.target instanceof Element ? e.target : null;
    const body = target && target.closest('[data-keep]');
    tap = null;
    if (!body) return;
    const chain = [];
    for (let el = target; el && el !== body; el = el.parentElement) {
      const path = pathOf(el, body);
      if (path) chain.push({ path, tag: el.tagName, top: el.getBoundingClientRect().top });
    }
    if (chain.length) tap = { keep: body.dataset.keep, chain, at: Date.now() };
  }, true);
  // Once the user moves the page themself, nothing is put back.
  const forget = () => {
    tap = null;
  };
  document.addEventListener('touchmove', forget, { capture: true, passive: true });
  document.addEventListener('wheel', forget, { capture: true, passive: true });

  function holdStill(root) {
    if (!tap || Date.now() - tap.at > 2500) return;
    for (const body of root.querySelectorAll('[data-keep]')) {
      if (body.dataset.keep !== tap.keep) continue;
      for (const link of tap.chain) {
        const el = follow(body, link.path);
        if (!el || el.tagName !== link.tag) continue;
        body.scrollTop += el.getBoundingClientRect().top - link.top;
        return;
      }
    }
  }

  /** Puts the present state on the screen, keeping scroll positions and the field being typed in. */
  EMA.draw = () => {
    const root = document.getElementById('app');
    const scroll = {};
    root.querySelectorAll('[data-keep]').forEach(el => {
      scroll[el.dataset.keep] = el.scrollTop;
    });
    const sideways = Array.from(root.querySelectorAll('.scroller')).map(el => el.scrollLeft);
    const was = drawn;
    const active = document.activeElement;
    const focus = active && active.id && root.contains(active) ? { id: active.id, a: active.selectionStart, b: active.selectionEnd } : null;
    const before = EMA.keep;
    EMA.keep = null;
    EMA.afterDraw = []; // work that needs the screen in place (the chart measuring itself), done before scroll is put back
    const screen = view();
    const jobs = EMA.afterDraw;
    EMA.afterDraw = null;
    // A screen that asks to be left alone (an article being read) is not replaced by an identical one.
    if (EMA.keep && EMA.keep === before && drawn === route) return;
    if (drawn === route + '/' + V.state.tab) screen.style.animation = 'none';
    drawn = route + '/' + V.state.tab;
    root.replaceChildren(screen);
    jobs.forEach(job => job());
    root.querySelectorAll('[data-keep]').forEach(el => {
      if (scroll[el.dataset.keep]) el.scrollTop = scroll[el.dataset.keep];
    });
    if (was === drawn) {
      root.querySelectorAll('.scroller').forEach((el, i) => {
        if (sideways[i]) el.scrollLeft = sideways[i];
      });
      holdStill(root);
    }
    if (focus) {
      const again = document.getElementById(focus.id);
      if (again) {
        again.focus();
        try {
          again.setSelectionRange(focus.a, focus.b);
        } catch (e) {
          // not every kind of field has a text cursor
        }
      }
    }
  };

  EMA.go = next => {
    if (next === 'scan') { // the Scan tab, from a scan notification
      V.state.tab = V.SCAN;
      next = 'home';
    }
    if (next.startsWith('d:') && !M.has(next.slice(2))) next = 'home';
    U.closeAll();
    if (next === 'add') V.state.add = null;
    route = next;
    EMA.draw();
  };

  /** The phone's Back: close a dialog, else go back one screen. False when there is nothing to go back to. */
  EMA.back = () => {
    if (U.closeTop()) return true;
    if (route === 'widget') {
      host.finish(false);
      return true;
    }
    if (route !== 'home') {
      EMA.go('home');
      return true;
    }
    return false;
  };

  EMA.theme = () => {
    const dark = M.dark();
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    host.ui({ dark });
  };

  /** Top bar, bottom bar and keyboard heights, so that nothing sits under them. */
  function insets(v) {
    const root = document.documentElement;
    const [top, bottom, keyboard] = v || [0, 0, 0];
    root.style.setProperty('--it', top + 'px');
    root.style.setProperty('--ib', (keyboard > 0 ? 0 : bottom) + 'px');
    root.style.setProperty('--ime', keyboard + 'px');
    root.classList.toggle('kb', keyboard > 0);
  }

  /** Reads the bars' heights from the engine again. */
  function syncInsets() {
    const i = host.freshInfo().insets;
    insets(Array.isArray(i) ? i : host.info.insets);
  }

  const stale = () => Date.now() - M.lastChecked > 30 * 60000;

  host.on((topic, data) => {
    if (topic === 'insets') insets(data);
    else if (topic === 'open') EMA.go(data);
    else if (topic === 'config') {
      host.info.dark = !!(data && data.dark);
      EMA.theme();
      EMA.draw();
    } else if (topic === 'checked') {
      // The background check finished while the app was open.
      if (!M.checking) {
        M.reload();
        EMA.draw();
      }
    } else if (topic === 'scanned') {
      // A background scan finished while the app was open.
      if (!M.scan.running) M.reloadScan();
    } else if (topic === 'resume') {
      M.reloadScan();
      syncInsets();
      M.reload();
      EMA.draw();
      if (M.assets.length && stale()) M.refresh(true);
    }
  });

  (async () => {
    try {
      await EMA.boot();
    } catch (e) {
      host.log('start failed: ' + e);
      document.getElementById('app').textContent = 'EMA Crossing could not start: ' + e.message;
      return;
    }
    syncInsets();
    // Some phones report the bars' heights only after the page has started, and that first report can be missed:
    // ask again a few times, so the app never sits under the phone's own buttons.
    for (const ms of [300, 1000, 3000]) setTimeout(syncInsets, ms);
    M.reload();
    EMA.theme();
    if (host.info.widgetSetup) route = 'widget';
    else if (host.info.route === 'scan') V.state.tab = V.SCAN;
    else if (host.info.route && (!host.info.route.startsWith('d:') || M.has(host.info.route.slice(2)))) route = host.info.route;
    EMA.draw();
    host.ready();
    if (route === 'widget') return;

    K.schedule();
    EMA.scan.schedule();
    const flash = host.get('flash', null);
    if (flash) {
      host.remove('flash');
      U.toast(flash);
    }
    if (!M.allowed) M.askNotifications(false);
    const idle = Date.now() - M.lastChecked;
    if (M.lastChecked && idle >= 12 * 3600000) {
      M.staleHours = Math.floor(idle / 3600000);
      EMA.draw();
    }
    const bars = Array.from(M.bars.values());
    if (M.assets.length && (stale() || !bars.some(b => b.price != null) || bars.some(b => !EMA.core.full(b)))) M.refresh(true);
    if (M.settings.updateUrl && Date.now() - (M.update.checked || 0) > 6 * 3600000) M.checkUpdates(true);
  })();
})(window.EMA);
