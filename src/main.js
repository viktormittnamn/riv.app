import './fonts.css';
import './styles.css';
import {
  PAPERS, ICONS, makeBlock, tear, undo, restart, setTotal, isDone, lastTorn, remaining, lockedToday, canTear,
  status, shelfOrder, stats, reminderPlan, challengeQuery, parseChallenge, migrate, exportBackup, importBackup, canCreate, paperLocked, pad2, dayKey
} from './logic.js';
import { t, setLang, getLang, fmtDate, fmtDateLower } from './i18n.js';
import * as audio from './audio.js';
import { loadRaw, saveRaw, haptic, setHaptics, shareImage, saveTextFile, remindersSupported, scheduleReminders, updateWidget, setStatusBar, shareLink, setupNativeChrome, isNative, buyPro, restorePro, PRICE_LABEL } from './platform.js';
import { drawShare, ensureFonts, toBlob, PAPER_HEX } from './share.js';

const KEY = 'rivblock_v1';
const PAYWALL = false;
// shortcut: tom tills appen har en egen webbplats; då blir länkarna klickbara för alla, inte bara de som har appen
const SITE_URL = ''; // slås på när köp i App Store är kopplat
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = migrate(null);
let current = null; // id för öppet block
let usingKeyboard = false;
window.addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key === 'Enter') usingKeyboard = true; }, true);
window.addEventListener('pointerdown', () => { usingKeyboard = false; }, true);

/* =========================================================
   LAGRING
   ========================================================= */
/** Lägg om påminnelserna efter varje ändring (bara i appen) */
let remTimer = null;
function refreshReminders(ask = false) {
  if (!remindersSupported()) return Promise.resolve(true);
  clearTimeout(remTimer);
  const run = () => scheduleReminders(reminderPlan(state.blocks, state.settings.reminder).map((p) => ({
    at: p.at, title: t('reminderTitle'), body: p.waiting > 1 ? t('reminderMany', p.waiting) : t('reminderText')
  })), ask);
  if (ask) return run();
  remTimer = setTimeout(run, 800);
  return Promise.resolve(true);
}

/** Widgeten visar de tre viktigaste egna blocken (samma ordning som hyllan) */
function syncWidget() {
  const pads = shelfOrder(state.blocks.filter((b) => !b.intro && !b.example)).active.slice(0, 3).map((b) => {
    const c = PAPER_HEX[b.paper], l = lastTorn(b);
    return { id: b.id, title: b.title, icon: b.icon || '', left: remaining(b), total: b.total, next: b.torn.length + 1,
      daily: b.pace === 'daily', lastDay: l ? dayKey(l.at) : null, bg: c.bg, ink: c.ink, muted: c.muted };
  });
  updateWidget(JSON.stringify({ lang: getLang(), pads }));
}

let saveTimer = null;
function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => { saveRaw(KEY, JSON.stringify(state)); refreshReminders(); syncWidget(); };
  if (now) go(); else saveTimer = setTimeout(go, 150);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

function daysAgo(n, h = 19) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 12, 0, 0); return d.toISOString(); }

function seedBlocks() {
  const sv = getLang() === 'sv';
  const intro = makeBlock({ title: t('introTitle'), total: 5, pace: 'free', paper: 'smor' });
  intro.intro = true; intro.texts = t('introTexts');
  const ex1 = makeBlock({ title: sv ? 'Dagar utan godis' : 'Days without candy', total: 21, pace: 'daily', paper: 'mint' });
  ex1.example = true; ex1.createdAt = daysAgo(8);
  const n1 = sv ? ['Svårt efter middagen', '', '', 'Frukt i stället', '', '', '', 'Lättare nu'] : ['Hard after dinner', '', '', 'Fruit instead', '', '', '', 'Easier now'];
  ex1.torn = n1.map((note, i) => ({ n: i + 1, at: daysAgo(8 - i), note }));
  const ex2 = makeBlock({ title: sv ? 'Böcker i höst' : 'Autumn books', total: 5, pace: 'free', paper: 'himmel' });
  ex2.example = true; ex2.createdAt = daysAgo(80);
  const n2 = sv ? ['Tove Jansson', '', 'Lånad av mamma', '', 'Bäst hittills'] : ['Tove Jansson', '', "Borrowed from mum", '', 'Best so far'];
  ex2.torn = n2.map((note, i) => ({ n: i + 1, at: daysAgo(70 - i * 14), note }));
  return [intro, ex1, ex2];
}

/* =========================================================
   HJÄLPARE
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getBlock = (id) => state.blocks.find((b) => b.id === id);
const shelfView = $('#shelfView'), padView = $('#padView'), overlay = $('#overlay'), live = $('#live');

function announce(msg) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }

let toastTimer = null;
function toast(msg, actionLabel, action) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').onclick = () => { el.classList.remove('show'); action(); };
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 4500 : 2600);
}

const I = {
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="4" height="4" rx="1"/><rect x="4" y="15" width="4" height="4" rx="1"/><path d="M11 7h9M11 17h9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.3 2.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-.3 1.6l-3.1 1.4-3 3 .6 4.2a1 1 0 0 1-1.7.9L10 14.2l-5.3 5.3a1 1 0 1 1-1.4-1.4L8.6 12.8 4.4 8.6a1 1 0 0 1 .9-1.7l4.2.6 3-3 1.4-3.1a1 1 0 0 1 .4-.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>'
};

/* =========================================================
   HYLLAN
   ========================================================= */
function chipFor(b) {
  const s = status(b);
  if (s === 'waiting') return `<span class="chip go">${t('chipWaiting')}</span>`;
  if (s === 'rested') return `<span class="chip ok">${t('chipRested')}</span>`;
  if (s === 'free') return `<span class="chip">${t('chipFree')}</span>`;
  return '';
}
const tag = (b) => (b.example ? `<span class="ex-tag">${t('example')}</span>` : '');

let selecting = false;
const selected = new Set();
const pick = (b) => (selecting ? `<span class="pick" aria-hidden="true">${selected.has(b.id) ? '✓' : ''}</span>` : '');
const sel = (b) => (selecting ? ` aria-pressed="${selected.has(b.id)}"` : '');

function card(b) {
  if (isDone(b)) return `<button class="done-card" type="button" data-open="${b.id}"${sel(b)}>${pick(b)}
    <div class="tag" data-paper="${b.paper}" style="view-transition-name:pad-${b.id}"><b>${b.icon ? b.icon + ' ' : ''}${b.total} / ${b.total}</b></div>
    <div><h4>${esc(b.title)}</h4><div class="meta">${t('finished', fmtDate(lastTorn(b).at, true))}${b.example ? ' · ' + t('example').toLowerCase() : ''}</div></div></button>`;
  const left = remaining(b), pct = Math.round((b.torn.length / b.total) * 100);
  let sheets = '';
  for (let i = Math.min(3, left - 1); i >= 1; i--) sheets += `<div class="sheet" style="transform:translate(${i * 2}px,${i * 3}px);opacity:${1 - i * 0.22}"></div>`;
  return `<button class="pad-card" type="button" data-open="${b.id}"${sel(b)}>${pick(b)}${b.pinned && !selecting ? `<span class="pin-badge" aria-label="${t('pinnedBlocks')}">${I.pin}</span>` : ''}
    <div class="mini" data-paper="${b.paper}" style="view-transition-name:pad-${b.id}">${sheets}<div class="face"><div class="num">${left}</div><div class="cap">${t('left')}</div></div></div>
    <div style="min-width:0"><h3>${b.icon ? b.icon + ' ' : ''}${esc(b.title)}${tag(b)}</h3>
    <div class="meta">${t('tornOf', b.torn.length, b.total)} · ${b.pace === 'daily' ? t('daily') : t('free')}</div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="chips">${chipFor(b)}</div></div></button>`;
}

