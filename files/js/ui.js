'use strict';
// The small building blocks every screen is made of: elements, icons, buttons, dialogs and the short notes
// at the bottom of the screen.
(function (EMA) {
  const U = {};

  /** Makes an element. `props`: class, style, html, on<event>, or any attribute; null and false are skipped. */
  U.h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const k of Object.keys(props || {})) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = kid => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  };
  const h = U.h;

  const ICONS = {
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    move: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
    more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    refresh: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    search: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
    info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
    down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z'
  };
  U.icon = (name, size = 24) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('class', 'icon');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name] || '');
    svg.appendChild(path);
    return svg;
  };

  U.btn = (label, onClick, kind = '', disabled = false) => h('button', { class: 'btn ' + kind, onclick: onClick, disabled }, label);
  U.iconBtn = (name, label, onClick, more = {}) => h('button', Object.assign({ class: 'iconbtn', 'aria-label': label, onclick: onClick }, more), U.icon(name));
  U.chip = (label, on, onClick, icon) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: onClick }, icon ? U.icon(icon, 18) : (on ? U.icon('check', 18) : null), label);
  U.pill = (text, kind = '') => h('span', { class: 'pill ' + kind }, text);
  U.card = (props, ...kids) => h('div', Object.assign({}, props, { class: 'card ' + ((props && props.class) || '') }), ...kids);

  /** One choice out of a few, as a row of joined buttons. `options` is [[value, label]]. */
  U.seg = (options, current, onPick) => h('div', { class: 'seg' },
    options.map(o => h('button', { class: o[0] === current ? 'on' : '', onclick: () => onPick(o[0]) }, o[1])));

  /** A line with a title, an explanation and a switch. */
  U.switchRow = (title, sub, on, onToggle) => h('div', { class: 'hrow', role: 'switch', 'aria-checked': String(on), onclick: () => onToggle(!on) },
    h('div', { class: 'grow' }, h('div', { class: 't-body-l' }, title), h('div', { class: 't-body-s muted' }, sub)),
    h('div', { class: 'switch' + (on ? ' on' : '') }));

  U.empty = (title, body, action) => h('div', { class: 'empty' },
    h('div', { class: 't-title-m' }, title), h('div', { class: 't-body-m muted mt6' }, body), action ? h('div', { class: 'mt16' }, action) : null);

  /** The top bar of a screen that has a back arrow. */
  U.subTop = (title, onBack, sub, actions) => h('div', { class: 'top sub' },
    U.iconBtn('back', 'Back', onBack),
    h('div', { class: 'titles' }, h('div', { class: 't-title-l one-line' }, title), sub ? h('div', { class: 't-body-s muted' }, sub) : null),
    actions || null);

  // --- short notes at the bottom ---
  let snackTimer = 0;
  U.toast = text => {
    const box = document.getElementById('snack');
    box.replaceChildren(h('div', null, text));
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => box.replaceChildren(), 4000);
  };

  // --- dialogs and menus: they live above the screen, and Back closes the top one ---
  const layers = [];
  const layerRoot = () => document.getElementById('layer');
  const closeLayer = el => {
    const i = layers.indexOf(el);
    if (i >= 0) layers.splice(i, 1);
    el.remove();
  };
  U.closeTop = () => {
    if (!layers.length) return false;
    closeLayer(layers[layers.length - 1]);
    return true;
  };
  U.closeAll = () => {
    while (layers.length) closeLayer(layers[layers.length - 1]);
  };

  /** `build(close)` returns {title, body, actions}; each action is [label, onClick, kind, disabled]. Returns a function that redraws it. */
  U.dialog = build => {
    const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) closeLayer(scrim); } });
    const close = () => closeLayer(scrim);
    const draw = () => {
      const d = build(close, draw);
      const focused = document.activeElement && document.activeElement.id;
      scrim.replaceChildren(h('div', { class: 'dialog' },
        h('div', { class: 't-headline', style: 'font-weight:400' }, d.title),
        h('div', { class: 'mt16' }, d.body),
        h('div', { class: 'actions' }, d.actions.map(a => U.btn(a[0], a[1], 'text ' + (a[2] || ''), !!a[3])))));
      if (focused) {
        const again = document.getElementById(focused);
        if (again) again.focus();
      }
    };
    draw();
    layers.push(scrim);
    layerRoot().appendChild(scrim);
    const first = scrim.querySelector('input');
    if (first) {
      first.focus();
      first.select();
    }
    return draw;
  };

  /** A small menu under `anchor`. `items` is [[label, onClick]]. */
  U.menu = (anchor, items) => {
    const r = anchor.getBoundingClientRect();
    const holder = h('div', { class: 'menuscrim', onclick: () => closeLayer(holder) },
      h('div', { class: 'menu', style: `top:${Math.round(r.bottom - 8)}px;right:${Math.round(window.innerWidth - r.right + 8)}px` },
        items.map(i => h('button', { onclick: i[1] }, i[0]))));
    layers.push(holder);
    layerRoot().appendChild(holder);
  };

  /** The simple Markdown of the change log and of an article's text version: headings, bullets, paragraphs, bold. */
  U.md = (lines, headingPrefix = '') => {
    const inline = text => {
      const out = [];
      text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '').split('**').forEach((part, i) => out.push(i % 2 === 1 ? h('b', null, part) : part));
      return out;
    };
    return h('div', { class: 'md' }, lines.map(line => {
      if (line.startsWith('## ')) return h('h2', null, headingPrefix + line.slice(3));
      if (line.startsWith('- ')) return h('li', null, inline(line.slice(2)));
      // A short line on its own ("Added", "Changed") labels the bullets under it.
      if (line.length <= 24 && !line.endsWith('.')) return h('h3', null, line);
      return h('p', null, inline(line));
    }));
  };

  /** The colour behind a name in the style sheet, for drawing on a canvas. */
  U.color = name => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();

  /** A canvas ready to draw on in screen units, or null while it has no size yet. */
  U.pen = cv => {
    const w = cv.clientWidth, hgt = cv.clientHeight;
    if (!w || !hgt) return null;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(hgt * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    return { ctx, w, h: hgt };
  };

  /** The small trend line on a watchlist card. */
  U.spark = (values, up) => {
    const cv = h('canvas', { class: 'spark' });
    const draw = () => {
      const p = U.pen(cv);
      if (!p || values.length < 2) return;
      const lo = Math.min(...values), hi = Math.max(...values);
      const span = hi > lo ? hi - lo : 1;
      const inset = 2;
      const y = v => inset + (hi - v) / span * (p.h - 2 * inset);
      const ctx = p.ctx;
      ctx.strokeStyle = ctx.fillStyle = U.color(up ? 'up' : 'down');
      ctx.lineWidth = 1.75;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = i * (p.w - 3) / (values.length - 1);
        if (i === 0) ctx.moveTo(x, y(v)); else ctx.lineTo(x, y(v));
      });
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.w - 3, y(values[values.length - 1]), 2.5, 0, Math.PI * 2);
      ctx.fill();
    };
    requestAnimationFrame(draw);
    return cv;
  };

  EMA.ui = U;
})(window.EMA);
