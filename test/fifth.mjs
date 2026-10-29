// 第五波 端到端验证：图鉴徽章 · 每日挑战 · 换色 DIY · 开机序列 · 分享卡片
// 覆盖：开机即得「初来乍到」· 探索行为解锁徽章（X光/蓝图/剖面/沉浸）
//      徽章墙渲染与计数 · 换色实时生效+本机记忆+恢复原色 · 切设备随存随取
//      每日挑战 5 题流程（答对打卡 / 答错重试）· 开机序列 overlay 全程
//      分享卡片下载触发 · localStorage 各键独立
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

let fails = 0, n = 0, lastT = Date.now();
const ok = (name, cond, extra = '') => {
  const dt = ((Date.now() - lastT) / 1000).toFixed(1); lastT = Date.now();
  console.log(`  ${++n}. ${name} ${cond ? 'OK' : 'FAIL'} [+${dt}s]${extra ? ' ' + extra : ''}`);
  if (!cond) fails++;
};

try {
  const ctx = await browser.createBrowserContext({ acceptDownloads: true });
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

  // ① 开机即得「初来乍到」
  let f = await fun(page);
  ok('开机解锁「初来乍到」', f.fifth.badgeIds.includes('first'), JSON.stringify(f.fifth.badgeIds));
  ok('徽章计数 1/12', f.fifth.badgeN === 1, `n=${f.fifth.badgeN}`);

  // ② 探索行为解锁：X 光 / 蓝图 / 剖面 / 沉浸
  await page.click('#btnXray');
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('xray'));
  ok('X 光解锁「X 光医师」', !!f);
  await page.keyboard.press('x');
  await page.click('#btnBlue');
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('blue'));
  ok('蓝图解锁「蓝图工程师」', !!f);
  await page.keyboard.press('b');
  await page.click('#btnCut');
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('cut'));
  ok('剖面解锁「解剖学家」', !!f);
  await page.click('#btnCut');
  await page.keyboard.press('i');
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('zen'));
  ok('沉浸解锁「冥想者」', !!f);
  await page.keyboard.press('Escape');
  f = await until(page, async () => (await fun(page)).zen === false);

  // ③ 徽章墙：面板打开 · 计数 · 网格 22 项（14+部件小游戏 8 枚）· 已解锁高亮
  await page.click('#btnBadges');
  f = await until(page, async () => (await fun(page)).fifth.badgeN >= 5);
  ok('徽章面板打开', await page.evaluate(() => document.querySelector('#badges').classList.contains('on')));
  ok('徽章计数文案 5/22', await page.evaluate(() => document.querySelector('#badgeCount').textContent === '5/22'));
  ok('徽章网格 22 项', await page.evaluate(() => document.querySelectorAll('#badgeGrid .bd').length === 22));
  ok('已解锁徽章高亮 5 个', await page.evaluate(() => document.querySelectorAll('#badgeGrid .bd.got').length === 5));
  await page.click('#badgesClose');
  ok('Esc/关闭按钮收起徽章面板', await page.evaluate(() => !document.querySelector('#badges').classList.contains('on')));

  // ④ 换色 DIY：上色实时生效 + 按设备持久化
  await page.click('#btnTint');
  ok('换色面板打开', await page.evaluate(() => document.querySelector('#tint').classList.contains('on')));
  ok('色板 8 色', await page.evaluate(() => document.querySelectorAll('#tintSwatches button').length === 8));
  const hex0 = (await fun(page)).fifth.tintHex;
  await page.click('#tintSwatches button[data-tint="gold"]');
  f = await until(page, async () => (await fun(page)).fifth.tint === 'gold');
  ok('上色沙漠金 tint=gold', !!f);
  f = await fun(page);
  ok('机身颜色实时变 #c9a86a', f.fifth.tintHex === '#c9a86a', `hex=${f.fifth.tintHex} (原 ${hex0})`);
  ok('色板选中态跟随', await page.evaluate(() => document.querySelector('#tintSwatches button[data-tint="gold"]').classList.contains('active')));
  ok('本机记忆已写入', await page.evaluate(() => localStorage.getItem('iphoneDuo.tint.p18') === 'gold'));

  // ⑤ 刷新页面：换色随设备恢复
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  f = await until(page, async () => { const s = await fun(page); return s.fifth.tint === 'gold' ? s : null; });
  ok('刷新后换色恢复 gold', !!f, JSON.stringify(f?.fifth));
  ok('徽章持久化（first+5 探索）', f.fifth.badgeN === 5, `n=${f.fifth.badgeN}`);

  // ⑥ 恢复原色：零残留
  await page.click('#btnTint');
  await page.click('#tintReset');
  f = await until(page, async () => (await fun(page)).fifth.tint === null);
  ok('恢复原色 tint=null', !!f);
  f = await fun(page);
  ok('机身颜色还原', f.fifth.tintHex === hex0, `hex=${f.fifth.tintHex} vs ${hex0}`);
  ok('记忆键已清除', await page.evaluate(() => localStorage.getItem('iphoneDuo.tint.p18') === null));
  await page.click('#tintClose');

  // ⑦ 每日挑战：打开 → 5 题 → 全对打卡
  await page.click('#btnDaily');
  f = await until(page, async () => {
    const s = (await fun(page)).fifth;
    return s.dailyOn && s.dailyTotal === 5 ? s : null;
  });
  ok('每日面板打开 5 题', !!f, JSON.stringify(f));
  // 作答推进：点击放在 until 轮询里，撞上 650ms 防抖窗口会自动重试（自愈）
  for (let i = 0; i < 5; i++) {
    const okI = await until(page, async () => {
      const s = (await fun(page)).fifth;
      if (s.dailyIdx === i && s.dailyAns) {
        await page.evaluate((a) => document.querySelector(`#dailyBody .opts button[data-id="${a}"]`)?.click(), s.dailyAns);
        await sleep(150);
      }
      return s.dailyIdx >= i + 1;
    }, 20000, 400);
    ok(`每日第 ${i + 1} 题答对推进`, !!okI);
  }
  f = await until(page, async () => (await fun(page)).fifth.dailyDone);
  ok('答对 5 题打卡成功', !!f);
  ok('解锁「每日打卡」徽章', (await fun(page)).fifth.badgeIds.includes('daily1'));
  ok('连续天数 1', (await fun(page)).fifth.dailyStreak === 1);
  ok('结算文案出现', await page.evaluate(() => document.querySelector('#dailyBody').textContent.includes('打卡成功')));

  // ⑧ 今日已打卡：重开面板显示完成态（不重复发题）
  await page.click('#dailyClose');
  await page.click('#btnDaily');
  f = await until(page, async () => (await fun(page)).fifth.dailyOn);
  ok('重开面板显示今日完成', await page.evaluate(() => document.querySelector('#dailyBody').textContent.includes('今日挑战完成')));
  await page.click('#dailyClose');

  // ⑨ 开机序列：黑幕 → Logo 亮起 → 退场 → 徽章
  await page.click('#btnPower');
  f = await until(page, async () => (await fun(page)).fifth.powerOn === true, 6000);
  ok('开机序列启动 powerOn=true', !!f);
  ok('黑幕 overlay 挂载', await page.evaluate(() => document.querySelector('#powerOverlay').classList.contains('on')));
  // 采样断言走 page.evaluate（浏览器上下文）——until 回调在 Node 侧，不能直接引用 document
  f = await until(page, async () => page.evaluate(() => document.querySelector('#powerOverlay').classList.contains('lit')), 15000);
  ok('Logo 亮起（1.4s 后）', !!f);
  ok('Logo 文本为设备名', await page.evaluate(() => document.querySelector('#powerLogo').textContent === 'IPHONE 18 PRO'));
  f = await until(page, async () => page.evaluate(() => !document.querySelector('#powerOverlay').classList.contains('on')), 20000);
  ok('黑幕退场（序列结束）', !!f);
  f = await until(page, async () => (await fun(page)).fifth.powerOn === false);
  ok('序列状态复位', !!f);
  ok('解锁「见证开机」徽章', (await fun(page)).fifth.badgeIds.includes('power'));

  // ⑩ 分享卡片：桩掉 <a>.click 捕获导出（文件名 + blob 链接），再断言徽章
  await page.evaluate(() => {
    window.__card = null;
    HTMLAnchorElement.prototype.click = function () {
      window.__card = { name: this.download, blob: this.href.startsWith('blob:') };
    };
  });
  await page.click('#btnCard');
  const card = await until(page, async () => (await page.evaluate(() => window.__card)));
  ok('分享卡片导出触发（blob 链接）', !!card && card.blob === true, JSON.stringify(card));
  ok('文件名含设备名+卡片', !!card && /分享卡片/.test(card.name || ''), card?.name);
  f = await until(page, async () => (await fun(page)).fifth.badgeIds.includes('share'));
  ok('解锁「分享家」徽章', !!f);

  // ⑪ 答错路径：独立 browser context（localStorage 隔离，打卡状态不泄漏）
  const ctx3 = await browser.createBrowserContext();
  const page3 = await ctx3.newPage();
  page3.on('pageerror', (e) => errs.push('page3: ' + e.message));
  await page3.goto(`${BASE}?dev=p18`, { waitUntil: 'domcontentloaded' });
  await page3.evaluate(() => {
    localStorage.setItem('iphoneDuo.seen', '1');
    localStorage.setItem('iphoneDuo.labels', '0');
  });
  await page3.reload({ waitUntil: 'domcontentloaded' });
  await page3.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 60000 });
  await sleep(2000);
  await page3.click('#btnDaily');
  await page3.waitForFunction(() => (window.__fun().fifth.dailyOn && window.__fun().fifth.dailyTotal === 5), { timeout: 20000 });
  for (let i = 0; i < 5; i++) {
    const okI = await until(page3, async () => {
      const s = (await fun(page3)).fifth;
      if (s.dailyIdx === i && s.dailyAns) {
        await page3.evaluate((a) => {
          const btn = [...document.querySelectorAll('#dailyBody .opts button')].find((b) => b.dataset.id !== a);
          btn?.click();
        }, s.dailyAns);
        await sleep(150);
      }
      return s.dailyIdx >= i + 1;
    }, 20000, 400);
    if (!okI) ok(`每日第 ${i + 1} 题答错推进`, false);
  }
  ok('全答错 → 显示重试引导', await page3.evaluate(() => document.querySelector('#dailyBody').textContent.includes('再试一次')));
  ok('未打卡', (await fun(page3)).fifth.dailyDone === false);
  await page3.evaluate(() => document.querySelector('#dailyRetry').click());
  const retried = await until(page3, async () => {
    const s = (await fun(page3)).fifth;
    return s.dailyIdx === 0 && s.dailyRight === 0 && s.dailyTotal === 5 ? s : null;
  });
  ok('重试一次重新发题', !!retried);
  await page3.close();
  await ctx3.close();

  // ⑫ 切设备：换色互不干扰（各自记忆）
  await page.click('#btnTint');
  await page.click('#tintSwatches button[data-tint="purple"]');
  f = await until(page, async () => {
    const s = await fun(page);
    return s.fifth.tint === 'purple' ? s : null;
  });
  ok('p18 先上暮山紫', !!f);
  await page.click('[data-dev="p18s"]');
  f = await until(page, async () => {
    const s = await fun(page);
    return s.fifth.dev === 'p18s' && s.fifth.tint === null ? s : null;
  });
  ok('切 p18s 换色不跟随（各自记忆）', f?.fifth.tint === null, JSON.stringify(f?.fifth));
  await page.click('#btnTint');
  await page.click('#tintSwatches button[data-tint="blue"]');
  f = await until(page, async () => (await fun(page)).fifth.tint === 'blue');
  ok('p18s 独立上深空蓝', !!f);
  await page.click('[data-dev="p18"]');
  f = await until(page, async () => {
    const s = await fun(page);
    return s.fifth.dev === 'p18' && s.fifth.tint === 'purple' ? s : null;
  });
  ok('切回 p18 恢复暮山紫', f?.fifth.tint === 'purple');

  ok('无页面 JS 错误', errs.length === 0, errs.join(' | '));
} catch (e) {
  console.error('FATAL', e);
  fails++;
} finally {
  await browser.close();
}
console.log(`\nfifth.mjs: ${n - fails}/${n} 通过`);
process.exit(fails ? 1 : 0);
