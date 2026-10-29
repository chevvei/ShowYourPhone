// ---------------- 电池内部 · 离子塔防 ----------------
// 进入方式：双击电池部件 / 信息卡「深入电池」按钮（main.js 通用 enterGameWorld 调 openTurret）。
// 世界观：锂离子平原——电涌怪物沿铜箔轨道涌向电池芯，玩家在轨道旁放置电容塔
//         拦截（点击发光槽位），守住 6 波 = 电网胜利，电池芯 HP 耗尽 = 过载失败。
// 工程套路：独立 Scene/相机（主循环切 RenderPass）；敌人沿 CatmullRom 曲线参数 t 前进；
//         激光即时命中 + 对象池光束；全部顶层标识符 t 前缀防合并重名。
// 跨模块边界：自备 t$ 查询器；徽章走 CustomEvent('game-award') 由 main.js 接收。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const t$ = (s) => document.querySelector(s);
export const turret = {
  on: false, run: false, over: false, win: false,
  gold: 0, wave: 0, coreHp: 10, score: 0, kills: 0,
  best: +(localStorage.getItem('iphoneDuo.turretBest') || 0),
};

// —— 铜箔轨道：S 形曲线（终点=电池芯）——
const tPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-34, 0, -44), new THREE.Vector3(-8, 0, -30), new THREE.Vector3(22, 0, -34),
  new THREE.Vector3(30, 0, -6), new THREE.Vector3(10, 0, 12), new THREE.Vector3(-14, 0, 6),
  new THREE.Vector3(-24, 0, 22), new THREE.Vector3(-4, 0, 34), new THREE.Vector3(0, 0, 42),
]);
const WAVES = [6, 8, 10, 12, 14, 16];                  // 每波敌人数量

export let tScene = null, tCam = null, tCore = null, tMaze = null;
let tSlots = [];                                       // 放塔槽位 { mesh, pos, tower }
const tFoes = [], tBeams = [];                         // 活动敌人 / 激光光束
let tCoreFlash = 0;

function batteryTexture() {
  // 程序化电池卷绕层：青灰底 + 同心层叠条纹（电池内部的“大地”）
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#10262a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(${90 + i * 4},${140 + i * 3},${150 + i * 2},.25)`;
    g.fillRect(0, i * 12, 256, 5);
  }
  g.strokeStyle = 'rgba(120,220,210,.16)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(0, i * 14); g.lineTo(256, i * 14); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
}

function buildTurret() {
  if (tScene) return;
  tScene = new THREE.Scene();
  tScene.fog = new THREE.FogExp2(0x06181c, 0.008);
  tCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
  tCam.position.set(0, 88, 96); tCam.lookAt(0, 0, -6);

  tScene.add(new THREE.AmbientLight(0x9fd8cc, 0.55));
  const sun = new THREE.DirectionalLight(0xdfffe8, 1.0);
  sun.position.set(40, 90, 30); tScene.add(sun);

  // 大地：卷绕层纹理
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190),
    new THREE.MeshStandardMaterial({ map: batteryTexture(), roughness: 0.8, metalness: 0.3 }));
  ground.rotation.x = -Math.PI / 2; tScene.add(ground);

  // 铜箔轨道
  const tube = new THREE.Mesh(new THREE.TubeGeometry(tPath, 120, 1.6, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8a850, emissive: 0x553300, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.3 }));
  tScene.add(tube);
  // 轨道流向粒子（getPoints(n) 返回 n+1 个点，取 159 → 160 粒子正好填满 480）
  const tp = tPath.getPoints(159), tpPos = new Float32Array(480);
  tp.forEach((p, i) => { tpPos.set([p.x, 0.8, p.z], i * 3); });
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tpPos, 3));
  tMaze = new THREE.Points(tg, new THREE.PointsMaterial({ color: 0xffe9a8, size: 1.1, transparent: true, opacity: 0.9, depthWrite: false }));
  tScene.add(tMaze);

  // 电池芯（守护核心）
  tCore = new THREE.Group();
  const coreBody = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 9, 28),
    new THREE.MeshStandardMaterial({ color: 0x2a3f46, metalness: 0.75, roughness: 0.35 }));
  const coreTop = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.8, 28),
    new THREE.MeshStandardMaterial({ color: 0x8fe8d0, emissive: 0x2fae8a, emissiveIntensity: 1.6 }));
  coreTop.position.y = 4.8;
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.4, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0x66ffd0, emissive: 0x1fae7a, emissiveIntensity: 2.0 }));
  coreRing.rotation.x = Math.PI / 2; coreRing.position.y = 1;
  tCore.add(coreBody, coreTop, coreRing);
  tCore.position.set(0, 4.5, 42);
  tScene.add(tCore);
  tCore.add(new THREE.PointLight(0x66ffcc, 90, 60, 1.8));

  // 放塔槽位：沿曲线取 10 个点，法向侧移 8
  const slotGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.5, 20);
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x1d4048, emissive: 0x0e6a5a, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i++) {
    const t = 0.08 + i * 0.088;
    const p = tPath.getPointAt(t), tan = tPath.getTangentAt(t);
    const nx = -tan.z, nz = tan.x;                       // 法向（水平面）
    const side = i % 2 ? 1 : -1;
    const pos = new THREE.Vector3(p.x + nx * 8 * side, 0.3, p.z + nz * 8 * side);
    const m = new THREE.Mesh(slotGeo, slotMat.clone());
    m.position.copy(pos);
    m.userData.slot = true;
    tScene.add(m);
    tSlots.push({ mesh: m, pos, tower: null });
  }
}