function tile(b) {
  const left = remaining(b), done = isDone(b), st = status(b), pct = Math.round((b.torn.length / b.total) * 100);
  let sheets = '';
  for (let i = Math.min(3, done ? 0 : left - 1); i >= 1; i--) sheets += `<i class="sheet" style="transform:translateY(${i * 3}px);left:${i * 2}px;right:${i * 2}px"></i>`;
  const meta = done ? t('finished', fmtDate(lastTorn(b).at)) : st === 'waiting' ? t('chipWaiting') : st === 'rested' ? t('chipRested') : t('tornOf', b.torn.length, b.total);
  return `<button class="tile${done ? ' is-done' : ''}${st === 'waiting' ? ' is-waiting' : ''}" type="button" data-open="${b.id}"${sel(b)}>${pick(b)}
    <div class="tile-pad" data-paper="${b.paper}" style="view-transition-name:pad-${b.id}">${sheets}
      <div class="face"><b class="bind"></b>
        ${b.icon ? `<span class="ico">${b.icon}</span>` : ''}
        <div class="num">${done ? '✓' : left}</div><div class="cap">${done ? t('bindingDone') : t('left')}</div>
        ${done ? '' : `<div class="bar"><span style="width:${pct}%"></span></div>`}
      </div></div>
    <div class="tile-title">${esc(b.title)}${tag(b)}</div>
    <div class="tile-meta">${meta}</div></button>`;
}

function renderShelf() {
  const { active, done } = shelfOrder(state.blocks);
  for (const id of selected) if (!getBlock(id)) selected.delete(id);
  const pinned = active.filter((b) => b.pinned), loose = active.filter((b) => !b.pinned);
  const today = loose.filter((b) => status(b) === 'waiting'), rest = loose.filter((b) => status(b) !== 'waiting');
  const sw = (html, b) => `<div class="swipe" data-sw="${b.id}"><div class="swipe-bg" aria-hidden="true"><span class="sw-pin">${I.pin}</span><span class="sw-del">${I.trash}</span></div>${html}</div>`;
  const grid = state.settings.view === 'grid';
  const section = (label, list, first, done) => list.length ? `<div class="shelf-head${first ? ' first' : ''}"><span class="label">${label}</span>${first ? `<button class="link-btn" type="button" id="selBtn">${selecting ? t('selectDone') : t('select')}</button>` : `<span class="label">${list.length}</span>`}</div>${grid ? `<div class="tiles">${list.map((b) => sw(tile(b), b)).join('')}</div>` : `<div class="${done ? 'done-grid' : 'cards'}">${list.map((b) => sw(card(b), b)).join('')}</div>`}` : '';
  let h = `<header class="topbar"><div class="wordmark" aria-label="Rivblock"><i></i>Rivblock</div>
    <div class="row"><button class="icon-btn" type="button" id="viewBtn" aria-label="${grid ? t('viewList') : t('viewGrid')}">${grid ? I.list : I.grid}</button>
    <button class="icon-btn" type="button" id="setBtn" aria-label="${t('settings')}">${I.gear}</button>
    <button class="pill-btn" type="button" id="newBtn">${I.plus}${t('newBlock')}</button></div></header>
    <div class="shelf-scroll${selecting ? ' selecting' : ''}">`;
  if (!state.blocks.length) h += `<p class="shelf-intro">${t('intro')}</p><div class="empty"><div>${t('emptyShelf')}</div><button class="pill-btn accent" type="button" data-new>${t('startBlock')}</button></div>`;
  const groups = [[t('pinnedBlocks'), pinned], [t('today2'), today], [t('activeBlocks'), rest], [t('emptyBlocks'), done]].filter(([, l]) => l.length);
  groups.forEach(([label, list], i) => { h += section(label, list, i === 0, list === done); });
  h += '</div>';
  if (selecting) {
    const all = selected.size === state.blocks.length;
    h += `<div class="select-bar"><button class="pill-btn ghost" type="button" id="selAll">${all ? t('selectNone') : t('selectAll')}</button>
      <button class="pill-btn danger" type="button" id="selDel"${selected.size ? '' : ' disabled'}>${t('deleteN', selected.size)}</button></div>`;
  }
  shelfView.innerHTML = h;
}

/** Tar bort block och visar Ångra som lägger tillbaka dem på samma plats */
function removeBlocks(ids) {
  const gone = state.blocks.map((b, i) => [b, i]).filter(([b]) => ids.includes(b.id));
  if (!gone.length) return;
  state.blocks = state.blocks.filter((b) => !ids.includes(b.id));
  save(true); renderShelf(); haptic.snap();
  toast(t('removedN', gone.length), t('undo').split(' ')[0], () => {
    for (const [b, i] of gone) state.blocks.splice(i, 0, b);
    save(true); renderShelf();
  });
}

/* Swipe som i iOS Mail: vänster = ta bort (röd papperskorg), höger = fäst överst (nål) */
let swipe = null, swallowClick = false;
shelfView.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('[data-open]'), wrap = card?.closest('.swipe');
  if (!card || !wrap || selecting) return;
  swipe = { card, wrap, id: card.dataset.open, x0: e.clientX, y0: e.clientY, dx: 0, on: false, armed: false, pid: e.pointerId };
});
shelfView.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.pid) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (!swipe.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // det var scroll
    if (Math.abs(dx) < 10) return;
    swipe.on = true;
    swipe.wrap.classList.add('on');
    try { swipe.card.setPointerCapture(e.pointerId); } catch { /* */ }
  }
  const canPin = !isDone(getBlock(swipe.id));
  swipe.dx = canPin ? dx : Math.min(0, dx);
  const armed = Math.abs(swipe.dx) > swipe.card.offsetWidth * 0.4;
  if (armed !== swipe.armed) { swipe.armed = armed; haptic.tick(); }
  swipe.wrap.classList.toggle('l', swipe.dx < 0);
  swipe.wrap.classList.toggle('r', swipe.dx > 0);
  swipe.wrap.classList.toggle('armed', armed);
  swipe.card.style.transition = 'none';
  swipe.card.style.transform = `translateX(${swipe.dx}px)`;
});
function endSwipe() {
  if (!swipe) return;
  const { card, wrap, id, dx, on, armed } = swipe; swipe = null;
  if (!on) return;
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 50);
  card.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)';
  if (armed && dx < 0) { // ta bort: kortet åker ut och raden fälls ihop
    card.style.transform = 'translateX(-110%)';
    wrap.style.height = wrap.offsetHeight + 'px';
    requestAnimationFrame(() => { wrap.classList.add('collapse'); });
    setTimeout(() => removeBlocks([id]), 260);
    return;
  }
  card.style.transform = '';
  if (armed && dx > 0) { // fäst: nålen sticks i kortet, sedan flyttas det överst
    const b = getBlock(id);
    const pin = document.createElement('span'); pin.className = 'pin-drop'; pin.innerHTML = I.pin;
    wrap.appendChild(pin);
    setTimeout(() => haptic.snap(), 260);
    setTimeout(() => {
      b.pinned = !b.pinned; if (!b.pinned) delete b.pinned;
      save(true); morph(renderShelf);
      toast(b.pinned ? t('pinnedToast') : t('unpinnedToast'));
    }, 520);
  }
  setTimeout(() => wrap.classList.remove('on', 'l', 'r', 'armed'), 280);
}
shelfView.addEventListener('pointerup', endSwipe);
shelfView.addEventListener('pointercancel', endSwipe);

