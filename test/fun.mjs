// 10 大可玩性特性端到端验证（p18 单设备全流程）
// 覆盖：环境光场循环 · 音效开关 · 部件大师（看图识名 + 盲找 + 连击）
//      拆装挑战（依赖顺序装配 + 计数）· 运镜录制开关 · AR 摄像头开关
//      抛掷物理（起抛 → 落地回正）· 壁纸工厂（导出宽度）
// 全程真实点击 + 轮询完成态（SwiftShader 帧率低，禁止固定 sleep 断言）
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8124/iphoneDuo.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  defaultViewport: { width: 1440, height: 900 },
});

// 轮询直到 fn 返回真值（超时返回 null）
const until = async (page, fn, timeout = 40000, every = 300) => {
  for (let t = 0; t < timeout; t += every) {
    try { const v = await fn(); if (v) return v; } catch { /* 页面跳转瞬间 */ }
    await sleep(every);
  }
  return null;
};
const fun = (page) => page.evaluate(() => window.__fun());
const click = async (page, x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); };

// 全视口扫描某部件的命中像素（find 模式 / 拆装挑战时目标可能不在视口内，转相机重扫）
const CAMS = [[0, 120, 820], [0, -120, 820], [500, 120, 500], [-500, 120, -500], [0, 120, -820], [0, 400, 400]];
const findPartPixel = (page, pid) => page.evaluate((id) => {
  let best = null, bd = 1e9;
  for (let y = 30; y < innerHeight - 30; y += 10)
    for (let x = 30; x < innerWidth - 30; x += 10) {
      const h = window.__ray(x, y);
      if (h && h.partId === id) {
        const d = (x - innerWidth / 2) ** 2 + (y - innerHeight / 2) ** 2;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
  return best;
}, pid);

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

  // ① 环境光场：影棚 → 日落 → 霓虹 → 影棚
  let f = await fun(page);
  ok('环境初始=studio', f.env === 'studio');
  for (const want of ['sunset', 'neon', 'studio']) {
    await page.click('#btnEnv');
    f = await until(page, async () => (await fun(page)).env === want);
    ok(`环境切换→${want}`, !!f);
  }

  // ② 音效开关持久化
  const s0 = f.sfx;
  await page.click('#btnSfx');
  f = await fun(page);
  ok('音效开关翻转', f.sfx === !s0);
  const kept = await page.evaluate(() => localStorage.getItem('iphoneDuo.sfx'));
  ok('音效状态持久化', kept === (f.sfx ? '1' : '0'), `localStorage=${kept}`);

  // ③ 部件大师 · 看图识名：答对 → 连击 +1 → 自动下一题
  await page.click('#btnQuiz');
  f = await until(page, async () => ((await fun(page)).quiz.on ? await fun(page) : null));
  ok('打开部件大师', !!f && (await page.$eval('#quiz', (el) => el.classList.contains('on'))));
  let q = f.quiz;
  ok('默认看图识名', q.mode === 'name' && q.ansName && q.streak === 0, `目标=${q.ansName}`);
  const ans0 = q.ans;
  await page.$$eval('#quizOpts button', (bs, name) => {
    const b = bs.find((x) => x.textContent.trim() === name);
    b && b.click();
  }, q.ansName);
  q = await until(page, async () => { const x = (await fun(page)).quiz; return x.streak === 1 && x.ans !== ans0 ? x : null; });
  ok('答对 +1 分并出下一题', !!q, `streak=${q?.streak} 下一题=${q?.ansName}`);

  // ④ 部件大师 · 盲找模式：扫像素点击目标部件
  // 切模式会重置连击并立刻出题，但上一题答对的 0.8s 换题定时器也可能随后触发——
  // 等它落地（题目稳定）再扫描，并在点击前校验目标没变
  await page.click('#quizModes [data-qm="find"]');
  q = await until(page, async () => (await fun(page)).quiz.mode === 'find');
  ok('切到盲找模式', !!q);
  await sleep(1500);                       // 掐掉换题定时器的窗口期
  const ans1 = (await fun(page)).quiz.ans;
  let hit = null;
  for (const c of CAMS) {
    await page.evaluate((cc) => window.__setCam(...cc), c);
    await sleep(400);
    hit = await findPartPixel(page, ans1);
    if (hit) break;
  }
  ok('盲找目标在视口内可命中', !!hit, JSON.stringify(hit));
  if (hit) {
    const ansNow = (await fun(page)).quiz.ans;
    if (ansNow === ans1) {
      await click(page, hit.x, hit.y);
      q = await until(page, async () => { const x = (await fun(page)).quiz; return x.streak === 1 && x.ans !== ans1 ? x : null; });
      ok('盲找点击命中 → 得分', !!q, `streak=${q?.streak}`);
    } else {
      ok('盲找点击命中 → 得分', false, `题目已切换 ${ans1}→${ansNow}`);
    }
  }
  await page.keyboard.press('Escape');
  f = await until(page, async () => !(await fun(page)).quiz.on);
  ok('Esc 关闭部件大师', !!f);

  // ⑤ 拆装挑战：依赖顺序装配（先装 2 件再放弃）
  await page.click('#btnAsm');
  f = await until(page, async () => { const a = (await fun(page)).asm; return a.on && a.total > 0 ? a : null; }, 60000);
  ok('打开拆装挑战（已展开）', !!f, `total=${f?.total}`);
  ok('爆照态就位', (await page.evaluate(() => window.__state())).explode > 0.99);
  let a = f;
  for (let i = 0; i < 2; i++) {
    let p = null;
    for (const c of CAMS) {
      await page.evaluate((cc) => window.__setCam(...cc), c);
      await sleep(400);
      p = await findPartPixel(page, a.next);
      if (p) break;
    }
    ok(`第 ${i + 1} 件可命中（${a.nextName}）`, !!p);
    if (!p) break;
    const left0 = a.left;
    await click(page, p.x, p.y);
    a = await until(page, async () => { const x = (await fun(page)).asm; return x.done === i + 1 && x.left === left0 - 1 ? x : null; }, 30000);
    ok(`装配第 ${i + 1} 件 → 剩 ${a?.left}`, !!a);
    if (!a) break;
  }
  await page.click('#asmGiveup');
  f = await until(page, async () => { const s = await page.evaluate(() => window.__state()); return s.explode < 0.01; }, 60000);
  ok('放弃 → 收拢归位', !!f);

  // ⑥ 运镜录制开关
  await page.click('#btnRec');
  f = await until(page, async () => (await fun(page)).rec, 15000);
  ok('开始录制', !!f);
  await sleep(1500);
  await page.click('#btnRec');
  f = await until(page, async () => !(await fun(page)).rec, 15000);
  ok('结束录制', !!f);

  // ⑦ AR 摄像头背景开关（fake media stream）
  await page.click('#btnAR');
  f = await until(page, async () => (await fun(page)).ar, 15000);
  const hasVideo = await page.$('#arVideo');
  ok('AR 预览开启（视频层）', !!f && !!hasVideo);
  await page.click('#btnAR');
  f = await until(page, async () => !(await fun(page)).ar, 15000);
  ok('AR 预览关闭', !!f);

  // ⑧ 抛掷物理：起抛 → 弹跳衰减 → 自动回正
  await page.click('#btnToss');
  f = await until(page, async () => (await fun(page)).phys, 5000);
  ok('起抛（物理接管）', !!f);
  f = await until(page, async () => { const x = await fun(page); return !x.phys ? x : null; }, 60000);
  ok('落地回正（物理交还）', !!f);

  // ⑨ 壁纸工厂：按机型原生分辨率导出（探针报告目标宽）
  f = await fun(page);
  ok('壁纸分辨率 = 机型原生', f.wallW >= 1179, `w=${f.wallW}`);

  // ⑩ 键盘快捷键 G 再抛一次
  await page.keyboard.press('g');
  f = await until(page, async () => (await fun(page)).phys, 5000);
  ok('快捷键 G 抛掷', !!f);
  await until(page, async () => !(await fun(page)).phys, 60000);

  ok('全程无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.screenshot({ path: '/tmp/fun_final.png' });
  await ctx.close();
  console.log(fails ? `\n${fails} 项 FAIL` : '\n全部通过');
} finally { await browser.close(); }
process.exit(fails ? 1 : 0);