// —— 塔工厂 ——
function makeTower() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 1.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x38505c, metalness: 0.8, roughness: 0.3 }));
  base.position.y = 0.8;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 5, 12),
    new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x2b8fff, emissiveIntensity: 1.4, metalness: 0.6 }));
  barrel.position.y = 4.2;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x2b8fff, emissiveIntensity: 2.4 }));
  tip.position.y = 7;
  g.add(base, barrel, tip);
  return g;
}
// —— 激光池 ——
function makeBeam() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 6),
    new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.95, depthWrite: false }));
  m.visible = false; tScene.add(m);
  return { mesh: m, life: 0 };
}
function fireBeam(from, to) {
  let b = tBeams.find((q) => !q.mesh.visible) || (tBeams.push(makeBeam()), tBeams[tBeams.length - 1]);
  const d = from.distanceTo(to);
  b.mesh.position.copy(from).lerp(to, 0.5);
  b.mesh.scale.set(1, d, 1);
  b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  b.mesh.visible = true; b.life = 0.14;
}

// —— 敌人 ——
function spawnFoe() {
  const hp = 2 + turret.wave * 1.3;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1),
    new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff2200, emissiveIntensity: 1.6, roughness: 0.4 }));
  const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.16, depthWrite: false }));
  g.add(body, aura);
  tScene.add(g);
  tFoes.push({ mesh: g, t: 0, hp, maxHp: hp, speed: 0.0105 + turret.wave * 0.0016 });
}
function killFoe(i) {
  const f = tFoes[i];
  tScene.remove(f.mesh);
  tFoes.splice(i, 1);
  turret.kills++; turret.gold += 8; turret.score += 10;
  sfx('pop');
}
function hurtCore() {
  turret.coreHp--; tCoreFlash = 0.5;
  sfx('thud'); buzz(26);
  if (turret.coreHp <= 0) { turret.coreHp = 0; endTurretRun(false); }
}

// —— 一局生命周期 ——
const tSleep = (ms) => new Promise((r) => setTimeout(r, ms));
let spawnLeft = 0, spawnGap = 0, waveGap = 0;
export async function openTurret() {
  buildTurret();
  turret.on = true;
  startTurretRun();
  dispatchEvent(new CustomEvent('game-award', { detail: 'turret' }));
}
export function startTurretRun() {
  for (const f of tFoes) tScene.remove(f.mesh);
  tFoes.length = 0;
  for (const s of tSlots) { if (s.tower) { tScene.remove(s.tower); s.tower = null; } s.mesh.visible = true; }
  Object.assign(turret, { run: false, over: false, win: false, gold: 90, wave: 0, coreHp: 10, score: 0, kills: 0 });
  spawnLeft = 0; waveGap = 2.2;
  t$('#tgame').classList.add('on');
  t$('#tOver').classList.remove('on');
  tMsg('离子塔防<small>点击发光槽位放置电容塔 · 守住电池芯</small>', 3);
  (async () => { await tSleep(2200); if (turret.on && !turret.over) turret.run = true; })();
}
function endTurretRun(win) {
  turret.run = false; turret.over = true; turret.win = win;
  const best = turret.score > turret.best;
  if (best) { turret.best = turret.score; localStorage.setItem('iphoneDuo.turretBest', String(turret.best)); }
  t$('#tOverTitle').textContent = win ? '⚡ 电网守住' : '💀 电芯过载';
  t$('#tStats').innerHTML =
    `本局分数 <b>${turret.score}</b>${best ? ' · 新纪录 ✦' : ''}<br>` +
    `拦截电涌 <b>${turret.kills}</b> · 历史最佳 <b>${turret.best}</b>`;
  t$('#tgame').classList.add('over');
  t$('#tOver').classList.add('on');
  sfx(win ? 'win' : 'thud');
  if (win) { sfx('win'); dispatchEvent(new CustomEvent('game-award', { detail: 'shield' })); }
}
// 测试探针：直接触发结算（e2e 验证胜利徽章路径，走真实 endTurretRun）
window.__turretEnd = (win) => endTurretRun(!!win);
window.__turretSlots = () => tSlots.map((s) => {
  const v = s.pos.clone().setY(2).project(tCam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, free: !s.tower };
});
export function closeTurretUI() {
  turret.on = false; turret.run = false; turret.over = false;
  for (const f of tFoes) tScene.remove(f.mesh);
  tFoes.length = 0;
  t$('#tgame').classList.remove('on', 'over');
  t$('#tOver').classList.remove('on');
  t$('#tMsg').classList.remove('on');
}

