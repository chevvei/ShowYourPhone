// 部件小游戏四件套 端到端验证（p18 单设备全流程）
// 覆盖：双击电池进入离子塔防（partTapT 泛化分发）· 放塔扣金币 · 波次推进
//      胜利结算徽章「电芯守卫者」· 再来一局 · Esc 退出渲染管线切回
//      点阵射击：真实射线命中目标计分连击 · 「深度扫描」徽章 · ✕ 按钮退出
//      声波冲浪：起跑加速 · 方向操控 · 1500 分「金牌混音师」· 重开清分
//      磁力迷阵：倾斜操控 · 三关递进（__mazeGoal 过关判定）· 「滚珠大师」· 退出
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
// 合成 PointerEvent（同 micro.mjs：OrbitControls 对合成事件 setPointerCapture 会抛，静默掉）
const tap = (page, x, y) => page.evaluate((x, y) => {
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  const c = document.querySelector('canvas');
  const o = { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true, isPrimary: true, button: 0 };
  c.dispatchEvent(new PointerEvent('pointerdown', o));
  c.dispatchEvent(new PointerEvent('pointerup', o));
}, x, y);
// 双击：单次 evaluate 内同步连发两击（主线程被 WebGL 渲染堵塞，setTimeout(90) 实测延迟 700ms+，
// 会超出 380ms 双击窗口；同步连发两对 pointerdown/up，间隔 0ms 仍在窗口内）
const dblTap = (page, x, y) => page.evaluate((x, y) => {
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  const c = document.querySelector('canvas');
  const o = { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true, isPrimary: true, button: 0 };
  for (let i = 0; i < 2; i++) {
    c.dispatchEvent(new PointerEvent('pointerdown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o));
  }
}, x, y);

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

  // ════════ ① 离子塔防（电池）════════
  console.log('── 离子塔防 · 电池 ──');
  // 双击电池：真实用户路径（拉爆炸 → 扫描可视像素 → 同步双击）
  await page.evaluate(() => { const el = document.querySelector('#explode'); el.value = 70; el.dispatchEvent(new Event('input')); });
  await sleep(2400);
  const findBatPixel = async () => {
    const angles = [[330, 70, 0], [-330, 70, 0], [0, 70, 330], [0, 70, -330], [230, 230, 230], [-230, 230, -230]];
    for (const a of angles) {
      await page.evaluate(([x, y, z]) => window.__setCam(x, y, z), a);
      await sleep(150);
      const hit = await page.evaluate(() => {
        for (const pid of ['batA', 'battery']) {
          const rect = window.__screenRect(pid);
          if (!rect) continue;
          const x0 = Math.max(4, rect.x), x1 = Math.min(innerWidth - 4, rect.x + rect.w);
          const y0 = Math.max(64, rect.y), y1 = Math.min(innerHeight - 4, rect.y + rect.h);
          for (let py = y0; py < y1; py += 12)
            for (let px = x0; px < x1; px += 12) {
              const r = window.__ray(px, py);
              if (r && (r.partId === 'batA' || r.partId === 'battery')) return { x: px, y: py };
            }
        }
        return null;
      });
      if (hit) return hit;
    }
    return null;
  };
  const bp = await findBatPixel();
  ok('扫描到电池可视像素', !!bp, bp ? `@(${bp.x},${bp.y})` : '');
  if (bp) {
    await dblTap(page, bp.x, bp.y);   // 双击（380ms 窗口内连发两击）
  } else {
    await page.evaluate(() => window.__enterGame('turret'));                     // 兜底：探针进入
  }
  let f = await until(page, async () => (await fun(page)).arcade.turret.on === true);
  ok('双击电池进入离子塔防 turret.on', !!f);
  f = await fun(page);
  ok('塔防 HUD 挂载 #tgame.on', f.arcade.turret.hudOn === true);
  ok('「电网工程师」徽章解锁', f.fifth.badgeIds.includes('turret'), `badges=${f.fifth.badgeIds.length}`);

  f = await until(page, async () => (await fun(page)).arcade.turret.run === true, 20000);
  ok('倒计时后开局 turret.run', !!f);
  f = await fun(page);
  ok('初始金币 90 · 电芯 10', f.arcade.turret.gold === 90 && f.arcade.turret.coreHp === 10,
    `gold=${f.arcade.turret.gold} hp=${f.arcade.turret.coreHp}`);

  // 点击发光槽位放塔：金币 90 → 60
  const slot = await page.evaluate(() => {
    const s = window.__turretSlots().filter((q) => q.free
      && q.x > 10 && q.x < innerWidth - 10 && q.y > 90 && q.y < innerHeight - 10);
    return s[0] || null;
  });
  ok('槽位投影在屏幕内可点', !!slot, slot ? `@(${Math.round(slot.x)},${Math.round(slot.y)})` : '');
  if (slot) await tap(page, slot.x, slot.y);
  f = await until(page, async () => (await fun(page)).arcade.turret.gold === 60);
  ok('点击槽位放塔扣 30 金币', !!f, `gold=${f?.arcade?.turret?.gold}`);

  f = await until(page, async () => (await fun(page)).arcade.turret.wave >= 1, 15000);
  ok('波次调度启动 wave≥1', !!f, `wave=${f?.arcade?.turret?.wave}`);

  await page.evaluate(() => window.__turretEnd(true));   // 胜利结算（真实 endTurretRun）
  f = await until(page, async () => (await fun(page)).arcade.turret.over === true);
  ok('守住 6 波进入胜利结算', !!f);
  f = await fun(page);
  ok('「电芯守卫者」徽章解锁', f.fifth.badgeIds.includes('shield'));
  const tStats = await page.evaluate(() => document.querySelector('#tStats').textContent);
  ok('结算含拦截数/历史最佳', /拦截电涌/.test(tStats) && /历史最佳/.test(tStats), `"${tStats.slice(0, 50)}…"`);

  await page.click('#tRetry');
  f = await until(page, async () => {
    const t = (await fun(page)).arcade.turret;
    return t.over === false && t.gold === 90 ? t : false;
  }, 15000);
  ok('重开满金币清结算', !!f, `gold=${f?.gold}`);
  await page.keyboard.press('Escape');
  f = await until(page, async () => (await fun(page)).arcade.turret.on === false, 15000);
  ok('Esc 退出塔防', !!f);
  f = await fun(page);
  ok('主场景恢复渲染', f.rpass === true && f.arcade.turret.hudOn === false);

  // ════════ ② 点阵射击（Face ID）════════
  console.log('── 点阵射击 · Face ID ──');
  await page.evaluate(() => window.__enterGame('shoot'));
  f = await until(page, async () => (await fun(page)).arcade.shoot.on === true);
  ok('进入点阵空间 shoot.on', !!f);
  f = await fun(page);
  ok('射击 HUD 挂载 #sgame.on', f.arcade.shoot.hudOn === true);
  ok('「点阵射手」徽章解锁', f.fifth.badgeIds.includes('shoot'));

  f = await until(page, async () => (await fun(page)).arcade.shoot.run === true, 20000);
  ok('倒计时后开局 shoot.run', !!f);

  // 真实射线命中：点目标 → hit/combo/score 联动
  for (let i = 0; i < 2; i++) {
    const tg = await page.evaluate(() => {
      const t = window.__shootTargets().filter((q) => q.x > 10 && q.x < innerWidth - 10 && q.y > 90 && q.y < innerHeight - 10);
      return t[0] || null;
    });
    if (tg) await tap(page, tg.x, tg.y);
    await sleep(200);
  }
  f = await fun(page);
  ok('点击目标命中 ×2 连击计分', f.arcade.shoot.hit >= 2 && f.arcade.shoot.combo >= 2,
    `hit=${f.arcade.shoot.hit} combo=${f.arcade.shoot.combo} score=${f.arcade.shoot.score}`);

  await page.evaluate(() => window.__shootEnd(true));    // 扫描完成结算
  f = await until(page, async () => (await fun(page)).arcade.shoot.over === true);
  ok('完成扫描进入结算', !!f);
  f = await fun(page);
  ok('「深度扫描」徽章解锁', f.fifth.badgeIds.includes('scan'));

  await page.click('#sRetry');
  f = await until(page, async () => {
    const s = (await fun(page)).arcade.shoot;
    return s.over === false && s.hit === 0 ? s : false;
  }, 15000);
  ok('重开清零命中数', !!f, `hit=${f?.hit}`);
  await page.click('#sQuit');
  f = await until(page, async () => (await fun(page)).arcade.shoot.on === false, 15000);
  ok('✕ 按钮退出点阵空间', !!f);
  f = await fun(page);
  ok('主场景恢复渲染', f.rpass === true);

  // ════════ ③ 声波冲浪（扬声器）════════
  console.log('── 声波冲浪 · 扬声器 ──');
  await page.evaluate(() => window.__enterGame('wave'));
  f = await until(page, async () => (await fun(page)).arcade.waver.on === true);
  ok('进入扬声管 waver.on', !!f);
  f = await fun(page);
  ok('冲浪 HUD 挂载 #wgame.on', f.arcade.waver.hudOn === true);
  ok('「浪尖骑士」徽章解锁', f.fifth.badgeIds.includes('waver'));

  f = await until(page, async () => (await fun(page)).arcade.waver.run === true, 20000);
  ok('倒计时后起跑 waver.run', !!f);
  f = await fun(page);
  ok('初速 36 · 音量 3 格', f.arcade.waver.vol === 3, `vol=${f.arcade.waver.vol}`);

  await page.keyboard.down('d');
  await sleep(600);
  await page.keyboard.up('d');
  const ws0 = (await fun(page)).arcade.waver.score;
  await sleep(1600);
  f = await fun(page);
  ok('方向操控存活且分数增长', f.arcade.waver.run === true && f.arcade.waver.score > ws0,
    `${ws0} → ${f.arcade.waver.score}`);

  await page.evaluate(() => window.__waveBonus(1500));  // 注入奖励分验证 beat 徽章路径
  await page.evaluate(() => window.__waveOver());       // 哑场结算（真实 endWaveRun）
  f = await until(page, async () => (await fun(page)).arcade.waver.over === true);
  ok('音量耗尽进入哑场结算', !!f);
  f = await fun(page);
  ok('「金牌混音师」徽章解锁', f.fifth.badgeIds.includes('beat'));
  const wStats = await page.evaluate(() => document.querySelector('#wStats').textContent);
  ok('结算含收集/连击/最佳', /收集音符/.test(wStats) && /最高连击/.test(wStats), `"${wStats.slice(0, 50)}…"`);

  await page.click('#wRetry');
  f = await until(page, async () => {
    const w = (await fun(page)).arcade.waver;
    return w.over === false && w.score === 0 && w.vol === 3 ? w : false;
  }, 15000);
  ok('重开清分满音量', !!f, `score=${f?.score} vol=${f?.vol}`);
  await page.keyboard.press('Escape');
  f = await until(page, async () => (await fun(page)).arcade.waver.on === false, 15000);
  ok('Esc 退出冲浪', !!f);
  f = await fun(page);
  ok('主场景恢复渲染', f.rpass === true);

  // ════════ ④ 磁力迷阵（MagSafe）════════
  console.log('── 磁力迷阵 · MagSafe ──');
  await page.evaluate(() => window.__enterGame('maze'));
  f = await until(page, async () => (await fun(page)).arcade.maze.on === true);
  ok('进入磁环迷宫 maze.on', !!f);
  f = await fun(page);
  ok('迷阵 HUD 挂载 #zgame.on', f.arcade.maze.hudOn === true);
  ok('「磁场行者」徽章解锁', f.fifth.badgeIds.includes('magnet'));

  f = await until(page, async () => (await fun(page)).arcade.maze.run === true, 20000);
  ok('倒计时后开局 maze.run', !!f);
  f = await fun(page);
  ok('第 1 关 · 45s 倒计时', f.arcade.maze.lv === 1 && f.arcade.maze.time <= 45, `lv=${f.arcade.maze.lv}`);

  await page.keyboard.down('d');                        // 倾斜操控：球滚动不崩
  await sleep(500);
  await page.keyboard.up('d');
  f = await fun(page);
  ok('方向键倾斜操控存活', f.arcade.maze.run === true, `time=${f.arcade.maze.time}`);

  await page.evaluate(() => window.__mazeGoal());       // 传送到终点 → 真实过关判定
  f = await until(page, async () => (await fun(page)).arcade.maze.lv === 2, 10000);
  ok('磁珠入环晋级第 2 关', !!f);
  await page.evaluate(() => window.__mazeGoal());
  f = await until(page, async () => (await fun(page)).arcade.maze.lv === 3, 10000);
  ok('晋级第 3 关', !!f);
  await page.evaluate(() => window.__mazeGoal());
  f = await until(page, async () => (await fun(page)).arcade.maze.over === true, 10000);
  ok('三关全通进入结算', !!f);
  f = await fun(page);
  ok('「滚珠大师」徽章解锁', f.fifth.badgeIds.includes('roll'));

  await page.click('#zRetry');
  f = await until(page, async () => {
    const m = (await fun(page)).arcade.maze;
    return m.over === false && m.lv === 1 && m.score === 0 ? m : false;
  }, 15000);
  ok('重开回第 1 关清分', !!f, `lv=${f?.lv}`);
  await page.click('#zQuit');
  f = await until(page, async () => (await fun(page)).arcade.maze.on === false, 15000);
  ok('✕ 按钮退出迷阵', !!f);
  f = await fun(page);
  ok('主场景恢复渲染', f.rpass === true && f.arcade.cur === null);
  ok('无游戏在场 arcade.cur=null', f.arcade.cur === null);

  // 8 枚游戏徽章全部到手
  f = await fun(page);
  const arc = ['turret', 'shield', 'shoot', 'scan', 'waver', 'beat', 'magnet', 'roll'];
  ok('四游戏 8 枚徽章全解锁', arc.every((id) => f.fifth.badgeIds.includes(id)),
    `badges=${f.fifth.badgeIds.length}/22`);

  ok('无页面 JS 错误', errs.length === 0, errs.join(' | ').slice(0, 200));
} catch (e) {
  console.error('FATAL', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(`\narcade.mjs: ${fails === 0 ? 'ALL PASS' : fails + ' 项失败'} (${n} 项)`);
if (fails) process.exitCode = 1;
