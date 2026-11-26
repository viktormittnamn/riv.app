// Klicktester i riktig Chrome (playwright-core + installerad Chrome). Kör: npm run build && npm run e2e
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = pathToFileURL(new URL('../dist/index.html', import.meta.url).pathname).href;
const SHOTS = new URL('../tests/shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = 0, passed = 0;
const errors = [];

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: opts.locale || 'sv-SE', colorScheme: opts.dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  ctx.setDefaultTimeout(6000);
  const page = await ctx.newPage();
  // headless Chrome låtsas kunna dela men dialogen kommer aldrig – testa reservvägen
  await page.addInitScript(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_);
  await page.waitForSelector('#shelfView .topbar', { state: 'attached' });
  return { ctx, page };
}

async function tearDrag(page) {
  const box = await page.locator('#active .tbody').boundingBox();
  const y = box.y + 20, x0 = box.x + 12;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(x0 + i * 14, y + i * 0.5);
  await page.mouse.up();
  await page.waitForTimeout(60);
}
const binding = (page) => page.locator('.binding span').innerText();

async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}

console.log('Rivblock e2e');

await test('första start öppnar intro-blocket och man kan riva', async () => {
  const { ctx, page } = await fresh();
  await page.waitForSelector('#active');
  assert.match(await page.locator('#padView h2').innerText(), /Så funkar/);
  assert.equal(await binding(page), '5 KVAR');
  await page.screenshot({ path: SHOTS + '01-intro.png' });
  await tearDrag(page);
  assert.equal(await binding(page), '4 KVAR');
  await ctx.close();
});

await test('ett halvt drag fjädrar tillbaka utan att riva', async () => {
  const { ctx, page } = await fresh();
  const box = await page.locator('#active .tbody').boundingBox();
  await page.mouse.move(box.x + 12, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 22); await page.mouse.up();
  assert.equal(await binding(page), '5 KVAR');
  await ctx.close();
});

await test('skapa block, en om dagen låser efter första lappen, ångra', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  await page.screenshot({ path: SHOTS + '02-shelf.png' });
  await page.click('#newBtn');
  await page.fill('#cTitle', 'Kalla bad');
  await page.click('[data-n="10"]');
  await page.click('[data-p="himmel"]');
  await page.screenshot({ path: SHOTS + '03-create.png' });
  await page.click('#cGo');
  await page.waitForSelector('#active');
  assert.equal(await binding(page), '10 KVAR');
  await page.fill('#noteIn', 'Två minuter!');
  await tearDrag(page);
  assert.equal(await binding(page), '9 KVAR');
  assert.ok(await page.locator('#active.locked').count(), 'ska vara låst');
  await page.screenshot({ path: SHOTS + '04-locked.png' });
  await tearDrag(page);
  assert.equal(await binding(page), '9 KVAR', 'låst lapp får inte rivas');
  await page.click('.toast button');
  assert.equal(await binding(page), '10 KVAR');
  assert.equal(await page.inputValue('#noteIn'), 'Två minuter!', 'anteckningen ska komma tillbaka');
  await ctx.close();
});

await test('snärt: snabbt drag över halvvägs river av när man släpper', async () => {
  const { ctx, page } = await fresh();
  const box = await page.locator('#active .tbody').boundingBox();
  const y = box.y + 20, x0 = box.x + 12;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + i * 32, y);
  await page.mouse.up();
  await page.waitForTimeout(60);
  assert.equal(await binding(page), '4 KVAR');
  await ctx.close();
});

await test('tangentbord: Enter river av en lapp', async () => {
  const { ctx, page } = await fresh();
  await page.focus('#active');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.equal(await binding(page), '4 KVAR');
  assert.match(await page.locator('#live').innerText(), /Lapp 1 avriven/);
  await ctx.close();
});

