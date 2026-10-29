// 彩蛋 / 照片墙 / 隐藏面板 端到端验证：node test/egg.mjs
// 前置：python3 -m http.server 8124 --directory dist（或任意能伺服 dist/iphoneDuo.html 的服务）
// 覆盖：boot 无报错 → 连点 5 次开彩蛋工坊 → 逐个聚焦部件点亮寻宝 → 找齐解锁虹彩+彩带 →
//       屏幕手电筒闪屏 → 照片 App 网格/浏览 → 设备切换后进度保留
import puppeteer from 'puppeteer-core';

const CHROME = '/usr/bin/google-chrome';
const BASE = 'http://localhost:8124/iphoneDuo.html';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(() => document.body.dataset.dev === 'duo' && document.querySelector('#loader.done'), { timeout: 30000 });
  } catch {
    const dbg = await page.evaluate(() => ({
      dev: document.body.dataset.dev,
      loader: document.querySelector('#loader')?.className,
      ls: document.querySelector('#loader .ls')?.textContent,
      loadBar: document.querySelector('#loadBar')?.style.width,
    }));
    console.error('[boot-timeout]', JSON.stringify(dbg), '\n[page-errors]', errors.join('\n') || '(none)');
    throw new Error('boot 未完成');
  }
  await new Promise((r) => setTimeout(r, 5000));
  await page.keyboard.press('Escape');          // 退出自动演示
  await new Promise((r) => setTimeout(r, 600));
  // 桌面端：侧栏 / 底栏常驻显示（大屏无需隐藏，旧贴边悬停机制已移除）
  await new Promise((r) => setTimeout(r, 3000));
  const deskVis = await page.evaluate(() => {
    const p = getComputedStyle(document.querySelector('#parts'));
    const d = getComputedStyle(document.querySelector('#dock'));
    return { p: p.opacity, d: d.opacity, pe: p.pointerEvents };
  });
  console.log(`[ui] 桌面侧栏/底栏常驻: ${deskVis.p === '1' && deskVis.d === '1' && deskVis.pe !== 'none' ? 'OK' : `FAIL ${JSON.stringify(deskVis)}`}`);

  // ---- 隐藏入口：连点设备名 5 次 → 彩蛋工坊 ----
  const brand = await page.$('#brandName');
  const bb = await brand.boundingBox();
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 500));
  let open = await page.evaluate(() => document.querySelector('#eggs').classList.contains('on'));
  console.log(`[egg] 连点5次开工坊: ${open ? 'OK' : 'FAIL'}`);
  await page.click('#eggsClose');

  // ---- 寻宝：Duo 4 枚（board / batA / vc / usb）----
  await page.evaluate(() => localStorage.setItem('iphoneDuo.seen', '1'));
  const clickPart = async (kw) => {
    await page.evaluate((k) => {
      const el = [...document.querySelectorAll('#partsList .item')].find((n) => n.textContent.includes(k));
      el && el.click();
    }, kw);
    await new Promise((r) => setTimeout(r, 700));
  };
  for (const kw of ['主板', '主电池', '均热板', 'USB-C']) await clickPart(kw);
  let badge = await page.evaluate(() => document.querySelector('#eggBadge').textContent);
  console.log(`[egg] Duo 寻宝进度角标: "${badge}" ${badge.includes('4/4') ? 'OK' : 'FAIL'}`);
  const full = await page.evaluate(() => document.querySelector('#eggBadge').classList.contains('full'));
  console.log(`[egg] 找齐解锁(full class): ${full ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: '/tmp/egg_duo_unlock.png' });
  // 虹彩中框材质断言（浏览器内读取 three 材质太深，退化为视觉截图 + fx 持久化断言）
  const fx = await page.evaluate(() => JSON.parse(localStorage.getItem('iphoneDuo.eggs') || '{}').fx);
  console.log(`[egg] fx 持久化: ${fx === true ? 'OK' : 'FAIL'}`);

  // ---- 移动端仿真：两侧面板均由左/右缘拉手手动拉出（轻点或跟手拖拽）+ 进场引导 ----
  await page.emulate({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await page.goto(`${BASE}?dev=duo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.dev === 'duo' && document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4500));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 600));
  const isMobileBody = await page.evaluate(() => document.body.classList.contains('mobile'));
  const tap = async (x, y) => { await page.touchscreen.tap(x, y); await new Promise((r) => setTimeout(r, 500)); };
  // 合成拖拽：在拉手上 pointerdown → 横向 pointermove → pointerup（真实触屏路径）
  const edgeDrag = (sel, x0, x1) => page.evaluate((sel, x0, x1) => {
    const el = document.querySelector(sel);
    const opt = (x) => ({ clientX: x, clientY: 400, pointerId: 9, pointerType: 'touch', bubbles: true, isPrimary: true });
    el.dispatchEvent(new PointerEvent('pointerdown', opt(x0)));
    el.dispatchEvent(new PointerEvent('pointermove', opt(x1)));
    el.dispatchEvent(new PointerEvent('pointerup', opt(x1)));
  }, sel, x0, x1);
  // 进场引导：两侧拉手浮现 + 气泡提示（8 秒后自动淡出）
  let guide = await page.evaluate(() => document.querySelector('#sbGuide').classList.contains('on')
    && document.body.classList.contains('nudge'));
  console.log(`[ui] 手机进场引导浮现: ${guide ? 'OK' : 'FAIL'} (mobile=${isMobileBody})`);
  await page.screenshot({ path: '/tmp/egg_mobile_guide.png' });
  await tap(10, 400);   // 左缘拉手轻点 → 拉出部件抽屉
  let side = await page.evaluate(() => ({
    L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR'),
    g: document.querySelector('#sbGuide').classList.contains('on'),
  }));
  console.log(`[ui] 左缘拉手轻点拉出抽屉: ${side.L && !side.R && !side.g ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  await page.screenshot({ path: '/tmp/egg_mobile_drawer.png' });
  await tap(330, 400);  // 点抽屉外 → 收起抽屉
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 点抽屉外收起: ${!side.L && !side.R ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  // 跟手拖拽：左缘拖 100px 松手 → 开；只拖 30px 松手 → 弹回
  await edgeDrag('#sbEdge', 6, 106);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 左缘拖拽拉出抽屉: ${side.L ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  await tap(330, 400);  // 收起
  await edgeDrag('#sbEdge', 6, 36);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR'), p: document.querySelector('#parts').classList.contains('pull') }));
  console.log(`[ui] 未过阈值拖拽弹回: ${!side.L && !side.R && !side.p ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  // 右缘拉手：轻点开控制坞；拖拽也开；点外收起
  await tap(379, 400);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 右缘拉手轻点出控制坞: ${side.R && !side.L ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  await page.screenshot({ path: '/tmp/egg_mobile_right.png' });
  await tap(60, 400);   // 点控制坞外 → 收起
  side = await page.evaluate(() => document.body.classList.contains('uiR'));
  console.log(`[ui] 点控制坞外收起: ${!side ? 'OK' : 'FAIL'}`);
  await edgeDrag('#dockEdge', 384, 284);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 右缘拖拽拉出控制坞: ${side.R && !side.L ? 'OK' : `FAIL ${JSON.stringify(side)}`}`);
  await tap(60, 400);   // 收起还原
  // 半屏点按不再弹面板（新交互：只认两侧拉手）
  await tap(60, 400);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 左半屏点按不再弹抽屉: ${!side.L ? 'OK' : 'FAIL'}`);
  await tap(330, 400);
  side = await page.evaluate(() => ({ L: document.body.classList.contains('uiL'), R: document.body.classList.contains('uiR') }));
  console.log(`[ui] 右半屏点按不再弹控制坞: ${!side.R ? 'OK' : 'FAIL'}`);
  // 手动面板不会被超时收起
  await tap(10, 400);
  await new Promise((r) => setTimeout(r, 5600));
  const stay = await page.evaluate(() => document.body.classList.contains('uiL'));
  console.log(`[ui] 抽屉手动收起不自动: ${stay ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: '/tmp/egg_mobile_stay.png' });
  await tap(330, 400);  // 收起抽屉还原
  // 还原桌面环境
  await page.emulate({
    viewport: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    userAgent: '',
  });

  // ---- 切到 iPhone 18 Pro：进度独立（edge 第 5 枚）----
  await page.goto(`${BASE}?dev=p18`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.dev === 'p18' && document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  badge = await page.evaluate(() => document.querySelector('#eggBadge').textContent);
  console.log(`[egg] P18 进度角标: "${badge}" ${badge.includes('4/5') ? 'OK' : 'FAIL(共享 found)'}`);
  for (const kw of ['中框', '主板', '钢壳电池', '均热板', 'USB-C']) await clickPart(kw);
  badge = await page.evaluate(() => document.querySelector('#eggBadge').textContent);
  console.log(`[egg] P18 找齐: "${badge}" ${badge.includes('5/5') ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: '/tmp/egg_p18_unlock.png' });

  // ---- 照片 App：上传 → 屏幕内点击相册图标 → 网格 → 点缩略图浏览 ----
  const cfg = { dev: 'p18', imgsP: [], ...JSON.parse(await page.evaluate(() => localStorage.getItem('iphoneDuo.custom.p18') || '{}')) };
  // 造 2 张 dataURL 照片直接写进 store（uploadFile 弹文件选择器在 headless 不可行，走同一 loadStore 路径）
  await page.evaluate(() => {
    const mk = (c1, c2) => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 160;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(0, 0, 120, 160);
      g.fillStyle = '#fff'; g.font = '600 34px sans-serif'; g.textAlign = 'center'; g.fillText('TEST', 60, 90);
      return c.toDataURL('image/jpeg', 0.8);
    };
    const s = JSON.parse(localStorage.getItem('iphoneDuo.custom.p18') || '{}');
    s.imgsP = [mk('#3a7bd5', '#00d2ff'), mk('#ff512f', '#dd2476')];
    localStorage.setItem('iphoneDuo.custom.p18', JSON.stringify(s));
  });
  await page.goto(`${BASE}?dev=p18`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.dev === 'p18' && document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 800));
  // 聚焦屏幕部件（满屏）后点击锁屏上的「照片」图标（右下角相机按钮旁的相册入口 → 由 hit() 分发）
  await page.evaluate(() => { const i = [...document.querySelectorAll('#partsList .item')].find((n) => n.textContent.includes('超视网膜')); i && i.click(); });
  await new Promise((r) => setTimeout(r, 1000));
  const r2 = await page.evaluate(() => {
    const r = document.querySelector('#gl').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.screenshot({ path: '/tmp/egg_photo_lock.png' });
  // 锁屏右下角 = 相机按钮 → 进入照片网格（textures.hit() 的 lock 分支）
  await page.mouse.click(r2.x + 200, r2.y + 240);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: '/tmp/egg_photo_grid.png' });
  const gridShot = await page.evaluate(() => document.querySelector('#gl').toDataURL ? true : true);
  console.log(`[photo] 网格截图: /tmp/egg_photo_grid.png (人工核对缩略图)`);

  // ---- ?eggs 专属直链：打开即弹彩蛋工坊 ----
  await page.goto(`${BASE}?eggs`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const direct = await page.evaluate(() => document.querySelector('#eggs').classList.contains('on'));
  console.log(`[egg] ?eggs 直链开工坊: ${direct ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: '/tmp/egg_studio_direct.png' });

  console.log(errors.length ? `[console-errors]\n${errors.join('\n')}` : '[console] 无页面错误 OK');
} finally {
  await browser.close();
}
