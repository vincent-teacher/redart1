/* 楊梅高中紅土藝術空間 — 前端程式（資料來自 data/exhibitions.js，由 tools/build.py 產生） */
(() => {
'use strict';

const DATA = (window.HONGTU || []).slice();
const BY_ID = Object.fromEntries(DATA.map(e => [e.id, e]));
const KIND_ICON = { '海報': 'i-poster', '邀請卡': 'i-invite', '小卡': 'i-card' };
const KIND_GRAD = { '海報': 'linear-gradient(135deg,#9c65b9,#e8364a)', '邀請卡': 'linear-gradient(135deg,#f4b63c,#c9573f)', '小卡': 'linear-gradient(135deg,#20a99a,#3d95dd)' };
const CAT_COLOR = { '個展': '#9c65b9', '聯展': '#3d95dd', '班級展': '#20a99a', '校友展': '#f08a24', '主題特展': '#e8364a', '講座': '#6cb94a' };
const RAINBOW = ['#9c65b9', '#e8364a', '#f4b63c', '#20a99a', '#3d95dd', '#c9573f', '#f38bb8', '#6cb94a'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const ad = y => y + 1911;
const yearLabel = y => `民國 ${y} 年`;
const app = $('#app');

/* ---------- 儲存（localStorage 失敗時仍可運作） ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('hongtu.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hongtu.' + k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } }
};
const settings = Object.assign({ font: 18, sound: true, vol: 60, music: false, anim: true, petals: true, theme: 'plum', view: 'grid' }, store.get('settings', {}));
let favs = store.get('favs', []);
let visited = store.get('visited', {});
let counters = store.get('counters', { search: 0, tour: 0, wins: 0, flips: 0 });
const saveSettings = () => store.set('settings', settings);
const bump = k => { counters[k] = (counters[k] || 0) + 1; store.set('counters', counters); };

/* ---------- 音效（Web Audio 合成，不需外部檔案） ---------- */
const Sound = (() => {
  let ctx, master, musicGain, musicTimer;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = settings.vol / 100;
    return ctx;
  };
  const tone = (freq, dur = .15, type = 'sine', vol = .25, when = 0, dest) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + .05);
    return o;
  };
  const noise = (dur = .3, vol = .15, f0 = 800, f1 = 3000) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.value = vol;
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t);
  };
  const fx = {
    click: () => tone(880, .08, 'triangle', .18),
    tick: () => tone(1500, .03, 'sine', .05),
    page: () => { tone(523, .12, 'sine', .14); tone(784, .18, 'sine', .12, .06); },
    open: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .12, i * .05)),
    flip: () => noise(.28, .22, 600, 4000),
    fav: () => [784, 988, 1319].forEach((f, i) => tone(f, .35, 'sine', .15, i * .07)),
    unfav: () => { tone(600, .12, 'sine', .14); tone(420, .2, 'sine', .12, .08); },
    match: () => [659, 880, 1175].forEach((f, i) => tone(f, .3, 'triangle', .16, i * .08)),
    miss: () => { tone(300, .15, 'square', .06); tone(240, .22, 'square', .06, .1); },
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, .4, 'triangle', .16, i * .11)),
    search: () => { tone(1200, .06, 'sine', .1); tone(1600, .1, 'sine', .08, .05); },
    dice: () => { for (let i = 0; i < 8; i++) tone(400 + Math.random() * 800, .05, 'square', .04, i * .06); },
    whoosh: () => noise(.5, .12, 300, 1800),
    zoom: up => tone(up ? 700 : 500, .07, 'sine', .1)
  };
  // 輕柔環境音：五聲音階隨機撥弦
  const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784];
  const startMusic = () => {
    const c = ensure(); if (!c || musicTimer) return;
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.linearRampToValueAtTime(.5, c.currentTime + 2);
    const loop = () => {
      const f = scale[Math.floor(Math.random() * scale.length)];
      tone(f, 2.8, 'sine', .08, 0, musicGain);
      tone(f / 2, 3.5, 'triangle', .03, 0, musicGain);
      if (Math.random() < .35) tone(f * 1.5, 2.2, 'sine', .04, .4, musicGain);
      musicTimer = setTimeout(loop, 900 + Math.random() * 1300);
    };
    loop();
  };
  const stopMusic = () => {
    clearTimeout(musicTimer); musicTimer = null;
    if (ctx) musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + .5);
  };
  return {
    play(name, arg) { if (!settings.sound) return; try { fx[name] && fx[name](arg); } catch (e) { /* 忽略 */ } },
    startMusic, stopMusic, setVol() { if (master) master.gain.value = settings.vol / 100; }
  };
})();
const sfx = (n, a) => Sound.play(n, a);