await test('riv hela intro-blocket → tom kartong med knapp till första blocket', async () => {
  const { ctx, page } = await fresh();
  for (let i = 0; i < 5; i++) await tearDrag(page);
  await page.waitForSelector('.done.show');
  assert.equal(await binding(page), 'TOMT BLOCK');
  await page.screenshot({ path: SHOTS + '05-intro-done.png' });
  await page.click('#firstBtn');
  await page.waitForSelector('#cTitle');
  await page.fill('#cTitle', 'Yoga');
  await page.click('#cGo');
  await page.click('#backBtn');
  assert.equal(await page.locator('text=Så funkar Rivblock').count(), 0, 'färdigt intro ska försvinna');
  await ctx.close();
});

await test('tomt exempelblock visar statistik och delningsbild', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  await page.click('.done-card');
  await page.waitForSelector('.done.show');
  await page.screenshot({ path: SHOTS + '06-done.png' });
  await page.click('#shareBtn');
  await page.waitForSelector('.share-img');
  const ok = await page.locator('.share-img').evaluate((img) => new Promise((r) => (img.complete ? r(img.naturalWidth) : (img.onload = () => r(img.naturalWidth)))));
  assert.equal(ok, 1080);
  await page.locator('.share-img').screenshot({ path: SHOTS + '07-share.png' });
  await ctx.close();
});

await test('meny: ändra block och ta bort med ångra', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  await page.click('.pad-card:has-text("godis")');
  await page.click('#moreBtn');
  await page.click('#mEdit');
  await page.fill('#cTitle', 'Inget godis');
  await page.click('[data-p="smor"]');
  await page.click('#cGo');
  assert.equal(await page.locator('#padView h2').innerText(), 'Inget godis');
  assert.equal(await page.locator('#stage').getAttribute('data-paper'), 'smor');
  await page.click('#moreBtn'); await page.click('#mDel'); await page.click('#mDel');
  assert.equal(await page.locator('.pad-card').count(), 1);
  await page.click('.toast button');
  assert.equal(await page.locator('.pad-card').count(), 2);
  await ctx.close();
});

await test('inställningar: engelska, säkerhetskopia tur och retur', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  await page.click('#setBtn');
  await page.screenshot({ path: SHOTS + '08-settings.png' });
  await page.click('[data-lang="en"]');
  await page.click('#sClose');
  assert.match(await page.locator('#newBtn').innerText(), /New pad/);
  await page.waitForTimeout(300);
  const backup = await page.evaluate(() => localStorage.getItem('rivblock_v1'));
  const data = JSON.parse(backup); data.app = 'rivblock'; data.blocks = data.blocks.slice(0, 1);
  await page.click('#setBtn');
  await page.click('#sImport');
  await page.fill('#sImportTxt', JSON.stringify(data));
  await page.click('#sImportGo');
  assert.equal(await page.locator('.pad-card, .done-card').count(), 1);
  await page.click('#setBtn'); await page.click('#sImport');
  await page.fill('#sImportTxt', 'skräp'); await page.click('#sImportGo');
  assert.match(await page.locator('.toast').innerText(), /does not look like/);
  await ctx.close();
});

await test('engelsk telefon får engelska från början', async () => {
  const { ctx, page } = await fresh({ locale: 'en-US' });
  assert.match(await page.locator('#padView h2').innerText(), /How Rivblock works/);
  await ctx.close();
});

await test('mörkt läge renderar', async () => {
  const { ctx, page } = await fresh({ dark: true });
  await page.click('#backBtn');
  await page.screenshot({ path: SHOTS + '09-dark-shelf.png' });
  await page.click('.pad-card >> nth=0');
  await page.screenshot({ path: SHOTS + '10-dark-pad.png' });
  await ctx.close();
});

await test('ny dag låser upp en låst lapp', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  await page.click('.pad-card >> nth=0'); // godis: väntar
  await tearDrag(page);
  assert.ok(await page.locator('#active.locked').count());
  // flytta tillbaka senaste rivningen en dag i lagringen och ladda om
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rivblock_v1'));
    const b = s.blocks.find((x) => x.torn.length === 9);
    const d = new Date(); d.setDate(d.getDate() - 1); b.torn[8].at = d.toISOString();
    localStorage.setItem('rivblock_v1', JSON.stringify(s));
  });
  await page.reload();
  await page.click('.pad-card >> nth=0');
  assert.equal(await page.locator('#active.locked').count(), 0);
  await ctx.close();
});

