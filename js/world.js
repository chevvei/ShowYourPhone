// ---------------- 异世界 · 元器件赛博都市（第一人称剧情模式）----------------
// 进入方式：控制坞「◈ 异世界」按钮 / V 键。世界观：A20 芯片内部宏大的赛博都市——
//         走线即 Neon 大道，电容是高塔，芯片是摩天楼；玩家以第一人称自由行走，
//         沿数据大道依次抵达 5 座关卡传送门（对应 5 款部件小游戏），通关回收核心碎片，
//         集齐 5 枚重启 A20 —— 3A 式章节推进。
// 工程套路：独立 Scene + 第一人称相机（主循环 world.on 分支接管 RenderPass）；
//         共享几何/材质压 draw call，全程序化纹理（地面走线 / 楼体窗格 / 霓虹招牌）；
//         桌面 WASD + 拖拽转视角，移动端左摇杆 + 右半屏滑动转视角；
//         与 main.js 单向解耦：'world-enter' 事件交给 main 走 enterGameWorld，
//         退出游戏后 main 调 worldResume() 回到异世界原地并结算碎片。
// 命名约定：合并产物里所有模块共享顶层作用域，本模块一律 wd 前缀防冲突。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const wd$ = (s) => document.querySelector(s);

export const world = {
  on: false, intro: 0, finale: false, near: null, msgT: 0, moving: false, pendingKey: null, lastNear: null,
  frags: JSON.parse(localStorage.getItem('iphoneDuo.worldFrags') || '[]'),
};
const wdHas = (k) => world.frags.includes(k);

// —— 剧情文案（章节推进 = 3A 运镜感的文字层）——
const WD_INTRO = [
  ['信号接入', 'SIGNAL // LEVEL 0'],
  ['你是一道误入 A20 PRO 的电流信号', '这里是你从未见过的手机内部——元器件的赛博都市'],
  ['回收 5 枚核心碎片', '重启这部手机的心跳'],
];
const WD_PORTALS = [
  { key: 'micro',  nm: '电流竞速', sub: 'A20 芯片 · 供电动脉',  icon: '⚡',  col: 0x35d6ff, x: 0, z: -130, line: '前方：硅基峡谷。那是所有电流的出生地——主板的供电动脉。' },
  { key: 'turret', nm: '离子塔防', sub: '电池仓 · 电芯区',      icon: '🔋', col: 0xffc24a, x: 62, z: -280, line: '前方：电芯区。离子塔正被电涌侵蚀，电网需要你。' },
  { key: 'shoot',  nm: '点阵射击', sub: 'Face ID · 点阵空间',   icon: '🎯', col: 0xff5fd0, x: -44, z: -430, line: '前方：点阵空间。三万个红外光点，正等待一次深度校准。' },
  { key: 'wave',   nm: '声波冲浪', sub: '扬声器 · 声学管',      icon: '🌊', col: 0x3dffa2, x: 52, z: -580, line: '前方：声学管。声浪在扬声器的峡谷里永不停歇。' },
  { key: 'maze',   nm: '磁力迷阵', sub: 'MagSafe · 磁环引力井', icon: '🧲', col: 0xb26bff, x: -8, z: -720, line: '前方：磁环迷阵。最后一枚碎片，在 MagSafe 的引力井深处。' },
];
const WD_WAY = [[0, 30], [0, -130], [62, -280], [-44, -430], [52, -580], [-8, -720], [0, -840]];

// —— 场景与玩家状态 ——
export let wdScene = null, wdCam = null;
const wdPos = { x: 0, z: 52 };
let wdYaw = 0, wdPitch = 0;            // 相机 forward=(-sinYaw,0,-cosYaw)，yaw=0 面向 -z（大道延伸方向）
const wdKeys = {};
let wdJoy = { on: false, dx: 0, dy: 0 };
let wdLook = { id: null, x: 0, y: 0, moved: 0 };
let wdWalkT = 0, wdT0 = performance.now();
let wdBeams = [], wdRings = [], wdIcons = [], wdSigns = [], wdPackets = [], wdStreams = null, wdSky = null;
let wdMatRoad = null;