/* ---------- 共用工具 ---------- */
function toast(msg, ic = 'i-plum') {
  const t = $('#toast');
  t.innerHTML = icon(ic) + '<span>' + esc(msg) + '</span>';
  t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
const coverOf = e => e.items.find(i => i.id === e.cover) || e.items[0];
const isLandscape = it => it.w > it.h * 1.05;
const kinds = e => { const k = {}; e.items.forEach(i => { k[i.kind] = (k[i.kind] || 0) + 1; }); return k; };
const kindIcons = e => Object.entries(kinds(e)).map(([k, n]) => `<span title="${k} ${n} 張">${icon(KIND_ICON[k])}${n}</span>`).join('');
const isFav = id => favs.includes(id);
function toggleFav(id) {
  if (isFav(id)) { favs = favs.filter(x => x !== id); sfx('unfav'); toast('已從收藏移除', 'i-heart-o'); }
  else { favs.push(id); sfx('fav'); toast('已加入我的收藏！', 'i-heart'); burst(); }
  store.set('favs', favs);
  $$(`[data-fav="${id}"]`).forEach(b => {
    const on = isFav(id);
    b.classList.toggle('fav-on', on);
    const u = b.querySelector('use'); if (u) u.setAttribute('href', on ? '#i-heart' : '#i-heart-o');
    const s = b.querySelector('span'); if (s) s.textContent = on ? '已收藏' : '加入收藏';
  });
}
function markVisited(id) { visited[id] = (visited[id] || 0) + 1; store.set('visited', visited); }
function norm(s) {
  return String(s || '').toLowerCase().replace(/臺/g, '台').replace(/[\s　·•.,，、。:：;；!！?？\-—_()（）「」『』【】\[\]\/|+＋~～"'“”]/g, '');
}
function hlRegex(q) {
  const terms = q.split(/\s+/).filter(Boolean).map(t => [...t.replace(/臺/g, '台')].map(ch => {
    const c = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return c === '台' ? '[台臺]' : c;
  }).join('[\\s·.]*'));
  return terms.length ? new RegExp('(' + terms.join('|') + ')', 'gi') : null;
}
function highlight(text, re) { const t = esc(text); return re ? t.replace(re, '<mark>$1</mark>') : t; }
const years = [...new Set(DATA.map(e => e.year))].sort((a, b) => b - a);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- 設定 ---------- */
function applySettings() {
  document.documentElement.style.setProperty('--fs', settings.font + 'px');
  document.documentElement.dataset.theme = settings.theme;
  document.body.classList.toggle('no-anim', !settings.anim);
  const bs = $('#btn-sound use'); bs.setAttribute('href', settings.sound ? '#i-sound' : '#i-mute');
  $$('#set-font button').forEach(b => b.classList.toggle('on', +b.dataset.v === settings.font));
  $$('#set-theme button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.theme));
  $('#set-sound').checked = settings.sound; $('#set-vol').value = settings.vol;
  $('#set-music').checked = settings.music; $('#set-anim').checked = settings.anim; $('#set-petals').checked = settings.petals;
  Petals.toggle(settings.petals && settings.anim);
  Sound.setVol();
}
function openSettings(open) {
  $('#settings').hidden = !open; $('#drawer-mask').hidden = !open;
  if (open) sfx('whoosh');
}
function bindSettings() {
  $('#btn-settings').onclick = () => openSettings(true);
  $('#settings-close').onclick = $('#drawer-mask').onclick = () => openSettings(false);
  $('#btn-sound').onclick = () => { settings.sound = !settings.sound; saveSettings(); applySettings(); sfx('click'); toast(settings.sound ? '音效已開啟' : '音效已關閉', settings.sound ? 'i-sound' : 'i-mute'); };
  $$('#set-font button').forEach(b => b.onclick = () => { settings.font = +b.dataset.v; saveSettings(); applySettings(); sfx('click'); });
  $$('#set-theme button').forEach(b => b.onclick = () => { settings.theme = b.dataset.v; saveSettings(); applySettings(); sfx('page'); });
  $('#set-sound').onchange = e => { settings.sound = e.target.checked; saveSettings(); applySettings(); sfx('click'); };
  $('#set-vol').oninput = e => { settings.vol = +e.target.value; saveSettings(); Sound.setVol(); };
  $('#set-vol').onchange = () => sfx('click');
  $('#set-music').onchange = e => { settings.music = e.target.checked; saveSettings(); settings.music ? Sound.startMusic() : Sound.stopMusic(); };
  $('#set-anim').onchange = e => { settings.anim = e.target.checked; saveSettings(); applySettings(); };
  $('#set-petals').onchange = e => { settings.petals = e.target.checked; saveSettings(); applySettings(); };
  $('#set-reset').onclick = () => {
    if (!confirm('確定要清除收藏與瀏覽紀錄嗎？')) return;
    favs = []; visited = {}; counters = { search: 0, tour: 0, wins: 0, flips: 0 };
    store.set('favs', favs); store.set('visited', visited); store.set('counters', counters);
    toast('紀錄已清除'); route();
  };
}

/* ---------- 飄落梅花 ---------- */
const Petals = (() => {
  const cv = $('#petals'), cx = cv.getContext('2d');
  let ps = [], on = false, raf, W, H;
  const cols = ['#f6b3c9', '#d7b4ea', '#ffd1d6', '#ffffff', '#f7c9a9'];
  const resize = () => { W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; };
  const mk = (top) => ({ x: Math.random() * W, y: top ? -20 : Math.random() * H, r: (5 + Math.random() * 7) * devicePixelRatio, vy: (.3 + Math.random() * .7) * devicePixelRatio, vx: (Math.random() - .5) * .6, a: Math.random() * 6.28, va: (Math.random() - .5) * .03, sw: Math.random() * 6.28, c: cols[Math.floor(Math.random() * cols.length)], o: .45 + Math.random() * .4 });
  const flower = p => {
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.globalAlpha = p.o; cx.fillStyle = p.c;
    for (let i = 0; i < 5; i++) { cx.beginPath(); cx.ellipse(0, -p.r * .6, p.r * .45, p.r * .6, 0, 0, 6.28); cx.fill(); cx.rotate(1.2566); }
    cx.fillStyle = '#ffe27a'; cx.beginPath(); cx.arc(0, 0, p.r * .22, 0, 6.28); cx.fill(); cx.restore();
  };
  const step = () => {
    cx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.sw += .02; p.x += p.vx + Math.sin(p.sw) * .5; p.y += p.vy; p.a += p.va;
      if (p.y > H + 20) Object.assign(p, mk(true));
      flower(p);
    }
    raf = requestAnimationFrame(step);
  };
  addEventListener('resize', () => { if (on) resize(); });
  document.addEventListener('visibilitychange', () => { if (!on) return; if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(step); });
  return {
    toggle(v) {
      if (v === on) return; on = v;
      if (on) { resize(); ps = Array.from({ length: innerWidth < 700 ? 10 : 18 }, () => mk(false)); cv.hidden = false; raf = requestAnimationFrame(step); }
      else { cancelAnimationFrame(raf); cx.clearRect(0, 0, W || 0, H || 0); cv.hidden = true; }
    }
  };
})();

function burst(x = innerWidth / 2, n = 60) {
  if (!settings.anim) return;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = (Math.random() * 100) + 'vw';
    c.style.background = RAINBOW[i % RAINBOW.length];
    c.style.borderRadius = Math.random() < .5 ? '50%' : '2px';
    c.style.animationDuration = (2 + Math.random() * 2.5) + 's';
    c.style.animationDelay = (Math.random() * .6) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5500);
  }
}

/* ---------- 燈箱（縮放、拖曳、翻面、切換） ---------- */
const LB = (() => {
  const box = $('#lightbox'), stage = $('#lb-stage'), img = $('#lb-img');
  let list = [], idx = 0, ex = null, s = 1, x = 0, y = 0, fit = 1, drag = null, pts = new Map(), pinch = null;
  const apply = () => { img.style.transform = `translate(${x}px,${y}px) scale(${s})`; $('#lb-zoom').textContent = Math.round(s / fit * 100) + '%'; };
  const fitImg = () => {
    const W = stage.clientWidth, H = stage.clientHeight, iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    fit = Math.min(W / iw, H / ih) * .94; s = fit; x = (W - iw * s) / 2; y = (H - ih * s) / 2; apply();
  };
  const zoomAt = (f, cx0, cy0) => {
    const ns = Math.min(Math.max(s * f, fit * .5), fit * 8);
    const r = stage.getBoundingClientRect(); const px = (cx0 ?? r.width / 2), py = (cy0 ?? r.height / 2);
    x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns; apply();
  };
  const partner = it => {
    if (!it.side) return null;
    const want = it.side === '正面' ? '背面' : '正面';
    return list.findIndex(o => o.kind === it.kind && o.n === it.n && o.side === want);
  };
  const show = (i) => {
    idx = (i + list.length) % list.length;
    const it = list[idx];
    img.style.opacity = 0;
    img.onload = () => { fitImg(); img.style.opacity = 1; };
    img.src = it.web; img.alt = ex.title + ' ' + it.label;
    $('#lb-title').textContent = `${ex.id}｜${ex.title}｜${it.label}`;
    $('#lb-flip').hidden = partner(it) < 0 || partner(it) == null;
    $$('#lb-strip button').forEach((b, j) => b.classList.toggle('on', j === idx));
    const on = $('#lb-strip button.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    $('#lb-prev').hidden = $('#lb-next').hidden = list.length < 2;
  };
  const open = (e, itemId) => {
    ex = e; list = e.items;
    $('#lb-strip').innerHTML = list.map((it, j) => `<button data-j="${j}" title="${esc(it.label)}"><img src="${it.thumb}" alt="${esc(it.label)}"></button>`).join('');
    box.hidden = false; document.body.style.overflow = 'hidden';
    sfx('open');
    show(Math.max(0, list.findIndex(it => it.id === itemId)));
  };
  const close = () => { box.hidden = true; document.body.style.overflow = ''; img.removeAttribute('src'); sfx('click'); if (document.fullscreenElement) document.exitFullscreen(); };
  $('#lb-close').onclick = close;
  $('#lb-prev').onclick = () => { sfx('whoosh'); show(idx - 1); };
  $('#lb-next').onclick = () => { sfx('whoosh'); show(idx + 1); };
  $('#lb-zin').onclick = () => { sfx('zoom', true); zoomAt(1.4); };
  $('#lb-zout').onclick = () => { sfx('zoom', false); zoomAt(1 / 1.4); };
  $('#lb-flip').onclick = () => { const p = partner(list[idx]); if (p >= 0) { sfx('flip'); show(p); } };
  $('#lb-full').onclick = () => { if (!document.fullscreenElement) box.requestFullscreen?.(); else document.exitFullscreen(); };
  $('#lb-strip').onclick = e => { const b = e.target.closest('button'); if (b) { sfx('tick'); show(+b.dataset.j); } };
  addEventListener('resize', () => { if (!box.hidden) fitImg(); });
  document.addEventListener('fullscreenchange', () => setTimeout(() => { if (!box.hidden) fitImg(); }, 100));
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener('dblclick', e => { const r = stage.getBoundingClientRect(); if (s > fit * 1.05) fitImg(); else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top); sfx('zoom', true); });
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
    else { drag = { sx: e.clientX, sy: e.clientY, x0: x, y0: y, moved: false }; stage.classList.add('drag'); }
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = stage.getBoundingClientRect();
      zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d;
    } else if (drag) { x = drag.x0 + e.clientX - drag.sx; y = drag.y0 + e.clientY - drag.sy; if (Math.abs(e.clientX - drag.sx) > 4) drag.moved = true; apply(); }
  });
  const up = e => {
    pts.delete(e.pointerId); stage.classList.remove('drag');
    if (drag && !drag.moved && s <= fit * 1.02 && e.type === 'pointerup') {
      // 未放大時左右滑動切換
    }
    if (drag && s <= fit * 1.02) { const dx = e.clientX - drag.sx; if (Math.abs(dx) > 80) { sfx('whoosh'); show(idx + (dx < 0 ? 1 : -1)); } }
    if (pts.size < 2) pinch = null; drag = null;
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') { sfx('whoosh'); show(idx - 1); }
    else if (e.key === 'ArrowRight') { sfx('whoosh'); show(idx + 1); }
    else if (e.key === '+' || e.key === '=') zoomAt(1.3);
    else if (e.key === '-') zoomAt(1 / 1.3);
    else if (e.key === 'f' || e.key === 'F') $('#lb-flip').click();
  });
  return { open, get isOpen() { return !box.hidden; } };
})();

