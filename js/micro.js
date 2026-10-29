// ---------------- 芯片微观世界 · 电流竞速 ----------------
// 进入方式：双击主板部件 / 主板信息卡「深入芯片」按钮（main.js 触发相机动画后调 openMicro）。
// 世界观：A20 芯片内部——阻焊层大地、金属层峡谷、走线即赛道；玩家是一道电流，
//         收集电子、躲避电阻墙与电容塔，3 点电荷耗尽则信号中断。
// 工程套路：独立 Scene + 独立相机（主循环里切换 RenderPass），bloom 调强复用；
//         玩家不动世界动（物体 z += v·dt），地面/峡谷壁用纹理滚动 + 分段贴弯，
//         浮点零漂移；实体全部对象池复用，全程 draw call < 80。
// 跨模块边界：自备 m$ 查询器（避免与 main.js 的 $ 在合并产物里重声明），
//         徽章解锁走 CustomEvent（microover）由 main.js 接收——单向解耦，dev/build 同构。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const m$ = (s) => document.querySelector(s);
export const micro = {
  on: false, run: false, over: false,
  score: 0, bonus: 0, combo: 1, lives: 3, speed: 0, dist: 0,
  best: +(localStorage.getItem('iphoneDuo.microBest') || 0),
  bestCombo: 0, gotE: 0, inv: 0, msgT: 0,
};

// —— 赛道蛇形：世界 z 处的横向偏移（叠加正弦，弯而不急）——
const curveX = (z) => 24 * Math.sin(z * 0.0075) + 11 * Math.sin(z * 0.019 + 1.7);

// —— 场景（首次进入时构建一次）——
export let mScene = null, mCam = null, mPlayer = null, mGlow = null, mGround = null, groundMat = null;
let walls = [], stars = null, starPos = null;
const ENT = [];          // 活动实体池 { type, mesh, x, z, w, taken }
const POOL = { wall: [], cap: [], e: [], orb: [], ring: [] };

function pcbTexture() {
  // 程序化 PCB 阻焊层：深绿底 + 金色走线 + 过孔阵列（微观世界的“大地”）
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#04331f'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(214,178,90,.5)';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 2 + Math.random() * 5; g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (Math.random() < 0.5) x = Math.random() * 512; else y = Math.random() * 512;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(230,200,120,.75)';
  for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 2.2, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 12);
  t.anisotropy = 4;
  return t;
}

function buildMicro() {
  if (mScene) return;
  mScene = new THREE.Scene();
  mScene.fog = new THREE.FogExp2(0x02131f, 0.011);
  mCam = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 600);

  mScene.add(new THREE.AmbientLight(0x8fb8d8, 0.65));
  const sun = new THREE.DirectionalLight(0xcfe8ff, 1.1);
  sun.position.set(30, 80, 20);
  mScene.add(sun);

  // 大地：PCB 纹理滚动平面（不真实移动，规避浮点漂移）
  groundMat = new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: 0.85, metalness: 0.2 });
  mGround = new THREE.Mesh(new THREE.PlaneGeometry(90, 520), groundMat);
  mGround.rotation.x = -Math.PI / 2;
  mScene.add(mGround);

  // 峡谷壁：芯片金属层切块，分 12 段各自贴弯
  const wallGeo = new THREE.BoxGeometry(6, 26, 44);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.4, metalness: 0.85, emissive: 0x0a1622, emissiveIntensity: 0.6 });
  for (let i = 0; i < 12; i++) {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.userData = { side, idx: i };
      walls.push(w); mScene.add(w);
    }
  }

  // 顶部“晶格星空”：青色粒子随速度流动（速度感的核心来源）
  const N = 260;
  starPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 90;
    starPos[i * 3 + 1] = 8 + Math.random() * 55;
    starPos[i * 3 + 2] = -Math.random() * 420;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x6fd8ff, size: 0.9, transparent: true, opacity: 0.8, depthWrite: false }));
  mScene.add(stars);

  // 玩家：电流核心（发光球 + 外圈电晕）
  mPlayer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.05, 2),
    new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x40c8ff, emissiveIntensity: 2.6, roughness: 0.3 }),
  );
  mGlow = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 1),
    new THREE.MeshBasicMaterial({ color: 0x2b6fff, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  mPlayer.add(mGlow);
  mScene.add(mPlayer);

  // 玩家点光：照亮周围赛道
  const pl = new THREE.PointLight(0x5fd0ff, 60, 60, 1.8);
  mPlayer.add(pl);
}

// —— 实体工厂（对象池）——
const ENT_DEF = {
  wall: () => new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x5a2020, emissive: 0xff3030, emissiveIntensity: 0.9, roughness: 0.5 })),
  cap: () => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 18),
      new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.35, metalness: 0.7 }));
    body.position.y = 2.5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 18),
      new THREE.MeshStandardMaterial({ color: 0x9fb8d0, metalness: 0.9, roughness: 0.25 }));
    top.position.y = 5.2;
    grp.add(body, top);
    return grp;
  },
  e: () => new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb820, emissiveIntensity: 2.4 })),
  orb: () => new THREE.Mesh(new THREE.OctahedronGeometry(1.15),
    new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2b9fff, emissiveIntensity: 2.8 })),
  ring: () => new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.32, 10, 28),
    new THREE.MeshStandardMaterial({ color: 0x66ffc8, emissive: 0x18ffa0, emissiveIntensity: 2.2 })),
};
function spawn(type, x, z) {
  const mesh = POOL[type].pop() || ENT_DEF[type]();
  mesh.visible = true;
  mScene.add(mesh);
  const ent = { type, mesh, x, z, w: type === 'wall' ? 1.9 : type === 'cap' ? 2.4 : 0, taken: false };
  ENT.push(ent);
  return ent;
}
function despawn(ent) {
  ent.mesh.visible = false;
  mScene.remove(ent.mesh);
  POOL[ent.type].push(ent.mesh);
}

