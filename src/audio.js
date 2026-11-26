// Pappersljud: en riktig CC0-inspelning (src/sounds/rip.mp3) som spelas i korta bitar i takt med fingret.
// Syntetiskt brus används tills inspelningen är laddad.
import ripUrl from './sounds/rip.mp3';

let ctx = null, buf = null, enabled = true, sample = null, loading = false, lastError = '';
export const setSound = (on) => { enabled = on; };
/** För felsökning i Inställningar: vad ljudmotorn gör just nu */
export const status = () => ({ enabled, ctx: ctx ? ctx.state : 'saknas', sample: sample ? 'laddad' : loading ? 'laddas/misslyckad' : 'ej startad', rate: ctx ? ctx.sampleRate : 0, error: lastError });

export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const len = ctx.sampleRate * 2;
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        d[i] = w * 0.65 + (b0 + b1 + b2) * 0.35;
      }
    }
    if (!sample && !loading) {
      loading = true;
      // ripUrl är en inbyggd data-URL; avkoda direkt (fetch av data: kan blockeras av CSP)
      const bytes = Uint8Array.from(atob(ripUrl.split(',')[1]), (c) => c.charCodeAt(0));
      ctx.decodeAudioData(bytes.buffer).then((b) => { sample = b; }).catch((e) => { lastError = 'avkodning: ' + (e && e.message || e); });
    }
    if (ctx.state !== 'running') {
      ctx.resume();
      // iOS: en tyst buffert inom användarens tryck låser upp ljudet på riktigt
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    }
  } catch { /* inget ljud */ }
}

function prof(paper) {
  if (paper === 'kvitto') return { f: 2900, q: 1.5, g: 0.22, hp: 900 };
  if (paper === 'kol') return { f: 860, q: 1.05, g: 0.3, hp: 220 };
  return { f: 1750, q: 1.2, g: 0.26, hp: 450 };
}
const ready = () => enabled && ctx && buf;

// Varje papper låter som sin vikt: tonhöjd (rate) och filter
const PAPER = {
  rosa: { rate: 1.05, hp: 280, lp: 9000, g: 0.9 },
  smor: { rate: 0.98, hp: 220, lp: 8000, g: 0.95 },
  mint: { rate: 1.1, hp: 320, lp: 10000, g: 0.85 },
  himmel: { rate: 0.94, hp: 200, lp: 7000, g: 0.95 },
  kvitto: { rate: 1.38, hp: 1100, lp: 14000, g: 0.75 }, // tunt termopapper: ljust och vasst
  kol: { rate: 0.7, hp: 90, lp: 2600, g: 1.25 }, // tjock kartong: mörkt och dovt
  kraft: { rate: 0.82, hp: 120, lp: 4200, g: 1.15 },
  tidning: { rate: 1.12, hp: 400, lp: 9000, g: 0.8 },
  washi: { rate: 1.22, hp: 600, lp: 7000, g: 0.65 }, // mjukt och tyst
  akvarell: { rate: 0.9, hp: 160, lp: 5200, g: 1.05 },
  kalker: { rate: 1.5, hp: 1400, lp: 15000, g: 0.7 }, // tunt och prasslande
  rutat: { rate: 1.05, hp: 300, lp: 9000, g: 0.9 }, linjerat: { rate: 1.05, hp: 300, lp: 9000, g: 0.9 }, mm: { rate: 1.08, hp: 320, lp: 9500, g: 0.88 },
  sakerhet: { rate: 0.95, hp: 220, lp: 7500, g: 1 }, randigt: { rate: 1, hp: 260, lp: 8500, g: 0.95 },
  neongul: { rate: 1.1, hp: 300, lp: 10000, g: 0.9 }, neonorange: { rate: 1.1, hp: 300, lp: 10000, g: 0.9 },
  guld: { rate: 0.66, hp: 80, lp: 2400, g: 1.3 } // tung svart kartong
};

/** Spela en bit av inspelningen [from, from+len] genom papprets filter */
function grain(paper, from, len, gain, rateJitter = 0.04) {
  const P = PAPER[paper] || PAPER.rosa, t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = sample;
  s.playbackRate.value = P.rate * (1 - rateJitter + Math.random() * rateJitter * 2);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = P.hp;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.lp;
  const g = ctx.createGain(), dur = len / s.playbackRate.value, v = gain * P.g;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ctx.destination);
  s.start(t, from, len);
}
function src() { const s = ctx.createBufferSource(); s.buffer = buf; return s; }

/** Ett litet ripp per perforeringstand; följer draghastigheten */
export function rip(paper, vel = 0.5, prog = 0.5) {
  if (!ready()) return;
  // inspelningens svaga rivdel (0,05–0,22 s) följer hur långt fingret kommit
  if (sample) { try { grain(paper, 0.05 + prog * 0.15 + Math.random() * 0.01, 0.045, Math.min(1.3, 0.45 + vel * 0.5)); } catch (e) { lastError = 'rip: ' + e.message; } return; }
  try {
    const t = ctx.currentTime, p = prof(paper), s = src(), dur = 0.02 + Math.random() * 0.018;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = p.f * (0.86 + Math.random() * 0.32 + prog * 0.18) * Math.min(1.55, 0.72 + vel * 0.58); bp.Q.value = p.q;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p.g * Math.min(1.25, 0.42 + vel * 0.62), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ctx.destination);
    s.start(t, Math.random() * 1.4, dur + 0.01);
  } catch { /* */ }
}

/** Det sista ryck-ljudet när lappen lossnar */
export function snap(paper) {
  if (!ready()) return;
  if (sample) { try { grain(paper, 0.19, 0.3, 1.25, 0.02); } catch (e) { lastError = 'snap: ' + e.message; } return; } // det kraftiga rycket
  try {
    const t = ctx.currentTime, p = prof(paper), s = src();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.85;
    bp.frequency.setValueAtTime(p.f * 1.05, t);
    bp.frequency.exponentialRampToValueAtTime(p.f * 2.15, t + 0.085);
    bp.frequency.exponentialRampToValueAtTime(p.f * 0.55, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(p.g * 1.45, t + 0.014); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(bp); bp.connect(g); g.connect(ctx.destination); s.start(t, Math.random() * 1.2, 0.18);
    const s2 = src(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp * 2.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.001, t + 0.018); g2.gain.linearRampToValueAtTime(p.g * 1.2, t + 0.025); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
    s2.connect(hp); hp.connect(g2); g2.connect(ctx.destination); s2.start(t + 0.018, Math.random() * 1.2, 0.06);
  } catch { /* */ }
}

/** Mjukt prassel (lappen fjädrar tillbaka, nytt block) */
export function settle() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime, s = src(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 680;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.075, t + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(lp); lp.connect(g); g.connect(ctx.destination); s.start(t, Math.random() * 1.2, 0.1);
  } catch { /* */ }
}

/** Stämpelduns när dagens lapp är riven (en om dagen) */
export function thud() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime + 0.05, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.18);
    const s = src(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.12, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(lp); lp.connect(g2); g2.connect(ctx.destination); s.start(t, Math.random(), 0.07);
  } catch { /* */ }
}

/** Varm klang när blocket är tomt */
export function chime() {
  if (!ready()) return;
  try {
    const t = ctx.currentTime + 0.15;
    [392, 493.88, 587.33, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), st = t + i * 0.07;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.045, st + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.8);
      o.connect(g); g.connect(ctx.destination); o.start(st); o.stop(st + 0.85);
    });
  } catch { /* */ }
}