/* ---------- 元件 ---------- */
function cardHTML(e, i = 0) {
  const c = coverOf(e);
  const v = visited[e.id];
  return `<article class="card" style="--c:${e.color};animation-delay:${Math.min(i, 16) * 45}ms" data-go="${e.id}" tabindex="0" role="link" aria-label="${esc(e.title)}">
    <div class="thumb">
      <img src="${c.thumb}" alt="${esc(e.title)} ${c.label}" loading="lazy" class="${isLandscape(c) ? 'contain' : ''}">
      <span class="code">${e.id}</span>
      <button class="fav ${isFav(e.id) ? 'fav-on' : ''}" data-fav="${e.id}" aria-label="收藏" title="收藏">${icon(isFav(e.id) ? 'i-heart' : 'i-heart-o')}</button>
      ${v ? `<span class="visited">已看過 ${v} 次</span>` : ''}
    </div>
    <div class="body">
      <div class="title">${esc(e.title)}</div>
      <div class="meta"><span class="ctag">${e.category}</span><span>${yearLabel(e.year)}</span></div>
      <div class="kinds">${kindIcons(e)}</div>
    </div>
  </article>`;
}
function rowHTML(e, i = 0) {
  const c = coverOf(e);
  return `<button class="row-item" style="--c:${e.color};animation-delay:${Math.min(i, 20) * 25}ms" data-go="${e.id}">
    <img src="${c.thumb}" alt="" loading="lazy">
    <span class="code">${e.id}</span>
    <span><span class="t">${esc(e.title)}</span><br><span class="p">${e.category}・${yearLabel(e.year)}（${ad(e.year)}）${e.period ? '・' + e.period : ''}</span></span>
    <span class="kinds">${kindIcons(e)}</span>
  </button>`;
}
function setNav(view) {
  $$('#mainnav a').forEach(a => a.classList.toggle('on', a.dataset.view === view));
  $('#mainnav').classList.remove('open'); $('#btn-menu').setAttribute('aria-expanded', 'false');
}
function observeReveal() {
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
  $$('.reveal, .tl-item').forEach(el => io.observe(el));
}
function countUp() {
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count; if (!settings.anim) { el.textContent = to; return; }
    const t0 = performance.now();
    const f = t => { const p = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
}

/* ---------- 首頁 ---------- */
function viewHome() {
  setNav('home');
  const total = DATA.reduce((s, e) => s + e.items.length, 0);
  const artists = DATA.length;
  const wall = DATA.filter(e => e.items.some(i => i.kind === '海報')).slice(0, 5);
  const pos = [[2, 4, -8], [28, 0, 4], [54, 6, -3], [14, 42, 6], [44, 40, -6]];
  const minY = Math.min(...years), maxY = Math.max(...years);
  const allY = []; for (let y = minY; y <= maxY; y++) allY.push(y);
  const cnt = y => DATA.filter(e => e.year === y).length;
  const maxC = Math.max(...allY.map(cnt));
  const title1 = '楊梅高中', title2 = '紅土藝術空間';
  const l2c = ['#c9573f', '#e8364a', '#d4418e', '#9c65b9', '#6d3e8f', '#3d95dd'];
  const chars = (s, d0, col) => [...s].map((ch, i) => `<span class="ch" style="animation-delay:${d0 + i * 70}ms${col ? ';color:' + col[i % col.length] : ''}">${ch}</span>`).join('');
  app.innerHTML = `<div class="view">
  <section class="hero">
    <div class="hero-bg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i></div>
    <div class="wrap hero-grid">
      <div>
        <div class="hero-emblems">
          <img class="badge" src="assets/校徽.jpg" alt="國立楊梅高級中學校徽">
          <span class="x">✕</span>
          <img class="logo" src="assets/logo.svg" alt="紅土藝術空間 Logo">
        </div>
        <h1><span class="l1">${chars(title1, 100)}</span><span class="l2">${chars(title2, 420, l2c)}</span></h1>
        <p class="lead">民國 97 年落成於啟明樓四樓，「紅土」緬懷梅岡先賢在貧瘠紅土上耕耘建校的精神。這裡典藏歷屆展覽的<b style="color:var(--plum)">海報</b>、<b style="color:var(--clay)">邀請卡</b>與<b style="color:var(--teal)">小卡</b>，歡迎一起走進梅岡的藝術長廊。</p>
        <div class="hero-actions">
          <a class="btn" href="#/browse" data-snd="page">${icon('i-grid')}開始逛展</a>
          <button class="btn plum" id="btn-random">${icon('i-dice')}隨機逛一展</button>
          <a class="btn ghost" href="#/tour">${icon('i-play')}展場漫遊</a>
        </div>
        <div class="stats">
          <div class="stat" style="--c:var(--purple)"><b data-count="${DATA.length}">0</b><span>檔展覽</span></div>
          <div class="stat" style="--c:var(--plum)"><b data-count="${total}">0</b><span>件文宣典藏</span></div>
          <div class="stat" style="--c:var(--gold)"><b data-count="${years.length}">0</b><span>個年度</span></div>
          <div class="stat" style="--c:var(--teal)"><b data-count="${new Date().getFullYear() - 2008}">0</b><span>年藝術耕耘</span></div>
        </div>
      </div>
      <div class="hero-wall" aria-label="最新展覽海報">
        ${wall.map((e, i) => { const c = coverOf(e); const [l, t, r] = pos[i]; return `<div class="wall-card" data-go="${e.id}" style="left:${l}%;top:${t}%;transform:rotate(${r}deg);animation-delay:${300 + i * 150}ms;z-index:${i}"><i class="pin"></i><img src="${c.thumb}" alt="${esc(e.title)}"><div class="cap">${e.id} ${esc(e.title)}</div></div>`; }).join('')}
      </div>
    </div>
  </section>
  <div class="marquee" aria-hidden="true"><div class="marquee-track">${[0, 1].map(() => DATA.map(e => `<span data-go="${e.id}">${icon('i-plum')}${e.id}　${esc(e.title)}</span>`).join('')).join('')}</div></div>

  <section class="section wrap reveal">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}最新展覽</h2><a class="btn ghost small" href="#/browse">看全部 ${DATA.length} 檔 ${icon('i-right')}</a></div>
    <div class="grid">${DATA.slice(0, 8).map(cardHTML).join('')}</div>
  </section>

  <section class="section wrap reveal">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}歷年展覽數量</h2><p>點選長條可查看該年度的展覽</p></div>
    <div class="yearbars"><div class="yb-chart">
      ${allY.map((y, i) => { const n = cnt(y); const c1 = RAINBOW[i % RAINBOW.length], c2 = RAINBOW[(i + 1) % RAINBOW.length]; return `<button class="yb ${n ? '' : 'none'}" ${n ? `data-year="${y}"` : 'disabled'} title="${yearLabel(y)}（${ad(y)}）：${n} 檔"><div class="bar" style="height:${n ? Math.max(8, n / maxC * 100) : 3}%;--c1:${c1};--c2:${c2};animation-delay:${i * 50}ms">${n ? `<i>${n}</i>` : ''}</div><span class="yl">${y}</span></button>`; }).join('')}
    </div></div>
  </section>

  <section class="section wrap reveal">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}探索方式</h2></div>
    <div class="entries">
      <a class="entry" href="#/browse" style="--g:linear-gradient(135deg,#9c65b9,#6d3e8f)">${icon('i-grid', 'big')}<b>展覽瀏覽</b><span>依年度、類別、文宣種類篩選</span></a>
      <a class="entry" href="#/timeline" style="--g:linear-gradient(135deg,#f4b63c,#c9573f)">${icon('i-time', 'big')}<b>年代長廊</b><span>沿著時間軸走過每一檔展覽</span></a>
      <a class="entry" href="#/search" style="--g:linear-gradient(135deg,#e8364a,#9c65b9)">${icon('i-search', 'big')}<b>全文檢索</b><span>連海報上的文字都搜得到</span></a>
      <a class="entry" href="#/tour" style="--g:linear-gradient(135deg,#3d95dd,#20a99a)">${icon('i-play', 'big')}<b>展場漫遊</b><span>聚光燈下自動輪播海報</span></a>
      <a class="entry" href="#/game" style="--g:linear-gradient(135deg,#20a99a,#6cb94a)">${icon('i-game', 'big')}<b>翻牌遊戲</b><span>記憶配對，認識更多展覽</span></a>
    </div>
  </section>
  </div>`;
  countUp();
}

/* ---------- 展覽瀏覽 ---------- */
function parseQ(qs) { const o = {}; new URLSearchParams(qs || '').forEach((v, k) => { o[k] = v; }); return o; }
function viewBrowse(q) {
  setNav('browse');
  const f = { y: q.y || '', c: q.c || '', k: q.k || '', s: q.s || 'new', t: q.t || '', fav: q.fav || '' };
  const cats = Object.keys(CAT_COLOR).filter(c => DATA.some(e => e.category === c));
  const link = patch => '#/browse?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...f, ...patch }).filter(([, v]) => v))).toString();
  let list = DATA.filter(e => (!f.y || e.year === +f.y) && (!f.c || e.category === f.c) && (!f.k || e.items.some(i => i.kind === f.k)) && (!f.fav || isFav(e.id)));
  if (f.t) { const n = norm(f.t); list = list.filter(e => norm(e.title + e.id + e.category).includes(n)); }
  if (f.s === 'old') list.reverse();
  else if (f.s === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  else if (f.s === 'items') list.sort((a, b) => b.items.length - a.items.length);
  const grouped = f.s === 'new' || f.s === 'old';
  const renderList = () => {
    if (!list.length) return `<div class="empty">${icon('i-plum')}<p>沒有符合條件的展覽，換個篩選條件試試看吧！</p><a class="btn" href="#/browse">清除篩選</a></div>`;
    const inner = arr => settings.view === 'list' ? `<div class="list">${arr.map(rowHTML).join('')}</div>` : `<div class="grid">${arr.map(cardHTML).join('')}</div>`;
    if (!grouped) return inner(list);
    const ys = [...new Set(list.map(e => e.year))];
    return ys.map(y => { const arr = list.filter(e => e.year === y); return `<section class="year-group" id="y${y}"><h2 class="year-title"><span class="yn">${y}</span>民國 ${y} 年<small>西元 ${ad(y)} 年・${arr.length} 檔</small></h2>${inner(arr)}</section>`; }).join('');
  };
  app.innerHTML = `<div class="view wrap section">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}展覽瀏覽</h2><p>共 ${DATA.length} 檔展覽，點選卡片進入展覽頁</p></div>
    <div class="filters">
      <div class="frow"><label>年度</label><div class="chips-scroll">
        <a class="chip ${!f.y ? 'on' : ''}" href="${link({ y: '' })}">全部</a>
        ${years.map(y => `<a class="chip ${f.y == y ? 'on' : ''}" href="${link({ y })}">${y}<span class="n">${DATA.filter(e => e.year === y).length}</span></a>`).join('')}
      </div></div>
      <div class="frow"><label>類別</label>
        <a class="chip ${!f.c ? 'on' : ''}" href="${link({ c: '' })}">全部</a>
        ${cats.map(c => `<a class="chip ${f.c === c ? 'on' : ''}" href="${link({ c })}" style="${f.c === c ? `background:${CAT_COLOR[c]};border-color:${CAT_COLOR[c]}` : ''}">${c}<span class="n">${DATA.filter(e => e.category === c).length}</span></a>`).join('')}
      </div>
      <div class="frow"><label>文宣</label>
        <a class="chip ${!f.k ? 'on' : ''}" href="${link({ k: '' })}">全部</a>
        ${['海報', '邀請卡', '小卡'].map(k => `<a class="chip ${f.k === k ? 'on' : ''}" href="${link({ k })}">${icon(KIND_ICON[k])}有${k}</a>`).join('')}
        <a class="chip ${f.fav ? 'on' : ''}" href="${link({ fav: f.fav ? '' : '1' })}">${icon('i-heart')}只看收藏</a>
      </div>
      <div class="frow"><label>排序</label>
        <select id="f-sort" aria-label="排序">
          <option value="new">年度：新 → 舊</option><option value="old">年度：舊 → 新</option>
          <option value="name">展名筆畫</option><option value="items">文宣數量多 → 少</option>
        </select>
        <input type="search" id="f-t" placeholder="篩選展名…" value="${esc(f.t)}" aria-label="篩選展名">
      </div>
    </div>
    <div class="result-bar"><span>找到 <b>${list.length}</b> 檔展覽</span>
      <div class="viewmode"><button data-vm="grid" class="${settings.view !== 'list' ? 'on' : ''}">${icon('i-grid')}卡片</button><button data-vm="list" class="${settings.view === 'list' ? 'on' : ''}">${icon('i-list')}清單</button></div>
    </div>
    <div id="browse-list">${renderList()}</div>
  </div>`;
  $('#f-sort').value = f.s;
  $('#f-sort').onchange = e => { sfx('click'); location.hash = link({ s: e.target.value }); };
  let tt; $('#f-t').oninput = e => { clearTimeout(tt); tt = setTimeout(() => { history.replaceState(null, '', link({ t: e.target.value })); f.t = e.target.value; viewBrowse(f); $('#f-t').focus(); const v = $('#f-t').value; $('#f-t').setSelectionRange(v.length, v.length); }, 350); };
  $$('[data-vm]').forEach(b => b.onclick = () => { settings.view = b.dataset.vm; saveSettings(); sfx('click'); viewBrowse(f); });
}

/* ---------- 展覽頁 ---------- */
function viewExhibit(id, itemId) {
  const e = BY_ID[id];
  if (!e) { app.innerHTML = `<div class="wrap empty">${icon('i-plum')}<p>找不到期別「${esc(id)}」的展覽。</p><a class="btn" href="#/browse">回到展覽瀏覽</a></div>`; return; }
  setNav('browse'); markVisited(id);
  const i = DATA.indexOf(e), newer = DATA[i - 1], older = DATA[i + 1];
  const cur = e.items.find(x => x.id === itemId) || coverOf(e);
  const groups = ['海報', '邀請卡', '小卡'].map(k => [k, e.items.filter(x => x.kind === k)]).filter(([, a]) => a.length);
  const ocrAll = e.items.filter(x => x.text && x.text.length);
  const flipGroup = (k, arr) => {
    const nums = [...new Set(arr.map(x => x.n))];
    return `<div class="flip-list">${nums.map(n => {
      const fr = arr.find(x => x.n === n && x.side !== '背面'), bk = arr.find(x => x.n === n && x.side === '背面');
      const a = fr || bk, b = fr && bk ? bk : null;
      return `<div class="flip-card"><div class="flipper" data-flip>
        <div class="flip-inner"><div class="flip-face" data-open="${a.id}"><img src="${a.thumb}" alt="${esc(a.label)}" loading="lazy"></div>
        ${b ? `<div class="flip-face flip-back" data-open="${b.id}"><img src="${b.thumb}" alt="${esc(b.label)}" loading="lazy"></div>` : ''}</div></div>
        <div class="flip-ctl"><span>${k}${nums.length > 1 ? ' ' + n : ''}${b ? '（正面／背面）' : a.side ? '（' + a.side + '）' : ''}</span>
        ${b ? `<button class="btn small teal" data-flipbtn>${icon('i-flip')}翻面</button>` : ''}
        <button class="btn small ghost" data-open-cur>${icon('i-zin')}放大</button></div></div>`;
    }).join('')}</div>`;
  };
  app.innerHTML = `<div class="view">
  <section class="ex-hero" style="--c:${e.color}"><div class="wrap">
    <nav class="crumbs"><a href="#/">首頁</a>›<a href="#/browse">展覽瀏覽</a>›<a href="#/browse?y=${e.year}">民國 ${e.year} 年</a>›<span>${esc(e.title)}</span></nav>
    <div class="ex-head">
      <div>
        <span class="ex-code">期別 ${e.id}・${e.year} 年第 ${e.no} 檔</span>
        <h1 class="ex-title">${esc(e.title)}</h1>
        <div class="ex-facts">
          <span>${icon('i-brush')}${e.category}</span>
          <span>${icon('i-time')}${e.period ? esc(e.period) + (e.periodAuto ? ' <small>（依海報文字自動辨識）</small>' : '') : `${yearLabel(e.year)}（西元 ${ad(e.year)} 年）`}</span>
          ${e.artist ? `<span>${icon('i-star')}${esc(e.artist)}</span>` : ''}
          <span>${icon('i-poster')}${e.items.length} 件文宣</span>
        </div>
        ${e.intro ? `<p style="margin-top:12px;max-width:46em">${esc(e.intro)}</p>` : ''}
      </div>
      <div class="ex-actions">
        <button class="btn ${isFav(e.id) ? 'fav-on' : 'ghost'}" data-fav="${e.id}">${icon(isFav(e.id) ? 'i-heart' : 'i-heart-o')}<span>${isFav(e.id) ? '已收藏' : '加入收藏'}</span></button>
        <button class="btn gold" id="ex-lb">${icon('i-zin')}全螢幕欣賞</button>
      </div>
    </div>
  </div></section>
  <div class="wrap">
    <div class="ex-body">
      <div class="stage">
        <div class="stage-frame" id="stage-frame" title="點一下放大檢視"><img id="stage-img" src="${cur.web}" alt="${esc(e.title)} ${cur.label}"><span class="stage-hint">${icon('i-zin')}點圖放大</span></div>
        <div class="stage-cap"><b id="stage-label">${cur.label}</b><span class="note">${cur.w}×${cur.h}・原始檔名：<span id="stage-file">${esc(cur.file)}</span></span></div>
      </div>
      <div>
        ${groups.map(([k, arr]) => `<div class="mat-group"><h3><span class="ic" style="--g:${KIND_GRAD[k]}">${icon(KIND_ICON[k])}</span>${k}<small>${arr.length} 張</small></h3>
          ${k === '海報' ? `<div class="mats">${arr.map(x => `<button class="mat ${x.id === cur.id ? 'on' : ''}" style="--c:${e.color}" data-pick="${x.id}"><img src="${x.thumb}" alt="${esc(x.label)}" loading="lazy"><span>${x.label}</span></button>`).join('')}</div>` : flipGroup(k, arr)}
        </div>`).join('')}
        ${ocrAll.length ? `<details class="ocr-box"><summary>${icon('i-search')}文宣上的文字（電腦自動辨識）</summary><div class="ocr-text">
          ${ocrAll.map(x => `<h4>${x.label}</h4>${x.text.map(t => `<p>${esc(t)}</p>`).join('')}`).join('')}
          <p class="note">※ 文字由電腦辨識產生，可能有錯字，僅供檢索參考。</p></div></details>` : ''}
      </div>
    </div>
    <nav class="ex-nav">
      ${older ? `<a href="#/ex/${older.id}" class="prev">${icon('i-left')}<img src="${coverOf(older).thumb}" alt=""><span><small>上一檔（較早）</small><b>${older.id} ${esc(older.title)}</b></span></a>` : '<span></span>'}
      ${newer ? `<a href="#/ex/${newer.id}" class="next">${icon('i-right')}<img src="${coverOf(newer).thumb}" alt=""><span><small>下一檔（較新）</small><b>${newer.id} ${esc(newer.title)}</b></span></a>` : '<span></span>'}
    </nav>
  </div></div>`;
  let curId = cur.id;
  const pick = xid => {
    const x = e.items.find(o => o.id === xid); if (!x) return; curId = xid;
    const im = $('#stage-img'); im.style.animation = 'none'; void im.offsetWidth; im.style.animation = '';
    im.src = x.web; im.alt = e.title + ' ' + x.label; $('#stage-label').textContent = x.label; $('#stage-file').textContent = x.file;
    $$('.mat').forEach(m => m.classList.toggle('on', m.dataset.pick === xid));
  };
  $$('[data-pick]').forEach(b => b.onclick = () => { sfx('tick'); pick(b.dataset.pick); });
  $('#stage-frame').onclick = () => LB.open(e, curId);
  $('#ex-lb').onclick = () => LB.open(e, curId);
  $$('.flip-card').forEach(fc => {
    const fl = $('[data-flip]', fc), btn = $('[data-flipbtn]', fc);
    const faces = $$('[data-open]', fc);
    const currentFace = () => (fl.classList.contains('flipped') && faces[1]) ? faces[1] : faces[0];
    const doFlip = () => { fl.classList.toggle('flipped'); sfx('flip'); bump('flips'); pick(currentFace().dataset.open); };
    if (btn) btn.onclick = doFlip;
    fl.onclick = () => { if (faces.length > 1) doFlip(); else { sfx('tick'); pick(faces[0].dataset.open); } };
    $('[data-open-cur]', fc).onclick = () => LB.open(e, currentFace().dataset.open);
  });
  if (visited[id] === 1) setTimeout(() => toast(`第一次來到「${e.title}」！`, 'i-star'), 400);
}

/* ---------- 年代長廊 ---------- */
function viewTimeline() {
  setNav('timeline');
  const asc = DATA.slice().reverse();
  let html = '', lastY = null;
  asc.forEach(e => {
    if (e.year !== lastY) { html += `<div class="tl-year" id="t${e.year}"><span>${yearLabel(e.year)}・${ad(e.year)}</span></div>`; lastY = e.year; }
    const c = coverOf(e);
    html += `<div class="tl-item" style="--c:${e.color}"><div class="tl-card" style="--c:${e.color}" data-go="${e.id}" tabindex="0">
      <img src="${c.thumb}" alt="" loading="lazy"><div><span class="code">${e.id}</span><h3>${esc(e.title)}</h3><p>${e.category}${e.period ? '・' + esc(e.period) : ''}</p><p class="kinds" style="display:flex;gap:8px;margin-top:6px">${kindIcons(e)}</p></div></div></div>`;
  });
  app.innerHTML = `<div class="view wrap section">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}年代長廊</h2><p>從民國 ${Math.min(...years)} 年到 ${Math.max(...years)} 年，一路走過紅土的藝術足跡</p></div>
    <div class="tl-jump">${years.slice().reverse().map(y => `<button class="chip" data-jump="${y}">${y}</button>`).join('')}</div>
    <div class="tl">${html}</div></div>`;
  $$('[data-jump]').forEach(b => b.onclick = () => { sfx('tick'); document.getElementById('t' + b.dataset.jump).scrollIntoView({ behavior: settings.anim ? 'smooth' : 'auto', block: 'center' }); });
  observeReveal();
}

/* ---------- 檢索 ---------- */
function searchData(q, scope) {
  const terms = q.split(/\s+/).map(norm).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const e of DATA) {
    const meta = norm([e.title, e.id, e.category, e.artist, e.intro, e.period, yearLabel(e.year), ad(e.year) + '年', e.folder].join(' '));
    let score = 0, ok = true; const hits = new Map();
    for (const t of terms) {
      let found = false;
      if (scope.title && meta.includes(t)) { score += norm(e.title).includes(t) ? 20 : 8; found = true; }
      if (scope.ocr) {
        for (const it of e.items) {
          const lines = (it.text || []).filter(l => norm(l).includes(t));
          if (lines.length) { found = true; score += lines.length; if (!hits.has(it.id)) hits.set(it.id, { it, lines: new Set() }); lines.forEach(l => hits.get(it.id).lines.add(l)); }
        }
      }
      if (scope.kind && e.items.some(i => i.kind.includes(t))) { found = true; score += 2; }
      if (!found) { ok = false; break; }
    }
    if (ok) out.push({ e, score, hits: [...hits.values()] });
  }
  return out.sort((a, b) => b.score - a.score || b.e.id.localeCompare(a.e.id));
}
function viewSearch(q) {
  setNav('search');
  const query = q.q || '';
  const scope = { title: q.st !== '0', ocr: q.so !== '0', kind: true };
  const hot = ['個展', '校友', '班展', '聯展', '攝影', '水彩', '油畫', '書法', '水墨', '繪本', '校慶', '美術班', '創作展', '開幕'];
  app.innerHTML = `<div class="view">
    <section class="search-hero"><svg class="deco" style="width:260px;height:260px;right:-40px;top:-60px"><use href="#i-plum"/></svg><svg class="deco" style="width:140px;height:140px;left:6%;bottom:-40px"><use href="#i-plum"/></svg>
      <div class="wrap"><h1>全文檢索</h1><p>可搜尋展名、期別、年度、類別，以及海報與卡片上印的文字（例如藝術家姓名、展期、畫種）。多個關鍵字用空白隔開。</p>
      <form class="bigsearch" id="bigsearch">${icon('i-search')}<input type="search" id="bs-input" value="${esc(query)}" placeholder="輸入關鍵字，例如：水彩、校友、2014…" autocomplete="off" aria-label="搜尋關鍵字"><button class="btn plum" type="submit">搜尋</button></form>
      <div class="search-opts"><label><input type="checkbox" id="so-title" ${scope.title ? 'checked' : ''}>展名與資訊</label><label><input type="checkbox" id="so-ocr" ${scope.ocr ? 'checked' : ''}>文宣上的文字</label></div>
      <div class="hotwords"><span>熱門關鍵字：</span>${hot.map(h => `<button class="chip" data-hot="${h}">${h}</button>`).join('')}</div></div>
    </section>
    <div class="wrap search-body" id="search-results"></div></div>`;
  const run = (qq, push) => {
    const sc = { title: $('#so-title').checked, ocr: $('#so-ocr').checked, kind: true };
    const res = qq.trim() ? searchData(qq, sc) : [];
    const re = hlRegex(qq.trim());
    const box = $('#search-results');
    if (push) history.replaceState(null, '', '#/search?' + new URLSearchParams({ q: qq, ...(sc.title ? {} : { st: '0' }), ...(sc.ocr ? {} : { so: '0' }) }));
    if (!qq.trim()) { box.innerHTML = `<div class="paper" style="text-align:center">${icon('i-search', '')} 請輸入關鍵字，或點選上方的熱門關鍵字。</div>`; return; }
    if (!res.length) {
      const chars = new Set(norm(qq));
      const sug = DATA.map(e => ({ e, s: [...new Set(norm(e.title))].filter(c => chars.has(c)).length })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 5);
      box.innerHTML = `<div class="paper empty">${icon('i-plum')}<p>找不到與「${esc(qq)}」相關的展覽。</p>${sug.length ? `<p class="suggest">你是不是要找：${sug.map(x => `<a href="#/ex/${x.e.id}">${esc(x.e.title)}</a>`).join('、')}</p>` : ''}</div>`;
      sfx('miss'); return;
    }
    sfx('search');
    box.innerHTML = `<div class="result-bar"><span>「${esc(qq)}」共找到 <b>${res.length}</b> 檔展覽</span></div>` + res.map((r, i) => {
      const e = r.e, c = coverOf(e);
      const snips = r.hits.flatMap(h => [...h.lines].slice(0, 2).map(l => `<p class="snip"><b>${h.it.label}</b>${highlight(l, re)}</p>`)).slice(0, 4).join('');
      return `<div class="sresult" style="--c:${e.color};animation-delay:${Math.min(i, 12) * 40}ms" data-go="${e.id}">
        <img src="${c.thumb}" alt="" loading="lazy">
        <div><span class="tag" style="background:color-mix(in srgb,${e.color} 15%,#fff);color:${e.color}">${e.id}・${e.category}・${yearLabel(e.year)}</span>
        <h3>${highlight(e.title, re)}</h3>${e.period ? `<p class="snip">${icon('i-time')} ${highlight(e.period, re)}</p>` : ''}${snips}
        ${r.hits.length ? `<div class="hits">${r.hits.map(h => `<button data-hit="${e.id}|${h.it.id}" title="檢視${h.it.label}"><img src="${h.it.thumb}" alt="${h.it.label}"></button>`).join('')}</div>` : ''}</div></div>`;
    }).join('');
    $$('[data-hit]', box).forEach(b => b.onclick = ev => { ev.stopPropagation(); const [eid, iid] = b.dataset.hit.split('|'); LB.open(BY_ID[eid], iid); });
  };
  let t;
  $('#bigsearch').onsubmit = ev => { ev.preventDefault(); bump('search'); run($('#bs-input').value, true); };
  $('#bs-input').oninput = ev => { clearTimeout(t); t = setTimeout(() => run(ev.target.value, true), 300); };
  $$('#so-title,#so-ocr').forEach(c => c.onchange = () => { sfx('click'); run($('#bs-input').value, true); });
  $$('[data-hot]').forEach(b => b.onclick = () => { $('#bs-input').value = b.dataset.hot; bump('search'); run(b.dataset.hot, true); });
  run(query, false);
  if (!query) $('#bs-input').focus();
}

/* ---------- 展場漫遊 ---------- */
let tourTimer = null;
function stopTour() { clearTimeout(tourTimer); tourTimer = null; }
function viewTour(q) {
  setNav('tour');
  let order = q.o || 'new', yf = q.y || '';
  const build = () => {
    let arr = DATA.filter(e => !yf || e.year === +yf).map(e => ({ e, it: coverOf(e) }));
    if (order === 'old') arr.reverse(); else if (order === 'rand') arr = shuffle(arr);
    return arr;
  };
  let list = build(), i = 0, playing = true, speed = 6000;
  app.innerHTML = `<div class="view tour">
    <div class="tour-top"><h1>${icon('i-play')}展場漫遊</h1>
      <div class="tour-ctl">
        <select id="tr-order" aria-label="順序"><option value="new">新 → 舊</option><option value="old">舊 → 新</option><option value="rand">隨機</option></select>
        <select id="tr-year" aria-label="年度"><option value="">全部年度</option>${years.map(y => `<option value="${y}">${yearLabel(y)}</option>`).join('')}</select>
        <select id="tr-speed" aria-label="速度"><option value="4000">快</option><option value="6000" selected>標準</option><option value="9000">慢</option></select>
        <button class="iconbtn light" id="tr-play" aria-label="播放／暫停">${icon('i-pause')}</button>
        <button class="iconbtn light" id="tr-full" aria-label="全螢幕">${icon('i-full')}</button>
      </div></div>
    <div class="tour-stage"><div class="tour-spot"></div>
      <button class="lb-nav prev" id="tr-prev" aria-label="上一檔">${icon('i-left')}</button>
      <div class="tour-frame" id="tr-frame"><div class="mat-in"><img id="tr-img" alt=""></div></div>
      <button class="lb-nav next" id="tr-next" aria-label="下一檔">${icon('i-right')}</button></div>
    <div class="tour-label" id="tr-label"></div>
    <i class="tour-prog" id="tr-prog"></i></div>`;
  $('#tr-order').value = order; $('#tr-year').value = yf;
  const prog = $('#tr-prog');
  const show = (n, snd = true) => {
    if (!list.length) return;
    i = (n + list.length) % list.length; const { e, it } = list[i];
    const fr = $('#tr-frame'); fr.classList.add('out');
    if (snd) sfx('whoosh');
    setTimeout(() => {
      const img = $('#tr-img'); if (!img) return;
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
      img.src = it.web; img.alt = e.title;
      $('#tr-label').innerHTML = `<span class="code">${e.id}・${i + 1} / ${list.length}</span><h2>${esc(e.title)}</h2><p>${e.category}・${yearLabel(e.year)}${e.period ? '・' + esc(e.period) : ''}　<a href="#/ex/${e.id}" style="color:var(--gold)">進入展覽頁 ›</a></p>`;
      fr.classList.remove('out');
      bump('tour');
    }, settings.anim ? 450 : 0);
    schedule();
  };
  const schedule = () => {
    stopTour();
    prog.style.transition = 'none'; prog.style.width = '0';
    if (!playing) return;
    void prog.offsetWidth; prog.style.transition = `width ${speed}ms linear`; prog.style.width = '100%';
    tourTimer = setTimeout(() => { if (location.hash.startsWith('#/tour')) show(i + 1); }, speed);
  };
  const setPlay = p => { playing = p; $('#tr-play use').setAttribute('href', p ? '#i-pause' : '#i-play'); schedule(); };
  $('#tr-play').onclick = () => { sfx('click'); setPlay(!playing); };
  $('#tr-prev').onclick = () => show(i - 1); $('#tr-next').onclick = () => show(i + 1);
  $('#tr-order').onchange = ev => { order = ev.target.value; list = build(); sfx('click'); show(0); };
  $('#tr-year').onchange = ev => { yf = ev.target.value; list = build(); sfx('click'); show(0); };
  $('#tr-speed').onchange = ev => { speed = +ev.target.value; sfx('click'); schedule(); };
  $('#tr-full').onclick = () => { const el = $('.tour'); if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen(); };
  $('#tr-frame').onclick = () => { const { e, it } = list[i]; setPlay(false); LB.open(e, it.id); };
  viewTour.key = ev => {
    if (LB.isOpen) return;
    if (ev.key === 'ArrowRight') show(i + 1); else if (ev.key === 'ArrowLeft') show(i - 1);
    else if (ev.key === ' ') { ev.preventDefault(); setPlay(!playing); }
  };
  show(0, false);
}

/* ---------- 翻牌遊戲 ---------- */
function viewGame(q) {
  setNav('game');
  const lv = { easy: { pairs: 6, cols: 4, name: '簡單' }, normal: { pairs: 8, cols: 4, name: '普通' }, hard: { pairs: 10, cols: 5, name: '困難' } };
  const L = lv[q.lv] ? q.lv : 'normal';
  const pool = shuffle(DATA.filter(e => coverOf(e))).slice(0, lv[L].pairs);
  const deck = shuffle(pool.flatMap(e => [e, e]));
  const best = store.get('best', {});
  let first = null, lock = false, moves = 0, done = 0, t0 = null, timer;
  app.innerHTML = `<div class="view wrap section">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}翻牌記憶遊戲</h2><p>翻開兩張相同的展覽海報就能配對成功！</p></div>
    <div class="game-head">
      <div class="seg" style="min-width:280px">${Object.entries(lv).map(([k, v]) => `<button class="${k === L ? 'on' : ''}" data-lv="${k}">${v.name}（${v.pairs} 對）</button>`).join('')}</div>
      <div class="game-stats"><span class="gstat">步數<b id="g-moves">0</b></span><span class="gstat">時間<b id="g-time">0</b> 秒</span><span class="gstat">配對<b id="g-done">0</b>/${pool.length}</span>${best[L] ? `<span class="gstat">最佳<b>${best[L]}</b> 步</span>` : ''}</div>
      <button class="btn plum" id="g-restart">${icon('i-dice')}重新洗牌</button>
    </div>
    <div class="board" id="board" style="--cols:${lv[L].cols}">${deck.map((e, j) => `<button class="gcard" data-j="${j}" data-id="${e.id}" aria-label="卡牌 ${j + 1}"><div class="gi"><div class="gf">${icon('i-plum')}</div><div class="gb"><img src="${coverOf(e).thumb}" alt="${esc(e.title)}"></div></div></button>`).join('')}</div>
    <div id="g-win"></div></div>`;
  $$('[data-lv]').forEach(b => b.onclick = () => { sfx('click'); location.hash = '#/game?lv=' + b.dataset.lv; });
  $('#g-restart').onclick = () => { sfx('dice'); viewGame({ lv: L }); };
  const tick = () => { $('#g-time') && ($('#g-time').textContent = Math.floor((Date.now() - t0) / 1000)); };
  $('#board').onclick = ev => {
    const c = ev.target.closest('.gcard'); if (!c || lock || c.classList.contains('up') || c.classList.contains('done')) return;
    if (!t0) { t0 = Date.now(); timer = setInterval(tick, 500); viewGame.timer = timer; }
    c.classList.add('up'); sfx('flip');
    if (!first) { first = c; return; }
    moves++; $('#g-moves').textContent = moves;
    if (first.dataset.id === c.dataset.id) {
      const e = BY_ID[c.dataset.id];
      [first, c].forEach(x => { x.classList.remove('up'); x.classList.add('done'); });
      first = null; done++; $('#g-done').textContent = done;
      setTimeout(() => sfx('match'), 250); toast(`配對成功：${e.title}`, 'i-star');
      if (done === pool.length) {
        clearInterval(timer); const sec = Math.floor((Date.now() - t0) / 1000);
        const stars = moves <= pool.length * 1.5 ? 3 : moves <= pool.length * 2.2 ? 2 : 1;
        const isBest = !best[L] || moves < best[L]; if (isBest) { best[L] = moves; store.set('best', best); }
        bump('wins');
        setTimeout(() => {
          sfx('win'); burst(undefined, 90);
          $('#g-win').innerHTML = `<div class="win"><div class="stars">${[1, 2, 3].map(n => `<svg style="animation-delay:${n * 150}ms;${n > stars ? 'opacity:.2' : ''}"><use href="#i-star"/></svg>`).join('')}</div><h2>全部配對完成！</h2><p>共 ${moves} 步、${sec} 秒${isBest ? '，刷新最佳紀錄！' : ''}</p>
          <p>這一局認識了：${pool.map(e => `<a href="#/ex/${e.id}">${esc(e.title)}</a>`).join('、')}</p><button class="btn plum" id="g-again">${icon('i-dice')}再玩一次</button></div>`;
          $('#g-again').onclick = () => { sfx('dice'); viewGame({ lv: L }); };
          $('#g-win').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 700);
      }
    } else {
      lock = true; const a = first; first = null;
      setTimeout(() => { sfx('miss'); a.classList.remove('up'); c.classList.remove('up'); lock = false; }, 900);
    }
  };
}

/* ---------- 我的收藏與徽章 ---------- */
function viewFav() {
  setNav('fav');
  const list = DATA.filter(e => isFav(e.id));
  const seen = Object.keys(visited).filter(id => BY_ID[id]).length;
  const pct = Math.round(seen / DATA.length * 100);
  const badges = [
    ['🌱', '初訪紅土', '看過 1 檔展覽', seen >= 1, 'linear-gradient(135deg,#6cb94a,#20a99a)'],
    ['🎨', '小小策展人', '看過 10 檔展覽', seen >= 10, 'linear-gradient(135deg,#9c65b9,#e8364a)'],
    ['🏛️', '紅土通', '看過 30 檔展覽', seen >= 30, 'linear-gradient(135deg,#c9573f,#f4b63c)'],
    ['👑', '全館巡禮', `看過全部 ${DATA.length} 檔`, seen >= DATA.length, 'linear-gradient(135deg,#f4b63c,#e8364a)'],
    ['💖', '收藏家', '收藏 5 檔展覽', favs.length >= 5, 'linear-gradient(135deg,#f38bb8,#e8364a)'],
    ['🔍', '檢索達人', '搜尋 5 次', counters.search >= 5, 'linear-gradient(135deg,#3d95dd,#9c65b9)'],
    ['🎬', '漫遊者', '展場漫遊欣賞 15 幅', counters.tour >= 15, 'linear-gradient(135deg,#20a99a,#3d95dd)'],
    ['🃏', '翻牌高手', '完成 1 局翻牌遊戲', counters.wins >= 1, 'linear-gradient(135deg,#6d3e8f,#20a99a)'],
    ['🔄', '翻面好奇寶寶', '翻面卡片 10 次', counters.flips >= 10, 'linear-gradient(135deg,#f08a24,#9c65b9)']
  ];
  app.innerHTML = `<div class="view wrap section">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}我的收藏</h2><p>收藏與紀錄只儲存在這台電腦的瀏覽器中</p></div>
    <div class="paper" style="margin-bottom:26px"><b>參觀進度：已看過 ${seen} / ${DATA.length} 檔展覽（${pct}%）</b><div class="progress"><i style="width:${pct}%"></i></div></div>
    <h3 style="font-size:1.3rem">${icon('i-star')} 我的徽章（${badges.filter(b => b[3]).length} / ${badges.length}）</h3>
    <div class="badges" style="margin-bottom:34px">${badges.map(b => `<div class="badge-it ${b[3] ? '' : 'locked'}"><div class="medal" style="--g:${b[4]}">${b[0]}</div><b>${b[1]}</b><small>${b[2]}</small></div>`).join('')}</div>
    <h3 style="font-size:1.3rem">${icon('i-heart')} 收藏的展覽（${list.length}）</h3>
    ${list.length ? `<div class="grid">${list.map(cardHTML).join('')}</div>` : `<div class="empty">${icon('i-heart-o')}<p>還沒有收藏任何展覽。在展覽卡片右上角點愛心就能收藏喔！</p><a class="btn" href="#/browse">去逛展</a></div>`}
  </div>`;
}

/* ---------- 關於紅土 ---------- */
function viewAbout() {
  setNav('about');
  const paras = [
    '本校「紅土藝術空間」於民國 97 年初即由楊松裕教授展開構思、設計，4 月招標後隨即動工，並於 5 月初告竣，5 月 9 日舉辦盛大之落成揭碑典禮。',
    '「紅土」一辭之命名發想，意在緬懷前達先賢蓽路藍縷的建校精神（命名者：本校邱逸華老師）。梅岡建校初期，高山頂上是一片貧瘠的紅土，在已故史校長振鼎的號召下，師生們從家中或他處移來肥沃的「客土」耘填，才能造就梅岡今日的蓊鬱宜人。沒有岡上「紅土」為基礎，如何造就這一片豐腴的沃土，培養一代又一代的梅岡菁莪，在各個領域出類拔萃？藝術的創作更需要土壤，才能生根、發芽、開花與茁壯。',
    '在蘇校長景進的多方請益後，選定了「藝術空間」作為此一藝術展示區的專名，期待它的功能是多元且充滿彈性的，它的價值是兼具現實感與歷史性的。「紅土藝術空間」之名，便是在這樣的感性基礎下產生的。',
    '同時，在蘇校長景進的盛情下，有幸能邀請知名書法家張穆希先生為「紅土藝術空間」題字，讓此一藝術之門充滿樸雅之妍。張穆希先生特別採清代冬心先生極具樸厚個性與金石趣味之「漆書」題字，展現了凝重與飄逸之美。',
    '民國 97 年 5 月 9 日落成啟用之後，首度展出的將是配合楊梅高中校慶六十週年之「校友及師長藝術創作美展」——這是梅岡藝術薪傳的勝舉，並將成為梅岡校史上重要的里程碑；未來，也將作為更多藝術展示的舞台。「紅土藝術空間」的設置，除了是校園人文藝術理想的落實，與眾多師生殷切期盼的實踐外，也將裨益楊梅鄉土藝術文化的推動，成為校園與地方文化精神的重要資源。'
  ];
  const facts = [['📍', '座落', '國立楊梅高級中學 啟明樓四樓', '#9c65b9,#6d3e8f'], ['📐', '坪數', '70 坪', '#f4b63c,#c9573f'], ['🖼️', '功能', '提供校內外各項藝術創作展示', '#e8364a,#9c65b9'], ['✏️', '空間規劃、設計', '楊松裕（中國科技大學室內設計系教授）', '#20a99a,#3d95dd'], ['🔨', '施工廠商', '順裕企業工程社', '#c9573f,#8e2a4d'], ['🎉', '落成啟用', '民國 97 年 5 月 9 日', '#6cb94a,#20a99a']];
  app.innerHTML = `<div class="view wrap section">
    <div class="section-head"><h2>${icon('i-plum', 'dot')}關於紅土藝術空間</h2></div>
    <div class="about-grid">
      <article class="paper reveal"><h2>「紅土藝術空間」落成誌</h2>${paras.map(p => `<p>${p}</p>`).join('')}<p class="sign">2008/05/09　誌於梅岡</p></article>
      <div>
        <div class="facts reveal">${facts.map(f => `<div class="fact"><span class="ic" style="--g:linear-gradient(135deg,${f[3]})">${f[0]}</span><div><small>${f[1]}</small><b>${f[2]}</b></div></div>`).join('')}</div>
        <div class="paper reveal" style="margin-top:22px">
          <h3>校徽與標誌</h3>
          <div class="emblem-show"><figure><img src="assets/校徽.jpg" alt="校徽"><figcaption>國立楊梅高中校徽</figcaption></figure><figure><img src="assets/logo.svg" alt="紅土藝術空間 Logo"><figcaption>紅土藝術空間</figcaption></figure></div>
          <p class="note" style="text-indent:0">網站配色取自校徽：</p>
          <div class="swatches"><span class="sw" style="--c:#9c65b9"><i></i>梅岡紫</span><span class="sw" style="--c:#e8364a"><i></i>梅花紅</span><span class="sw" style="--c:#c9573f"><i></i>紅土色</span><span class="sw" style="--c:#f4b63c"><i></i>花蕊金</span></div>
        </div>
      </div>
    </div>
    <div class="howto reveal" style="margin-top:30px">
      <h3>${icon('i-brush')} 如何新增期別（給管理者）</h3>
      <ol>
        <li>在「紅土藝術空間」資料夾中新增一個期別資料夾，命名為 <code>期別代碼(展覽名稱)</code>，例如 <code>11502(某某創作展)</code>。期別代碼前三碼為民國年、後兩碼為當年第幾檔。</li>
        <li>把圖片放進該資料夾並依規則命名：<code>11502(某某創作展)海報1.JPG</code>、<code>…邀請卡正面1.JPG</code>、<code>…邀請卡背面1.JPG</code>、<code>…小卡正面1.JPG</code>、<code>…小卡背面1.JPG</code>（同類多張時流水號 2、3…）。</li>
        <li>雙擊網站資料夾中的 <code>更新網站.bat</code>，程式會自動轉檔、辨識海報文字並更新網站（只處理新增的圖片）。</li>
        <li>若要補充展期、藝術家或介紹，可編輯 <code>data/meta.json</code>（格式說明見「使用說明.txt」）。</li>
      </ol>
    </div>
  </div>`;
  observeReveal();
}

/* ---------- 路由 ---------- */
function route() {
  stopTour(); clearInterval(viewGame.timer); viewTour.key = null;
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = parseQ(qs);
  const v = parts[0] || 'home';
  if (v === 'home') viewHome();
  else if (v === 'browse') viewBrowse(q);
  else if (v === 'ex') viewExhibit(decodeURIComponent(parts[1] || ''), parts[2]);
  else if (v === 'timeline') viewTimeline();
  else if (v === 'search') viewSearch(q);
  else if (v === 'tour') viewTour(q);
  else if (v === 'game') viewGame(q);
  else if (v === 'fav') viewFav();
  else if (v === 'about') viewAbout();
  else viewHome();
  observeReveal();
}
let lastPath = null;
addEventListener('hashchange', () => {
  const p = location.hash.split('?')[0];
  const keepScroll = p === lastPath && p.startsWith('#/browse');
  const y = scrollY;
  route();
  if (keepScroll) scrollTo(0, y); else scrollTo({ top: 0, behavior: 'instant' });
  if (p !== lastPath) sfx('page');
  lastPath = p;
});

/* ---------- 全域事件 ---------- */
document.addEventListener('click', e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a,[data-hit]')) { sfx('click'); location.hash = '#/ex/' + go.dataset.go; return; }
  const yb = e.target.closest('[data-year]');
  if (yb) { sfx('click'); location.hash = '#/browse?y=' + yb.dataset.year; return; }
  if (e.target.closest('#btn-random')) {
    sfx('dice'); const btn = $('#btn-random'); btn.disabled = true;
    let n = 0; const pickR = () => DATA[Math.floor(Math.random() * DATA.length)];
    const spin = setInterval(() => { btn.innerHTML = icon('i-dice') + esc(pickR().title.slice(0, 8)); if (++n > 10) { clearInterval(spin); location.hash = '#/ex/' + pickR().id; } }, 80);
    return;
  }
  const btn = e.target.closest('.btn, .chip');
  if (btn && settings.anim) {
    const r = btn.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const rp = document.createElement('span'); rp.className = 'ripple';
    rp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden'; btn.appendChild(rp); setTimeout(() => rp.remove(), 650);
  }
  if (e.target.closest('a.chip, .mainnav a, .brand, .entry, .btn')) sfx('click');
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-go][tabindex]')) { e.preventDefault(); e.target.click(); }
  if (viewTour.key) viewTour.key(e);
  if (e.key === '/' && !e.target.matches('input,textarea')) { e.preventDefault(); location.hash = '#/search'; }
  if (e.key === 'Escape' && !$('#settings').hidden) openSettings(false);
});
// 卡片 3D 傾斜
let tiltEl = null;
document.addEventListener('pointermove', e => {
  if (!settings.anim || e.pointerType !== 'mouse') return;
  const c = e.target.closest('.card');
  if (tiltEl && tiltEl !== c) { tiltEl.style.transform = ''; tiltEl = null; }
  if (!c) return;
  if (tiltEl !== c) { tiltEl = c; sfx('tick'); }
  const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
  c.style.transform = `perspective(900px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateY(-6px)`;
});
$('#quicksearch').onsubmit = e => { e.preventDefault(); const v = $('#qs-input').value.trim(); bump('search'); location.hash = '#/search?q=' + encodeURIComponent(v); $('#qs-input').value = ''; $('#qs-input').blur(); };
$('#btn-menu').onclick = () => { const n = $('#mainnav'); n.classList.toggle('open'); $('#btn-menu').setAttribute('aria-expanded', n.classList.contains('open')); sfx('click'); };
addEventListener('scroll', () => { $('#totop').classList.toggle('show', scrollY > 600); }, { passive: true });
$('#totop').onclick = () => { sfx('whoosh'); scrollTo({ top: 0, behavior: settings.anim ? 'smooth' : 'auto' }); };
// 瀏覽器需使用者互動後才能播放音訊
const unlock = () => { if (settings.music) Sound.startMusic(); removeEventListener('pointerdown', unlock); };
addEventListener('pointerdown', unlock);

$$('#mainnav a').forEach(a => { a.title = a.textContent.trim(); });
$('#footer-meta').textContent = `典藏 ${DATA.length} 檔展覽・${DATA.reduce((s, e) => s + e.items.length, 0)} 件文宣　資料更新：${window.HONGTU_BUILT || '—'}`;
bindSettings(); applySettings();
lastPath = location.hash.split('?')[0];
if (!DATA.length) app.innerHTML = '<div class="wrap empty"><p>尚未產生展覽資料，請先執行「更新網站.bat」。</p></div>';
else route();
})();
