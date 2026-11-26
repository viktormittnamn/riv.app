import { describe, it, expect } from 'vitest';
import {
  dayKey, dayDiff, makeBlock, tear, undo, restart, lockedToday, canTear, isDone, remaining,
  setTotal, stats, status, shelfOrder, migrate, exportBackup, importBackup, canCreate, paperLocked, clampTotal
} from '../src/logic.js';

const D = (s) => new Date(s);

describe('datum', () => {
  it('dayKey ger lokal dag', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('dayDiff räknar kalenderdagar över sommartid', () => {
    expect(dayDiff(new Date(2026, 2, 28, 22), new Date(2026, 2, 30, 1))).toBe(2);
    expect(dayDiff(new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 12))).toBe(2);
  });
});

describe('block', () => {
  it('skapas med rimliga värden', () => {
    const b = makeBlock({ title: '  Promenader  ', total: 500, pace: 'x', paper: 'okänd' });
    expect(b.title).toBe('Promenader');
    expect(b.total).toBe(100);
    expect(b.pace).toBe('daily');
    expect(b.paper).toBe('rosa');
    expect(b.id).toMatch(/^[A-Z0-9]{4}$/);
  });
  it('clampTotal hanterar skräp', () => {
    expect(clampTotal('abc')).toBe(21);
    expect(clampTotal(0)).toBe(1);
    expect(clampTotal(7.6)).toBe(8);
  });
  it('en om dagen: en lapp per kalenderdag', () => {
    const b = makeBlock({ title: 'Läsa', total: 3, pace: 'daily' });
    expect(tear(b, 'kap 1', D('2026-11-01T10:00'))).toBe(true);
    expect(lockedToday(b, D('2026-11-01T23:00'))).toBe(true);
    expect(tear(b, '', D('2026-11-01T23:00'))).toBe(false);
    expect(canTear(b, D('2026-11-02T00:01'))).toBe(true);
    // missad dag straffas inte
    expect(tear(b, '', D('2026-11-05T08:00'))).toBe(true);
    expect(b.torn.map((t) => t.n)).toEqual([1, 2]);
    expect(b.torn[0].note).toBe('kap 1');
  });
  it('eget tempo: flera per dag, tar slut', () => {
    const b = makeBlock({ title: 'Pass', total: 2, pace: 'free' });
    const t = D('2026-11-01T10:00');
    expect(tear(b, '', t)).toBe(true);
    expect(tear(b, '', t)).toBe(true);
    expect(isDone(b)).toBe(true);
    expect(tear(b, '', t)).toBe(false);
    expect(remaining(b)).toBe(0);
    expect(status(b)).toBe('done');
  });
  it('ångra lägger tillbaka anteckningen som utkast', () => {
    const b = makeBlock({ title: 'X', total: 3 });
    tear(b, 'hej');
    expect(undo(b)).toBe(true);
    expect(b.torn.length).toBe(0);
    expect(b.draft).toBe('hej');
    expect(undo(b)).toBe(false);
  });
  it('börja om ökar varvet', () => {
    const b = makeBlock({ title: 'X', total: 1 });
    tear(b);
    restart(b);
    expect(b.torn.length).toBe(0);
    expect(b.round).toBe(2);
  });
  it('setTotal går aldrig under rivna', () => {
    const b = makeBlock({ title: 'X', total: 5, pace: 'free' });
    tear(b); tear(b); tear(b);
    setTotal(b, 1);
    expect(b.total).toBe(3);
  });
  it('stats', () => {
    const b = makeBlock({ title: 'X', total: 5, pace: 'free' });
    tear(b, 'a', D('2026-11-01T10:00'));
    tear(b, '', D('2026-11-01T12:00'));
    tear(b, 'c', D('2026-11-04T12:00'));
    expect(stats(b)).toEqual({ days: 4, activeDays: 2, notes: 2 });
  });
});

describe('hyllan', () => {
  it('sorterar väntande först och tomma separat', () => {
    const now = D('2026-11-10T12:00');
    const a = makeBlock({ title: 'vilar', total: 5, pace: 'daily' }); tear(a, '', now);
    const b = makeBlock({ title: 'väntar', total: 5, pace: 'daily' });
    const c = makeBlock({ title: 'klar', total: 1, pace: 'free' }); tear(c, '', now);
    const d = makeBlock({ title: 'fritt', total: 5, pace: 'free' });
    const { active, done } = shelfOrder([a, b, c, d], now);
    expect(active.map((x) => x.title)).toEqual(['väntar', 'fritt', 'vilar']);
    expect(done.map((x) => x.title)).toEqual(['klar']);
  });
});