// —— 点击放塔（射线拾取槽位）——
const tRay = new THREE.Raycaster();
addEventListener('pointerdown', (e) => {
  if (!turret.on || !turret.run || turret.over) return;
  if (e.target.closest('#tOver,#tQuit')) return;
  tRay.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), tCam);
  const hit = tRay.intersectObjects(tSlots.map((s) => s.mesh))[0];
  if (!hit) return;
  const s = tSlots.find((q) => q.mesh === hit.object);
  if (!s || s.tower) return;
  if (turret.gold < 30) { tMsg('金币不足（需 30）', 1.1); sfx('wrong'); return; }
  turret.gold -= 30;
  s.tower = makeTower();
  s.tower.position.copy(s.pos);
  s.tower.userData.cd = 0;
  tScene.add(s.tower);
  s.mesh.visible = false;
  sfx('tick'); buzz(8);
});

// —— HUD ——
let tHudT = 0;
function tMsg(html, dur = 1.6) {
  t$('#tMsg').innerHTML = html;
  t$('#tMsg').classList.add('on');
  clearTimeout(turret.msgT);
  turret.msgT = setTimeout(() => t$('#tMsg').classList.remove('on'), dur * 1000);
}
function tUpdHUD() {
  t$('#tGold').textContent = turret.gold;
  t$('#tWave').textContent = `${Math.max(turret.wave, 1)}/${WAVES.length}`;
  t$('#tHp').textContent = '▮'.repeat(turret.coreHp) || '—';
  t$('#tScore').textContent = turret.score;
}

// —— 每帧 ——
export function tickTurret(dt) {
  if (!turret.on) return;
  tCam.aspect = innerWidth / innerHeight; tCam.updateProjectionMatrix();

  if (turret.run) {
    // 波次调度
    if (spawnLeft > 0) {
      spawnGap -= dt;
      if (spawnGap <= 0) { spawnGap = 1.05; spawnLeft--; spawnFoe(); }
    } else if (tFoes.length === 0) {
      waveGap -= dt;
      if (waveGap <= 0) {
        if (turret.wave >= WAVES.length) endTurretRun(true);
        else { turret.wave++; spawnLeft = WAVES[turret.wave - 1]; waveGap = 3.2; if (turret.wave > 1) tMsg(`第 ${turret.wave} 波电涌来袭`, 1.4); }
      }
    }
    // 敌人推进 + 到芯扣血
    for (let i = tFoes.length - 1; i >= 0; i--) {
      const f = tFoes[i];
      f.t += f.speed * dt;
      if (f.t >= 1) { tScene.remove(f.mesh); tFoes.splice(i, 1); hurtCore(); if (turret.over) break; continue; }
      const p = tPath.getPointAt(f.t);
      f.mesh.position.set(p.x, 1.8, p.z);
      f.mesh.rotation.y += dt * 3;
    }
    // 塔攻击：射程内最近敌人
    if (!turret.over) for (const s of tSlots) {
      if (!s.tower) continue;
      s.tower.userData.cd -= dt;
      s.tower.rotation.y += dt * 0.6;
      if (s.tower.userData.cd > 0) continue;
      let near = null, nd = 30 * 30;
      for (const f of tFoes) {
        const d = s.tower.position.distanceToSquared(f.mesh.position);
        if (d < nd) { nd = d; near = f; }
      }
      if (near) {
        s.tower.userData.cd = 0.5;
        fireBeam(s.tower.position.clone().setY(7), near.mesh.position.clone());
        near.hp -= 2;
        if (near.hp <= 0) killFoe(tFoes.indexOf(near));
      }
    }
  }
  // 光束淡出
  for (const b of tBeams) {
    if (!b.mesh.visible) continue;
    b.life -= dt;
    b.mesh.material.opacity = Math.max(b.life / 0.14, 0) * 0.95;
    if (b.life <= 0) b.mesh.visible = false;
  }
  // 核心受击闪红 + 待机呼吸
  if (tCoreFlash > 0) { tCoreFlash -= dt; tCore.children[1].material.emissive.setHex(0xff2200); }
  else tCore.children[1].material.emissive.setHex(0x2fae8a);
  tCore.children[2].rotation.z += dt * 0.8;
  tCore.position.y = 4.5 + Math.sin(performance.now() / 900) * 0.25;
  // 轨道流向粒子闪烁
  tMaze.material.size = 1.0 + Math.sin(performance.now() / 300) * 0.25;

  tHudT += dt;
  if (tHudT > 0.12) { tHudT = 0; tUpdHUD(); }
}
