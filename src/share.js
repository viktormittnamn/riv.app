// Delningsbild 1080×1350 (Instagram 4:5), ritad på canvas.
import { isDone, lastTorn, pad2 } from './logic.js';
import { t, fmtDate } from './i18n.js';

export const PAPER_HEX = {
  rosa: { bg: '#f7bccb', ink: '#4a1426', muted: '#8c4a5d', stamp: '#c01f48', hole: '#c97f93' },
  smor: { bg: '#f6df8b', ink: '#3b2c05', muted: '#7b6320', stamp: '#b3430f', hole: '#c2a245' },
  mint: { bg: '#b2e5cb', ink: '#0f3a28', muted: '#3e7058', stamp: '#0b6a43', hole: '#6fb08f' },
  himmel: { bg: '#b8d4f1', ink: '#10284a', muted: '#42608a', stamp: '#1b4db0', hole: '#7b9fcb' },
  kvitto: { bg: '#fbfbf7', ink: '#17171a', muted: '#6c6c75', stamp: '#17171a', hole: '#b9b9bf' },
  kol: { bg: '#29282e', ink: '#f3eee4', muted: '#a29d92', stamp: '#e8c27c', hole: '#55525c' },
  kraft: { bg: '#c9a57a', ink: '#2e1f0f', muted: '#5f4528', stamp: '#7a2e12', hole: '#8a6a45' },
  tidning: { bg: '#e6e2d6', ink: '#1d1c19', muted: '#6b675c', stamp: '#b02a1e', hole: '#a9a497' },
  washi: { bg: '#f3eee2', ink: '#2b2620', muted: '#8b8274', stamp: '#b5452e', hole: '#c9bfae' },
  akvarell: { bg: '#f6f2ea', ink: '#1f3a57', muted: '#5b7690', stamp: '#2c5d91', hole: '#a9b8c6' },
  kalker: { bg: '#f4f4f0', ink: '#1b1a21', muted: '#5d5b66', stamp: '#1b1a21', hole: '#9c9aa4' },
  rutat: { bg: '#fbfbf8', ink: '#1b2a4a', muted: '#5a6b8c', stamp: '#2b4fa0', hole: '#b4c0d8' },
  linjerat: { bg: '#fdfcf6', ink: '#1b1a21', muted: '#6b6a72', stamp: '#c83c3c', hole: '#c4c2ba' },
  mm: { bg: '#f4f8f0', ink: '#173b22', muted: '#4f7a5a', stamp: '#1f7a43', hole: '#a9c7b0' },
  sakerhet: { bg: '#d9ecdf', ink: '#123d2a', muted: '#3d6b55', stamp: '#0b6a43', hole: '#8fbba2' },
  randigt: { bg: '#f7f3ec', ink: '#4a1426', muted: '#8c4a5d', stamp: '#c01f48', hole: '#d6a3b0' },
  neongul: { bg: '#e9ff3a', ink: '#1d2200', muted: '#59650a', stamp: '#3a4300', hole: '#b0c21e' },
  neonorange: { bg: '#ff7a45', ink: '#2a0d00', muted: '#7a2a07', stamp: '#2a0d00', hole: '#d65a2a' },
  guld: { bg: '#1c1b1f', ink: '#e0bd73', muted: '#9c8a62', stamp: '#e0bd73', hole: '#4a4436' }
};

const DISPLAY = '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

function rr(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

function grain(x, X, Y, w, h, alpha) {
  const n = Math.round(w * h / 90);
  x.save(); x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    x.fillRect(X + Math.random() * w, Y + Math.random() * h, 1.6, 1.6);
  }
  x.restore();
}

function spaced(s) { return s.split('').join(' '); }

export async function ensureFonts() {
  if (!document.fonts?.load) return;
  try { await Promise.all([document.fonts.load(`900 96px ${DISPLAY}`), document.fonts.load(`500 24px ${MONO}`), document.fonts.load("800 48px 'Riv Logo'")]); } catch { /* reserv */ }
}

