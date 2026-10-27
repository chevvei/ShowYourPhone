// 标注开关验证：L 键切换 + localStorage 持久化 + 刷新恢复
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 },
});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:8124/iphoneDuo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  // 初始：active
  let st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[init] active=${st.a} ls="${st.ls}" ${st.a ? 'OK' : 'FAIL'}`);
  // 按 L 隐藏
  await page.keyboard.press('l');
  await new Promise((r) => setTimeout(r, 300));
  st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[L键隐藏] active=${st.a} ls="${st.ls}" ${!st.a && st.ls === '0' ? 'OK' : 'FAIL'}`);
  // 刷新恢复
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loader.done'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  st = await page.evaluate(() => ({ a: document.querySelector('#btnLabels').classList.contains('active'), ls: localStorage.getItem('iphoneDuo.labels') }));
  console.log(`[刷新恢复] active=${st.a} ls="${st.ls}" ${!st.a ? 'OK' : 'FAIL'}`);
  // 再按 L 恢复显示
  await page.keyboard.press('L');
  await new Promise((r) => setTimeout(r, 300));
  st = await page.evaluate(() => document.querySelector('#btnLabels').classList.contains('active'));
  console.log(`[L键恢复] active=${st} ${st ? 'OK' : 'FAIL'}`);
} finally { await browser.close(); }
