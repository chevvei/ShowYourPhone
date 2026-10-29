// 芯片微观世界 端到端验证（p18 单设备全流程）
// 覆盖：双击主板触发电影化运镜进入 · HUD/徽章 · 倒计时起跑 · 计分增长 · 方向操控
//      死亡结算（分数/最佳/连击回显）· 再来一局循环 · Esc / ✕ 双出口 · 退出后可再进入
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
    try { const v = await fn(); if (v) return v; } catch { /* 世界切换瞬间 */ }
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
    localStorage.setItem('iphoneDuo.labels', '0');     // 关标注（防浮层挡点击）
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  await sleep(2500);

  // 找一个能射线命中主板的屏幕像素：轮换机位，只扫主板屏幕投影矩形内部（快且准）
  const findBoardPixel = async () => {
    const angles = [[330, 70, 0], [-330, 70, 0], [0, 70, 330], [0, 70, -330], [0, 300, 200], [230, 230, 230], [-230, 230, -230]];
    for (const a of angles) {
      await page.evaluate(([x, y, z]) => window.__setCam(x, y, z), a);
      await sleep(150);
      const hit = await page.evaluate(() => {
        const rect = window.__screenRect('board');
        if (!rect) return { __dbg: 'no rect' };
        const x0 = Math.max(4, rect.x), x1 = Math.min(innerWidth - 4, rect.x + rect.w);
        const y0 = Math.max(64, rect.y), y1 = Math.min(innerHeight - 4, rect.y + rect.h);
        const first = {};
        for (let py = y0; py < y1; py += 14)
          for (let px = x0; px < x1; px += 14) {
            const r = window.__ray(px, py);
            if (!r) continue;
            first[r.partId] = (first[r.partId] || 0) + 1;
            if (r.partId === 'board') return { x: px, y: py };
          }
        return { __dbg: JSON.stringify({ rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, first }) };
      });
      if (hit && !hit.__dbg) return hit;
      if (hit?.__dbg) console.log('    [scan]', a.join(','), hit.__dbg);
    }
    return null;
  };
  // 双击主板：单次 evaluate 内同步派发两击（目标代码路径与真实输入一致）。
  // 不用 CDP mouse 协议、也不分两次 evaluate：swiftshader 重载下事件注入/求值排队
  // 延迟会让两击在页面时间轴上超出 380ms 双击窗口（真实触屏/鼠标无此问题）。
  const dblTapBoard = (p) => page.evaluate((x, y) => {
    // 合成 PointerEvent 无真实 active pointer：OrbitControls 内部 set/releasePointerCapture
    // 会抛 NotFoundError（真实输入不触发），测试侧静默
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
    const c = document.querySelector('canvas');
    const o = { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true, isPrimary: true, button: 0 };
    for (let i = 0; i < 2; i++) {
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      c.dispatchEvent(new PointerEvent('pointerup', o));
    }
  }, p.x, p.y);

  // ① 双击主板 → 电影化运镜（合拢/飞向芯片/白闪穿膜）→ 进入微观世界
  //    主板整机状态下被外壳包住：先拉爆炸滑块让部件散开（真实用户路径）
  await page.evaluate(() => { const el = document.querySelector('#explode'); el.value = 70; el.dispatchEvent(new Event('input')); });
  await sleep(2400);                                    // 等展开+爆炸动画完全结束（动画期间相机被逐帧控制）
  const bp = await findBoardPixel();
  ok('扫描到主板可视像素', !!bp, bp ? `@(${bp.x},${bp.y})` : '');
  if (!bp) throw new Error('board not pickable');
  await dblTapBoard(bp);
  let f = await until(page, async () => (await fun(page)).micro.on === true);
  ok('双击主板进入微观世界 micro.on', !!f);
  f = await fun(page);
  ok('游戏 HUD 挂载 #game.on', f.micro.gameOn === true);
  ok('「微观访客」徽章解锁', f.fifth.badgeIds.includes('micro'), `badges=${f.fifth.badgeIds}`);

  // ② 倒计时起跑（进入提示 2.4s + 3/2/1/GO ≈ 4.6s）
  f = await until(page, async () => (await fun(page)).micro.run === true, 20000);
  ok('倒计时后起跑 micro.run', !!f);
  f = await fun(page);
  ok('初始 3 点电荷', f.micro.lives === 3, `lives=${f.micro.lives}`);
  ok('初速已推进', f.micro.speed >= 30, `speed=${f.micro.speed}`);

  // ③ 计分随里程增长 + 方向操控不崩
  const s0 = f.micro.score;
  await sleep(1600);
  f = await fun(page);
  ok('分数随里程增长', f.micro.score > s0, `${s0} → ${f.micro.score}`);
  await page.keyboard.down('d');
  await sleep(600);
  await page.keyboard.up('d');
  f = await fun(page);
  ok('方向操控存活（D 键横移）', f.micro.run === true, `speed=${f.micro.speed}`);

  // ④ 死亡结算：gOver 面板 + 本局统计回显
  await page.evaluate(() => window.__microOver());
  f = await until(page, async () => (await fun(page)).micro.over === true);
  ok('电荷耗尽进入结算 micro.over', !!f);
  f = await fun(page);
  ok('结算面板 #gOver.on', f.micro.overOn === true);
  ok('结算时停止滚动 micro.run=false', f.micro.run === false);
  const stats = await page.evaluate(() => document.querySelector('#gStats').textContent);
  ok('结算含本局分数/最佳/连击', /本局分数/.test(stats) && /历史最佳/.test(stats), `"${stats.slice(0, 60)}…"`);

  // ⑤ 再来一局：重置状态 + 重新倒计时起跑
  //    不查 score===0：swiftshader 下 click 的 CDP 往返可耗 2-5s，起跑后 60ms 分数即跳 1，
  //    零分窗口必然错过。改用持久证据：结算面板关闭 + 分数低于上局（清零后新跑的分数）
  const prevScore = f.micro.score;
  await page.click('#gRetry');
  f = await until(page, async () => {
    const m = (await fun(page)).micro;
    return m.over === false && m.overOn === false && m.lives === 3 && m.score < prevScore ? m : false;
  }, 15000);
  ok('重开满电荷且清分', !!f, `lives=${f?.lives} score=${f?.score}（上局 ${prevScore}）`);
  f = await until(page, async () => (await fun(page)).micro.run === true, 20000);
  ok('「再来一局」重新起跑', !!f);

  // ⑥ Esc 退出：白闪 → 回主场景 → 相机拉回全局
  await page.keyboard.press('Escape');
  f = await until(page, async () => (await fun(page)).micro.on === false, 15000);
  ok('Esc 退出微观世界', !!f);
  f = await fun(page);
  ok('HUD 已卸载', f.micro.gameOn === false && f.micro.overOn === false);
  ok('主场景恢复渲染（渲染管线切回）', f.rpass === true, `rpass=${f.rpass}`);

  // ⑦ 退出后二次进入：部件列表选主板（自动爆炸+飞近）→ 信息卡「深入芯片」按钮入口 + ✕ 出口
  await sleep(800);                                     // 等退出拉镜动画收尾
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('#partsList .item')];
    const board = items.find((b) => b.textContent.includes('主板') || /board/i.test(b.textContent));
    board && board.click();
  });
  await sleep(400);                                     // selectPart 同步亮面板，等飞近动画起步即可
  const infoOn = await page.evaluate(() => !document.querySelector('#infoMicro').hidden);
  ok('主板信息卡亮出「深入芯片」入口', infoOn === true);
  await page.click('#infoMicro');
  f = await until(page, async () => (await fun(page)).micro.on === true);
  ok('信息卡按钮二次进入微观世界', !!f);
  await page.click('#gQuit');
  f = await until(page, async () => (await fun(page)).micro.on === false, 15000);
  ok('✕ 按钮退出微观世界', !!f);

  ok('无页面 JS 错误', errs.length === 0, errs.join(' | ').slice(0, 200));
} catch (e) {
  console.error('FATAL', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(`\nmicro.mjs: ${fails === 0 ? 'ALL PASS' : fails + ' 项失败'} (${n} 项)`);
if (fails) process.exitCode = 1;
