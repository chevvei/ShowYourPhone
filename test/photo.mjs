// 屏幕内照片交互端到端验证（四设备 · 真实点击 3D 屏幕上的按钮）
// 流程：注入照片到 localStorage → 加载 → 聚焦屏幕 → UV 反查像素（解决倾斜投影失真）
// → 真实点击锁屏照片按钮（网格）→ 点击缩略图（大图）→ 断言 ui 状态机 lock → grid → view
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8124/iphoneDuo.html';
// 两张可区分的 1×1 PNG（红 / 蓝）
const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfz8BEwMDAQAAXgQGAhKmMIQAAAABJRU5ErkJggg==';

// 每台设备的屏幕定义：
//   partId = 持有锁屏纹理的部件（duo 内屏 oled / 外屏 outer / 18 系列 screen——射线穿玻璃后命中）
//   tab / keys / store = 锁屏实例与存储键
//   btn = 照片按钮画布 UV（v 从顶部，与 textures.js dockBtn 一致：x=W-bx 处的照片 App）
//   cell = 第一张缩略图中心画布 UV（grid: cols=3, mx=0.045W, top=0.155H）
//   part = 部件清单里用于点击聚焦的名称关键字（必须唯一：
//   「外屏」会误匹配副电池的 spec「位于外屏一侧」，「内屏」会误匹配内屏盖板）
const CASES = [
  { dev: 'duo',  partId: 'oled',   tab: 'inner', keys: ['imgsI', 'imgsO'], store: 'iphoneDuo.custom.duo',  btn: [0.773, 0.876], cell: [0.182, 0.348], part: '柔性 OLED 内屏' },
  { dev: 'duo',  partId: 'outer',  tab: 'outer', keys: ['imgsI', 'imgsO'], store: 'iphoneDuo.custom.duo',  btn: [0.844, 0.876], cell: [0.182, 0.251], part: '5.4 英寸外屏', back: true },
  { dev: 'p18s', partId: 'screen', tab: 'phone', keys: ['imgsS'],          store: 'iphoneDuo.custom.p18s', btn: [0.86, 0.927],  cell: [0.182, 0.218], part: '超视网膜' },
  { dev: 'p18',  partId: 'screen', tab: 'phone', keys: ['imgsP'],          store: 'iphoneDuo.custom.p18',  btn: [0.86, 0.927],  cell: [0.182, 0.218], part: '超视网膜' },
  { dev: 'p18m', partId: 'screen', tab: 'phone', keys: ['imgsM'],          store: 'iphoneDuo.custom.p18m', btn: [0.86, 0.927],  cell: [0.182, 0.218], part: '超视网膜' },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1440, height: 900 },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 用 CDP 真实鼠标事件（自带 pointerId，合成 PointerEvent 会让 setPointerCapture 抛错）
const click = async (page, x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); };

// 等特写动画（展开 + 爆炸 + 飞行）真正完成：SwiftShader 无头帧率极低，
// tween 按帧推进被拉长 6-8 倍（1.2s 的展开实测跑 ~10s），必须等完成态而非固定 sleep。
// 完成态 = 已展开（fold≈0）+ 已爆炸（explode≈1）+ 相机静止（__state 连续 3 次一致）
const waitStable = async (page) => {
  let prev = null, same = 0;
  for (let i = 0; i < 100; i++) {
    const key = await page.evaluate(() => JSON.stringify(window.__state()));
    const st = JSON.parse(key);
    if (st.fold < 0.01 && st.explode > 0.99) {
      if (key === prev && ++same >= 3) return true;
      same = key === prev ? same : 0;
    } else same = 0;
    prev = key;
    await sleep(300);
  }
  return false;
};

// 等开场相机动画停下（SwiftShader 帧率低，4.2s 可能仍在飞；
// 此时 __setCam 会被进行中的 boot tween 覆盖回 home 位）
const waitCamStable = async (page) => {
  let prev = null, same = 0;
  for (let i = 0; i < 100; i++) {
    const key = await page.evaluate(() => JSON.stringify(window.__state()));
    if (key === prev) { if (++same >= 3) return true; } else same = 0;
    prev = key;
    await sleep(300);
  }
  return false;
};

// UV 反查像素：在屏幕包围盒内扫描射线，找锁屏 UV 最接近目标的像素
// （特写视角屏幕倾斜+爆炸分离，包围盒线性映射会偏出玻璃外，必须反查）
const findPixel = (page, partId, [u, vTop]) => page.evaluate((pid, u, vTop) => {
  const r = window.__screenRect(pid);
  if (!r) return null;
  const tv = 1 - vTop;   // 画布 v（顶部为 0）→ three uv（底部为 0）
  let best = null, bd = 1e9;
  for (let y = Math.round(r.y); y < r.y + r.h; y += 8)
    for (let x = Math.round(r.x); x < r.x + r.w; x += 8) {
      const h = window.__ray(x, y);
      if (!h || h.partId !== pid || !h.uv) continue;
      const d = (h.uv.x - u) ** 2 + (h.uv.y - tv) ** 2;
      if (d < bd) { bd = d; best = { x, y, d: Math.sqrt(d) }; }
    }
  return best;
}, partId, u, vTop);

