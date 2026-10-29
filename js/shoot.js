// ---------------- Face ID 模组 · 点阵射击 ----------------
// 进入方式：双击 Face ID / 前摄部件 / 信息卡按钮（main.js 通用 enterGameWorld 调 openShoot）。
// 世界观：深度传感器点阵空间——红外点云为地，琥珀色目标浮现，移动准星点击点亮，
//         60 秒内点亮 25 个目标 = 完成面部扫描；连击越高得分越猛，miss 清连击。
// 工程套路：独立 Scene/相机；目标=发光球+光环，命中即爆闪换位；准星用 CSS 十字
//         （HUD 层跟随 pointermove），射击走 canvas pointerdown + Raycaster 真实拾取。
// 跨模块边界：自备 s$ 查询器；徽章走 CustomEvent('game-award')。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const s$ = (s) => document.querySelector(s);
export const shoot = {
  on: false, run: false, over: false, win: false,
  score: 0, combo: 0, bestCombo: 0, hit: 0, need: 25, time: 60,
  best: +(localStorage.getItem('iphoneDuo.shootBest') || 0),
};

export let sScene = null, sCam = null;
const sTargets = [];                                   // { grp, body, alive }
let sGrid = null, sScan = null;

function buildShoot() {
  if (sScene) return;
  sScene = new THREE.Scene();
  sScene.fog = new THREE.FogExp2(0x030a06, 0.02);
  sCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);
  sCam.position.set(0, 3, 34);

  sScene.add(new THREE.AmbientLight(0x88b890, 0.5));
  const sun = new THREE.DirectionalLight(0xd8ffe0, 0.8);
  sun.position.set(20, 50, 40); sScene.add(sun);

  // 点阵地面：IR 点云网格（Face ID 的标志性视觉）
  const N = 64, pos = new Float32Array(N * N * 3);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    pos.set([(i - N / 2) * 1.6, 0, (j - N / 2) * 1.6], (i * N + j) * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sGrid = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x2fae62, size: 0.5, transparent: true, opacity: 0.75, depthWrite: false }));
  sScene.add(sGrid);

  // 顶部扫描线：缓慢平移的发光横杆
  sScan = new THREE.Mesh(new THREE.BoxGeometry(120, 0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x39d97a, transparent: true, opacity: 0.6 }));
  sScan.position.set(0, 34, -60);
  sScene.add(sScan);
}

function placeTarget(t) {
  t.grp.position.set((Math.random() - 0.5) * 56, 7 + Math.random() * 22, -18 - Math.random() * 58);
  t.grp.visible = true; t.alive = true;
}
function spawnTargets(n) {
  for (let i = sTargets.length; i < n; i++) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0xffc040, emissive: 0xff8c00, emissiveIntensity: 2.2, roughness: 0.3 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.18, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.8 }));
    grp.add(body, ring);
    grp.userData.target = true;
    sScene.add(grp);
    const t = { grp, body, ring, alive: true };
    placeTarget(t);
    sTargets.push(t);
  }
}