shelfView.addEventListener('click', (e) => {
  if (swallowClick) return;
  if (e.target.closest('#viewBtn')) { state.settings.view = state.settings.view === 'grid' ? 'list' : 'grid'; save(); haptic.tick(); return morph(renderShelf); }
  if (e.target.closest('#selBtn')) { selecting = !selecting; selected.clear(); return renderShelf(); }
  if (e.target.closest('#selAll')) { if (selected.size === state.blocks.length) selected.clear(); else state.blocks.forEach((b) => selected.add(b.id)); return renderShelf(); }
  if (e.target.closest('#selDel')) { const ids = [...selected]; selecting = false; selected.clear(); return removeBlocks(ids); }
  const o = e.target.closest('[data-open]');
  if (o && selecting) { const id = o.dataset.open; selected.has(id) ? selected.delete(id) : selected.add(id); haptic.tick(); return renderShelf(); }
  if (o) return morph(() => openPad(o.dataset.open));
  if (e.target.closest('#newBtn,[data-new]')) return openCreate();
  if (e.target.closest('#setBtn')) return openSettings();
});

let ignorePop = false;
function showShelf(fromPop = false) {
  if (fromPop !== true && !isNative() && history.state && history.state.rb === 'pad') { ignorePop = true; try { history.back(); } catch { ignorePop = false; } }
  current = null;
  renderShelf();
  padView.hidden = true; shelfView.hidden = false;
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (overlay.innerHTML) { closeSheet(); if (current) try { history.pushState({ rb: 'pad' }, ''); } catch { /* */ } return; }
  if (current) showShelf(true);
});

/* =========================================================
   BLOCKVYN
   ========================================================= */
function ticketHTML(b, n, kind, locked) {
  const dateLbl = kind === 'active' && !locked ? `${t('today')} ${fmtDate()}` : locked ? t('tomorrow') : t('next');
  const lead = b.intro && b.texts && b.texts[n - 1] ? `<div class="t-lead">${esc(b.texts[n - 1])}</div>` : '';
  const note = kind === 'active' && !b.intro
    ? `<div class="t-note"><label for="noteIn">${t('note')}</label><input id="noteIn" type="text" maxlength="60" autocomplete="off" enterkeyhint="done" placeholder="${t('notePh')}"${locked ? ' disabled' : ''} value="${esc(locked ? '' : b.draft || '')}"></div>`
    : '<div class="t-note"></div>';
  return `<div class="stub"><span>${esc(b.title)}</span><span>${b.round > 1 ? t('round', b.round) + ' · ' : ''}RB-${b.id}</span></div>
    <div class="perf"><i class="dots"></i><i class="gap"></i><i class="notch l"></i><i class="notch r"></i></div>
    <div class="tbody">
      ${locked ? `<div class="big-stamp">${t('stampTomorrow')}<small>${t('stampTomorrowSub')}</small></div>` : ''}
      <div class="t-row"><span>${t('ticketNo')}</span><span>${dateLbl}</span></div>
      <div class="bignum">${pad2(n)}<small>/${pad2(b.total)}</small></div>
      <div class="t-title">${b.icon ? `<span class="t-ico">${b.icon}</span> ` : ''}${esc(b.title)}</div>${lead}
      ${note}
      <div class="t-foot"><div><div class="barcode"></div><div class="serial">RB-${b.id}-${pad2(n)}</div></div><div class="stamp">${t('tearOff')}</div></div>
    </div>`;
}

/** Byt vy med zoom från blocket på hyllan (iOS 18+/Chrome), annars direkt */
function morph(fn) {
  if (!document.startViewTransition || reduceMotion()) return fn();
  let ran = false;
  const once = () => { if (!ran) { ran = true; fn(); } };
  try { document.startViewTransition(once); } catch { once(); }
  setTimeout(once, 400); // om övergången hänger sig byter vi vy ändå
}

function openPad(id, entering = false) {
  if (!current && !isNative()) { try { history.pushState({ rb: 'pad' }, ''); } catch { /* */ } }
  current = id;
  shelfView.hidden = true; padView.hidden = false;
  renderPad(entering);
  if (usingKeyboard) $('#backBtn')?.focus({ preventScroll: true });
}

function statusLine(b) {
  if (isDone(b)) return '';
  if (lockedToday(b)) return t('statusRested');
  if (!state.settings.hintSeen || b.intro && b.torn.length === 0) return `<span class="hint">${t('hint')} ${I.arrow}</span>`;
  const l = lastTorn(b);
  if (b.pace === 'daily') return l ? t('statusDaily', fmtDateLower(l.at)) : t('statusDailyFirst');
  return l ? t('statusFree', fmtDateLower(l.at)) : t('statusFreeFirst');
}

function doneHTML(b) {
  if (!isDone(b)) return '';
  const first = b.torn[0], last = lastTorn(b);
  const span = dayKey(first.at) === dayKey(last.at) ? fmtDate(last.at, true) : `${fmtDate(first.at)} – ${fmtDate(last.at, true)}`;
  const st = stats(b), notes = b.torn.filter((x) => x.note);
  const actions = b.intro
    ? `<button class="pill-btn accent" type="button" id="firstBtn">${t('startBlock')}</button>
       <div class="row"><button class="link-btn" type="button" id="toShelfBtn">${t('toShelf')}</button></div>`
    : `<button class="pill-btn" type="button" id="shareBtn">${t('share')}</button>
       <div class="row"><button class="link-btn" type="button" id="againBtn">${t('again')}</button><button class="link-btn" type="button" id="toShelfBtn">${t('toShelf')}</button></div>`;
  return `<div class="done" data-paper="${b.paper}">
    <div class="d-head"><div class="d-stamp">${t('emptyStamp')}</div><h3>${esc(b.title)}</h3>
      <div class="d-meta">${t('doneMeta', b.total, span)}</div><div class="d-meta">${t('doneStats', st.days, st.activeDays)}</div></div>
    <div class="stubs" style="${b.total <= 6 ? `grid-template-columns:repeat(${b.total},1fr)` : b.total <= 12 ? 'grid-template-columns:repeat(6,1fr)' : ''}">${b.torn.map((x) => `<div class="s${x.note ? ' noted' : ''}"><b>${pad2(x.n)}</b><span>${fmtDate(x.at)}</span></div>`).join('')}</div>
    ${notes.length ? `<div class="notes">${notes.map((x) => `<div><b>${pad2(x.n)}</b><span>${esc(x.note)}</span></div>`).join('')}</div>` : ''}
    <div class="d-actions">${actions}</div></div>`;
}

