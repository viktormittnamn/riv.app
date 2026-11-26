// Tar App Store-skärmbilder (6,9", 1320×2868) på svenska och engelska. Kör: npm run build && node tests/store-shots.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = pathToFileURL(new URL('../dist/index.html', import.meta.url).pathname).href;
const OUT = new URL('../store/screenshots/', import.meta.url).pathname;
const RAW = OUT + 'raw/';
mkdirSync(RAW, { recursive: true });
const fontData = (f) => 'data:font/woff2;base64,' + readFileSync(new URL('../src/fonts/' + f, import.meta.url)).toString('base64');
const FONT = fontData('BigShouldersDisplay-var.woff2');
const FONT2 = fontData('InstrumentSans-400_700.woff2');

const COPY = {
  sv: [
    ['Ett block för varje mål', 'Bestäm hur många lappar. Sedan är det bara att riva.', '#e9e8ee'],
    ['Riv av när du gjort det', 'Dra fingret längs perforeringen. Det knastrar.', '#f7bccb'],
    ['Missa en dag utan straff', 'Inga streaks som går sönder. Lappen väntar på dig.', '#b2e5cb'],
    ['Tomt block = klart', 'Alla lappar och anteckningar på kartongen.', '#b8d4f1'],
    ['Dela din bunt', 'En snygg bild när blocket är slut.', '#f6df8b']
  ],
  en: [
    ['One pad for every goal', 'Pick how many tickets. Then just tear.', '#e9e8ee'],
    ['Tear it off when it is done', 'Drag along the perforation. It crackles.', '#f7bccb'],
    ['Miss a day, no penalty', 'No streaks to break. The ticket waits for you.', '#b2e5cb'],
    ['Empty pad = done', 'Every ticket and note, kept on the board.', '#b8d4f1'],
    ['Share your stack', 'A clean image when the pad is finished.', '#f6df8b']
  ]
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function appPage(lang) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, locale: lang === 'sv' ? 'sv-SE' : 'en-US', reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} });
  await ctx.addInitScript((lang) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const s = { schema: 2, settings: { sound: false, haptics: true, lang: 'auto', reminder: null, hintSeen: true, onboarded: true, pro: false }, blocks: [] };
    s.settings.hintSeen = true;
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(19, 0, 0, 0); return x.toISOString(); };
    const T = (n, start, notes = []) => Array.from({ length: n }, (_, i) => ({ n: i + 1, at: d(start - i), note: notes[i] || '' }));
    const sv = lang === 'sv';
    s.blocks = [
      { id: 'K7QD', title: sv ? 'Kalla bad' : 'Cold plunges', total: 30, pace: 'daily', paper: 'himmel', createdAt: d(12), torn: T(12, 12), draft: '', round: 1 },
      { id: 'P3XA', title: sv ? 'Träningspass' : 'Workouts', total: 20, pace: 'free', paper: 'rosa', createdAt: d(20), torn: T(7, 19), draft: '', round: 1 },
      { id: 'M2GH', title: sv ? 'Dagar utan socker' : 'Days without sugar', total: 21, pace: 'daily', paper: 'mint', createdAt: d(6), torn: T(6, 6), draft: '', round: 1 },
      { id: 'B8RT', title: sv ? 'Böcker i höst' : 'Autumn books', total: 6, pace: 'free', paper: 'smor', createdAt: d(80), torn: T(6, 75).map((t, i) => ({ ...t, at: d(75 - i * 13) })), draft: '', round: 1 },
      { id: 'L4NE', title: sv ? 'Promenader' : 'Walks', total: 10, pace: 'free', paper: 'kol', createdAt: d(30), torn: T(10, 25), draft: '', round: 1 }
    ];
    s.blocks[3].torn[0].note = 'Tove Jansson'; s.blocks[3].torn[2].note = sv ? 'Lånad av mamma' : 'Borrowed from mum'; s.blocks[3].torn[5].note = sv ? 'Bäst hittills' : 'Best so far';
    localStorage.setItem('rivblock_v1', JSON.stringify(s));
  }, lang);
  const page = await ctx.newPage();
  await page.goto(APP);
  await page.waitForTimeout(500);
  return { ctx, page };
}