// —— 路段生成：每 34 单位一个“事件段”，密度随速度渐涨 ——
let genZ = -60;
function genSegment() {
  const hard = Math.min((micro.speed - 34) / 40, 1);      // 0→1 难度系数
  const r = Math.random();
  if (r < 0.42) {
    // 电阻墙：整排留 1~2 个缺口（缺口随难度收窄）
    const gap = Math.random() < 0.5 + hard * 0.3 ? 1 : 2;
    const lanes = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
    const skip = new Set();
    while (skip.size < gap) skip.add(lanes[(Math.random() * lanes.length) | 0]);
    for (const lx of lanes) if (!skip.has(lx)) spawn('wall', lx, genZ);
  } else if (r < 0.62) {
    // 电容塔：1~2 座
    const n = 1 + (Math.random() < hard ? 1 : 0);
    for (let i = 0; i < n; i++) spawn('cap', (Math.random() - 0.5) * 15, genZ - i * 10);
  }
  // 电子串：60% 概率跟随一道弧线（沿弯道切向排布更自然）
  if (Math.random() < 0.6) {
    const bx = (Math.random() - 0.5) * 13, n = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) spawn('e', bx + Math.sin(i * 0.9) * 2.4, genZ - 6 - i * 3.4);
  }
  if (Math.random() < 0.085) spawn('orb', (Math.random() - 0.5) * 12, genZ - 14);      // 电荷包（+1 命）
  if (Math.random() < 0.1) spawn('ring', (Math.random() - 0.5) * 10, genZ - 20);       // 涡流环（+80）
  genZ -= 34;
}

// —— 输入：←→/AD 横移（速度+阻尼模型），触屏左右半屏 ——
const keys = { l: false, r: false };
let pvx = 0;
addEventListener('keydown', (e) => {
  if (!micro.on) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.l = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.r = true;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.l = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.r = false;
});
let touchDir = 0;
addEventListener('pointerdown', (e) => {
  if (!micro.on || !micro.run || e.pointerType !== 'touch' || e.target.closest('#gOver,#gQuit')) return;
  touchDir = e.clientX < innerWidth / 2 ? -1 : 1;
});
addEventListener('pointerup', () => { touchDir = 0; });

// —— HUD ——
let hudT = 0;
function updHUD() {
  m$('#gScore').textContent = micro.score;
  m$('#gCombo').textContent = '×' + micro.combo;
  m$('#gLives').textContent = '⚡'.repeat(micro.lives) || '—';
  m$('#gSpeed').textContent = Math.round(micro.speed);
}
function gMsg(html, dur = 1.6) {
  m$('#gMsg').innerHTML = html;
  m$('#gMsg').classList.add('on');
  clearTimeout(micro.msgT);
  micro.msgT = setTimeout(() => m$('#gMsg').classList.remove('on'), dur * 1000);
}