function renderPad(entering) {
  const b = getBlock(current);
  if (!b) return showShelf();
  const left = remaining(b), done = isDone(b), locked = lockedToday(b), n = b.torn.length + 1;
  let h = `<header class="topbar pad-top"><button class="icon-btn" type="button" id="backBtn" aria-label="${t('toShelf')}">${I.back}</button>
    <h2>${esc(b.title)}</h2><div class="row">
    <button class="icon-btn" type="button" id="soundBtn" aria-label="${state.settings.sound ? t('soundOff') : t('soundOn')}">${state.settings.sound ? I.soundOn : I.soundOff}</button>
    <button class="icon-btn" type="button" id="moreBtn" aria-label="${t('more')}">${I.more}</button></div></header>
    <div class="pad-main"><div class="stage" id="stage" data-paper="${b.paper}" style="view-transition-name:pad-${b.id}">
    <div class="board"><div class="binding"><span>${done ? t('bindingDone') : t('bindingLeft', left)}</span></div>${doneHTML(b)}</div>${b.torn.length && !done ? '<i class="remnant"></i>' : ''}`;
  if (!done) {
    for (let i = Math.min(4, left - 1); i >= 1; i--) h += `<div class="stack-sheet" style="transform:translateY(${i * 2.6}px);left:${i * 1.2}px;right:${i * 1.2}px;z-index:${10 - i}"></div>`;
    if (left > 1 && !locked) h += `<div class="ticket preview" aria-hidden="true">${ticketHTML(b, n + 1, 'preview')}</div>`;
    h += `<div class="ticket active${locked ? ' locked' : ''}${entering ? ' entering' : ''}" id="active" tabindex="0" role="button" aria-label="${esc(t('tearLabel', n, b.total))}"${locked ? ' aria-disabled="true"' : ''}>${ticketHTML(b, n, 'active', locked)}</div>`;
  }
  h += `</div><div class="pad-status" id="padStatus">${statusLine(b)}</div></div>`;
  padView.innerHTML = h;
  if (done) requestAnimationFrame(() => $('.done', padView)?.classList.add('show'));
  bindPad(b);
}

function bindPad(b) {
  $('#backBtn').onclick = () => morph(() => showShelf());
  $('#soundBtn').onclick = () => {
    state.settings.sound = !state.settings.sound; audio.setSound(state.settings.sound); save();
    if (state.settings.sound) { audio.unlock(); audio.rip(b.paper, 0.7, 0.5); }
    renderPad(false); $('#soundBtn').focus();
  };
  $('#moreBtn').onclick = () => openMenu(b);
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('shareBtn', () => shareBlock(b));
  on('againBtn', () => {
    const nb = makeBlock({ title: b.title, total: b.total, pace: b.pace, paper: b.paper, icon: b.icon });
    nb.round = (b.round || 1) + 1;
    state.blocks.unshift(nb); save(true); audio.unlock(); audio.settle();
    current = nb.id; renderPad(true);
  });
  on('toShelfBtn', () => showShelf());
  on('firstBtn', () => { showShelf(); openCreate(); });
  const note = $('#noteIn');
  if (note) {
    note.addEventListener('input', () => { b.draft = note.value; save(); });
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') note.blur(); });
  }
  const act = $('#active');
  if (act) {
    act.addEventListener('pointerdown', onDown);
    act.addEventListener('pointermove', onMove);
    act.addEventListener('pointerup', onUp);
    act.addEventListener('pointercancel', onUp);
    act.addEventListener('keydown', (e) => {
      if (e.target !== act) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); autoTear(); }
    });
  }
}

/* =========================================================
   RIV-FYSIK
   ========================================================= */
const THRESHOLD = 0.8;
const drag = { on: false, id: null, x0: 0, y0: 0, lx: 0, lt: 0, dir: 'ltr', locked: false, prog: 0, step: 0, vel: 0, busy: false };

function parts() {
  const a = $('#active');
  return a ? { a, body: $('.tbody', a), gap: $('.gap', a), stamp: $('.stamp', a) } : null;
}

function refuse() {
  const E = parts(); if (!E) return;
  E.a.classList.remove('shake'); void E.a.offsetWidth; E.a.classList.add('shake');
  haptic.nope();
}

function onDown(e) {
  const b = getBlock(current);
  if (!b || drag.busy || isDone(b)) return;
  if (e.target.closest('input')) return;
  audio.unlock();
  if (!canTear(b)) return refuse();
  if (document.activeElement?.id === 'noteIn') document.activeElement.blur();
  const E = parts(), r = E.a.getBoundingClientRect();
  Object.assign(drag, { on: true, id: e.pointerId, x0: e.clientX, lx: e.clientX, y0: e.clientY, lt: performance.now(), prog: 0, step: 0, locked: false });
  drag.dir = (e.clientX - r.left) / r.width > 0.55 ? 'rtl' : 'ltr';
  haptic.start();
  try { E.a.setPointerCapture(e.pointerId); } catch { /* */ }
}

function applyTear(E, p, dir, dy) {
  const c = Math.max(0, Math.min(1, p)), s = dir === 'ltr' ? 1 : -1;
  E.body.style.transformOrigin = dir === 'ltr' ? '96% 0%' : '4% 0%';
  E.body.style.transition = 'none';
  E.body.classList.toggle('tearing', c > 0.03);
  const tilt = -s * (c * 14.5 + Math.max(0, dy * 0.03));
  const y = c * 24 + Math.max(0, Math.min(36, dy * 0.3)), x = s * c * 12;
  // pappret lyfter från hörnet: lätt 3D-böj som växer med rivningen
  E.body.style.transform = `perspective(900px) translate3d(${x}px,${y}px,0) rotate(${tilt}deg) rotateX(${c * 9}deg) rotateY(${-s * c * 7}deg)`;
  E.gap.style.transition = 'none';
  E.gap.style.opacity = c > 0.02 ? '1' : '0';
  E.gap.style.width = Math.min(94, c * 96) + '%';
  E.gap.style.left = dir === 'ltr' ? '10px' : 'auto';
  E.gap.style.right = dir === 'ltr' ? 'auto' : '10px';
  E.stamp.style.opacity = String(0.4 + c * 0.55);
  E.stamp.textContent = c > 0.6 ? t('doneStamp') : t('tearOff');
}

function onMove(e) {
  if (!drag.on || e.pointerId !== drag.id || drag.busy) return;
  const E = parts(); if (!E) return;
  const r = E.a.getBoundingClientRect(), dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.locked && Math.abs(dx) > 8) { drag.dir = dx >= 0 ? 'ltr' : 'rtl'; drag.locked = true; }
  const sdx = drag.dir === 'ltr' ? dx : -dx, span = r.width * 0.8;
  const p = Math.max(0, Math.min(1, Math.max(0, sdx / span) + (dy > 16 && sdx > 10 ? (dy * 0.22) / span : 0)));
  const now = performance.now(), vel = Math.abs(e.clientX - drag.lx) / Math.max(8, now - drag.lt);
  drag.lx = e.clientX; drag.lt = now;
  const b = getBlock(current);
  const hole = 9 / span; // en knäpp per hål i perforeringen (hålen sitter var 9:e px)
  if (p > drag.step + hole) { drag.step = p; audio.rip(b.paper, Math.min(2.2, vel), p); haptic.tick(); }
  drag.vel = vel;
  drag.prog = p;
  applyTear(E, p, drag.dir, dy);
  if (p >= THRESHOLD) completeTear(vel);
}