// —— 程序化纹理 ——
function wdGroundTex() {  // 大地：深色阻焊层 + 青金色走线网格 + 过孔
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#060a14'; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(30,200,255,.16)';
  for (let i = 0; i < 60; i++) {
    g.lineWidth = 2 + Math.random() * 6; g.beginPath();
    let x = Math.random() * 1024, y = Math.random() * 1024; g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { if (Math.random() < 0.5) x = Math.random() * 1024; else y = Math.random() * 1024; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,190,80,.10)';
  for (let i = 0; i < 26; i++) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(Math.random() * 1024, 0); g.lineTo(Math.random() * 1024, 1024); g.stroke(); }
  g.fillStyle = 'rgba(120,220,255,.14)';
  for (let i = 0; i < 130; i++) { g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 1024, 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 44); t.anisotropy = 4;
  return t;
}
function wdTowerTex() {   // 芯片摩天楼：窗格点阵（自发光贴图）
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 18) for (let x = 8; x < 256; x += 16) {
    const r = Math.random();
    if (r < 0.42) { g.fillStyle = r < 0.1 ? '#ff5fd0' : r < 0.24 ? '#35d6ff' : '#ffd76a'; g.globalAlpha = 0.25 + Math.random() * 0.75; g.fillRect(x, y, 9, 10); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function wdSignTex(txt, col) {  // 霓虹招牌
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#05070d'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140);
  g.font = 'bold 86px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 34; g.fillStyle = col;
  g.fillText(txt, 256, 84);
  return new THREE.CanvasTexture(c);
}
function wdIconSprite(icon, nm, col) {  // 传送门名牌（canvas → Sprite）
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '52px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#' + new THREE.Color(col).getHexString(); g.shadowBlur = 26;
  g.fillStyle = '#fff'; g.fillText(icon, 128, 40);
  g.font = 'bold 34px system-ui,sans-serif'; g.fillStyle = '#' + new THREE.Color(col).getHexString();
  g.fillText(nm, 128, 98);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(16, 8, 1);
  return sp;
}

// —— 沿路取点（数据大道中心线）——
function wdRoadAt(d) {  // d: 0..1 → [x, z, 朝向角]
  const total = WD_WAY.length - 1, f = Math.min(Math.max(d, 0), 1) * total;
  const i = Math.min(Math.floor(f), total - 1), k = f - i;
  const [x0, z0] = WD_WAY[i], [x1, z1] = WD_WAY[i + 1];
  return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, Math.atan2(x1 - x0, -(z1 - z0))];
}

// —— 建城（首次进入构建一次）——
function wdBuild() {
  if (wdScene) return;
  wdScene = new THREE.Scene();
  wdScene.background = new THREE.Color(0x05070f);
  wdScene.fog = new THREE.FogExp2(0x05070f, 0.0034);
  wdCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1400);

  wdScene.add(new THREE.HemisphereLight(0x35507a, 0x080a12, 0.9));
  const moon = new THREE.DirectionalLight(0x9fc0ff, 0.5);
  moon.position.set(-120, 300, -80);
  wdScene.add(moon);

  // 大地
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1900),
    new THREE.MeshStandardMaterial({ map: wdGroundTex(), roughness: 0.9, metalness: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -400);
  wdScene.add(ground);

  // 数据大道：发光路面 + 两侧霓虹护栏
  wdMatRoad = new THREE.MeshStandardMaterial({ color: 0x0a1830, emissive: 0x1899ff, emissiveIntensity: 0.85, roughness: 0.4 });
  const railMat = new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.6 });
  const N = 84;
  for (let i = 0; i < N; i++) {
    const [x, z, a] = wdRoadAt(i / (N - 1));
    const seg = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 11.6), wdMatRoad);
    seg.position.set(x, 0.26, z); seg.rotation.y = a;
    wdScene.add(seg);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 11.6), railMat);
      r.position.set(x + Math.cos(a) * 7.4 * s, 0.8, z + Math.sin(a) * 7.4 * s); r.rotation.y = a;
      wdScene.add(r);
    }
  }

  // 元器件天际线：芯片楼 / 电容塔 / 电阻柱
  const winTex = wdTowerTex();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x11182a, roughness: 0.6, metalness: 0.7, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.15 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.35, metalness: 0.8 });
  const capTopMat = new THREE.MeshStandardMaterial({ color: 0x9fb8d0, metalness: 0.9, roughness: 0.25 });
  const bandCols = [0x8b3a2a, 0x2a2a30, 0xc98a2a, 0xd4af37];
  for (let i = 0; i < 92; i++) {
    const d = 0.03 + Math.random() * 0.94;
    const [px, pz, a] = wdRoadAt(d);
    const side = Math.random() < 0.5 ? -1 : 1;
    const off = 34 + Math.random() * 210;
    const x = px + Math.cos(a) * off * side, z = pz + Math.sin(a) * off * side;
    const r = Math.random();
    if (r < 0.5) {          // 芯片摩天楼（窗格发光 + 顶部天线）
      const w = 14 + Math.random() * 30, h = 34 + Math.random() * 130;
      const m = towerMat.clone(); m.emissiveMap = winTex.clone();
      m.emissiveMap.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(2, Math.round(h / 14)));
      m.emissiveMap.needsUpdate = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + Math.random() * 0.7)), m);
      b.position.set(x, h / 2, z); wdScene.add(b);
      if (Math.random() < 0.3) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 6), new THREE.MeshBasicMaterial({ color: 0xff4466 }));
        ant.position.set(x, h + 6, z); wdScene.add(ant);
      }
    } else if (r < 0.78) {  // 电容塔（圆柱身 + 顶部铝壳 + 霓虹环）
      const rad = 7 + Math.random() * 10, h = 40 + Math.random() * 90;
      const g2 = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 18), capMat); body.position.y = h / 2;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.08, rad * 1.08, 3, 18), capTopMat); top.position.y = h + 1.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.12, 0.5, 8, 28), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x35d6ff : 0xff5fd0 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = h * (0.3 + Math.random() * 0.4);
      g2.add(body, top, ring); g2.position.set(x, 0, z); wdScene.add(g2);
    } else {                // 电阻柱（色环编码）
      const g3 = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 18, 12), new THREE.MeshStandardMaterial({ color: 0xc9b8a0, roughness: 0.7 }));
      body.position.y = 9; g3.add(body);
      for (let b = 0; b < 3; b++) {
        const bd = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 1.6, 12), new THREE.MeshStandardMaterial({ color: bandCols[b], emissive: bandCols[b], emissiveIntensity: 0.35 }));
        bd.position.y = 6 + b * 3.4; g3.add(bd);
      }
      g3.position.set(x, 0, z); wdScene.add(g3);
    }
  }
  // 大道上方磁环拱门
  for (let i = 1; i < 7; i++) {
    const [x, z] = wdRoadAt(i / 7 + 0.04);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(24, 1.5, 10, 40, Math.PI),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xb26bff : 0x3dffa2, transparent: true, opacity: 0.8 }));
    arch.position.set(x, 0.4, z); arch.rotation.y = Math.PI / 2;
    wdScene.add(arch);
  }

  // 霓虹招牌（面向大道）
  const SIGNS = [['电流不休', '#35d6ff'], ['硅谷 2077', '#ff5fd0'], ['离子酒吧', '#3dffa2'], ['RAM 街 404', '#ffd76a'], ['电容之塔', '#b26bff'], ['信号永远满格', '#35d6ff']];
  for (let i = 0; i < SIGNS.length; i++) {
    const d = 0.08 + i * 0.15, [px, pz, a] = wdRoadAt(d), side = i % 2 ? -1 : 1;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(24, 7.5),
      new THREE.MeshBasicMaterial({ map: wdSignTex(...SIGNS[i]), transparent: true, side: THREE.DoubleSide }));
    s.position.set(px + Math.cos(a) * 30 * side, 16 + (i % 3) * 9, pz + Math.sin(a) * 30 * side);
    s.rotation.y = a + (side < 0 ? 0 : Math.PI);
    s.userData.sway = Math.random() * 6;
    wdSigns.push(s); wdScene.add(s);
  }

  // 5 座关卡传送门
  for (const p of WD_PORTALS) {
    const g4 = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.1, 12, 42),
      new THREE.MeshStandardMaterial({ color: 0x0c1220, emissive: p.col, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.3 }));
    ring.position.y = 8.4;
    const beamMat = new THREE.MeshBasicMaterial({ color: p.col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 320, 12, 1, true), beamMat);
    beam.position.y = 160;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 1.1, 26),
      new THREE.MeshStandardMaterial({ color: 0x101828, emissive: p.col, emissiveIntensity: 0.55, metalness: 0.8, roughness: 0.35 }));
    ped.position.y = 0.55;
    const ic = wdIconSprite(p.icon, p.nm, p.col); ic.position.y = 21.5;
    const pl = new THREE.PointLight(p.col, 90, 70, 1.8); pl.position.y = 8;
    g4.add(ring, beam, ped, ic, pl);
    g4.position.set(p.x, 0, p.z);
    wdRings.push(ring); wdBeams.push(beam); wdIcons.push(ic);
    wdScene.add(g4);
  }

  // 天际粒子星海 + 街面数据流
  const starN = 420, sp = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) { sp[i * 3] = (Math.random() - 0.5) * 1400; sp[i * 3 + 1] = 60 + Math.random() * 500; sp[i * 3 + 2] = -400 - Math.random() * 1100; }
  const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  wdSky = new THREE.Points(sg2, new THREE.PointsMaterial({ color: 0x7fb8ff, size: 1.5, transparent: true, opacity: 0.7, depthWrite: false }));
  wdScene.add(wdSky);

  const stN = 150, st = new Float32Array(stN * 3);
  for (let i = 0; i < stN; i++) { st[i * 3] = Math.random() * 900 - 450; st[i * 3 + 1] = 2 + Math.random() * 26; st[i * 3 + 2] = 40 - Math.random() * 900; }
  const stg = new THREE.BufferGeometry(); stg.setAttribute('position', new THREE.BufferAttribute(st, 3));
  wdStreams = new THREE.Points(stg, new THREE.PointsMaterial({ color: 0x54ffd8, size: 1.1, transparent: true, opacity: 0.85, depthWrite: false }));
  wdScene.add(wdStreams);

  // 大道上的数据包（流动光球）
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x35d6ff, emissiveIntensity: 3 }));
    m.position.y = 2.4;
    m.userData = { d: Math.random(), v: 0.012 + Math.random() * 0.02, lane: (Math.random() - 0.5) * 7 };
    wdPackets.push(m); wdScene.add(m);
  }

  wdHUD();
}

