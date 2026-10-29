// ---------------- 扬声器内部 · 声波冲浪 ----------------
// 进入方式：双击扬声器部件 / 信息卡按钮（main.js 通用 enterGameWorld 调 openWave）。
// 世界观：扬声管内的正弦声波世界——赛道是实时起伏的波形地形，玩家踩冲浪板
//         横移 + 起跳，收集音符、躲避静音黑洞；骑在浪尖上分数加倍，音量耗尽=哑场。
// 工程套路：独立 Scene/相机；地形=PlaneGeometry 顶点每帧按 y=f(x,z,phase) 重算，
//         世界滚动靠 phase 推进（地形不动、相位动，零浮点漂移）；实体对象池同 micro。
// 跨模块边界：自备 w$ 查询器；徽章走 CustomEvent('game-award')。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const w$ = (s) => document.querySelector(s);
export const wave = {
  on: false, run: false, over: false,
  score: 0, bonus: 0, combo: 1, vol: 3, speed: 0, dist: 0, air: 0,
  best: +(localStorage.getItem('iphoneDuo.waveBest') || 0),
  bestCombo: 0, gotN: 0, peakT: 0,
};

// —— 波形：x 横向、z 纵深；phase 随距离推进（世界不动物理相位动）——
const waveY = (x, z) => 2.6 * Math.sin(x * 0.16 + z * 0.045 - wave.phase) + 1.4 * Math.sin(x * 0.42 + z * 0.11 + 1.3);
const wCurveX = (z) => 20 * Math.sin(z * 0.006) + 9 * Math.sin(z * 0.017 + 2.1);

export let wScene = null, wCam = null, wBoard = null, wTerr = null;
let wTerrain = null, wStars = null;
const WENT = [];                                       // { type, mesh, x, z, taken }
const WPOOL = { note: [], hole: [], ring: [] };
let wpx = 0, wpvx = 0, wpy = 0, wvy = 0, wAir = false, wGenZ = -80;

function speakerTexture() {
  // 程序化振膜纹：深紫底 + 同心圆（扬声器宇宙的地板）
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#160b26'; g.fillRect(0, 0, 256, 256);
  for (let r = 8; r < 200; r += 7) {
    g.strokeStyle = `rgba(${150 + r % 60},${80 + r % 40},220,.18)`;
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 14);
  return t;
}

function buildWave() {
  if (wScene) return;
  wScene = new THREE.Scene();
  wScene.fog = new THREE.FogExp2(0x120826, 0.012);
  wCam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);

  wScene.add(new THREE.AmbientLight(0xb8a0e8, 0.6));
  const sun = new THREE.DirectionalLight(0xe8d8ff, 1.0);
  sun.position.set(20, 70, 30); wScene.add(sun);

  // 波形地形：40×160 段，每帧重算 y
  wTerr = new THREE.PlaneGeometry(96, 460, 40, 160);
  wTerr.rotateX(-Math.PI / 2);
  wTerrain = new THREE.Mesh(wTerr, new THREE.MeshStandardMaterial({ map: speakerTexture(), roughness: 0.55, metalness: 0.35, wireframe: false }));
  wScene.add(wTerrain);
  // 地形线框叠层（波形可视化更立体）
  const wf = new THREE.Mesh(wTerr, new THREE.MeshBasicMaterial({ color: 0x8a5cff, wireframe: true, transparent: true, opacity: 0.12 }));
  wf.position.y = 0.3; wScene.add(wf);

  // 音符星空
  const N = 200, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 90, 10 + Math.random() * 50, -Math.random() * 400], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  wStars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8a0ff, size: 0.8, transparent: true, opacity: 0.75, depthWrite: false }));
  wScene.add(wStars);

  // 冲浪板：压扁胶囊 + 底部光刃
  wBoard = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 5.2),
    new THREE.MeshStandardMaterial({ color: 0xf0eaff, emissive: 0x7a4fff, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }));
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 4.6),
    new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.8 }));
  fin.position.y = -0.5;
  wBoard.add(deck, fin);
  wBoard.add(new THREE.PointLight(0x9a6fff, 40, 40, 1.8));
  wScene.add(wBoard);
}

// —— 实体工厂（对象池）——
const WDEF = {
  note: () => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd8f0, emissive: 0xff64c8, emissiveIntensity: 2.2 }));
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xffd8f0, emissive: 0xff64c8, emissiveIntensity: 1.8 }));
    stem.position.set(0.8, 1.2, 0);
    g.add(ball, stem);
    return g;
  },
  hole: () => new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x0a0410, emissive: 0x300040, emissiveIntensity: 1.2, roughness: 0.9 })),
  ring: () => new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0x9fffd8, emissive: 0x20ffa0, emissiveIntensity: 2.0 })),
};
function wSpawn(type, x, z) {
  let mesh = WPOOL[type].pop();
  if (!mesh) { mesh = WDEF[type](); wScene.add(mesh); }
  mesh.visible = true;
  WENT.push({ type, mesh, x, z, taken: false });
}
function wDespawn(e) { e.mesh.visible = false; WPOOL[e.type].push(e.mesh); }
function genSeg() {
  const hard = Math.min(wave.dist / 2600, 1);
  if (Math.random() < 0.62) {                          // 音符串
    const bx = (Math.random() - 0.5) * 13, n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) wSpawn('note', bx + Math.sin(i * 1.1) * 2.2, wGenZ - i * 4);
  }
  if (Math.random() < 0.3 + hard * 0.25) wSpawn('hole', (Math.random() - 0.5) * 14, wGenZ - 10);
  if (Math.random() < 0.09) wSpawn('ring', (Math.random() - 0.5) * 12, wGenZ - 16);
  wGenZ -= 30;
}