function springBack(E) {
  E.body.style.transition = 'transform .42s cubic-bezier(.22,1.25,.36,1)';
  E.body.style.transform = ''; E.body.classList.remove('tearing');
  E.gap.style.transition = 'width .3s ease, opacity .25s ease'; E.gap.style.width = '0'; E.gap.style.opacity = '0';
  E.stamp.style.opacity = '.4'; E.stamp.textContent = t('tearOff');
}

function onUp(e) {
  if (!drag.on || e.pointerId !== drag.id) return;
  drag.on = false;
  const E = parts(); if (!E) return;
  try { E.a.releasePointerCapture(e.pointerId); } catch { /* */ }
  if (drag.busy) return;
  haptic.end();
  if (drag.prog > 0.5 && drag.vel > 0.5) return completeTear(drag.vel); // snärt över halvvägs räcker
  if (drag.prog > 0.06) audio.settle();
  springBack(E);
}

/** Tangentbord/skärmläsare: animera rivningen automatiskt */
function autoTear() {
  const b = getBlock(current);
  if (!b || drag.busy || isDone(b)) return;
  audio.unlock();
  if (!canTear(b)) return refuse();
  const E = parts(); drag.dir = 'ltr';
  if (reduceMotion()) return completeTear(0.8);
  drag.busy = true;
  const t0 = performance.now(), D = 420;
  let step = 0;
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / D) * THRESHOLD;
    if (p > step + 0.06) { step = p; audio.rip(b.paper, 0.9, p); haptic.tick(); }
    applyTear(E, p, 'ltr', 0);
    if (p < THRESHOLD) requestAnimationFrame(frame); else { drag.busy = false; completeTear(1); }
  };
  requestAnimationFrame(frame);
}

function completeTear(vel) {
  if (drag.busy) return;
  const b = getBlock(current), E = parts(), stage = $('#stage');
  const note = (b.draft || '').trim();
  if (!tear(b, note)) return;
  drag.busy = true; drag.on = false;
  audio.snap(b.paper); haptic.snap();

  const r = E.body.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const ghost = E.body.cloneNode(true);
  ghost.classList.add('falling');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText += `;left:${r.left - sr.left}px;top:${r.top - sr.top}px;width:${E.body.offsetWidth}px;height:${E.body.offsetHeight}px;`;
  const gi = ghost.querySelector('input'); if (gi) { gi.removeAttribute('id'); gi.value = note; }
  const gs = ghost.querySelector('.stamp'); if (gs) { gs.textContent = t('doneStamp'); gs.style.opacity = '.95'; }

  state.settings.hintSeen = true;
  const finished = isDone(b), n = b.torn.length;
  save(true);
  renderPad(true);
  $('#stage').appendChild(ghost);
  if (usingKeyboard) $('#active')?.focus({ preventScroll: true });
  announce(t('tornAnnounce', n, remaining(b)));

  if (finished) { audio.chime(); setTimeout(() => haptic.success(), 250); }
  else if (lockedToday(b)) { setTimeout(() => { audio.thud(); haptic.snap(); }, 380); }
  if (!b.intro) toast(t('tornAnnounce', n, remaining(b)), t('undo').split(' ')[0], () => doUndo(b));

  if (reduceMotion()) { ghost.remove(); drag.busy = false; return; }
  const s = drag.dir === 'ltr' ? 1 : -1;
  const fx = s * (90 + Math.min(125, vel * 75)), rot = s * (26 + Math.random() * 14);
  ghost.classList.add('ragged');
  const from = ghost.style.transform || 'none';
  ghost.animate([
    { transform: from, opacity: 1 },
    { transform: `perspective(900px) translate3d(${fx * 0.35}px,140px,0) rotate(${rot * 0.4}deg) rotateY(${s * 28}deg)`, opacity: 1, offset: 0.35 },
    { transform: `perspective(900px) translate3d(${fx * 0.7}px,330px,0) rotate(${rot * 0.75}deg) rotateY(${-s * 18}deg)`, opacity: 0.85, offset: 0.7 },
    { transform: `perspective(900px) translate3d(${fx}px,540px,0) rotate(${rot}deg) rotateY(${s * 10}deg)`, opacity: 0 }
  ], { duration: 820, easing: 'cubic-bezier(.4,.05,.7,.4)', fill: 'forwards' });
  setTimeout(() => { ghost.remove(); drag.busy = false; }, 840);
}

function doUndo(b) {
  if (!undo(b)) return;
  save(); audio.unlock(); audio.settle();
  if (current === b.id) renderPad(true); else renderShelf();
  toast(t('undone'));
}

/* =========================================================
   SHEETS
   ========================================================= */