// —— HUD（一次性构建）——
function wdHUD() {
  if (wd$('#vgame')) return;
  const el = document.createElement('section');
  el.id = 'vgame'; el.className = 'gameLayer';
  el.innerHTML = `
    <div id="vObjective"><b id="vFrags">◈ 0/5</b><span id="vMission"></span><span id="vDist"></span></div>
    <button id="vQuit" class="gQuit" title="离开异世界 (Esc)">✕</button>
    <div id="vCross"></div>
    <div id="vPrompt"><b></b><span></span></div>
    <div id="vMsg"></div>
    <div id="vTitle"><h2></h2><p></p></div>
    <div id="vJoy"><i></i></div>
    <div id="vLookTip">右半屏拖动转视角</div>`;
  document.body.append(el);
  wd$('#vQuit').onclick = () => dispatchEvent(new CustomEvent('world-quit'));
  // 转视角 + 点击进入（非摇杆/按钮区域）
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#vJoy,#vQuit')) return;
    wdLook = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    try { el.setPointerCapture(e.pointerId); } catch { }
  });
  el.addEventListener('pointermove', (e) => {
    if (wdLook.id !== e.pointerId) return;
    const dx = e.clientX - wdLook.x, dy = e.clientY - wdLook.y;
    wdLook.x = e.clientX; wdLook.y = e.clientY; wdLook.moved += Math.abs(dx) + Math.abs(dy);
    wdYaw -= dx * 0.0034; wdPitch = Math.max(-1.2, Math.min(1.2, wdPitch - dy * 0.0028));
  });
  const lookEnd = (e) => {
    if (wdLook.id !== e.pointerId) return;
    const tap = wdLook.moved < 7;
    wdLook.id = null;
    if (tap) wdTryEnter();
  };
  el.addEventListener('pointerup', lookEnd);
  el.addEventListener('pointercancel', lookEnd);
  // 移动端摇杆
  const joyEl = wd$('#vJoy'), stick = joyEl.querySelector('i');
  joyEl.addEventListener('pointerdown', (e) => {
    wdJoy.on = true; wdJoy.id = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
    wdJoy.cx = e.clientX; wdJoy.cy = e.clientY;
    e.stopPropagation();
  });
  joyEl.addEventListener('pointermove', (e) => {
    if (!wdJoy.on || e.pointerId !== wdJoy.id) return;
    const dx = e.clientX - wdJoy.cx, dy = e.clientY - wdJoy.cy, len = Math.hypot(dx, dy) || 1, cl = Math.min(len, 46);
    wdJoy.dx = (dx / len) * (cl / 46); wdJoy.dy = (dy / len) * (cl / 46);
    stick.style.transform = `translate(${(dx / len) * cl}px,${(dy / len) * cl}px)`;
  });
  const joyEnd = () => { wdJoy.on = false; wdJoy.dx = wdJoy.dy = 0; stick.style.transform = 'translate(0,0)'; };
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);
}
addEventListener('keydown', (e) => { if (world.on) wdKeys[e.code] = true; });
addEventListener('keyup', (e) => { wdKeys[e.code] = false; });
addEventListener('resize', () => { if (wdCam && world.on) { wdCam.aspect = innerWidth / innerHeight; wdCam.updateProjectionMatrix(); } });

