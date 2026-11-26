// Ren logik utan DOM — allt här är enhetstestat (tests/logic.test.js)

export const PAPERS = ['rosa', 'smor', 'mint', 'himmel', 'kvitto', 'kol'];
export const STYLES = ['lott', 'affisch', 'bio', 'kvitto', 'klipp', 'boarding', 'kalender'];
export const FREE_PAPERS = ['rosa', 'mint', 'kvitto'];
export const MAX_TOTAL = 100;
export const ICONS = ['🏃', '💪', '🧘', '🚶', '🚴', '🏊', '🧊', '📚', '✍️', '🎸', '💧', '🥦', '🍬', '🍷', '☕', '😴', '📵', '🧹', '💸', '❤️'];
export const SCHEMA = 2;

export function uid() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/** Lokal kalenderdag som 'YYYY-MM-DD' */
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Antal kalenderdagar mellan två tidpunkter (lokal tid, oberoende av sommartid) */
export function dayDiff(a, b) {
  const da = new Date(a), db = new Date(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** ISO-veckonummer (måndag först, vecka 1 innehåller årets första torsdag) */
export function isoWeek(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / 86400000 + 1) / 7);
}

export function clampTotal(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 21;
  return Math.max(1, Math.min(MAX_TOTAL, v));
}

export function makeBlock({ title, total, pace = 'daily', paper = 'rosa', icon = '', style = 'lott', now = new Date() }) {
  return {
    icon: cleanIcon(icon),
    style: STYLES.includes(style) ? style : 'lott',
    id: uid(),
    title: String(title || '').trim().slice(0, 40),
    total: clampTotal(total),
    pace: pace === 'free' ? 'free' : 'daily',
    paper: PAPERS.includes(paper) ? paper : 'rosa',
    createdAt: new Date(now).toISOString(),
    torn: [],
    draft: '',
    round: 1
  };
}