// —— 一局生命周期 ——
const sSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openShoot() {
  buildShoot();
  shoot.on = true;
  startShootRun();
  dispatchEvent(new CustomEvent('game-award', { detail: 'shoot' }));
}
export function startShootRun() {
  Object.assign(shoot, { run: false, over: false, win: false, score: 0, combo: 0, bestCombo: 0, hit: 0, time: 60 });
  for (const t of sTargets) placeTarget(t);
  spawnTargets(3);
  s$('#sgame').classList.add('on');
  s$('#sOver').classList.remove('on');
  sMsg('点阵射击<small>点击琥珀目标 · 60s 点亮 25 个完成面部扫描</small>', 3);
  (async () => { await sSleep(2200); if (shoot.on && !shoot.over) shoot.run = true; })();
}
function endShootRun(win) {
  shoot.run = false; shoot.over = true; shoot.win = win;
  const best = shoot.score > shoot.best;
  if (best) { shoot.best = shoot.score; localStorage.setItem('iphoneDuo.shootBest', String(shoot.best)); }
  s$('#sOverTitle').textContent = win ? '✦ 面部扫描完成' : '⏱ 扫描超时';
  s$('#sStats').innerHTML =
    `本局分数 <b>${shoot.score}</b>${best ? ' · 新纪录 ✦' : ''}<br>` +
    `点亮目标 <b>${shoot.hit}/${shoot.need}</b> · 最高连击 <b>×${shoot.bestCombo}</b> · 历史最佳 <b>${shoot.best}</b>`;
  s$('#sgame').classList.add('over');
  s$('#sOver').classList.add('on');
  sfx(win ? 'win' : 'thud');
  if (win) dispatchEvent(new CustomEvent('game-award', { detail: 'scan' }));
}
// 测试探针：直接触发结算（e2e 验证胜利徽章路径，走真实 endShootRun）
window.__shootEnd = (win) => endShootRun(!!win);
window.__shootTargets = () => sTargets.filter((t) => t.alive).map((t) => {
  const v = t.grp.position.clone().project(sCam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
});
export function closeShootUI() {
  shoot.on = false; shoot.run = false; shoot.over = false;
  s$('#sgame').classList.remove('on', 'over');
  s$('#sOver').classList.remove('on');
  s$('#sMsg').classList.remove('on');
}

// —— 准星跟随 + 射击 ——
const sRay = new THREE.Raycaster();
addEventListener('pointermove', (e) => {
  if (!shoot.on) return;
  const c = s$('#sCross');
  c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
}, { passive: true });
addEventListener('pointerdown', (e) => {
  if (!shoot.on || !shoot.run || shoot.over) return;
  if (e.target.closest('#sOver,#sQuit')) return;
  sRay.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), sCam);
  const hit = sRay.intersectObjects(sTargets.map((t) => t.body))[0];
  if (hit) {
    const t = sTargets.find((q) => q.body === hit.object);
    if (t && t.alive) {
      t.alive = false; t.grp.visible = false;
      shoot.hit++; shoot.combo++;
      shoot.bestCombo = Math.max(shoot.bestCombo, shoot.combo);
      shoot.score += 100 + (shoot.combo - 1) * 20;
      placeTarget(t); t.alive = true;                 // 立即换位重生
      sfx('right'); buzz(6);
      if (shoot.hit >= shoot.need) endShootRun(true);
      else if (shoot.hit % 5 === 0) sMsg(`扫描 ${Math.round(shoot.hit / shoot.need * 100)}% · ×${shoot.combo} 连击`, 1);
    }
  } else {
    if (shoot.combo > 2) sMsg('miss · 连击中断', 0.8);
    shoot.combo = 0;
    sfx('tick');
  }
});

// —— HUD ——
let sHudT = 0;
function sMsg(html, dur = 1.6) {
  s$('#sMsg').innerHTML = html;
  s$('#sMsg').classList.add('on');
  clearTimeout(shoot.msgT);
  shoot.msgT = setTimeout(() => s$('#sMsg').classList.remove('on'), dur * 1000);
}
function sUpdHUD() {
  s$('#sProgress').textContent = `${shoot.hit}/${shoot.need}`;
  s$('#sBar').style.width = `${Math.min(shoot.hit / shoot.need * 100, 100)}%`;
  s$('#sCombo').textContent = '×' + shoot.combo;
  s$('#sTime').textContent = Math.ceil(shoot.time);
  s$('#sScore').textContent = shoot.score;
}

// —— 每帧 ——
export function tickShoot(dt) {
  if (!shoot.on) return;
  sCam.aspect = innerWidth / innerHeight; sCam.updateProjectionMatrix();
  if (shoot.run) {
    shoot.time -= dt;
    if (shoot.time <= 0) { shoot.time = 0; endShootRun(shoot.hit >= shoot.need); }
  }
  // 目标漂浮 + 光环旋转
  const now = performance.now() / 1000;
  for (const t of sTargets) {
    t.grp.position.y += Math.sin(now * 2 + t.grp.position.x) * 0.02;
    t.ring.rotation.y += dt * 1.6;
    t.ring.rotation.x = Math.PI / 2 + Math.sin(now + t.grp.position.z) * 0.4;
  }
  // 扫描线往返 + 点阵呼吸
  sScan.position.x = Math.sin(now * 0.4) * 50;
  sGrid.material.opacity = 0.6 + Math.sin(now * 2.4) * 0.15;

  sHudT += dt;
  if (sHudT > 0.12) { sHudT = 0; sUpdHUD(); }
}
