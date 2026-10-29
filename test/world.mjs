// 异世界（第一人称元器件都市）端到端验证
// 覆盖：V 键/按钮进入 · 首次开场剧情锁 · WASD 行走位移 · 罗盘目标指引
//      走到传送门 → world-enter 进电流竞速 → 通关结算 → 碎片回收 worldResume
//      集齐 5 枚碎片触发终章 · world5 徽章 · ✕ 退出渲染管线切回主场景
// 前置：python3 -m http.server 8124 --directory dist
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
const wd = (page) => page.evaluate(() => window.__world.state());

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
    localStorage.clear();                              // 全新存档：触发首次开场剧情
    localStorage.setItem('iphoneDuo.seen', '1');       // 跳过主场景开场演示
    localStorage.setItem('iphoneDuo.labels', '0');     // 关标注（防浮层挡点击）
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  await sleep(2500);

  // ════════ ① 进入异世界 ════════
  console.log('── 异世界 · 接入 ──');
  await page.click('#btnWorld');
  let f = await until(page, async () => (await fun(page)).world.on === true);
  ok('◈ 按钮进入异世界 world.on', !!f);
  f = await fun(page);
  ok('HUD 挂载 #vgame.on', f.world.layerOn === true);
  ok('渲染管线接管 wdScene/wdCam', f.world.rpassWd === true);
  ok('body.world 隐藏主 UI', await page.evaluate(() => document.body.classList.contains('world')));
  f = await wd(page);
  ok('首次进入播开场剧情 intro', f.intro === true, `frags=${f.frags.length}`);
  ok('「异世界旅人」徽章解锁 world1', (await fun(page)).fifth.badgeIds.includes('world1'));

  // 开场剧情 5.2s 锁输入（轮询到 intro 结束，不用固定 sleep——SwiftShader 低帧率会拖长）
  f = await until(page, async () => (await wd(page)).intro === false, 20000);
  ok('开场剧情播完解锁操控', !!f);

  // ════════ ② 第一人称行走 ════════
  console.log('── 第一人称 · 行走 ──');
  await page.evaluate(() => window.__world.go(0, 52));
  const p0 = await wd(page);
  await page.keyboard.down('w');
  await sleep(1500);
  await page.keyboard.up('w');
  const p1 = await wd(page);
  ok('W 前进位移 z 减小', p1.z < p0.z - 5, `${p0.z} → ${p1.z}`);
  await page.keyboard.down('ShiftLeft');               // 冲刺：同时间位移更大
  await page.keyboard.down('w');
  await sleep(1000);
  await page.keyboard.up('w');
  await page.keyboard.up('ShiftLeft');
  const p2 = await wd(page);
  ok('Shift 冲刺更快', (p1.z - p2.z) > (p0.z - p1.z), `${p1.z - p2.z} > ${p0.z - p1.z}`);
  // 边界钳制：撞到世界尽头不出界
  await page.evaluate(() => window.__world.go(0, -900));
  f = await wd(page);
  ok('世界边界钳制 z≥-880', f.z >= -880, `z=${f.z}`);

  // ════════ ③ 罗盘 + 传送门进入关卡 ════════
  console.log('── 传送门 · 电流竞速 ──');
  const dist1 = await page.evaluate(() => document.querySelector('#vDist')?.textContent || '');
  ok('目标罗盘显示距离', /\d+m/.test(dist1), `"${dist1}"`);
  await page.evaluate(() => window.__world.go(0, -122));   // 传送到第 1 座传送门跟前（micro @ z=-130）
  f = await until(page, async () => (await wd(page)).near === 'micro');
  ok('接近传送门 near=micro', !!f);
  f = await fun(page);
  ok('接近提示浮层亮起', await page.evaluate(() => document.querySelector('#vPrompt')?.classList.contains('on')));
  await page.evaluate(() => window.__world.enter());       // E 键等效路径
  f = await until(page, async () => (await fun(page)).arcade.cur === 'micro');
  ok('穿门进入电流竞速 cur=micro', !!f);
  f = await fun(page);
  ok('viaWorld 路径标记', f.world.viaWorld === true && f.world.on === false);
  ok('结算按钮改「返回异世界」', await page.evaluate(() => document.querySelector('#gExit')?.textContent.includes('异世界')));

  // 通关：over=true 时退出 → 碎片回收
  await until(page, async () => (await fun(page)).micro.run === true, 20000);
  await page.evaluate(() => window.__microOver());          // 真实结算面板（over=true）
  f = await until(page, async () => (await fun(page)).micro.over === true);
  ok('本局结算面板出现', !!f);
  await page.click('#gExit');
  f = await until(page, async () => (await fun(page)).world.on === true);
  ok('返回异世界原地复活', !!f);
  f = await fun(page);
  ok('碎片回收 frags=1', f.world.frags === 1, `frags=${f.world.frags} [${f.world.fragIds}]`);
  ok('渲染管线重回异世界', f.world.rpassWd === true);
  const mission = await page.evaluate(() => document.querySelector('#vMission')?.textContent || '');
  ok('任务推进到下一章节', mission.includes('离子塔防'), `"${mission}"`);

  // ════════ ④ 未通关退出不回收 ════════
  console.log('── 传送门 · 未通关 ──');
  await page.evaluate(() => window.__world.go(62, -270));   // turret 传送门 @ (62,-280)
  f = await until(page, async () => (await wd(page)).near === 'turret');
  await page.evaluate(() => window.__world.enter());
  // 竞态规避：cur 可见时 busy 可能仍 true（120ms 白闪窗口），Esc 会被互斥锁吞掉
  await until(page, async () => (await page.evaluate(() => window.__gstate())).busy === false);
  f = await until(page, async () => (await fun(page)).arcade.cur === 'turret');
  await page.keyboard.press('Escape');                      // 直接 Esc：无结算 → 不回收
  f = await until(page, async () => (await fun(page)).world.on === true);
  ok('Esc 中途退出回异世界', !!f);
  f = await fun(page);
  ok('未通关不回收碎片 frags=1', f.world.frags === 1, `frags=${f.world.frags}`);

  // ════════ ⑤ 集齐 5 枚碎片 → 终章 ════════
  console.log('── 终章 · CORE ONLINE ──');
  // 各游戏通关探针 + HUD 前缀 + __fun 快照字段（wave 游戏的快照字段名是 waver）
  const END_PROBE = { micro: '__microOver', turret: '__turretEnd', shoot: '__shootEnd', wave: '__waveOver', maze: '__mazeEnd' };
  const GAME_PRE = { micro: 'g', turret: 't', shoot: 's', wave: 'w', maze: 'z' };
  const FUN_KEY = { micro: 'micro', turret: 'turret', shoot: 'shoot', wave: 'waver', maze: 'maze' };
  // 走进某座传送门并通关回收：over=true 结算 → Exit → 回异世界 → frags+1
  const beatPortal = async (key, x, z, expectFrags) => {
    const fk = FUN_KEY[key];
    await page.evaluate(([x, z]) => window.__world.go(x, z), [x, z]);
    await until(page, async () => (await wd(page)).near === key);
    await page.evaluate(() => window.__world.enter());
    await until(page, async () => (await page.evaluate(() => window.__gstate())).busy === false);
    await until(page, async () => (await fun(page)).arcade.cur === key);
    await until(page, async () => (await fun(page)).arcade[fk].run === true, 25000);
    await page.evaluate((p) => window[p](true), END_PROBE[key]);   // 真实通关结算
    await until(page, async () => (await fun(page)).arcade[fk].over === true);
    await sleep(400);                                              // 结算面板过渡动画稳定
    await page.click(`#${GAME_PRE[key]}Exit`);
    await until(page, async () => (await fun(page)).world.on === true);
    return (await fun(page)).world.frags === expectFrags;
  };
  ok('shoot 传送门通关回收', await beatPortal('shoot', -44, -420, 2));
  ok('wave 传送门通关回收', await beatPortal('wave', 52, -570, 3));
  ok('maze 传送门通关回收', await beatPortal('maze', -8, -710, 4));
  // turret 上一步未通关，补一次
  ok('turret 传送门通关回收', await beatPortal('turret', 62, -270, 5));
  f = await fun(page);
  ok('5 枚碎片集齐', f.world.frags === 5, `frags=${f.world.frags} [${f.world.fragIds}]`);
  f = await until(page, async () => (await fun(page)).world.finale === true, 10000);
  ok('终章触发 finale', !!f);
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('world5'), 10000);
  ok('「重启之心」徽章 world5', !!f);
  const title = await until(page, async () => {
    const t = await page.evaluate(() => document.querySelector('#vTitle')?.classList.contains('on'));
    return t || null;
  }, 8000);
  ok('CORE ONLINE 终章标题', !!title);

  // ════════ ⑥ 退出 + 持久化 ════════
  console.log('── 退出 · 持久化 ──');
  await page.click('#vQuit');
  f = await until(page, async () => (await fun(page)).world.on === false);
  ok('✕ 退出异世界', !!f);
  f = await fun(page);
  ok('主场景恢复渲染', f.rpass === true && f.world.layerOn === false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('iphoneDuo.worldFrags') || '[]'));
  ok('碎片 localStorage 持久化', saved.length === 5, `[${saved}]`);

  // 重进：欢迎回归（不再播首次剧情），碎片还在
  await page.keyboard.press('v');
  f = await until(page, async () => (await fun(page)).world.on === true);
  ok('V 键重进异世界', !!f);
  f = await fun(page);
  ok('回归不重播开场剧情', (await wd(page)).intro === false);
  ok('碎片存档保留 5/5', f.world.frags === 5);
  await page.keyboard.press('Escape');
  await until(page, async () => (await fun(page)).world.on === false);

  ok('无页面 JS 错误', errs.length === 0, errs.join(' | ').slice(0, 200));
} catch (e) {
  console.error('FATAL', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(`\nworld.mjs: ${fails === 0 ? 'ALL PASS' : fails + ' 项失败'} (${n} 项)`);
if (fails) process.exitCode = 1;