// —— 输入：←→/AD 横移，空格/↑/W 起跳 ——
const wKeys = { l: false, r: false };
let wTouchDir = 0;
addEventListener('keydown', (e) => {
  if (!wave.on) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') wKeys.l = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') wKeys.r = true;
  if ((e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && wave.run && !wAir) { wvy = 15.5; wAir = true; sfx('tick'); }
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') wKeys.l = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') wKeys.r = false;
});
addEventListener('pointerdown', (e) => {
  if (!wave.on || !wave.run || e.pointerType !== 'touch' || e.target.closest('#wOver,#wQuit')) return;
  if (e.clientX > innerWidth / 2 && !wAir) { wvy = 15.5; wAir = true; sfx('tick'); }
  else wTouchDir = e.clientX < innerWidth / 2 ? -1 : 0;
});
addEventListener('pointerup', () => { wTouchDir = 0; });

// —— 一局生命周期 ——
const wSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openWave() {
  buildWave();
  wave.on = true;
  startWaveRun();
  dispatchEvent(new CustomEvent('game-award', { detail: 'waver' }));
}
export function startWaveRun() {
  for (const e of [...WENT]) wDespawn(e);
  WENT.length = 0; wGenZ = -80;
  Object.assign(wave, { run: false, over: false, score: 0, bonus: 0, combo: 1, vol: 3, speed: 0, dist: 0, phase: 0, air: 0, bestCombo: 0, gotN: 0, peakT: 0 });
  wpx = 0; wpvx = 0; wvy = 0; wAir = false;
  w$('#wgame').classList.add('on');
  w$('#wOver').classList.remove('on');
  wMsg('声波冲浪<small>←→ 横移 · 空格起跳 · 浪尖得分加倍</small>', 3);
  (async () => { await wSleep(2200); if (wave.on && !wave.over) { wave.run = true; wave.speed = 36; } })();
}
function endWaveRun() {
  wave.run = false; wave.over = true;
  const best = wave.score > wave.best;
  if (best) { wave.best = wave.score; localStorage.setItem('iphoneDuo.waveBest', String(wave.best)); }
  w$('#wStats').innerHTML =
    `本局分数 <b>${wave.score}</b>${best ? ' · 新纪录 ✦' : ''}<br>` +
    `收集音符 <b>${wave.gotN}</b> · 最高连击 <b>×${wave.bestCombo}</b> · 历史最佳 <b>${wave.best}</b>`;
  w$('#wgame').classList.add('over');
  w$('#wOver').classList.add('on');
  sfx('thud'); buzz(30);
  if (best) sfx('win');
  if (wave.score >= 1500) dispatchEvent(new CustomEvent('game-award', { detail: 'beat' }));
}
// 测试探针：直接触发哑场结算（走真实 endWaveRun）；注入奖励分（验证 1500 分「beat」徽章路径）
window.__waveOver = () => { wave.vol = 0; endWaveRun(); };
window.__waveBonus = (v) => { wave.bonus = v; wave.score = v; };
export function closeWaveUI() {
  wave.on = false; wave.run = false; wave.over = false;
  for (const e of [...WENT]) wDespawn(e);
  WENT.length = 0;
  w$('#wgame').classList.remove('on', 'over');
  w$('#wOver').classList.remove('on');
  w$('#wMsg').classList.remove('on');
}

// —— HUD ——
let wHudT = 0;
function wMsg(html, dur = 1.6) {
  w$('#wMsg').innerHTML = html;
  w$('#wMsg').classList.add('on');
  clearTimeout(wave.msgT);
  wave.msgT = setTimeout(() => w$('#wMsg').classList.remove('on'), dur * 1000);
}
function wUpdHUD() {
  w$('#wScore').textContent = wave.score;
  w$('#wCombo').textContent = '×' + wave.combo;
  w$('#wVol').textContent = '🔊'.repeat(wave.vol) || '🔇';
  w$('#wSpeed').textContent = Math.round(wave.speed);
  w$('#wPeak').classList.toggle('on', wave.peakT > 0);
}

