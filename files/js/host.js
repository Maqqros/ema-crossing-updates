'use strict';
// The pack's side of the bridge to the engine. The engine offers `Host` (see docs/ENGINE.md); this wraps it
// so that the rest of the pack deals in values, not text, and gets answers to slow calls as promises.
window.EMA = window.EMA || {};
(function (EMA) {
  const H = window.Host;
  const waiting = new Map();
  const listeners = [];
  let next = 1;

  // The engine answers a slow call here.
  window.__native = (id, text) => {
    const done = waiting.get(id);
    if (!done) return;
    waiting.delete(id);
    let answer;
    try {
      answer = JSON.parse(text);
    } catch (e) {
      answer = { ok: false, error: 'The engine gave an answer that could not be read' };
    }
    done(answer);
  };
  // The engine, or another running copy of the pack, reports that something happened.
  window.__event = (topic, data) => {
    for (const f of listeners.slice()) {
      try {
        f(topic, data);
      } catch (e) {
        H.log('event ' + topic + ': ' + e);
      }
    }
  };

  const json = (text, fallback) => {
    if (text == null) return fallback;
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  };

  EMA.host = {
    /** What the engine says about itself: {api, shellCode, shellName, pack, packName, sdk, dark, foreground, job, route, insets, widgetSetup}. */
    info: json(H.info(), {}),
    /** The engine's info as it is now (`info` is read once, at start). */
    freshInfo: () => json(H.info(), {}),
    get: (key, fallback = null) => json(H.get(key), fallback),
    /** A kept value as the text it is stored as, or null. */
    raw: key => H.get(key),
    set: (key, value) => H.set(key, JSON.stringify(value)),
    remove: key => H.remove(key),
    keys: prefix => json(H.keys(prefix), []),
    legacy: () => json(H.legacy(), {}),
    legacyClear: () => H.legacyClear(),
    /** A slow call ("http", "updatePack", "installEngine", "saveFile", "pickFile", "shareFile", "askNotifications"). Never rejects: look at `ok`. */
    call: (name, args) => new Promise(done => {
      const id = next++;
      waiting.set(id, done);
      H.call(id, name, JSON.stringify(args || {}));
    }),
    on: f => listeners.push(f),
    notificationsAllowed: () => H.notificationsAllowed() === 'true',
    notify: o => H.notify(JSON.stringify(o)),
    cancelNotification: tag => H.cancelNotification(tag),
    schedule: o => H.schedule(JSON.stringify(o)),
    cancel: name => H.cancel(name),
    lock: name => H.lock(name) === 'true',
    unlock: name => H.unlock(name),
    emit: topic => H.emit(topic),
    widgets: () => json(H.widgets(), []),
    setWidget: (id, spec) => H.setWidget(id, JSON.stringify(spec)),
    enableWidget: (kind, on) => H.enableWidget(kind, !!on),
    open: what => H.open(what),
    ui: o => H.ui(JSON.stringify(o)),
    haptic: () => H.haptic(),
    share: text => H.share(text),
    copy: text => H.copy(text),
    ready: () => H.ready(),
    done: result => H.done(result),
    reload: () => H.reload(),
    finish: ok => H.finish(!!ok),
    log: text => H.log(String(text))
  };
})(window.EMA);