let fails = 0;
try {
  for (const c of CASES) {
    const ctx = await browser.createBrowserContext();   // 每台设备独立 localStorage
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`  [pageerror] ${e.message}`));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // 注入：跳过开场演示 + 关标注（浮层 SVG 会挡住 canvas 点击）+ 每个屏 2 张照片
    await page.evaluate((store, keys, a, b) => {
      localStorage.setItem('iphoneDuo.seen', '1');
      localStorage.setItem('iphoneDuo.labels', '0');
      const o = {};
      keys.forEach((k) => (o[k] = [a, b]));
      localStorage.setItem(store, JSON.stringify(o));
    }, c.store, c.keys, RED, BLUE);
    await page.goto(`${BASE}?dev=${c.dev}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 40000 });
    await sleep(4200);   // 等开场展开动画 + 照片异步解码落地

    // 隐藏会挡住 canvas 点击的浮层：底部控制坞 / 底部提示（特写视角下
    // 屏幕底部的照片 App 会伸进 dock 区域，elementFromPoint 命中 FOOTER 而非 CANVAS）
    await page.evaluate(() => {
        for (const s of ['#dock', '#hint']) { const el = document.querySelector(s); el && (el.style.display = 'none'); }
    });

    // 初始 lock 态
    let ui = await page.evaluate((dev, tab) => window.__locks()[dev][tab], c.dev, c.tab);
    const okInit = ui === 'lock';
    console.log(`[${c.dev}/${c.tab}] 初始 ui=${ui} ${okInit ? 'OK' : 'FAIL'}`);
    if (!okInit) fails++;

    // 聚焦屏幕部件，等特写飞行完全稳定
    // 外屏（朝 -z）聚焦前先把相机转到背面：特写方向 = 当前相机方向，
    // 停在正面会只看到背板玻璃（OLED 是 FrontSide，从背面永不命中）
    await waitCamStable(page);
    if (c.back) await page.evaluate(() => window.__setCam(60, 40, -820));
    await page.evaluate((name) => {
      const i = [...document.querySelectorAll('#partsList .item')].find((n) => n.textContent.includes(name));
      i && i.click();
    }, c.part);
    const ok = await waitStable(page);
    if (!ok) console.log(`[${c.dev}/${c.tab}] WARN 相机未稳定`);

    // 照片按钮：UV 反查像素 → 点击 → grid
    const b = await findPixel(page, c.partId, c.btn);
    if (!b || b.d > 0.03) { console.log(`[${c.dev}/${c.tab}] FAIL 按钮反查失败 ${JSON.stringify(b)}`); fails++; await ctx.close(); continue; }
    await click(page, b.x, b.y);
    await sleep(700);
    ui = await page.evaluate((dev, tab) => window.__locks()[dev][tab], c.dev, c.tab);
    const okGrid = ui === 'grid';
    console.log(`[${c.dev}/${c.tab}] 照片按钮@(${b.x},${b.y})uvΔ${b.d.toFixed(3)} ui=${ui} ${okGrid ? 'OK' : 'FAIL(应进网格)'}`);
    if (!okGrid) fails++;
    await page.screenshot({ path: `/tmp/photo_${c.dev}_${c.tab}_grid.png` });

    // 第一张缩略图：UV 反查像素 → 点击 → view
    const t = await findPixel(page, c.partId, c.cell);
    if (!t || t.d > 0.03) { console.log(`[${c.dev}/${c.tab}] FAIL 缩略图反查失败 ${JSON.stringify(t)}`); fails++; await ctx.close(); continue; }
    await click(page, t.x, t.y);
    await sleep(700);
    ui = await page.evaluate((dev, tab) => window.__locks()[dev][tab], c.dev, c.tab);
    const okView = ui === 'view';
    console.log(`[${c.dev}/${c.tab}] 缩略图@(${t.x},${t.y})uvΔ${t.d.toFixed(3)} ui=${ui} ${okView ? 'OK' : 'FAIL(应进大图)'}`);
    if (!okView) fails++;
    await page.screenshot({ path: `/tmp/photo_${c.dev}_${c.tab}_view.png` });
    await ctx.close();
  }
  console.log(fails ? `\n${fails} 项 FAIL` : '\n全部通过');
} finally { await browser.close(); }
process.exit(fails ? 1 : 0);