export function drawShare(b, { notes = false } = {}) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const P = PAPER_HEX[b.paper] || PAPER_HEX.rosa;
  const done = isDone(b);

  // bakgrund: papperets färg som ett stort fält
  x.fillStyle = P.bg; x.fillRect(0, 0, W, H);
  grain(x, 0, 0, W, H, 0.05);

  // kartong
  const BX = 80, BY = 80, BW = W - 160, BH = H - 160;
  x.save(); x.shadowColor = 'rgba(20,16,10,.28)'; x.shadowBlur = 60; x.shadowOffsetY = 26;
  x.fillStyle = '#a9a39a'; rr(x, BX, BY, BW, BH, 40); x.fill(); x.restore();
  x.save(); rr(x, BX, BY, BW, BH, 40); x.clip(); grain(x, BX, BY, BW, BH, 0.08);
  // bindning
  x.fillStyle = '#1b1a21'; x.fillRect(BX, BY, BW, 74);
  x.restore();
  x.fillStyle = '#e9e6df'; x.font = `500 22px ${MONO}`; x.textAlign = 'center';
  x.fillText(spaced(done ? t('imgDone') : t('imgLeft', b.total - b.torn.length)), W / 2, BY + 46);

  // titel
  x.fillStyle = '#23211d'; x.font = `900 100px ${DISPLAY}`;
  const words = b.title.toUpperCase().split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const tt = line ? line + ' ' + w : w; if (x.measureText(tt).width > BW - 120 && line) { lines.push(line); line = w; } else line = tt; }
  lines.push(line);
  const L = lines.slice(0, 2);
  L.forEach((l, i) => x.fillText(l, W / 2, BY + 200 + i * 94));
  let y = BY + 200 + (L.length - 1) * 94 + 58;
  const first = b.torn[0], last = lastTorn(b);
  x.font = `500 24px ${MONO}`; x.fillStyle = 'rgba(35,33,29,.75)';
  x.fillText(t('imgOf', b.torn.length, b.total) + (first ? '  ·  ' + fmtDate(first.at) + ' – ' + fmtDate(last.at, true) : ''), W / 2, y);

  // lapparna
  const cols = b.total <= 5 ? 5 : b.total <= 12 ? 6 : b.total <= 30 ? 6 : b.total <= 56 ? 8 : 10;
  const gap = 12, gw = BW - 120;
  let cw = (gw - gap * (cols - 1)) / cols, ch = cw * 1.08;
  const rows = Math.ceil(b.total / cols);
  const quotes = notes ? b.torn.filter((x) => x.note).slice(-3).reverse() : [];
  const gy = y + 44, maxH = BY + BH - 150 - gy - quotes.length * 58;
  if (rows * (ch + gap) - gap > maxH) ch = (maxH + gap) / rows - gap;
  const gx = BX + 60;
  for (let i = 0; i < b.total; i++) {
    const cx = gx + (i % cols) * (cw + gap), cy = gy + Math.floor(i / cols) * (ch + gap), tk = b.torn[i];
    if (tk) {
      x.fillStyle = P.bg; rr(x, cx, cy, cw, ch, Math.min(10, ch / 6)); x.fill();
      x.fillStyle = P.ink; x.font = `900 ${Math.round(ch * 0.48)}px ${DISPLAY}`;
      x.fillText(pad2(i + 1), cx + cw / 2, cy + ch * (ch > 60 ? 0.6 : 0.7));
      if (ch > 60) {
        x.fillStyle = P.muted; x.font = `500 ${Math.max(11, Math.round(ch * 0.12))}px ${MONO}`;
        x.fillText(fmtDate(tk.at), cx + cw / 2, cy + ch * 0.86);
      }
      if (tk.note) { x.fillStyle = P.stamp; x.beginPath(); x.arc(cx + cw - 10, cy + 10, 4, 0, Math.PI * 2); x.fill(); }
    } else {
      x.setLineDash([7, 7]); x.strokeStyle = 'rgba(35,33,29,.35)'; x.lineWidth = 2;
      rr(x, cx + 1, cy + 1, cw - 2, ch - 2, Math.min(10, ch / 6)); x.stroke(); x.setLineDash([]);
    }
  }

  // anteckningar som citat ovanför signaturen
  x.textAlign = 'left';
  quotes.forEach((q, i) => {
    const qy = BY + BH - 150 - (quotes.length - i) * 58 + 40;
    x.fillStyle = 'rgba(35,33,29,.55)'; x.font = `500 20px ${MONO}`; x.fillText(pad2(q.n), BX + 60, qy);
    x.fillStyle = '#23211d'; x.font = `italic 500 32px "Instrument Sans", sans-serif`;
    let s = `”${q.note}”`; while (x.measureText(s).width > BW - 200 && s.length > 4) s = s.slice(0, -2) + '…”';
    x.fillText(s, BX + 110, qy);
  });
  x.textAlign = 'center';
  // stämpel
  if (done) {
    x.save(); x.translate(W - 270, BY + BH - 120); x.rotate(-0.12);
    x.strokeStyle = P.stamp === '#e8c27c' ? '#8a5a12' : P.stamp; x.fillStyle = x.strokeStyle; x.lineWidth = 6; x.globalAlpha = 0.92;
    rr(x, -150, -52, 300, 104, 14); x.stroke();
    x.font = `900 64px ${DISPLAY}`; x.fillText(t('doneStamp').toUpperCase(), 0, 23); x.restore();
  }
  // signatur
  x.fillStyle = '#23211d'; x.textAlign = 'left'; x.font = `900 42px ${DISPLAY}`;
  x.font = `800 48px 'Riv Logo', ${DISPLAY}`;
  x.fillText('RIV', BX + 60, BY + BH - 92);
  x.font = `500 18px ${MONO}`; x.fillStyle = 'rgba(35,33,29,.7)';
  x.fillText('RB-' + b.id, BX + 60, BY + BH - 62);
  return c;
}

export function toBlob(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}