// —— 剧情 UI ——
function wdMsg(html, dur = 2.6) {
  const m = wd$('#vMsg');
  if (!m) return;
  m.innerHTML = html; m.classList.add('on');
  clearTimeout(world.msgT);
  world.msgT = setTimeout(() => m.classList.remove('on'), dur * 1000);
}
function wdTitle(h, p, dur = 2.6) {
  const t = wd$('#vTitle');
  t.querySelector('h2').textContent = h;
  t.querySelector('p').textContent = p;
  t.classList.add('on');
  clearTimeout(world.msgT);
  world.msgT = setTimeout(() => t.classList.remove('on'), dur * 1000);
}
const wdTarget = () => WD_PORTALS.find((p) => !wdHas(p.key));
function wdObjective() {
  if (!wd$('#vMission')) return;
  wd$('#vFrags').textContent = `◈ ${world.frags.length}/5`;
  const t = wdTarget();
  if (!t) { wd$('#vMission').textContent = world.finale ? 'A20 已重启 · 自由探索' : '核心齐备 · 异世界已苏醒'; wd$('#vDist').textContent = ''; }
  else wd$('#vMission').textContent = `前往「${t.nm}」· ${t.sub}`;
}

// —— 交互：靠近传送门进入关卡 ——
function wdTryEnter() {
  if (world.intro || !world.on) return;
  const p = wdNearPortal();
  if (!p) return;
  sfx('boot'); buzz(14);
  world.pendingKey = p.key;   // worldResume 结算碎片凭据（main 走 enterGameWorld → exitGameWorld → worldResume）
  dispatchEvent(new CustomEvent('world-enter', { detail: p.key }));
}
function wdNearPortal() {
  for (const p of WD_PORTALS) {
    if (wdHas(p.key)) continue;
    if (Math.hypot(wdPos.x - p.x, wdPos.z - p.z) < 11) return p;
  }
  return null;
}