for (const lang of ['sv', 'en']) {
  const { ctx, page } = await appPage(lang);
  // 1 hyllan
  await page.screenshot({ path: `${RAW}${lang}-1.png` });
  // 2 mitt i rivningen
  await page.click('.pad-card >> nth=0');
  await page.waitForTimeout(300);
  await page.fill('#noteIn', lang === 'sv' ? 'Tungt men grymt' : 'Tough but great');
  await page.evaluate(() => document.activeElement.blur());
  const box = await page.locator('#active .tbody').boundingBox();
  await page.mouse.move(box.x + 14, box.y + 18); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 14 + i * 16, box.y + 18 + i * 1.5);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${RAW}${lang}-2.png` });
  for (let i = 13; i <= 22; i++) await page.mouse.move(box.x + 14 + i * 16, box.y + 18 + i * 1.5);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.toast')?.remove());
  // 3 låst för idag
  await page.screenshot({ path: `${RAW}${lang}-3.png` });
  // 4 tomt block
  await page.click('#backBtn');
  await page.click('.done-card >> nth=0');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${RAW}${lang}-4.png` });
  // 5 delningsbild
  await page.click('#shareBtn');
  await page.waitForSelector('.share-img');
  await page.waitForTimeout(300);
  const src = await page.locator('.share-img').getAttribute('src');
  const b64 = await page.evaluate(async (u) => { const r = await fetch(u); const b = await r.blob(); return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); }); }, src);
  writeFileSync(`${RAW}${lang}-share.png`, Buffer.from(b64.split(',')[1], 'base64'));
  await ctx.close();
}

// Sätt ihop: rubrik + telefon
const frame = await browser.newContext({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
const fp = await frame.newPage();
for (const lang of ['sv', 'en']) {
  for (let i = 0; i < 5; i++) {
    const [title, sub, bg] = COPY[lang][i];
    const img = i === 4 ? `${RAW}${lang}-share.png` : `${RAW}${lang}-${i + 1}.png`;
    const data = 'data:image/png;base64,' + readFileSync(img).toString('base64');
    const dark = bg === '#29282e';
    const html = `<html><head><style>
      @font-face{font-family:BS;src:url('${FONT}') format('woff2');font-weight:600 900}
      @font-face{font-family:IS;src:url('${FONT2}') format('woff2');font-weight:400 700}
      html,body{margin:0}body{width:1320px;height:2868px;background:${bg};display:flex;flex-direction:column;align-items:center;overflow:hidden;color:${dark ? '#f3eee4' : '#1b1a21'};position:relative}
      body::after{content:"";position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.05' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");opacity:.12;mix-blend-mode:multiply;pointer-events:none}
      h1{font:900 150px/0.92 BS;text-transform:uppercase;text-align:center;margin:190px 90px 0;letter-spacing:.005em;text-wrap:balance}
      p{font:500 50px/1.3 IS;text-align:center;margin:44px 140px 0;opacity:.75;text-wrap:balance}
      .phone{margin-top:110px;width:1000px;border-radius:120px;background:#1b1a21;padding:26px;box-shadow:0 60px 120px rgba(0,0,0,.28)}
      .phone img{display:block;width:100%;border-radius:96px}
      .share{margin-top:130px;width:1060px;border-radius:40px;box-shadow:0 60px 120px rgba(0,0,0,.25)}
    </style></head><body><h1>${title}</h1><p>${sub}</p>${i === 4 ? `<img class="share" src="${data}">` : `<div class="phone"><img src="${data}"></div>`}</body></html>`;
    await fp.setContent(html);
    await fp.waitForTimeout(250);
    await fp.screenshot({ path: `${OUT}${lang}-${i + 1}.png` });
  }
}
await browser.close();
console.log('klart:', OUT);