// —— 一局生命周期 ——
const mSleep = (ms) => new Promise((r) => setTimeout(r, ms));
function clearEntities() {
  for (const ent of [...ENT]) despawn(ent);
  ENT.length = 0;
  genZ = -60;
}
export async function startMicroRun() {
  clearEntities();
  micro.run = false; micro.over = false;
  micro.score = 0; micro.bonus = 0; micro.combo = 1; micro.lives = 3; micro.dist = 0;
  micro.speed = 34; micro.inv = 0; micro.bestCombo = 0; micro.gotE = 0;
  px = 0; pvx = 0;
  m$('#game').classList.remove('over');
  m$('#gOver').classList.remove('on');
  updHUD();
  gMsg('3', 0.8); sfx('tick'); await mSleep(700);
  gMsg('2', 0.8); sfx('tick'); await mSleep(700);
  gMsg('1', 0.8); sfx('tick'); await mSleep(700);
  gMsg('⚡ GO', 0.9); sfx('boot');
  micro.run = true;
}
function endMicroRun() {
  micro.run = false; micro.over = true;
  sfx('thud'); buzz(30);
  const best = micro.score > micro.best;
  if (best) { micro.best = micro.score; localStorage.setItem('iphoneDuo.microBest', String(micro.best)); }
  m$('#gStats').innerHTML =
    `本局分数 <b>${micro.score}</b>${best ? ' · 新纪录 ✦' : ''}<br>` +
    `历史最佳 <b>${micro.best}</b> · 收集电子 <b>${micro.gotE}</b> · 最高连击 <b>×${micro.bestCombo}</b>`;
  m$('#game').classList.add('over');
  m$('#gOver').classList.add('on');
  if (best) sfx('win');
  if (micro.score >= 2000) dispatchEvent(new CustomEvent('micro-award', { detail: 'racer' }));
}
// 测试探针（与 main.js 的 window.__fun 同族）：e2e 直接触发结算画面，验证死亡→重开循环
window.__microOver = () => { micro.lives = 0; endMicroRun(); };

// —— 开放接口：main.js 在相机动画/白闪完成后调用 ——
export function openMicro() {
  buildMicro();
  micro.on = true;
  mCam.aspect = innerWidth / innerHeight; mCam.updateProjectionMatrix();
  m$('#game').classList.add('on');
  dispatchEvent(new CustomEvent('micro-award', { detail: 'micro' }));
  gMsg('你已进入 A20 PRO<small>硅基世界 · 电流竞速</small>', 2.4);
  setTimeout(() => startMicroRun(), 2400);
}
export function closeMicroUI() {
  micro.on = false; micro.run = false; micro.over = false;
  clearEntities();
  m$('#game').classList.remove('on', 'over');
  m$('#gOver').classList.remove('on');
  m$('#gMsg').classList.remove('on');
}