let lastFocus = null;
function closeSheet() {
  overlay.innerHTML = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function openSheet(html, onReady, label) {
  lastFocus = document.activeElement;
  $('.toast')?.classList.remove('show');
  overlay.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || '')}"><div class="grabber"></div>${html}</div></div>`;
  $('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim') closeSheet(); });
  const sh = $('.sheet', overlay);
  if (onReady) onReady(sh);
  const f = sh.querySelector('input:not([type=hidden]),button:not(.grabber)');
  if (f && !('ontouchstart' in window)) f.focus({ preventScroll: true });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.innerHTML) closeSheet();
  if (e.key === 'Tab' && overlay.innerHTML) { // håll fokus i sheeten
    const items = [...overlay.querySelectorAll('button,input,textarea,select')].filter((x) => !x.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

function blockForm(b) {
  const counts = [5, 10, 21, 30, 50];
  return `<div class="field"><label class="label" for="cTitle">${t('whatTitle')}</label>
      <input class="text-in" id="cTitle" maxlength="40" placeholder="${t('titlePh')}" autocomplete="off" enterkeyhint="done" value="${b ? esc(b.title) : ''}">
      ${b ? '' : `<div class="seg sug">${t('suggestions').map(([s], i) => `<button type="button" data-sug="${i}">${esc(s)}</button>`).join('')}</div>`}</div>
    <div class="field"><span class="label" id="cCountLbl">${t('count')}</span><div class="seg" role="group" aria-labelledby="cCountLbl">
      ${counts.map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
      <input class="count-in" id="cCountIn" type="number" min="1" max="100" inputmode="numeric" placeholder="${t('countOwn')}" aria-label="${t('countOwn')}"></div>
      ${b && b.torn.length ? `<span class="fine">${t('countMin', b.torn.length)}</span>` : ''}</div>
    <div class="field"><span class="label">${t('pace')}</span><div class="pace">
      <button type="button" data-pace="daily"><b>${t('paceDaily')}</b><span>${t('paceDailySub')}</span></button>
      <button type="button" data-pace="free"><b>${t('paceFree')}</b><span>${t('paceFreeSub')}</span></button></div></div>
    <div class="field"><span class="label">${t('icon')}</span><div class="icons">
      <button type="button" data-ic="" aria-label="${t('noIcon')}">–</button>${ICONS.map((x) => `<button type="button" data-ic="${x}">${x}</button>`).join('')}</div></div>
    <div class="field"><span class="label">${t('paper')}</span><div class="swatches">
      ${PAPERS.map((p) => `<button type="button" data-p="${p}"><i data-paper="${p}"></i>${t('papers')[p]}${paperLocked(p, state, PAYWALL) ? `<span class="lock">${I.lock}</span>` : ''}</button>`).join('')}</div></div>`;
}

function wireForm(sh, f, onSubmit, minCount = 1) {
  const ti = $('#cTitle', sh), ci = $('#cCountIn', sh);
  const preset = [5, 10, 21, 30, 50];
  function sync() {
    sh.querySelectorAll('[data-n]').forEach((x) => { x.setAttribute('aria-pressed', String(+x.dataset.n === f.total)); x.disabled = +x.dataset.n < minCount; });
    sh.querySelectorAll('[data-pace]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pace === f.pace)));
    sh.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.p === f.paper)));
    sh.querySelectorAll('[data-ic]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.ic === f.icon)));
    if (document.activeElement !== ci) ci.value = preset.includes(f.total) ? '' : f.total;
  }
  sync();
  sh.addEventListener('click', (e) => {
    let x;
    if ((x = e.target.closest('[data-sug]'))) {
      const [title, n, pace, paper, icon] = t('suggestions')[+x.dataset.sug];
      ti.value = title; f.total = Math.max(minCount, n); f.pace = pace; f.icon = icon;
      if (!paperLocked(paper, state, PAYWALL)) f.paper = paper;
      sync(); haptic.tick();
    }
    else if ((x = e.target.closest('[data-n]'))) { f.total = +x.dataset.n; sync(); }
    else if ((x = e.target.closest('[data-pace]'))) { f.pace = x.dataset.pace; sync(); }
    else if ((x = e.target.closest('[data-ic]'))) { f.icon = x.dataset.ic; sync(); haptic.tick(); }
    else if ((x = e.target.closest('[data-p]'))) {
      if (paperLocked(x.dataset.p, state, PAYWALL)) return openPro(t('proPaper'));
      f.paper = x.dataset.p; sync();
    }
  });
  ci.addEventListener('input', () => { const v = parseInt(ci.value, 10); if (v >= 1) { f.total = Math.max(minCount, Math.min(100, v)); sync(); } });
  ci.addEventListener('blur', () => { ci.value = preset.includes(f.total) ? '' : f.total; });
  ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') ti.blur(); });
  $('#cGo', sh).onclick = () => {
    const title = ti.value.trim();
    if (!title) { ti.focus(); ti.placeholder = t('titleMissing'); haptic.nope(); return; }
    onSubmit(title);
  };
}

function openCreate(pre = null) {
  if (!canCreate(state, PAYWALL)) return openPro(t('proLimit'));
  const f = pre ? { total: pre.total, pace: pre.pace, paper: pre.paper, icon: pre.icon } : { total: 21, pace: 'daily', paper: 'rosa', icon: '' };
  openSheet(`<h2>${t('newBlock')}</h2>${blockForm(null)}<button class="pill-btn accent big" type="button" id="cGo">${t('create')}</button>`, (sh) => {
    if (pre) $('#cTitle', sh).value = pre.title;
    wireForm(sh, f, (title) => {
      const b = makeBlock({ title, ...f });
      state.blocks = state.blocks.filter((x) => !(x.intro && isDone(x))); // färdigt intro behövs inte längre
      state.blocks.unshift(b); save(true); closeSheet();
      audio.unlock(); audio.settle(); haptic.snap();
      openPad(b.id, true);
    });
  }, t('newBlock'));
}

function openEdit(b) {
  const f = { total: b.total, pace: b.pace, paper: b.paper, icon: b.icon || '' };
  openSheet(`<h2>${t('edit')}</h2>${blockForm(b)}<button class="pill-btn accent big" type="button" id="cGo">${t('saveChanges')}</button>`, (sh) => {
    wireForm(sh, f, (title) => {
      b.title = title.slice(0, 40); b.pace = f.pace; b.paper = f.paper; b.icon = f.icon; setTotal(b, f.total);
      delete b.example;
      save(true); closeSheet(); renderPad(false);
    }, Math.max(1, b.torn.length));
  }, t('edit'));
}

function openMenu(b) {
  openSheet(`<h2>${esc(b.title)}</h2><div class="menu">
      ${b.torn.length ? `<button type="button" id="mHist">${t('history')}</button>` : ''}
      ${b.intro ? '' : `<button type="button" id="mEdit">${t('edit')}</button>`}
      ${b.intro ? '' : `<button type="button" id="mChal">${t('challenge')}</button>`}
      ${isDone(b) || b.intro ? '' : `<button type="button" id="mPin">${b.pinned ? t('unpin') : t('pin')}</button>`}
      ${b.torn.length && !b.intro ? `<button type="button" id="mUndo">${t('undo')}</button>` : ''}
      ${b.torn.length && !b.intro ? `<button type="button" id="mShare">${t('shareBlock')}</button>` : ''}
      <button type="button" id="mReset">${t('restart')}</button>
      <button type="button" class="danger" id="mDel">${t('remove')}</button>
      <button type="button" id="mCancel">${t('cancel')}</button></div>`, (sh) => {
    const arm = (btn, text, act) => { if (btn.dataset.armed) return act(); btn.dataset.armed = '1'; btn.textContent = text; btn.style.borderColor = 'currentColor'; haptic.nope(); };
    const on = (id, fn) => { const el = $(id, sh); if (el) el.onclick = fn; };
    on('#mEdit', () => { closeSheet(); openEdit(b); });
    on('#mChal', async () => {
      closeSheet();
      const q = challengeQuery(b), url = SITE_URL ? `${SITE_URL}/app/?${q}` : `rivblock://new?${q}`;
      const r = await shareLink(t('challengeText', b.title, b.total), url);
      if (r === 'copied') toast(t('linkCopied'));
    });
    on('#mPin', () => { b.pinned = !b.pinned; if (!b.pinned) delete b.pinned; save(true); closeSheet(); toast(b.pinned ? t('pinnedToast') : t('unpinnedToast')); });
    on('#mHist', () => { closeSheet(); openHistory(b); });
    on('#mUndo', () => { closeSheet(); doUndo(b); });
    on('#mShare', () => { closeSheet(); shareBlock(b); });
    on('#mReset', function () { arm(this, t('restartConfirm'), () => { restart(b); save(true); closeSheet(); renderPad(true); }); });
    on('#mDel', function () {
      arm(this, t('removeConfirm'), () => {
        const idx = state.blocks.indexOf(b);
        state.blocks.splice(idx, 1); save(true); closeSheet(); showShelf();
        toast(t('removed'), t('undo').split(' ')[0], () => { state.blocks.splice(idx, 0, b); save(true); renderShelf(); });
      });
    });
    on('#mCancel', closeSheet);
  }, b.title);
}

/** Månadskalendrar (måndag först) där dagar med rivna lappar är markerade */
function openHistory(b) {
  const byDay = {};
  for (const x of b.torn) (byDay[dayKey(x.at)] ||= []).push(x.n);
  const first = new Date(b.torn.length ? b.torn[0].at : b.createdAt), now = new Date();
  const months = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now && months.length < 12; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const cal = (m) => {
    const y = m.getFullYear(), mo = m.getMonth(), days = new Date(y, mo + 1, 0).getDate(), lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    let cells = '<i></i>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(y, mo, d)), ns = byDay[k], isToday = k === dayKey();
      cells += ns ? `<button type="button" class="hit${isToday ? ' now' : ''}" data-day="${k}" aria-label="${ns.map((n) => t('editNoteFor', n, fmtDate(new Date(y, mo, d)))).join(', ')}">${d}<small>${ns.length > 1 ? `${ns.length}×` : `nr ${ns[0]}`}</small></button>` : `<span${isToday ? ' class="now"' : ''}>${d}</span>`;
    }
    return `<div class="cal"><div class="cal-m">${t('monthsLong')[mo]} ${y}</div><div class="cal-g">${t('weekdays').map((w) => `<em>${w}</em>`).join('')}${cells}</div></div>`;
  };
  const notes = b.torn.filter((x) => x.note).reverse();
  openSheet(`<h2>${esc(b.title)}</h2><p>${t('historySub', b.torn.length, b.total, Object.keys(byDay).length)}</p>
    <div class="cals" data-paper="${b.paper}">${months.reverse().map(cal).join('')}</div>
    <div class="field"><span class="label">${t('notesTitle')}</span>${notes.length ? `<div class="hist-notes">${notes.map((x) => `<button type="button" data-day="${dayKey(x.at)}"><b>${pad2(x.n)}</b><span>${esc(x.note)}</span><em>${fmtDate(x.at)}</em></button>`).join('')}</div>` : `<p class="fine">${t('noNotes')}</p>`}</div>
    <div id="hEdit"></div>
    <button class="pill-btn big" type="button" id="hClose">${t('close')}</button>`, (sh) => {
    $('#hClose', sh).onclick = closeSheet;
    // tryck på en dag/anteckning → skriv eller ändra anteckningen för den dagens lappar
    sh.addEventListener('click', (e) => {
      const day = e.target.closest('[data-day]')?.dataset.day;
      if (!day) return;
      const ts = b.torn.filter((x) => dayKey(x.at) === day), box = $('#hEdit', sh);
      box.innerHTML = `<div class="note-edit">${ts.map((x) => `<label class="label" for="nt${x.n}">${t('editNoteFor', x.n, fmtDate(x.at))}</label>
        <input class="text-in" id="nt${x.n}" data-n="${x.n}" maxlength="60" value="${esc(x.note)}" placeholder="${t('notePh')}">`).join('')}
        <button class="pill-btn" type="button" id="hSave">${t('saveNote')}</button></div>`;
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      box.querySelector('input').focus();
      $('#hSave', sh).onclick = () => {
        box.querySelectorAll('input').forEach((i) => { b.torn[+i.dataset.n - 1].note = i.value.trim().slice(0, 60); });
        save(true); haptic.tick(); closeSheet(); openHistory(b);
      };
    });
  }, t('history'));
}