await test('trasig lagring kraschar inte appen', async () => {
  const { ctx, page } = await fresh();
  await page.evaluate(() => localStorage.setItem('rivblock_v1', '{trasig'));
  await page.reload();
  await page.waitForSelector('#shelfView .topbar', { state: 'attached' });
  await ctx.close();
});

await test('webbläsarens bakåt: stänger blocket, och mall fyller i antal och tempo', async () => {
  const { ctx, page } = await fresh();
  await page.goBack();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#padView').isHidden(), true);
  await page.click('.pad-card >> nth=0');
  await page.click('#backBtn');
  await page.waitForTimeout(150);
  await page.click('#newBtn');
  await page.waitForTimeout(150);
  await page.click('[data-sug="1"]');
  assert.equal(await page.inputValue('#cTitle'), 'Dagar utan socker');
  assert.equal(await page.getAttribute('[data-n="21"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-pace="daily"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-p="mint"]', 'aria-pressed'), 'true');
  await page.click('#cGo');
  await page.waitForSelector('#active');
  await page.goBack();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#padView').isHidden(), true);
  assert.equal(await page.locator('#scrim').count(), 0);
  await ctx.close();
});

await test('riktigt fingersvep (touch) river av, lodrätt svep gör det inte', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, locale: 'sv-SE', reducedMotion: 'reduce' });
  ctx.setDefaultTimeout(6000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  await page.waitForSelector('#active');
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (x0, y0, dx, dy, steps = 20) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
  };
  const box = await page.locator('#active .tbody').boundingBox();
  await swipe(box.x + box.width - 14, box.y + 24, 0, 220); // lodrätt
  assert.equal(await binding(page), '5 KVAR');
  await swipe(box.x + box.width - 14, box.y + 24, -330, 10); // höger till vänster
  assert.equal(await binding(page), '4 KVAR');
  await ctx.close();
});

await test('hyllan: swipe vänster tar bort ett block, kort drag gör det inte, Ångra', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  const count = () => page.locator('[data-open]').count();
  const n0 = await count();
  const drag = async (dist) => {
    const b = await page.locator('.pad-card >> nth=0').boundingBox();
    await page.mouse.move(b.x + b.width - 20, b.y + 30); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width - 20 - (dist * i) / 10, b.y + 31);
    await page.mouse.up(); await page.waitForTimeout(350);
  };
  await drag(60);
  assert.equal(await count(), n0, 'kort drag ska inte ta bort');
  assert.equal(await page.locator('#padView').isHidden(), true, 'swipe ska inte öppna blocket');
  await drag(250);
  assert.equal(await count(), n0 - 1);
  await page.click('.toast button');
  assert.equal(await count(), n0);
  await ctx.close();
});

await test('hyllan: Välj → Markera alla → Ta bort, och Ångra', async () => {
  const { ctx, page } = await fresh();
  await page.click('#backBtn');
  const n0 = await page.locator('[data-open]').count();
  await page.click('#selBtn');
  await page.click('[data-open] >> nth=0');
  assert.match(await page.locator('#selDel').innerText(), /\(1\)/);
  await page.click('#selAll');
  assert.match(await page.locator('#selDel').innerText(), new RegExp(`\\(${n0}\\)`));
  await page.screenshot({ path: SHOTS + '11-select.png' });
  await page.click('#selDel');
  assert.equal(await page.locator('[data-open]').count(), 0);
  await page.click('.toast button');
  assert.equal(await page.locator('[data-open]').count(), n0);
  await ctx.close();
});

await test('inga fel i konsolen', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
console.log(`\n${passed} gick igenom, ${failed} misslyckades`);
process.exit(failed ? 1 : 0);