/** En symbol: kort sträng utan HTML-tecken, annars tom */
export const cleanIcon = (x) => (typeof x === 'string' && x.length <= 8 && !/[<>&"']/.test(x) ? x : '');

export const isDone = (b) => b.torn.length >= b.total;
export const lastTorn = (b) => (b.torn.length ? b.torn[b.torn.length - 1] : null);
export const remaining = (b) => Math.max(0, b.total - b.torn.length);

/** I "en om dagen"-läge: är dagens lapp redan riven? */
export function lockedToday(b, now = new Date()) {
  const l = lastTorn(b);
  return b.pace === 'daily' && !isDone(b) && !!l && dayKey(l.at) === dayKey(now);
}

export function canTear(b, now = new Date()) {
  return !isDone(b) && !lockedToday(b, now);
}

/** River av nästa lapp. Returnerar true om något hände. Muterar blocket. */
export function tear(b, note = '', now = new Date()) {
  if (!canTear(b, now)) return false;
  b.torn.push({ n: b.torn.length + 1, at: new Date(now).toISOString(), note: String(note || '').trim().slice(0, 60) });
  b.draft = '';
  return true;
}

export function undo(b) {
  if (!b.torn.length) return false;
  const t = b.torn.pop();
  b.draft = t.note || '';
  return true;
}

export function restart(b, now = new Date()) {
  b.torn = [];
  b.draft = '';
  b.round = (b.round || 1) + 1;
  b.createdAt = new Date(now).toISOString();
}

/** Ändra antal lappar — aldrig färre än redan rivna */
export function setTotal(b, n) {
  b.total = Math.max(b.torn.length || 1, clampTotal(n));
}

export function stats(b) {
  if (!b.torn.length) return { days: 0, activeDays: 0, notes: 0 };
  const first = b.torn[0].at, last = lastTorn(b).at;
  const activeDays = new Set(b.torn.map((t) => dayKey(t.at))).size;
  return { days: dayDiff(first, last) + 1, activeDays, notes: b.torn.filter((t) => t.note).length };
}

/** Status för hyllkortet */
export function status(b, now = new Date()) {
  if (isDone(b)) return 'done';
  if (b.pace === 'daily') return lockedToday(b, now) ? 'rested' : 'waiting';
  return 'free';
}

/** Sortering på hyllan: väntande först, sedan senast aktiv */
export function shelfOrder(blocks, now = new Date()) {
  const rank = { waiting: 0, free: 1, rested: 2 };
  const touched = (b) => (lastTorn(b) ? lastTorn(b).at : b.createdAt);
  const active = blocks.filter((b) => !isDone(b)).sort((a, c) => (c.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || rank[status(a, now)] - rank[status(c, now)] || (touched(c) > touched(a) ? 1 : -1));
  const done = blocks.filter(isDone).sort((a, c) => (lastTorn(c).at > lastTorn(a).at ? 1 : -1));
  return { active, done };
}

/* ---------- Lagring & migrering ---------- */

export function defaultSettings() {
  return { sound: true, haptics: true, lang: 'auto', reminder: null, view: 'list', theme: 'system', hintSeen: false, onboarded: false, pro: false };
}

/** Tar emot vad som helst (gammalt format, trasig JSON-data) och returnerar ett giltigt state */
export function migrate(raw) {
  const out = { schema: SCHEMA, settings: defaultSettings(), blocks: [] };
  if (!raw || typeof raw !== 'object') return out;
  // v1 hade sound/hintSeen direkt på roten
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : raw;
  for (const k of Object.keys(out.settings)) if (k in s && typeof s[k] === typeof out.settings[k]) out.settings[k] = s[k];
  if (typeof s.reminder === 'string' && /^\d{2}:\d{2}$/.test(s.reminder)) out.settings.reminder = s.reminder;
  if (!['auto', 'sv', 'en'].includes(out.settings.lang)) out.settings.lang = 'auto';
  if (!['list', 'grid'].includes(out.settings.view)) out.settings.view = 'list';
  if (!['system', 'light', 'dark'].includes(out.settings.theme)) out.settings.theme = 'system';
  if (Array.isArray(raw.blocks)) {
    for (const b of raw.blocks) {
      if (!b || typeof b !== 'object' || !b.title) continue;
      const torn = Array.isArray(b.torn) ? b.torn.filter((t) => t && t.at && !isNaN(new Date(t.at))) : [];
      const blk = {
        id: typeof b.id === 'string' && b.id ? b.id : uid(),
        title: String(b.title).slice(0, 40),
        total: clampTotal(b.total),
        pace: b.pace === 'free' ? 'free' : 'daily',
        paper: PAPERS.includes(b.paper) ? b.paper : 'rosa',
        createdAt: b.createdAt && !isNaN(new Date(b.createdAt)) ? b.createdAt : new Date().toISOString(),
        torn: torn.map((t, i) => ({ n: i + 1, at: t.at, note: String(t.note || '').slice(0, 60) })),
        draft: String(b.draft || '').slice(0, 60),
        round: Number(b.round) || 1,
        icon: cleanIcon(b.icon),
        style: STYLES.includes(b.style) ? b.style : 'lott'
      };
      if (b.pinned === true) blk.pinned = true;
      if (b.example) blk.example = true;
      if (b.intro) { blk.intro = true; blk.texts = Array.isArray(b.texts) ? b.texts.slice(0, blk.total) : []; }
      blk.total = Math.max(blk.total, blk.torn.length);
      out.blocks.push(blk);
    }
  }
  return out;
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'rivblock', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('bad-json'); }
  if (!raw || raw.app !== 'rivblock') throw new Error('not-rivblock');
  return migrate(raw);
}

/** Free-gränser (används bara när betalvägg är påslagen) */
export function canCreate(state, paywall) {
  if (!paywall || state.settings.pro) return true;
  return state.blocks.filter((b) => !isDone(b) && !b.example && !b.intro).length < 2;
}
export const paperLocked = (paper, state, paywall) => !!paywall && !state.settings.pro && !FREE_PAPERS.includes(paper);

/**
 * Datum för påminnelser kommande dagar. Hoppar över idag om klockan passerat eller om
 * inget väntar idag. Returnerar [{ at: Date, waiting: antal block }].
 */
export function reminderPlan(blocks, hhmm, now = new Date(), days = 14) {
  if (!hhmm) return [];
  const active = blocks.filter((b) => !isDone(b) && !b.intro && !b.example);
  if (!active.length) return [];
  const [h, m] = hhmm.split(':').map(Number);
  const out = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now); at.setDate(at.getDate() + i); at.setHours(h, m, 0, 0);
    if (at <= now) continue;
    // idag räknas bara block som faktiskt väntar; framtida dagar: alla dagliga + fria
    const waiting = i === 0 ? active.filter((b) => canTear(b, now)).length : active.length;
    if (waiting) out.push({ at, waiting });
  }
  return out;
}

/* ---------- Utmana en vän: blockets inställningar som länk ---------- */
export function challengeQuery(b) {
  const q = new URLSearchParams({ t: b.title, n: String(b.total), p: b.pace, c: b.paper });
  if (b.icon) q.set('i', b.icon);
  return q.toString();
}

/** Läser en utmaning ur en länk (okänd källa: allt valideras). null om den saknas. */
export function parseChallenge(query) {
  const q = new URLSearchParams(String(query || '').replace(/^.*?\?/, ''));
  const title = (q.get('t') || '').trim().slice(0, 40);
  if (!title) return null;
  return {
    title,
    total: clampTotal(q.get('n')),
    pace: q.get('p') === 'free' ? 'free' : 'daily',
    paper: PAPERS.includes(q.get('c')) ? q.get('c') : 'rosa',
    icon: cleanIcon(q.get('i') || '')
  };
}