/** Förhandsvisa delningsbilden, välj om anteckningar ska med, dela */
async function shareBlock(b) {
  await ensureFonts();
  const hasNotes = b.torn.some((x) => x.note);
  let withNotes = false, url = null, blob = null;
  const draw = async () => { blob = await toBlob(drawShare(b, { notes: withNotes })); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); };
  await draw();
  openSheet(`<h2>${t('yourImage')}</h2><img class="share-img" id="sImg" src="${url}" alt="${esc(b.title)}">
    ${hasNotes ? `<div class="set-list"><div class="set-row"><span>${t('withNotes')}</span><button class="toggle" type="button" role="switch" id="sNotes" aria-checked="false" aria-label="${t('withNotes')}"></button></div></div>` : ''}
    <p id="sHint" hidden>${t('holdToSave')}</p>
    <div class="sheet-actions"><button class="pill-btn ghost" type="button" id="sClose">${t('close')}</button><button class="pill-btn accent" type="button" id="sGo">${t('shareNow')}</button></div>`, (sh) => {
    const nt = $('#sNotes', sh);
    if (nt) nt.onclick = async () => { withNotes = !withNotes; nt.setAttribute('aria-checked', String(withNotes)); await draw(); $('#sImg', sh).src = url; };
    $('#sGo', sh).onclick = async () => { if ((await shareImage(blob, t('shareTitle', b.title))) === 'fallback') $('#sHint', sh).hidden = false; };
    $('#sClose', sh).onclick = () => { closeSheet(); URL.revokeObjectURL(url); };
  }, t('yourImage'));
}