// —— 每帧 ——
export function tickWave(dt) {
  if (!wave.on) return;
  wCam.aspect = innerWidth / innerHeight; wCam.updateProjectionMatrix();
  const px = wpx + wCurveX(0);                          // 世界系玩家 x

  if (wave.run) {
    wave.speed = Math.min(wave.speed + dt * 0.6, 82);
    wave.dist += wave.speed * dt;
    wave.phase += wave.speed * dt * 0.045;
    // 横移
    const acc = (wKeys.l ? -1 : 0) + (wKeys.r ? 1 : 0) + wTouchDir;
    wpvx += acc * 80 * dt;
    wpvx *= Math.pow(0.004, dt);
    wpx = THREE.MathUtils.clamp(wpx + wpvx * dt, -11, 11);
    if (Math.abs(wpx) >= 10.9 && wave.combo > 1) wave.combo = 1;
    // 跳跃物理 + 波面落地
    const gy = waveY(px, 0);
    if (wAir || wpy > gy + 0.05) {
      wvy -= 44 * dt; wpy += wvy * dt;
      if (wpy <= gy) { wpy = gy; wAir = false; wvy = 0; if (wave.run) sfx('tick'); }
    } else wpy = gy;
    // 浪尖判定（本地波高）：骑浪计时
    const localH = waveY(wpx, 0);
    if (localH > 2.8) wave.peakT = 0.35;
    else wave.peakT = Math.max(wave.peakT - dt, 0);
    // 计分：距离分（浪尖 ×2）+ 奖励分
    wave.score = Math.floor(wave.dist / 2 * (wave.peakT > 0 ? 2 : 1)) + wave.bonus;
    // 实体推进 + 碰撞
    for (const e of WENT) {
      e.z += wave.speed * dt;
      if (e.z > 26) wDespawn(e);
    }
    for (let i = WENT.length - 1; i >= 0; i--) if (!WENT[i].mesh.visible) WENT.splice(i, 1);
    while (wGenZ > -wave.speed * 3.4 - 100) genSeg();
    for (const e of WENT) {
      if (e.taken || e.z < -3 || e.z > 3) continue;
      const dx = Math.abs(px - (e.x + wCurveX(e.z)));
      const dy = Math.abs(wpy + 1 - e.mesh.position.y);
      if (e.type === 'note' && dx < 2.4 && e.z > -2.4 && dy < 3.4) {
        e.taken = true; wDespawn(e);
        wave.combo = Math.min(wave.combo + 1, 9);
        wave.bestCombo = Math.max(wave.bestCombo, wave.combo);
        wave.gotN++; wave.bonus += 12 * wave.combo;
        sfx('tick');
      } else if (e.type === 'ring' && dx < 2.6 && e.z > -2) {
        e.taken = true; wDespawn(e);
        wave.bonus += 90; wave.peakT = Math.max(wave.peakT, 1.2);
        wMsg('◈ 增益环 +90', 1); sfx('pop');
      } else if (e.type === 'hole' && dx < 3.2 && e.z > -2.6 && !wAir) {
        e.taken = true; wDespawn(e);
        wave.vol--; wave.combo = 1; wave.speed = Math.max(wave.speed * 0.6, 30);
        sfx('wrong'); buzz(24);
        if (wave.vol <= 0) { endWaveRun(); break; }
        wMsg('黑洞吞声 · 剩 ' + wave.vol + ' 格音量', 1.1);
      }
    }
    wHudT += dt;
    if (wHudT > 0.12) { wHudT = 0; wUpdHUD(); }
  }

  // —— 场景摆放（结算画面继续流动）——
  const flow = wave.run ? wave.speed * dt : 14 * dt;
  wave.phase += (wave.run ? 0 : dt * 2);               // 待机时波形仍起伏
  // 地形顶点重算（40×160 段，世界滚动 = 相位推进）
  const p = wTerr.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, waveY(p.getX(i), p.getZ(i)));
  }
  p.needsUpdate = true;
  // 星空流动
  const sp = wStars.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let z = sp.getZ(i) + flow * 1.6;
    if (z > 30) { z = -400 + Math.random() * 40; sp.setX(i, (Math.random() - 0.5) * 90); sp.setY(i, 10 + Math.random() * 50); }
    sp.setZ(i, z);
  }
  sp.needsUpdate = true;
  // 实体摆放（含弯道偏移 + 洞悬浮）
  for (const e of WENT) {
    const wx = e.x + wCurveX(e.z);
    e.mesh.position.set(wx, e.type === 'hole' ? waveY(wx, e.z) + 1.6 : waveY(wx, e.z) + 1.2, e.z);
    if (e.type === 'note') e.mesh.rotation.y += dt * 2.4;
    if (e.type === 'ring') { e.mesh.rotation.y += dt * 2; e.mesh.rotation.x = Math.PI / 2; }
  }
  // 冲浪板 + 相机
  const gy = waveY(px, 0);
  if (!wAir) wpy = gy;
  wBoard.position.set(px, wpy + 0.8, 0);
  wBoard.rotation.z = -wpvx * 0.02;
  wBoard.rotation.x = (waveY(px, -4) - gy) * 0.1;
  if (wAir) wBoard.rotation.x = -0.35;
  const spdK = (wave.speed - 36) / 46;
  wCam.fov = 62 + spdK * 14; wCam.updateProjectionMatrix();
  wCam.position.set(px * 0.85, wpy + 6.5 + spdK, 15.5 - spdK * 1.5);
  wCam.lookAt(px + wCurveX(-50) * 0.3, waveY(px, -50) + 2, -50);
}