describe('migrering & backup', () => {
  it('läser v1-format', () => {
    const v1 = { sound: false, hintSeen: true, blocks: [{ id: 'AB12', title: 'Godis', total: 21, pace: 'daily', paper: 'mint', torn: [{ n: 1, at: '2026-11-01T10:00:00Z', note: 'x' }], example: true }] };
    const s = migrate(v1);
    expect(s.settings.sound).toBe(false);
    expect(s.settings.hintSeen).toBe(true);
    expect(s.blocks[0].paper).toBe('mint');
    expect(s.blocks[0].example).toBe(true);
    expect(s.blocks[0].round).toBe(1);
  });
  it('tål trasig data', () => {
    expect(migrate(null).blocks).toEqual([]);
    const s = migrate({ blocks: [null, { title: '' }, { title: 'ok', total: 'x', torn: [{ at: 'nope' }, { at: '2026-01-01' }] }] });
    expect(s.blocks.length).toBe(1);
    expect(s.blocks[0].torn.length).toBe(1);
    expect(s.blocks[0].total).toBe(21);
  });
  it('total blir aldrig mindre än rivna', () => {
    const s = migrate({ blocks: [{ title: 'x', total: 1, torn: [{ at: '2026-01-01' }, { at: '2026-01-02' }] }] });
    expect(s.blocks[0].total).toBe(2);
  });
  it('backup tur och retur', () => {
    const s = migrate({ blocks: [{ title: 'Läsa', total: 3, torn: [] }] });
    const back = importBackup(exportBackup(s));
    expect(back.blocks[0].title).toBe('Läsa');
    expect(() => importBackup('{')).toThrow('bad-json');
    expect(() => importBackup('{"a":1}')).toThrow('not-rivblock');
  });
});

describe('betalvägg', () => {
  it('max två egna aktiva block gratis', () => {
    const s = migrate({ blocks: [{ title: 'a', total: 3 }, { title: 'b', total: 3 }, { title: 'ex', total: 3, example: true }] });
    expect(canCreate(s, false)).toBe(true);
    expect(canCreate(s, true)).toBe(false);
    s.settings.pro = true;
    expect(canCreate(s, true)).toBe(true);
  });
  it('papper låses bara med betalvägg', () => {
    const s = migrate({});
    expect(paperLocked('kol', s, false)).toBe(false);
    expect(paperLocked('kol', s, true)).toBe(true);
    expect(paperLocked('rosa', s, true)).toBe(false);
  });
});

import { reminderPlan, makeBlock as mk, tear as tr } from '../src/logic.js';
describe('påminnelser', () => {
  it('hoppar över idag när dagens lapp är riven, och passerad tid', () => {
    const now = new Date(2026, 10, 10, 12, 0);
    const b = mk({ title: 'A', total: 5, pace: 'daily' });
    tr(b, '', now);
    const plan = reminderPlan([b], '19:00', now, 3);
    expect(plan.map((p) => p.at.getDate())).toEqual([11, 12]);
    const plan2 = reminderPlan([mk({ title: 'B', total: 5 })], '09:00', now, 2);
    expect(plan2.map((p) => p.at.getDate())).toEqual([11]);
  });
  it('inga påminnelser utan aktiva egna block eller utan tid', () => {
    const ex = mk({ title: 'E', total: 2 }); ex.example = true;
    expect(reminderPlan([ex], '19:00')).toEqual([]);
    expect(reminderPlan([mk({ title: 'X', total: 2 })], null)).toEqual([]);
  });
  it('räknar väntande block idag', () => {
    const now = new Date(2026, 10, 10, 8, 0);
    const plan = reminderPlan([mk({ title: 'A', total: 3 }), mk({ title: 'B', total: 3 })], '19:00', now, 1);
    expect(plan[0].waiting).toBe(2);
  });
});

import { cleanIcon } from '../src/logic.js';
describe('symbol', () => {
  it('tillåter emoji, stoppar HTML och långa strängar', () => {
    expect(cleanIcon('🧊')).toBe('🧊');
    expect(cleanIcon('<img>')).toBe('');
    expect(cleanIcon('x'.repeat(9))).toBe('');
    expect(cleanIcon(null)).toBe('');
  });
});

import { shelfOrder as order, makeBlock as mk2 } from '../src/logic.js';
describe('fäst', () => {
  it('fästa block hamnar först bland aktiva', () => {
    const a = mk2({ title: 'a', total: 3 }), b = mk2({ title: 'b', total: 3, pace: 'free' });
    b.pinned = true;
    expect(order([a, b]).active.map((x) => x.title)).toEqual(['b', 'a']);
  });
});

import { challengeQuery, parseChallenge, makeBlock as mk3 } from '../src/logic.js';
describe('utmaning', () => {
  it('tur och retur via länk', () => {
    const b = mk3({ title: 'Kalla bad', total: 30, pace: 'daily', paper: 'himmel', icon: '🧊' });
    expect(parseChallenge('rivblock://new?' + challengeQuery(b))).toEqual({ title: 'Kalla bad', total: 30, pace: 'daily', paper: 'himmel', icon: '🧊' });
  });
  it('skräp och HTML stoppas', () => {
    expect(parseChallenge('?n=5')).toBe(null);
    expect(parseChallenge('?t=x&n=9999&c=evil&i=<b>')).toEqual({ title: 'x', total: 100, pace: 'daily', paper: 'rosa', icon: '' });
  });
});

import { makeBlock as mk4, migrate as mg4 } from '../src/logic.js';
describe('lappstil', () => {
  it('lott som standard, affisch går att välja, skräp blir lott', () => {
    expect(mk4({ title: 'a', total: 3 }).style).toBe('lott');
    expect(mk4({ title: 'a', total: 3, style: 'affisch' }).style).toBe('affisch');
    expect(mg4({ blocks: [{ title: 'x', total: 3, style: 'evil' }] }).blocks[0].style).toBe('lott');
  });
});
