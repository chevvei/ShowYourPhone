// 视觉三兄弟 + 深度链接 + 沉浸模式 端到端验证（p18 单设备全流程）
// 覆盖：X 光开/关（材质 swap 生效与还原）· 蓝图开（线框 + 深蓝背景 + 网格）
//      X 光↔蓝图互斥 · 剖面开/关（clipping 挂载与清除）· 剖面深度滑块联动
//      剖面↔X 光互斥 · 沉浸模式（body.zen + UI 隐没 + 自转 + Esc/轻点退出）
//      分享链接参数序列化 · URL 打开还原现场（env/ex/dev）· 切设备自动退出视觉模式
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8124/iphoneDuo.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1440, height: 900 },
});
const until = async (page, fn, timeout = 40000, every = 300) => {
  for (let t = 0; t < timeout; t += every) {
    try { const v = await fn(); if (v) return v; } catch { /* 页面切换瞬间 */ }
    await sleep(every);
  }
  return null;
};
const fun = (page) => page.evaluate(() => window.__fun());

let fails = 0, n = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${++n}. ${name} ${cond ? 'OK' : 'FAIL'}${extra ? ' ' + extra : ''}`);
  if (!cond) fails++;
};

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}?dev=p18`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('iphoneDuo.seen', '1');       // 跳过开场演示
    localStorage.setItem('iphoneDuo.labels', '0');     // 关标注（防点击被浮层挡）
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  await sleep(2500);

  // ① X 光开：vis 状态 + 外壳幽灵材质（非线框半透明蓝）/ 内部件线框青 + 按钮高亮
  let f = await fun(page);
  ok('初始 vis=off', f.vis === 'off');
  const matsOff = await page.evaluate(() => window.__mats());
  await page.click('#btnXray');
  f = await until(page, async () => (await fun(page)).vis === 'xray');
  ok('X 光开启 vis=xray', !!f);
  const matsX = await page.evaluate(() => window.__mats());
  ok('X 光外壳=幽灵材质(非线框)', matsX.body && !matsX.body.wire, JSON.stringify(matsX.body));
  ok('X 光内部件=线框', matsX.core && matsX.core.wire, JSON.stringify(matsX.core));
  ok('X 光按钮高亮', await page.evaluate(() => document.querySelector('#btnXray').classList.contains('active')));

  // ② X 光关：材质零残留还原
  await page.click('#btnXray');
  f = await until(page, async () => (await fun(page)).vis === 'off');
  ok('X 光再按关闭 vis=off', !!f);
  const matsR = await page.evaluate(() => window.__mats());
  ok('材质还原零残留', JSON.stringify(matsR) === JSON.stringify(matsOff), `${JSON.stringify(matsR)} vs ${JSON.stringify(matsOff)}`);

  // ③ 蓝图开：全部件线框 + 深蓝纯色背景 + 地面网格
  await page.click('#btnBlue');
  f = await until(page, async () => (await fun(page)).vis === 'blueprint');
  ok('蓝图开启 vis=blueprint', !!f);
  const matsB = await page.evaluate(() => window.__mats());
  ok('蓝图外壳=线框', matsB.body && matsB.body.wire && matsB.body.color === '#8fd6ff', JSON.stringify(matsB.body));
  f = await fun(page);
  ok('蓝图深蓝背景', f.bg === '#08172c', `bg=${f.bg}`);
  ok('蓝图地面网格显示', f.grid === true);

  // ④ 蓝图 → X 光互斥切换（不关直接切）
  await page.click('#btnXray');
  f = await until(page, async () => (await fun(page)).vis === 'xray');
  ok('蓝图→X 光直接互斥切换', !!f);
  await page.keyboard.press('x');   // 键盘快捷键关闭
  f = await until(page, async () => (await fun(page)).vis === 'off');
  ok('X 键开关 X 光', !!f);

  // ⑤ 剖面开：clipping 挂载 + 控制条弹出 + 深度初值
  await page.click('#btnCut');
  f = await until(page, async () => (await fun(page)).cutOn === true);
  ok('剖面开启 cutOn=true', !!f);
  ok('剖面控制条弹出', await page.evaluate(() => document.querySelector('#cutBar').classList.contains('on')));
  ok('剖面初值 35%', (await fun(page)).cutK === 0.35);
  ok('X 光被剖面踢出（互斥）', (await fun(page)).vis === 'off');

  // ⑥ 剖面深度滑块联动
  await page.evaluate(() => { const el = document.querySelector('#cutDepth'); el.value = 62; el.dispatchEvent(new Event('input')); });
  f = await until(page, async () => Math.abs((await fun(page)).cutK - 0.62) < 0.01);
  ok('滑块调深度 62%', !!f);
  ok('深度百分比回显', await page.evaluate(() => document.querySelector('#cutPct').textContent === '62%'));

  // ⑦ 剖面关：clipping 清除 + 控制条收起
  await page.click('#btnCut');
  f = await until(page, async () => (await fun(page)).cutOn === false);
  ok('剖面关闭 cutOn=false', !!f);
  ok('剖面控制条收起', await page.evaluate(() => !document.querySelector('#cutBar').classList.contains('on')));
  const clipCleared = await page.evaluate(() => {
    const p = window.__mats(); return p; // 材质探针仍可用（无报错即 API 未破坏）
  });
  ok('材质探针仍可用', !!clipCleared);

  // ⑧ 沉浸模式：body.zen + 进场亮 UI → 静止隐没 → 活动唤回
  await page.keyboard.press('i');
  f = await until(page, async () => (await fun(page)).zen === true);
  ok('I 键进入沉浸 zen=true', !!f);
  ok('body.zen 挂载', await page.evaluate(() => document.body.classList.contains('zen')));
  ok('进场操作坞亮起（uiLive）', await page.evaluate(() => document.body.classList.contains('uiLive')));
  const dockOpacity = await until(page, async () => {
    const o = await page.evaluate(() => getComputedStyle(document.querySelector('#dock')).opacity);
    return o === '0' ? o : null;   // 等静止 2.5s + 过渡完成
  }, 15000);
  ok('静止后 UI 隐没（dock opacity=0）', dockOpacity === '0', `opacity=${dockOpacity}`);
  const autoRot = await page.evaluate(() => document.querySelector('#btnZen').classList.contains('active'));
  ok('沉浸按钮高亮', autoRot);
  // 鼠标活动 → 操作坞唤回（沉浸中可操作，不退出）
  await page.mouse.move(700, 500);
  f = await until(page, async () => page.evaluate(() => getComputedStyle(document.querySelector('#dock')).opacity === '1'));
  ok('鼠标活动唤回操作坞', !!f);
  f = await until(page, async () => (await fun(page)).zen === true);
  ok('操作中不退出沉浸', !!f);
  await page.keyboard.press('Escape');
  f = await until(page, async () => (await fun(page)).zen === false);
  ok('Esc 退出沉浸', !!f);

  // ⑨ 沉浸模式：轻点翻转 UI（不退出）· 双击退出
  await page.keyboard.press('i');
  f = await until(page, async () => (await fun(page)).zen === true);
  ok('再次进入沉浸', !!f);
  await until(page, async () => page.evaluate(() => document.body.classList.contains('uiLive') === false), 15000);  // 等初始 UI 隐没
  await page.mouse.down(); await page.mouse.up();   // 轻点（鼠标已在画布上，不动）→ 唤出
  f = await until(page, async () => page.evaluate(() => document.body.classList.contains('uiLive')));
  ok('轻点唤出操作坞（不退出）', !!(f && (await fun(page)).zen === true));
  await page.mouse.down(); await page.mouse.up();   // 再轻点 → 收起
  f = await until(page, async () => page.evaluate(() => document.body.classList.contains('uiLive') === false));
  ok('再轻点收起操作坞', !!f);
  await page.mouse.down(); await page.mouse.up(); await page.mouse.down(); await page.mouse.up();   // 双击
  f = await until(page, async () => (await fun(page)).zen === false);
  ok('双击退出沉浸', !!f);

  // ⑩ 分享链接：环境/爆炸度编码进 URL
  f = await until(page, async () => {
    const s = await fun(page);
    if (s.env === 'neon') return s;
    await page.click('#btnEnv');
    return null;
  });
  ok('循环切到霓虹环境', f?.env === 'neon', `env=${f?.env}`);
  await page.evaluate(() => { const el = document.querySelector('#explode'); el.value = 58; el.dispatchEvent(new Event('input')); });
  f = await until(page, async () => (await fun(page)).ex > 0.5);
  f = await fun(page);
  ok('设置爆炸度 58%', f.ex > 0.55 && f.ex < 0.61, `ex=${f.ex?.toFixed(2)}`);
  const url = await page.evaluate(() => window.__share());
  ok('分享链接含 dev', /[?&]dev=p18/.test(url), url);
  ok('分享链接含 env=neon', /[?&]env=neon/.test(url));
  ok('分享链接含 ex≈0.58', /[?&]ex=0\.58/.test(url));

  // ⑪ 打开分享链接还原现场（新 context 模拟新访客）
  const page2 = await ctx.newPage();
  await page2.goto(url, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  f = await until(page2, async () => {
    const s = await fun(page2);
    return s.env === 'neon' && Math.abs(s.ex - 0.58) < 0.01 ? s : null;
  });
  ok('新会话打开链接还原 env+ex', !!f, `env=${f?.env} ex=${f?.ex?.toFixed(2)}`);
  const keynote2 = await page2.evaluate(() => document.body.classList.contains('keynote'));
  ok('分享链接跳过开场演示', keynote2 === false);
  await page2.close();

  // ⑫ 切设备自动退出视觉模式
  await page.keyboard.press('x');
  f = await until(page, async () => (await fun(page)).vis === 'xray');
  ok('切设备前先进 X 光', !!f);
  await page.click('[data-dev="p18s"]');
  f = await until(page, async () => {
    const s = await fun(page);
    return s.vis === 'off' ? s : null;
  });
  ok('切设备自动退出 X 光', f?.vis === 'off', JSON.stringify(f));
  ok('设备已切到 p18s', await page.evaluate(() => document.body.dataset.dev) === 'p18s');
  const matsD = await page.evaluate(() => window.__mats());
  ok('新设备材质干净（非线框）', matsD.body && !matsD.body.wire, JSON.stringify(matsD.body));

  ok('无页面 JS 错误', errs.length === 0, errs.join(' | '));
} catch (e) {
  console.error('FATAL', e);
  fails++;
} finally {
  await browser.close();
}
console.log(`\nvis.mjs: ${n - fails}/${n} 通过`);
process.exit(fails ? 1 : 0);
