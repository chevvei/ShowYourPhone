// 真实时间截图验证：node test/shot.mjs [duo|p18s|p18|p18m ...]
// 用系统 Chrome + 真实等待（等 boot 完成 + 模型切换落位），规避 --virtual-time-budget 下
// renderer.compileAsync 挂起导致的空图。每台等待 data-dev 匹配 + loader done，再拖拽转到背面拍相机布局。
import puppeteer from 'puppeteer-core';

const CHROME = '/usr/bin/google-chrome';
const BASE = 'http://localhost:8124/iphoneDuo.html';
const targets = process.argv.slice(2);
if (!targets.length) { console.error('usage: node test/shot.mjs duo p18s p18 p18m'); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
async function drag(page, dx, dy) {
  const { x, y, width, height } = await page.evaluate(() => {
    const r = document.querySelector('#stage, canvas')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height } : { x: 720, y: 450 };
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 700));
}
try {
  for (const dev of targets) {
    const url = dev === 'duo' ? BASE : `${BASE}?dev=${dev}`;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      (d) => document.body.dataset.dev === d && document.querySelector('#loader.done'),
      { timeout: 30000 }, dev,
    ).catch(() => console.error(`[timeout] ${dev} boot 未完成`));
    // 等开场动画（首次访问自动播放发布会 / 非首次展开动画）稳定
    await new Promise((r) => setTimeout(r, 6000));
    await page.keyboard.press('Escape');   // 退出自动演示，回到自由视角
    await new Promise((r) => setTimeout(r, 800));
    await drag(page, -520, -60);           // 水平拖拽转到背面
    await drag(page, -260, -40);
    const out = `/tmp/shot_${dev}.png`;
    await page.screenshot({ path: out });
    const state = await page.evaluate(() => ({
      dev: document.body.dataset.dev,
      title: document.title,
      parts: document.querySelectorAll('#partsList .item').length,
      keynote: document.body.classList.contains('keynote'),
    }));
    console.log(`[${dev}] ${JSON.stringify(state)} -> ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