// —— 每帧（主循环 world.on 时调用；dt 秒）——
export function tickWorld(dt) {
  const t = (performance.now() - wdT0) / 1000;

  // 开场演出（锁输入，逐条亮台词）
  if (world.intro > 0) {
    world.intro -= dt;
    if (!world.introShown && world.intro < 4.6) { world.introShown = true; wdTitle(...WD_INTRO[0], 1.6); }
    if (world.introShown2 === undefined && world.intro < 2.9) { world.introShown2 = true; wdTitle(...WD_INTRO[1], 1.6); }
    if (world.introShown3 === undefined && world.intro < 1.2) { world.introShown3 = true; wdTitle(...WD_INTRO[2], 1.2); }
    if (world.intro <= 0) { world.intro = 0; const tp = wdTarget(); if (tp) wdMsg(tp.line, 3.4); }
  } else {
    // 移动：桌面 WASD/方向键 + 移动端摇杆（相机朝向系）
    let mx = 0, mz = 0, moving = false;
    if (wdKeys.KeyW || wdKeys.ArrowUp) mz -= 1;
    if (wdKeys.KeyS || wdKeys.ArrowDown) mz += 1;
    if (wdKeys.KeyA || wdKeys.ArrowLeft) mx -= 1;
    if (wdKeys.KeyD || wdKeys.ArrowRight) mx += 1;
    mx += wdJoy.dx; mz += wdJoy.dy;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const run = wdKeys.ShiftLeft || wdKeys.ShiftRight ? 1.7 : 1;
      const sp = 26 * run * Math.min(len, 1) * dt;
      const fwd = -mz, str = mx;                        // W → 前进；D → 右移
      wdPos.x += (-Math.sin(wdYaw) * fwd + Math.cos(wdYaw) * str) * sp;
      wdPos.z += (-Math.cos(wdYaw) * fwd - Math.sin(wdYaw) * str) * sp;
      wdWalkT += dt * (6 + run * 4);
      moving = true;
    } else wdWalkT *= 0.9;
    wdPos.x = Math.max(-460, Math.min(460, wdPos.x));
    wdPos.z = Math.max(-880, Math.min(90, wdPos.z));
    world.moving = moving;
  }

  // 相机：第一人称 + 行走起伏
  const bob = Math.sin(wdWalkT) * 0.14 * (world.moving ? 1 : 0.2);
  wdCam.position.set(wdPos.x, 4.7 + bob, wdPos.z);
  wdCam.rotation.set(0, 0, 0);
  wdCam.rotateY(wdYaw); wdCam.rotateX(wdPitch);

  // 环境：传送门呼吸 / 招牌摇曳 / 数据包巡航 / 星海漂移
  for (let i = 0; i < WD_PORTALS.length; i++) {
    const got = wdHas(WD_PORTALS[i].key);
    const r = wdRings[i];
    r.rotation.z += dt * (got ? 0.1 : 0.6);
    r.position.y = 8.4 + Math.sin(t * 1.4 + i) * (got ? 0.15 : 0.55);
    r.material.emissiveIntensity = got ? 0.5 : 2.2 + Math.sin(t * 2.2 + i * 2) * 0.6;
    wdBeams[i].visible = !got;
    wdIcons[i].position.y = 21.5 + Math.sin(t * 1.1 + i) * 0.6;
    wdIcons[i].material.opacity = got ? 0.35 : 1;
  }
  wdMatRoad.emissiveIntensity = 0.75 + Math.sin(t * 2.4) * 0.18;
  for (const s of wdSigns) s.rotation.z = Math.sin(t * 0.8 + s.userData.sway) * 0.02;
  for (const pk of wdPackets) {
    pk.userData.d = (pk.userData.d + pk.userData.v * dt) % 1;
    const [x, z, a] = wdRoadAt(pk.userData.d);
    pk.position.x = x + Math.cos(a) * pk.userData.lane; pk.position.z = z + Math.sin(a) * pk.userData.lane;
  }
  if (wdStreams) wdStreams.position.x = (t * 14) % 60 - 30;

  // 接近提示 + 章节台词（每个新章节只播一次）
  const p = wdNearPortal();
  world.near = p ? p.key : null;
  const pr = wd$('#vPrompt');
  if (pr) {
    if (p && !world.intro) {
      pr.classList.add('on');
      pr.querySelector('b').textContent = `${p.icon} ${p.nm}`;
      pr.querySelector('span').textContent = document.body.classList.contains('mobile') ? '点击传送门进入' : 'E / 点击传送门进入';
    } else pr.classList.remove('on');
  }
  if (p && world.lastNear !== p.key) {
    world.lastNear = p.key;
    if (!world.intro) wdMsg(p.line, 3.2);
  }
  if (!p) world.lastNear = null;

  // 目标距离罗盘（↑←→ 指引）
  const tg = wdTarget();
  if (tg && wd$('#vDist')) {
    const dx = tg.x - wdPos.x, dz = tg.z - wdPos.z, dist = Math.round(Math.hypot(dx, dz));
    let rel = Math.atan2(dx, -dz) + wdYaw;   // 0=正前；>0 偏右
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    wd$('#vDist').textContent = dist < 14 ? '' : `${dist}m ${Math.abs(rel) < 0.5 ? '↑' : rel > 0 ? '→' : '←'}`;
  }
}
addEventListener('keydown', (e) => {
  if (!world.on || world.intro) return;
  if (e.code === 'KeyE') wdTryEnter();
});