/* ---------- Inställningar ---------- */
function openSettings() {
  const s = state.settings;
  const hasExamples = state.blocks.some((b) => b.example || b.intro);
  const toggle = (id, on, label) => `<button class="toggle" type="button" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"></button>`;
  openSheet(`<h2>${t('settings')}</h2>
    <div class="set-list">
      <div class="set-row"><span>${t('language')}</span><div class="mini-seg" role="group" aria-label="${t('language')}">
        <button type="button" data-lang="auto">${t('langAuto')}</button><button type="button" data-lang="sv">Svenska</button><button type="button" data-lang="en">English</button></div></div>
      <div class="set-row"><span>${t('theme')}</span><div class="mini-seg" role="group" aria-label="${t('theme')}">
        <button type="button" data-th="system">${t('themeSystem')}</button><button type="button" data-th="light">${t('themeLight')}</button><button type="button" data-th="dark">${t('themeDark')}</button></div></div>
      <div class="set-row"><span>${t('sound')}</span>${toggle('sSound', s.sound, t('sound'))}</div>
      <div class="set-row"><span>${t('haptics')}</span>${toggle('sHap', s.haptics, t('haptics'))}</div>
      <div class="set-row"><span>${t('reminder')}${remindersSupported() ? '' : `<small>${t('reminderNative')}</small>`}</span>
        ${remindersSupported() ? `<div class="row"><input class="time-in" type="time" id="sTime" value="${s.reminder || '19:00'}" aria-label="${t('reminder')}">${toggle('sRem', !!s.reminder, t('reminder'))}</div>` : ''}</div>
    </div>
    <div class="field"><span class="label">${t('backup')}</span>
      <div class="sheet-actions"><button class="pill-btn ghost" type="button" id="sExport">${t('backupExport')}</button><button class="pill-btn ghost" type="button" id="sImport">${t('backupImport')}</button></div>
      <div id="sImportBox" hidden><textarea id="sImportTxt" aria-label="${t('backupPaste')}" placeholder="${t('backupPaste')}"></textarea>
        <p class="fine">${t('backupReplace')}</p><button class="pill-btn" type="button" id="sImportGo">${t('backupLoad')}</button></div></div>
    ${hasExamples ? `<button class="pill-btn ghost" type="button" id="sEx">${t('removeExamples')}</button>` : ''}
    ${PAYWALL && !s.pro ? `<button class="pill-btn accent" type="button" id="sPro">${t('proTitle')}</button>` : ''}
    <div class="field"><span class="label">${t('about')}</span><p class="fine">${t('aboutText')}</p><p class="fine">${t('version')} ${VERSION}</p></div>
    <button class="pill-btn big" type="button" id="sClose">${t('close')}</button>`, (sh) => {
    const syncLang = () => sh.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === s.lang)));
    syncLang();
    const syncTh = () => sh.querySelectorAll('[data-th]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.th === s.theme)));
    syncTh();
    sh.querySelectorAll('[data-th]').forEach((x) => x.onclick = () => { s.theme = x.dataset.th; save(); applyTheme(); syncTh(); haptic.tick(); });
    sh.querySelectorAll('[data-lang]').forEach((x) => x.onclick = () => { s.lang = x.dataset.lang; setLang(s.lang); save(); closeSheet(); rerender(); openSettings(); });
    const flip = (el, key, after) => { el.onclick = () => { s[key] = !s[key]; el.setAttribute('aria-checked', String(s[key])); save(); after && after(); }; };
    flip($('#sSound', sh), 'sound', () => { audio.setSound(s.sound); if (s.sound) { audio.unlock(); audio.settle(); } });
    flip($('#sHap', sh), 'haptics', () => { setHaptics(s.haptics); haptic.tick(); });
    const rem = $('#sRem', sh), time = $('#sTime', sh);
    if (rem) {
      const apply = async () => {
        const ok = await refreshReminders(true);
        if (!ok && s.reminder) { s.reminder = null; rem.setAttribute('aria-checked', 'false'); }
        save();
      };
      rem.onclick = () => { s.reminder = s.reminder ? null : time.value || '19:00'; rem.setAttribute('aria-checked', String(!!s.reminder)); apply(); };
      time.onchange = () => { if (s.reminder) { s.reminder = time.value; apply(); } };
    }
    $('#sExport', sh).onclick = async () => {
      const text = exportBackup(state), name = `rivblock-${dayKey()}.json`;
      const r = await saveTextFile(name, text);
      if (r === 'shared' || r === 'downloaded') return toast(t('backupSaved'));
      try { await navigator.clipboard.writeText(text); toast(t('backupCopied')); } catch { $('#sImportBox', sh).hidden = false; $('#sImportTxt', sh).value = text; $('#sImportTxt', sh).select(); }
    };
    $('#sImport', sh).onclick = () => { $('#sImportBox', sh).hidden = false; $('#sImportTxt', sh).focus(); };
    $('#sImportGo', sh).onclick = () => {
      try {
        const next = importBackup($('#sImportTxt', sh).value);
        state = next; applySettings(); save(true); closeSheet(); showShelf();
        toast(t('backupLoaded', state.blocks.length));
      } catch { toast(t('backupBad')); haptic.nope(); }
    };
    const ex = $('#sEx', sh);
    if (ex) ex.onclick = () => { state.blocks = state.blocks.filter((b) => !b.example && !b.intro); save(true); closeSheet(); showShelf(); toast(t('examplesRemoved')); };
    const pro = $('#sPro', sh); if (pro) pro.onclick = () => openPro();
    $('#sClose', sh).onclick = closeSheet;
  }, t('settings'));
}

/* ---------- Rivblock Hela (engångsköp) ---------- */
function openPro(reason) {
  openSheet(`<div class="pro-hero">${['rosa', 'smor', 'mint', 'himmel', 'kvitto', 'kol'].map((p, i) => `<i data-paper="${p}" style="--r:${(i - 2.5) * 4}deg"></i>`).join('')}</div>
    <h2>${t('proTitle')}</h2>${reason ? `<p>${esc(reason)}</p>` : ''}<p>${t('proText')}</p>
    <button class="pill-btn accent big" type="button" id="pBuy">${t('proBuy', PRICE_LABEL)}</button>
    <button class="link-btn" type="button" id="pRestore">${t('proRestore')}</button>
    <button class="pill-btn ghost big" type="button" id="pClose">${t('close')}</button>`, (sh) => {
    const done = (r) => { if (r === 'ok') { state.settings.pro = true; save(true); closeSheet(); toast(t('proThanks')); haptic.success(); } };
    $('#pBuy', sh).onclick = async () => done(await buyPro());
    $('#pRestore', sh).onclick = async () => done(await restorePro());
    $('#pClose', sh).onclick = closeSheet;
  }, t('proTitle'));
}

/* =========================================================
   START
   ========================================================= */
/** Pappersbrus ritas en gång till en liten PNG (billigare än SVG-filter på varje lapp) */
function makeNoise() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 145 | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`);
  } catch { /* SVG-reserven i CSS gäller */ }
}

/* Utseende: följ telefonen, eller tvinga ljust/mörkt (CSS-tokens finns för [data-theme]) */
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const th = state.settings.theme, root = document.documentElement;
  if (th === 'system') delete root.dataset.theme; else root.dataset.theme = th;
  const dark = th === 'dark' || (th === 'system' && darkMq.matches);
  root.dataset.dark = dark ? '1' : '';
  setStatusBar(dark);
}
darkMq.addEventListener('change', () => applyTheme()); // iOS byter till mörkt på kvällen

function applySettings() {
  applyTheme();
  setLang(state.settings.lang);
  audio.setSound(state.settings.sound);
  setHaptics(state.settings.haptics);
}
function rerender() { if (current && getBlock(current)) renderPad(false); else renderShelf(); }

// Ny dag medan appen är öppen → lås upp dagens lapp
let today = dayKey();
function checkDay() { if (dayKey() !== today) { today = dayKey(); refreshReminders(); if (!drag.on && !drag.busy) rerender(); } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

async function boot() {
  // iOS släpper bara upp ljud vid touchend/click, inte pointerdown
  for (const ev of ['touchend', 'click']) document.addEventListener(ev, audio.unlock, { passive: true });
  makeNoise();
  const raw = await loadRaw(KEY);
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  state = migrate(parsed);
  applySettings();
  const first = !parsed;
  if (first) { state.blocks = seedBlocks(); save(true); }
  showShelf();
  setupNativeChrome();
  refreshReminders();
  syncWidget();
  if (isNative()) {
    import('@capacitor/app').then(({ App }) => App.addListener('appUrlOpen', ({ url }) => {
      const id = /^rivblock:\/\/pad\/([A-Z0-9]+)/.exec(url || '')?.[1];
      if (id && getBlock(id)) { closeSheet(); openPad(id); }
      const ch = /^rivblock:\/\/new\?/.test(url || '') && parseChallenge(url);
      if (ch) { closeSheet(); showShelf(); openCreate(ch); }
    })).catch(() => {});
    import('@capacitor/app').then(({ App }) => App.addListener('backButton', () => {
      if (overlay.innerHTML) closeSheet();
      else if (current) showShelf();
      else App.exitApp();
    })).catch(() => {});
  }
  if (first) { const intro = state.blocks.find((b) => b.intro); if (intro) openPad(intro.id); }
  const ch = parseChallenge(location.search);
  if (ch) { history.replaceState(null, '', location.pathname); showShelf(); openCreate(ch); }
  if (!isNative() && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
boot();