// —— 每帧（主循环 micro.on 时调用；dt 秒）——
let px = 0;
export function tickMicro(dt) {
  if (!micro.on) return;
  mCam.aspect = innerWidth / innerHeight; mCam.updateProjectionMatrix();

  if (micro.run) {
    // 速度爬升 + 距离累计
    micro.speed = Math.min(micro.speed + dt * 0.55, 78);
    micro.dist += micro.speed * dt;
    micro.score = Math.floor(micro.dist / 2) + micro.bonus;            // 距离分 + 收集奖励分分开记账
    if (micro.inv > 0) micro.inv -= dt;

    // 横移：加速度 + 阻尼（顺滑手感），边界橡皮墙
    const acc = (keys.l ? -1 : 0) + (keys.r ? 1 : 0) + touchDir;
    pvx += acc * 88 * dt;
    pvx *= Math.pow(0.0018, dt);                                     // 强阻尼
    px = THREE.MathUtils.clamp(px + pvx * dt, -10.6, 10.6);
    if (Math.abs(px) >= 10.5) { pvx = 0; micro.speed *= Math.pow(0.55, dt); if (micro.combo > 1) micro.combo = 1; }

    // 世界流动：物体向玩家推进，身后的回收、前方的补段
    for (const ent of ENT) {
      ent.z += micro.speed * dt;
      if (ent.z > 26) despawn(ent);
    }
    for (let i = ENT.length - 1; i >= 0; i--) if (!ENT[i].mesh.visible) ENT.splice(i, 1);
    while (genZ > -micro.speed * 3.2 - 90) genSegment();

    // 碰撞（赛道本地系 AABB / 半径）
    for (const ent of ENT) {
      if (ent.taken || ent.z < -2.4 || ent.z > 2.6) continue;
      const dx = Math.abs(px - ent.x);
      if (ent.type === 'e') {
        if (dx < 2.3 && ent.z > -1.9) {
          ent.taken = true; despawn(ent);
          micro.combo = Math.min(micro.combo + 1, 9);
          micro.bestCombo = Math.max(micro.bestCombo, micro.combo);
          micro.gotE++;
          micro.bonus += 10 * micro.combo;
          sfx('tick');
        }
      } else if (ent.type === 'orb') {
        if (dx < 2.5 && ent.z > -2) {
          ent.taken = true; despawn(ent);
          if (micro.lives < 3) { micro.lives++; gMsg('＋1 ⚡ 电荷', 1.1); } else { micro.bonus += 120; gMsg('满电荷 · +120', 1.1); }
          sfx('right');
        }
      } else if (ent.type === 'ring') {
        if (dx < 2.6 && ent.z > -2) {
          ent.taken = true; despawn(ent);
          micro.bonus += 80; micro.inv = Math.max(micro.inv, 2);
          gMsg('◈ 涡流 +80 · 短暂免疫', 1.2); sfx('pop');
        }
      } else if (micro.inv <= 0 && dx < ent.w + 1.0) {                // wall / cap：撞击
        micro.lives--; micro.combo = 1; micro.inv = 1.6;
        micro.speed = Math.max(micro.speed * 0.62, 30);
        sfx('wrong'); buzz(24);
        if (micro.lives <= 0) { endMicroRun(); break; }
        gMsg('💥 撞击 · 剩 ' + micro.lives + ' ⚡', 1.1);
      }
    }

    // HUD 节流刷新
    hudT += dt;
    if (hudT > 0.12) { hudT = 0; updHUD(); }
  }

  // —— 场景摆放（run 与否都摆，结算画面继续流动更带感）——
  const flow = micro.run ? micro.speed * dt : 12 * dt;
  // 地面纹理滚动（前进感）
  groundMat.map.offset.y -= flow / 43;
  // 星空向后流动
  const sp = stars.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let z = sp.getZ(i) + flow * 1.8;
    if (z > 30) { z = -420 + Math.random() * 40; sp.setX(i, (Math.random() - 0.5) * 90); sp.setY(i, 8 + Math.random() * 55); }
    sp.setZ(i, z);
  }
  sp.needsUpdate = true;
  // 峡谷壁分段贴弯（壁不动，物体动——壁是“die 金属层”，恒定参照系）
  for (const w of walls) {
    const zc = -((w.userData.idx + 0.5) * 44) + (flow * 0);           // 壁恒定，仅按弯道摆位
    w.position.set((w.userData.side > 0 ? 15.5 : -15.5) + curveX(zc), 12, zc);
  }
  // 实体：世界 x = 本地 x + curveX(世界 z)
  for (const ent of ENT) {
    ent.mesh.position.set(ent.x + curveX(ent.z), ent.type === 'cap' ? 0 : ent.type === 'wall' ? 1.6 : 1.4, ent.z);
    if (ent.type === 'ring') { ent.mesh.rotation.y += dt * 2.2; ent.mesh.rotation.x = Math.PI / 2; }
    if (ent.type === 'orb') ent.mesh.rotation.y += dt * 3;
  }
  // 玩家 + 相机（跟随弯道，速度拉 FOV）
  mPlayer.position.set(px + curveX(0), 1.45, 0);
  mPlayer.rotation.y += dt * 2;
  mPlayer.visible = !(micro.inv > 0 && ((micro.inv * 8) | 0) % 2 === 0);
  const spdK = (micro.speed - 34) / 44;
  mCam.fov = 64 + spdK * 16; mCam.updateProjectionMatrix();
  const ahead = curveX(-52);
  mCam.position.set(px + curveX(0) * 0.7, 7.4 + spdK * 1.2, 15.5 - spdK * 1.5);
  mCam.lookAt(ahead, 2.2, -52);
  mCam.rotation.z = (curveX(-14) - curveX(0)) * 0.012;                // 过弯侧倾
  mGlow.material.opacity = 0.16 + 0.1 * Math.sin(performance.now() / 90);
}