// —— 进 / 出 / 回归（main.js 调用）——
export function openWorld(resume) {
  wdBuild();
  world.on = true;
  document.body.classList.add('world');
  wdCam.aspect = innerWidth / innerHeight; wdCam.updateProjectionMatrix();
  wd$('#vgame').classList.add('on');
  wd$('#vLookTip').style.display = document.body.classList.contains('mobile') ? '' : 'none';
  if (!resume) {
    wdPos.x = 0; wdPos.z = 52; wdYaw = 0; wdPitch = 0;
    for (const k of Object.keys(wdKeys)) wdKeys[k] = false;
    if (!localStorage.getItem('iphoneDuo.worldSeen')) {
      world.intro = 5.2; world.introShown = world.introShown2 = world.introShown3 = undefined;
      localStorage.setItem('iphoneDuo.worldSeen', '1');
    } else {
      wdTitle('欢迎回到异世界', '数据大道永远亮着 · 继续你的回收任务', 2.2);
      const tp = wdTarget();
      if (tp) wdMsg(tp.line, 3);
    }
  }
  wdObjective();
  dispatchEvent(new CustomEvent('world-award', { detail: 'world1' }));
}
export function closeWorld() {
  world.on = false; world.intro = 0; world.near = null;
  document.body.classList.remove('world');
  wd$('#vgame')?.classList.remove('on');
  wd$('#vMsg')?.classList.remove('on');
  wd$('#vTitle')?.classList.remove('on');
}
// 从关卡退出回到异世界：结算碎片 + 章节推进 + 终章
export function worldResume(played) {
  openWorld(true);
  const cur = world.pendingKey;
  world.pendingKey = null;
  if (played && cur && !wdHas(cur)) {
    world.frags.push(cur);
    localStorage.setItem('iphoneDuo.worldFrags', JSON.stringify(world.frags));
    const p = WD_PORTALS.find((x) => x.key === cur);
    sfx('win'); buzz(20);
    wdMsg(`◈ 核心碎片「${p.nm}」已回收 · ${world.frags.length}/5`, 3.2);
    if (world.frags.length >= 5 && !world.finale) {
      world.finale = true;
      setTimeout(() => {
        wdTitle('CORE ONLINE', '5 枚碎片归位 · A20 心跳已重启 · 感谢游玩', 4.6);
        sfx('boot'); buzz(30);
        dispatchEvent(new CustomEvent('world-award', { detail: 'world5' }));
      }, 1600);
    }
  } else if (cur) wdMsg('信号中断 · 碎片仍在传送门之后，随时再来', 2.6);
  wdObjective();
}

// —— 测试探针（e2e 用）——
window.__world = {
  go: (x, z) => { wdPos.x = x; wdPos.z = z; },
  look: (y) => { wdYaw = y; wdPitch = 0; },
  enter: () => wdTryEnter(),
  state: () => ({ on: world.on, intro: world.intro > 0, frags: [...world.frags], finale: world.finale, x: Math.round(wdPos.x), z: Math.round(wdPos.z), near: world.near, layerOn: wd$('#vgame')?.classList.contains('on') || false }),
};
