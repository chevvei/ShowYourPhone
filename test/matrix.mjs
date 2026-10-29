// 4 机型 × 5 游戏进出矩阵：node test/matrix.mjs
// 前置：python3 -m http.server 8124 --directory dist
// 每台设备依次进入 micro/turret/shoot/wave/maze，确认 arcade.cur 切换与退出还原，全程无 pageerror
import puppeteer from 'puppeteer-core';

const CHROME = '/usr/bin/google-chrome';
const BASE = 'http://localhost:8124/iphoneDuo.html';
const DEVS = ['duo', 'p18s', 'p18', 'p18m'];
const GAMES = ['micro', 'turret', 'shoot', 'wave', 'maze'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, timeout = 30000, every = 300) => {
  for (let t = 0; t < timeout; t += every) {
    try { const v = await fn(); if (v) return v; } catch { /* 进出切换瞬间探针可能空 */ }
    await sleep(every);
  }
  return null;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
let fails = 0;
try {
  for (const dev of DEVS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}?dev=${dev}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('iphoneDuo.seen', '1');
      localStorage.setItem('iphoneDuo.labels', '0');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
    await sleep(2500);
    const row = [];
    for (const g of GAMES) {
      await page.evaluate((k) => window.__enterGame(k), g);
      const inn = await until(page, async () => (await page.evaluate(() => window.__fun())).arcade.cur === g);
      let out = null;
      if (inn) {
        await page.keyboard.press('Escape');
        out = await until(page, async () => (await page.evaluate(() => window.__fun())).arcade.cur === null);
        await sleep(600);   // 等相机回位再进下一局
      }
      row.push(`${g}:${inn && out ? 'OK' : inn ? 'IN-NO-EXIT' : 'NO-ENTER'}`);
      if (!inn || !out) fails++;
    }
    console.log(`[${dev}] ${row.join('  ')}  errors=${errs.length ? errs.length + '!' : 0}${errs.length ? ' | ' + errs[0] : ''}`);
    await ctx.close();
  }
  console.log(fails === 0 ? 'MATRIX-OK 全部 4×5 通过' : `MATRIX-FAIL ${fails} 项失败`);
} catch (e) {
  console.error('MATRIX-ERROR', e);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails === 0 ? 0 : 1);
