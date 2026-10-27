// 标注开关验证：L 键切换 + localStorage 持久化 + 刷新恢复 + 聚焦时只留选中标注
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:8124/iphoneDuo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 30000 });
  await sleep(2500);
  await page.keyboard.press('Escape');
  await sleep(500);
  // 初始：active
  let st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[init] active=${st.a} ls="${st.ls}" ${st.a ? 'OK' : 'FAIL'}`);
  // 按 L 隐藏
  await page.keyboard.press('l');
  await sleep(300);
  st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[L键隐藏] active=${st.a} ls="${st.ls}" ${!st.a && st.ls === '0' ? 'OK' : 'FAIL'}`);
  // 刷新恢复
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 30000 });
  await sleep(2500);
  await page.keyboard.press('Escape');
  await sleep(500);
  st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[刷新恢复] active=${st.a} ls="${st.ls}" ${!st.a ? 'OK' : 'FAIL'}`);
  // 再按 L 恢复显示
  await page.keyboard.press('L');
  await sleep(300);
  st = await page.evaluate(() => document.querySelector('#btnLabels').classList.contains('active'));
  console.log(`[L键恢复] active=${st} ${st ? 'OK' : 'FAIL'}`);

  // ---- 聚焦时只留选中标注：展开 → 爆炸 → 选中主板 → 断言只剩 1 个 → Esc 恢复多个 ----
  await page.keyboard.press('f');   // 先展开（Esc 退出开场后 fold=PI 合上态，标注不显示）
  await sleep(3200);
  await page.keyboard.press('e');   // 爆炸（动画 ~8s，滑块渐进更新）
  await page.waitForFunction(() => parseInt(document.querySelector('#explode').value) > 80, { timeout: 20000 });
  await sleep(1200);
  let n = await page.evaluate(() => document.querySelectorAll('#labels .label.on').length);
  console.log(`[爆炸态] 标注数=${n} ${n > 5 ? 'OK' : 'FAIL(爆炸后应有多条)'}`);
  await page.screenshot({ path: '/tmp/label_explode.png' });
  await page.evaluate(() => { const i = [...document.querySelectorAll('#partsList .item')].find((n2) => n2.textContent.includes('主板')); i && i.click(); });
  await sleep(2000);
  n = await page.evaluate(() => document.querySelectorAll('#labels .label.on').length);
  const hot = await page.evaluate(() => document.querySelectorAll('#labels .label.on.hot').length);
  console.log(`[聚焦主板] 标注数=${n} hot=${hot} ${n === 1 && hot === 1 ? 'OK' : 'FAIL(应只剩选中那一条)'}`);
  await page.screenshot({ path: '/tmp/label_focus.png' });
  await page.keyboard.press('Escape');
  await sleep(1500);
  n = await page.evaluate(() => document.querySelectorAll('#labels .label.on').length);
  console.log(`[Esc取消] 标注数=${n} ${n > 5 ? 'OK' : 'FAIL'}`);
} finally { await browser.close(); }
