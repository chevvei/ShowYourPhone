// 主程序：渲染、交互、标注、发布会演示
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setAnisotropy, contactShadow, createLockScreen } from './textures.js';
import { buildPhone, buildPhone18 } from './model.js';
import { P18, P18_STD, P18_MAX } from './geo.js';
import { EGG_DEFS, eggsForDev, loadEggs, saveEggs, decodeEggImage, eggOpts } from './eggs.js';
import { sfx, buzz, toggleSfx, sfxMuted } from './sfx.js';
import { micro, mScene, mCam, openMicro, closeMicroUI, startMicroRun, tickMicro } from './micro.js';
import { turret, tScene, tCam, openTurret, closeTurretUI, startTurretRun, tickTurret } from './turret.js';
import { shoot, sScene, sCam, openShoot, closeShootUI, startShootRun, tickShoot } from './shoot.js';
import { wave, wScene, wCam, openWave, closeWaveUI, startWaveRun, tickWave } from './wave.js';
import { maze, zScene, zCam, openMaze, closeMazeUI, startMazeRun, tickMaze } from './maze.js';
import { world, wdScene, wdCam, openWorld, closeWorld, worldResume, tickWorld } from './world.js';

const $ = (s) => document.querySelector(s);
const PI = Math.PI;

// 触屏设备（手机/平板）或窄屏：全屏沉浸模式，触碰后从两侧滑出选项
const coarse = matchMedia('(hover: none) and (pointer: coarse)');
const isMobile = () => coarse.matches || Math.min(innerWidth, innerHeight) < 600;
document.body.classList.toggle('mobile', isMobile());

// ---------------- 渲染器 / 场景 ----------------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
setAnisotropy(Math.min(renderer.capabilities.getMaxAnisotropy(), 8));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 5, 6000);
camera.position.set(-260, 120, 300);

// 视口适配：竖屏时先适度放大 FOV，再按比例拉远镜头，保证机身完整入画
let fitK = 1;
function fitCamera() {
  const a = innerWidth / innerHeight;
  const tH = Math.tan(THREE.MathUtils.degToRad(14)) * (a < 1 ? 1.08 : 1.6); // 竖屏时机身占满屏宽约 85%
  const need = tH / a;
  const vTan = THREE.MathUtils.clamp(need, Math.tan(THREE.MathUtils.degToRad(14)), Math.tan(THREE.MathUtils.degToRad(24)));
  camera.fov = THREE.MathUtils.radToDeg(Math.atan(vTan)) * 2;
  fitK = Math.max(1, need / vTan);
  camera.aspect = a;
  camera.updateProjectionMatrix();
}
fitCamera();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 70;
controls.maxDistance = 1800;
controls.autoRotateSpeed = 0.8;
controls.target.set(0, 0, 0);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// ---------------- 环境光场：影棚 / 日落 / 霓虹 ----------------
// 三套预设 = 环境贴图（反射高光）+ 平行光颜色强度 + 页面底色，一键切换整套布光
// 日落/霓虹面板比影棚多一块大面积色纸，让中框和玻璃镀膜反射出标志性色彩
function studioEnv(base = 0x07080a) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: base, side: THREE.BackSide })));
  const panel = (w, h, pos, k, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(18, 8, [0, 15, 3], 4.5);             // 顶部柔光箱
  panel(2.2, 22, [-15, 2, 8], 9);            // 左灯条
  panel(2.2, 22, [15, 2, 8], 7, 0xf2f6ff);   // 右灯条
  panel(14, 3, [0, 4, -16], 5, 0xcfe0ff);    // 背部轮廓光
  panel(8, 8, [10, -6, 14], 1.6, 0xffe6cc);  // 暖色补光
  panel(30, 30, [0, -19, 0], 0.15);          // 地面反光
  return s;
}
function sunsetEnv() {
  const s = studioEnv(0x120a08);
  const panel = (w, h, pos, k, tint) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(26, 14, [0, 6, -17], 3.2, 0xff5a3c);   // 正后方巨大的落日色纸
  panel(10, 4, [0, 13, 14], 2.0, 0xffb36b);    // 前侧暖色反光板
  return s;
}
function neonEnv() {
  const s = studioEnv(0x06060e);
  const bar = (pos, k, tint) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 30, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k) }));
    m.position.set(...pos); s.add(m);
  };
  bar([-13, 2, 6], 8, 0xff2d95);   // 品红霓虹管
  bar([13, 2, 6], 8, 0x00e5ff);    // 青色霓虹管
  bar([0, 14, -12], 5, 0x7b2dff);  // 紫色顶灯
  return s;
}
const pmrem = new THREE.PMREMGenerator(renderer);
const ENVS = {
  studio: { label: '影棚光', build: () => studioEnv(), key: [0xffffff, 1.4], rim: [0xbcd4ff, 1.0], bg: null },
  sunset: { label: '日落光', build: sunsetEnv, key: [0xffb08a, 1.25], rim: [0xff7a4d, 1.5], bg: 'sunset' },
  neon: { label: '霓虹光', build: neonEnv, key: [0x9db4ff, 1.0], rim: [0x00e5ff, 1.6], bg: 'neon' },
};
const envCache = { studio: pmrem.fromScene(studioEnv(), 0.03).texture };
let curEnv = 'studio';
function setEnv(name) {
  const E = ENVS[name];
  if (!E) return;
  curEnv = name;
  scene.environment = (envCache[name] ||= pmrem.fromScene(E.build(), 0.03)).texture;
  key.color.setHex(E.key[0]); key.intensity = E.key[1];
  rim.color.setHex(E.rim[0]); rim.intensity = E.rim[1];
  if (E.bg) document.body.dataset.env = E.bg;
  else delete document.body.dataset.env;
  $('#btnEnv').textContent = E.label;
}
// 声明顺序：ENVS 里引用的 key/rim 灯光在此创建（setEnv 仅在 UI 交互后调用，届时已存在）
const key = new THREE.DirectionalLight(ENVS.studio.key[0], ENVS.studio.key[1]);
key.position.set(-200, 300, 250);
scene.add(key);
const rim = new THREE.DirectionalLight(ENVS.studio.rim[0], ENVS.studio.rim[1]);
rim.position.set(250, 120, -300);
scene.add(rim);
const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.35);
scene.add(hemi);

// 后处理：UnrealBloom 泛光——常态只给屏幕高光一点辉光（阈值以上才生效，几乎无感），
// 找齐全部隐藏细节后短暂增强，让虹彩中框 / 彩带 / 灵动岛流光“炸”开
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------- 模型 ----------------
const stage = new THREE.Group();
scene.add(stage);
let model;

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false, opacity: 0.85 })
);
shadow.rotation.x = -PI / 2;
shadow.position.y = -78;
scene.add(shadow);

// ---------------- 状态 ----------------
const S = { fold: 0, explode: 0, labels: localStorage.getItem('iphoneDuo.labels') !== '0', auto: false, scheme: 'white', selected: null, keynote: false };

function setFold(v) { S.fold = THREE.MathUtils.clamp(v, 0, PI); }
function setExplode(v) { S.explode = THREE.MathUtils.clamp(v, 0, 1); }

// ---------------- 补间动画 ----------------
const tweens = new Set();
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 4),
  linear: (t) => t,
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
};
function tween(dur, fn, e = ease.inOut) {
  return new Promise((res) => tweens.add({ t: 0, dur: Math.max(dur, 1e-3), fn, e, res }));
}
function runTweens(dt) {
  for (const tw of tweens) {
    tw.t += dt;
    const k = Math.min(tw.t / tw.dur, 1);
    tw.fn(tw.e(k));
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
}
// 取消时直接丢弃（不 resolve），使被打断的动画链自然终止
function cancelTweens() { tweens.clear(); }

const animFold = (to, dur = 1.6) => { const from = S.fold; return tween(dur, (k) => setFold(from + (to - from) * k), ease.inOutQuint); };
const animExplode = (to, dur = 1.8) => { const from = S.explode; return tween(dur, (k) => setExplode(from + (to - from) * k)); };
function flyTo(pos, target, dur = 2) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
  // 以目标点为中心做球面插值，避免穿模
  const s0 = new THREE.Spherical().setFromVector3(p0.clone().sub(t0));
  const s1 = new THREE.Spherical().setFromVector3(p1.clone().sub(t1));
  s1.radius *= fitK;
  let dTheta = s1.theta - s0.theta;
  if (dTheta > PI) dTheta -= 2 * PI;
  if (dTheta < -PI) dTheta += 2 * PI;
  const sp = new THREE.Spherical();
  return tween(dur, (k) => {
    controls.target.lerpVectors(t0, t1, k);
    sp.set(s0.radius + (s1.radius - s0.radius) * k, s0.phi + (s1.phi - s0.phi) * k, s0.theta + dTheta * k);
    camera.position.setFromSpherical(sp).add(controls.target);
  });
}
function orbit(dur, deg) {
  const t = controls.target.clone();
  const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t));
  const sp = new THREE.Spherical();
  return tween(dur, (k) => {
    sp.set(s0.radius, s0.phi, s0.theta + THREE.MathUtils.degToRad(deg) * k);
    camera.position.setFromSpherical(sp).add(controls.target);
  }, ease.linear);
}

const VIEWS = {
  hero: [[-260, 120, 300], [0, 0, 0]],
  front: [[0, 0, 360], [0, 0, 0]],
  back: [[0, 20, -360], [0, 0, 0]],
  side: [[380, 30, 20], [0, 0, 0]],
  top: [[0, 380, 40], [0, 0, 0]],
  explode: [[-420, 210, 430], [0, 0, 10]],
};

// ---------------- 部件列表 / 标注 ----------------
const labelsEl = $('#labels'), svg = $('#leaders');
const CATS = { display: '显示', hinge: '铰链', perf: '性能', power: '电源与声学', camera: '摄像头', body: '机身' };

function buildUI() {
  const list = $('#partsList');
  list.innerHTML = '';
  labelsEl.innerHTML = '';
  svg.innerHTML = '';
  const byCat = {};
  model.parts.forEach((p) => (byCat[p.cat] ||= []).push(p));
  for (const [cat, ps] of Object.entries(byCat)) {
    const h = document.createElement('div');
    h.className = 'cat'; h.textContent = CATS[cat];
    list.appendChild(h);
    ps.forEach((p) => {
      const it = document.createElement('button');
      it.className = 'item'; it.innerHTML = `<span>${p.name}</span><small>${p.en}</small>`;
      it.onclick = () => selectPart(p.id, true);
      p.listEl = it;
      list.appendChild(it);
    });
  }
  for (const p of model.parts) {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = `<div class="t">${p.name}</div><div class="e">${p.en}</div><div class="s">${p.spec}</div>`;
    el.onclick = () => selectPart(p.id, true);
    el.onpointerenter = () => (hovered = p);
    el.onpointerleave = () => (hovered = null);
    labelsEl.appendChild(el);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', 3.2);
    svg.appendChild(path); svg.appendChild(dot);
    Object.assign(p, { el, path, dot, shown: false });
  }
}

const vtmp = new THREE.Vector3();
function updateLabels() {
  const W = innerWidth, H = innerHeight;
  const on = S.labels && !S.keynote && S.explode > 0.12 && S.fold < 0.2;
  const items = [];
  // 聚焦特写时只保留选中部件的标注，其余自动淡出，避免遮挡模型；取消选中即恢复全部
  const selOnly = S.selected && model.parts.some((q) => q.id === S.selected) ? S.selected : null;
  for (const p of model.parts) {
    let vis = on && p.k > 0.55 && p.fade > 0.5 && (!selOnly || p.id === selOnly);
    if (vis) {
      vtmp.copy(p.anchor);
      p.anchorObj.localToWorld(vtmp).project(camera);
      if (vtmp.z > 1 || Math.abs(vtmp.x) > 1.2 || Math.abs(vtmp.y) > 1.2) vis = false;
      else items.push({ p, x: (vtmp.x * 0.5 + 0.5) * W, y: (-vtmp.y * 0.5 + 0.5) * H });
    }
    if (!vis && p.shown) {
      p.shown = false;
      p.el.classList.remove('on');
      p.path.style.display = p.dot.style.display = 'none';
    }
  }
  if (!items.length) return;
  const cx = items.reduce((a, i) => a + i.x, 0) / items.length;
  const focusMode = items.length <= 6;
  const mobile = document.body.classList.contains('mobile');
  const gap = mobile ? (focusMode ? 52 : 25) : (focusMode ? 74 : 40);
  const lw = mobile ? Math.min(124, W * 0.3) : 210;
  for (const side of [-1, 1]) {
    const col = items.filter((i) => (side < 0 ? i.x < cx : i.x >= cx)).sort((a, b) => a.y - b.y);
    if (!col.length) continue;
    let colX = side < 0 ? Math.min(...col.map((i) => i.x)) - 70 : Math.max(...col.map((i) => i.x)) + 70;
    colX = side < 0 ? Math.max(colX, lw + (mobile ? 10 : 240)) : Math.min(colX, W - lw - 10);
    const top = mobile ? 56 : 90, bottom = H - (mobile ? 56 : 120);
    const ys = col.map((i) => i.y);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gap : top);
    const over = ys[ys.length - 1] - bottom;
    if (over > 0) for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i] - (i === ys.length - 1 ? over : 0), i < ys.length - 1 ? ys[i + 1] - gap : ys[i]);
    col.forEach((it, i) => {
      const { p, x, y } = it;
      const ly = ys[i];
      p.el.classList.toggle('left', side < 0);
      p.el.classList.toggle('detail', focusMode);
      p.el.classList.toggle('hot', hovered === p || S.selected === p.id);
      p.el.style.transform = `translate(${colX}px, ${ly}px) translate(${side < 0 ? '-100%' : '0'}, -50%)`;
      const ex = colX - side * 14;
      p.path.setAttribute('d', `M${x.toFixed(1)},${y.toFixed(1)} L${ex.toFixed(1)},${ly.toFixed(1)} L${(colX - side * 2).toFixed(1)},${ly.toFixed(1)}`);
      p.dot.setAttribute('cx', x.toFixed(1)); p.dot.setAttribute('cy', y.toFixed(1));
      if (!p.shown) {
        p.shown = true;
        p.el.classList.add('on');
        p.path.style.display = p.dot.style.display = '';
      }
    });
  }
}

// ---------------- 选择 / 悬停 ----------------
let hovered = null;
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDirty = false, downAt = null;

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouseDirty = true;
});
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
let zenTapT = 0;   // 沉浸模式轻点计时：350ms 内两击 = 双击退出（不依赖浏览器 dblclick 合成，触屏统一）
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || S.keynote) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > (e.pointerType === 'touch' ? 10 : 4)) return;
  if (zen.on) {
    const now = performance.now();
    if (now - zenTapT < 350) { zenTapT = 0; toggleZen(false); }     // 双击退出沉浸
    else { zenTapT = now; zenUI(!document.body.classList.contains('uiLive')); }   // 单击唤出/收起操作坞
    return;
  }
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick();
  // 拆装挑战进行中：所有点击都交给装配逻辑（判对/判错），不走部件选择
  if (asm.on) { if (hovered) asmPick(hovered); return; }
  // 部件大师·盲拆找件模式：点击就是作答
  if (quiz.on && quiz.mode === 'find') { if (hovered) quizFindAnswer(hovered.id); return; }
  // 屏幕内「假手机」交互：命中屏幕时先把点击交给锁屏 UI（照片 App / 手电筒），
  // 被吃掉就不再触发部件选择——像真的在用这台 3D 手机
  if (lastHit && lastHit.uv) {
    const scr = (SCREEN_LOCKS[CUR] || {})[lastHit.object.userData.partId];
    if (scr) {
      const [sw, sh] = DEV().screens[scr];
      if (lockOf(scr).hit(lastHit.uv.x * sw, (1 - lastHit.uv.y) * sh)) { pokeUI(); sfx('tick'); buzz(8); return; }
    }
  }
  selectPart(hovered ? hovered.id : null, false);
  // 彩蛋入口：双击游戏部件（主板/电池/前摄/扬声器/MagSafe）→ 电影化运镜钻进内部小游戏
  if (hovered) {
    const g = gameOfPart(hovered.id);
    if (g) {
      const now = performance.now();
      if (now - partTapT < 380) { partTapT = 0; enterGameWorld(g); }
      else partTapT = now;
    }
  }
});
let partTapT = 0;
// 爆炸态双击部件 = 弹飞：给它一个随机冲量，转几圈后自己飞回原位
canvas.addEventListener('dblclick', (e) => {
  if (S.keynote || S.explode < 0.5 || phys.on) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick();
  if (!hovered) return;
  kickPart(hovered.id);
});

// 移动端：任意触碰短暂亮出顶栏/信息卡（5 秒隐没）；两侧面板一律由侧缘拉手手动拉出（见下）
let uiTimer = 0;
function pokeUI(e) {
  if (!document.body.classList.contains('mobile') || S.keynote || zen.on) return;
  document.body.classList.add('ui', 'touched');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => document.body.classList.remove('ui'), 5000);
}
for (const ev of ['pointerdown', 'touchstart', 'input']) addEventListener(ev, pokeUI, { capture: true, passive: true });
for (const el of ['#parts', '#dock']) $(el).addEventListener('scroll', pokeUI, { passive: true });

// —— 手机端两侧缘拉手：轻点 或 按住跟手拖出（拖过阈值松手=开，否则弹回）；桌面端侧栏常驻无需拉手 ——
let sbGuideT = 0;
const hideSbGuide = () => { clearTimeout(sbGuideT); document.body.classList.remove('nudge'); $('#sbGuide').classList.remove('on'); };
const drawerOpen = (side, v) => {                     // side: 'uiL'（部件抽屉）| 'uiR'（控制坞）
  document.body.classList.toggle(side, v);
  if (v) { document.body.classList.remove(side === 'uiL' ? 'uiR' : 'uiL'); hideSbGuide(); }   // 小屏一次只开一侧
};
const showSbGuide = () => {
  if (!document.body.classList.contains('mobile')) return;
  document.body.classList.add('nudge');
  $('#sbGuide').classList.add('on');
  clearTimeout(sbGuideT);
  sbGuideT = setTimeout(hideSbGuide, 8000);
};
const bindEdgePull = (stripSel, panelSel, side) => {
  const strip = $(stripSel), panel = $(panelSel);
  const dir = side === 'uiL' ? 1 : -1;                // 左缘向右拖开 / 右缘向左拖开
  let x0 = null, y0 = 0, dragging = false, lastDx = 0, suppressClick = false;
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dragging = false; lastDx = 0;
    try { strip.setPointerCapture(e.pointerId); } catch { /* 合成事件/旧浏览器无捕获 */ }
  });
  strip.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const dx = (e.clientX - x0) * dir;
    if (!dragging && dx > 8 && Math.abs(e.clientY - y0) < 40) dragging = true;   // 横向意图明确才算拖拽
    if (!dragging) return;
    lastDx = Math.max(0, dx);
    panel.classList.add('pull');                       // 面板跟手：CSS 变量实时位移
    panel.style.setProperty('--pull', Math.min(lastDx, panel.offsetWidth + 20) + 'px');
  }, { passive: true });
  strip.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });   // 拦截 iOS 边缘返回等系统手势
  const settle = () => {
    if (x0 === null) return;
    if (dragging) {
      panel.classList.remove('pull');
      panel.style.removeProperty('--pull');
      drawerOpen(side, lastDx > 64);                   // 拖过阈值=开，否则弹回
      suppressClick = true; setTimeout(() => (suppressClick = false), 400);   // 拖拽松手后的 click 不再触发开
    }
    x0 = null; dragging = false; lastDx = 0;
  };
  strip.addEventListener('pointerup', settle);
  strip.addEventListener('pointercancel', settle);
  strip.addEventListener('click', () => { if (!suppressClick) drawerOpen(side, true); });   // 轻点拉手直接开
};
bindEdgePull('#sbEdge', '#parts', 'uiL');
bindEdgePull('#dockEdge', '#dock', 'uiR');
// 抽屉打开时点到抽屉外任意处 → 收起（拉手 / 面板本体 / 顶部栏 / 信息卡不算「外」）
addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('mobile')) return;
  const L = document.body.classList.contains('uiL'), R = document.body.classList.contains('uiR');
  if (!L && !R) return;
  if (!e.target.closest('#parts,#dock,#sbEdge,#dockEdge,#sbGuide,#top,#info')) {
    if (L) drawerOpen('uiL', false);
    if (R) drawerOpen('uiR', false);
  }
}, true);
// 面板上向外快速滑动 → 收起（与列表纵向滚动区分：横向位移大、纵向位移小）
let dwX = null, dwY = 0;
for (const sel of ['#parts', '#dock']) $(sel).addEventListener('pointerdown', (e) => { dwX = e.clientX; dwY = e.clientY; }, { passive: true });
addEventListener('pointermove', (e) => {
  if (dwX === null) return;
  const dx = e.clientX - dwX;
  if (Math.abs(e.clientY - dwY) < 30 && Math.abs(dx) > 48) {
    dwX = null;
    drawerOpen(dx < 0 ? 'uiL' : 'uiR', false);         // 部件抽屉左滑收 / 控制坞右滑收
  }
}, { passive: true });
addEventListener('pointerup', () => { dwX = null; }, { passive: true });

let lastHit = null;   // 最近一次射线命中（pointerup 用它的 uv 做屏幕内交互）
// 盖板玻璃 → 屏幕 穿透表：玻璃盒体挡在屏幕前且自身 UV 无意义，
// 命中玻璃时用同一条射线再打屏幕取 UV（hover/选中仍是玻璃部件本身）
const GLASS_THROUGH = {
  duo: { cover: 'oled' },
  p18s: { frontGlass: 'screen' }, p18: { frontGlass: 'screen' }, p18m: { frontGlass: 'screen' },
};
function pick() {
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(model.pickables(), false)[0];
  lastHit = hit || null;
  if (hit) {
    const through = (GLASS_THROUGH[CUR] || {})[hit.object.userData.partId];
    if (through) {
      const scr = model.parts.find((p) => p.id === through);
      const h2 = scr && ray.intersectObjects(scr.meshes, false)[0];
      if (h2) lastHit = h2;   // 屏幕命中替换玻璃命中，拿到映射锁屏纹理的 UV
    }
  }
  hovered = hit ? model.parts.find((p) => p.id === hit.object.userData.partId) : null;
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
  const tip = $('#tip');
  if (hovered && !(S.labels && S.explode > 0.12)) {
    tip.innerHTML = `<b>${hovered.name}</b><span>${hovered.en}</span>`;
    tip.classList.add('on');
  } else tip.classList.remove('on');
}
canvas.addEventListener('pointermove', (e) => {
  const tip = $('#tip');
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
});

// 屏幕 partId → 锁屏标签（UV 点击交互的路由表）
const SCREEN_LOCKS = {
  duo: { oled: 'inner', outer: 'outer' },
  p18s: { screen: 'phone' }, p18: { screen: 'phone' }, p18m: { screen: 'phone' },
};
// 测试探针：暴露各设备锁屏实例的 ui 状态（lock/grid/view），供 e2e 断言屏幕内交互
window.__locks = () => Object.fromEntries(Object.entries(DEVICES).map(([k, d]) => [k, Object.fromEntries(Object.entries(d.locks).map(([t, l]) => [t, l.ui]))]));
// 测试探针：在指定像素做一次与生产代码完全一致的射线检测（含盖板穿透），返回命中的部件与屏幕 UV
window.__ray = (px, py) => {
  const m = new THREE.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.setFromCamera(m, camera);
  const hit = ray.intersectObjects(model.pickables(), false)[0];
  if (!hit) return null;
  const through = (GLASS_THROUGH[CUR] || {})[hit.object.userData.partId];
  let partId = hit.object.userData.partId, uv = hit.uv;
  if (through) {
    const scr = model.parts.find((p) => p.id === through);
    const h2 = scr && ray.intersectObjects(scr.meshes, false)[0];
    if (h2) { partId = h2.object.userData.partId; uv = h2.uv; }
  }
  return { partId, uv: uv ? { x: uv.x, y: uv.y } : null };
};
// 测试探针：指定像素的完整命中序列（部件/UV/距离），调试盖板穿透用
window.__hits = (px, py) => {
  const m = new THREE.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.setFromCamera(m, camera);
  return ray.intersectObjects(model.pickables(), false).slice(0, 4).map((h) => ({
    partId: h.object.userData.partId,
    uv: h.uv ? { x: +h.uv.x.toFixed(3), y: +h.uv.y.toFixed(3) } : null,
    d: +h.distance.toFixed(2),
  }));
};
// 测试探针：相机/模型状态快照（取证特写后视角漂移）
window.__state = () => ({
  fold: +S.fold.toFixed(4), explode: +S.explode.toFixed(4), selected: S.selected,
  cam: camera.position.toArray().map((v) => +v.toFixed(1)),
  tgt: controls.target.toArray().map((v) => +v.toFixed(1)),
});
// 测试探针：直接设置相机位（特写前先转到目标朝向，如外屏需从 -z 看）
window.__setCam = (x, y, z) => { camera.position.set(x, y, z); controls.target.set(0, 0, 0); controls.update(); };
// 测试探针：屏幕部件包围盒投影到像素坐标，供 e2e 计算屏幕内按钮的点击位置
window.__screenRect = (partId) => {
  const p = model?.parts?.find((q) => q.id === partId);
  if (!p) return null;
  const box = new THREE.Box3();
  for (const m of p.meshes) box.expandByObject(m);
  if (box.isEmpty()) return null;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const v = new THREE.Vector3();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
    v.set(c.x + (s.x * dx) / 2, c.y + (s.y * dy) / 2, c.z + (s.z * dz) / 2).project(camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x: (x0 * 0.5 + 0.5) * innerWidth, y: (-y1 * 0.5 + 0.5) * innerHeight, w: ((x1 - x0) * 0.5) * innerWidth, h: ((y1 - y0) * 0.5) * innerHeight };
};

let selGame = null;   // 当前信息卡部件对应的小游戏 key（入口按钮用）
function selectPart(id, fly) {
  S.selected = id;
  if (id) { sfx('tick'); buzz(8); }
  // 彩蛋发现：聚焦到埋有隐藏细节的部件即视为“找到”（真正的乐趣在于凑近读那行微雕）
  const trig = (EGG_TRIGGERS[CUR] || EGG_TRIGGERS.p18)[id];
  if (trig) discoverEgg(trig);
  model.parts.forEach((p) => p.listEl.classList.toggle('active', p.id === id));
  const panel = $('#info');
  if (!id) { model.setFocus(null); panel.classList.remove('on'); return; }
  const p = model.parts.find((q) => q.id === id);
  model.setFocus([id]);
  $('#infoCat').textContent = CATS[p.cat];
  $('#infoName').textContent = p.name;
  $('#infoEn').textContent = p.en;
  $('#infoSpec').textContent = p.spec;
  const entryGame = gameOfPart(id);                  // 部件专属入口：钻进内部小游戏
  selGame = entryGame;
  $('#infoMicro').hidden = !entryGame;
  if (entryGame) $('#infoMicro').textContent = `⤢ ${GAMES[entryGame].nm}`;
  panel.classList.add('on');
  if (fly) {
    const go = async () => {
      if (S.fold > 0.01) await animFold(0, 1.2);
      if (S.explode < 0.99) await animExplode(1, 1.4);
      model.update(0);
      stage.updateMatrixWorld(true);
      const c = p.anchorObj.localToWorld(p.anchor.clone());
      const dir = camera.position.clone().sub(controls.target).normalize();
      const pos = c.clone().addScaledVector(dir, 270);
      flyTo(pos.toArray(), c.toArray(), 1.4);
    };
    go();
  }
}

// ---------------- 控制面板 ----------------
function bindUI() {
  const fold = $('#fold'), exp = $('#explode'), dim = $('#dim');
  fold.oninput = () => { cancelTweens(); setFold(THREE.MathUtils.degToRad(180 - fold.value)); };
  exp.oninput = () => { cancelTweens(); if (S.fold > 0.01) animFold(0, 0.8); setExplode(exp.value / 100); };
  // 聚焦淡化：选中部件时其余部件的残留不透明度（0=完全隐藏）
  dim.oninput = () => {
    const v = dim.value / 100;
    model.setDim(v);
    $('#dimVal').textContent = `${dim.value}%`;
    store.dim = v;
    saveStore();
  };
  $('#btnOpen').onclick = () => { cancelTweens(); animExplode(0, 0.8).then(() => animFold(0).then(() => { sfx('hinge'); buzz(12); })); };
  $('#btnClose').onclick = () => { cancelTweens(); selectPart(null); animExplode(0, 0.8).then(() => animFold(PI).then(() => { sfx('hinge'); buzz(12); })); };
  $('#btnExplode').onclick = async () => {
    cancelTweens();
    if (S.explode > 0.5) { animExplode(0); sfx('whoosh'); return; }
    if (S.fold > 0.01) await animFold(0, 1.2);
    animExplode(1);
    sfx('whoosh');
    flyTo(...VIEWS.explode, 2);
  };
  $('#btnAuto').onclick = (e) => { S.auto = !S.auto; e.currentTarget.classList.toggle('active', S.auto); };
  $('#btnLabels').onclick = (e) => { S.labels = !S.labels; localStorage.setItem('iphoneDuo.labels', S.labels ? '1' : '0'); e.currentTarget.classList.toggle('active', S.labels); };
  $('#btnLabels').classList.toggle('active', S.labels);   // 恢复上次选择
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { cancelTweens(); flyTo(...VIEWS[b.dataset.view], 1.6); }));
  document.querySelectorAll('.swatch').forEach((b) => (b.onclick = () => setScheme(b.dataset.scheme)));
  $('#btnKeynote').onclick = () => startKeynote();
  $('#kExit').onclick = () => stopKeynote();
  $('#infoClose').onclick = () => selectPart(null);
  // 部件小游戏：信息卡入口 + 各游戏 HUD 按钮 + 徽章事件（游戏模块 → award，单向解耦）
  $('#infoMicro').onclick = () => { if (selGame) enterGameWorld(selGame); };
  for (const [key, pre] of Object.entries(GAME_PRE)) {
    $('#' + pre + 'Quit').onclick = () => exitGameWorld();
    $('#' + pre + 'Exit').onclick = () => exitGameWorld();
    $('#' + pre + 'Retry').onclick = () => GAMES[key].start();
  }
  addEventListener('micro-award', (e) => award(e.detail));
  addEventListener('game-award', (e) => award(e.detail));
  // 异世界三事件（world.js 单向解耦）：进关卡 / 离开 / 解锁徽章
  addEventListener('world-enter', (e) => enterGameWorld(e.detail, true));
  addEventListener('world-quit', () => exitWorld());
  addEventListener('world-award', (e) => award(e.detail));
  document.querySelectorAll('#devTabs button').forEach((b) => (b.onclick = () => switchDevice(b.dataset.dev)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (curGame) exitGameWorld();
      else if (world.on) exitWorld();
      else if (S.keynote) stopKeynote();
      else if (zen.on) toggleZen(false);
      else if ($('#custom').classList.contains('on')) $('#custom').classList.remove('on');
      else if (quiz.on) toggleQuiz(false);
      else if ($('#asm').classList.contains('on')) toggleAsm(false);
      else if ($('#daily').classList.contains('on')) toggleDaily(false);
      else if ($('#badges').classList.contains('on')) toggleBadges(false);
      else if ($('#tint').classList.contains('on')) toggleTint(false);
      else if (ar.on) toggleAR();
      else if (rec.on) toggleRec();
      else selectPart(null);
    }
    if (S.keynote) return;
    // 异世界内只保留 V（进出）——其余快捷键挂起，避免面板/主场景动作穿透到第一人称层
    if (world.on) { if (e.key === 'v' || e.key === 'V') toggleWorld(); return; }
    if (e.key === 'v' || e.key === 'V') toggleWorld();              // 异世界
    if (e.key === 'e' || e.key === 'E') $('#btnExplode').click();
    if ((e.key === 'f' || e.key === 'F') && DEV().hasFold) (S.fold > 1 ? $('#btnOpen') : $('#btnClose')).click();
    if (e.key === 'k' || e.key === 'K') startKeynote();
    if (e.key === 'l' || e.key === 'L') $('#btnLabels').click();   // 标注 隐藏/显示
    if (e.key === 'q' || e.key === 'Q') toggleQuiz();              // 部件大师
    if (e.key === 'g' || e.key === 'G') tossPhone();               // 抛一下
    if (e.key === 'x' || e.key === 'X') setVisMode('xray');        // X 光透视
    if (e.key === 'b' || e.key === 'B') setVisMode('blueprint');   // 蓝图
    if (e.key === 'c' || e.key === 'C') setCut(!cut.on);           // 剖面
    if (e.key === 'i' || e.key === 'I') toggleZen();               // 沉浸
  });
}

// ---------------- 个性化定制：鎏金激光雕刻 / 屏保轮播 / 图层 ----------------
// 工程套路：锁屏实例在 boot 前创建、纹理在 build* 时注入材质，
// 之后只通过 CanvasTexture.needsUpdate 驱动刷新，无需重建材质。
const lockOuter = createLockScreen('outer');  // Duo 5.4 英寸外屏（竖版）
const lockInner = createLockScreen('inner');  // Duo 7.6 英寸内屏（横版 iPad 构图）
// 18 系列三档：同为 19.5:9 竖版构图，照片库/轮播实例完全独立
const lockP18S = createLockScreen('phone');   // iPhone 18   6.1 英寸单屏
const lockP18 = createLockScreen('phone');    // iPhone 18 Pro 6.3 英寸单屏
const lockP18M = createLockScreen('phone');   // iPhone 18 Pro Max 6.9 英寸单屏

// ---------------- 多设备注册表：一切按设备隔离 ----------------
// 四台设备的照片库 / 刻字 / 画布比例完全独立：锁屏实例、存储键、
// 屏保标签、雕刻默认值、发布会脚本都在这里按设备登记。
// 18 系列三档共享一套基准几何（model.js 内按 dims 缩放三围），
// 但机型名 / 屏幕尺寸 / 芯片 / 电池 / 雕刻画布比例各自独立。
const DEVICES = {
  duo: {
    name: 'iPhone Duo', hasFold: true,
    locks: { outer: lockOuter, inner: lockInner },
    tabs: [['outer', '外屏'], ['inner', '内屏']],
    screens: { outer: [1024, 1448], inner: [2048, 1448] },
    imgKeys: { outer: 'imgsO', inner: 'imgsI' },
    storeKey: 'iphoneDuo.custom.duo',
    engrave: { def: 'iPhone Duo' },
    build: () => buildPhone({ outerTex: lockOuter.texture, innerTex: lockInner.texture, eggs: eggOpts(eggs) }),
  },
  p18s: {
    name: 'iPhone 18', hasFold: false,
    dims: P18_STD,
    label: {
      size: '6.1', chip: 'A20', chipName: 'A20', bat: 3561, batWh: '13.87', batModel: 'A3609',
      colors: '黑色 · 白色 · 深蓝色 · 柔粉色',
      motion: 'ProMotion 120Hz 自适应', alwaysOn: '', peak: '1600 尼特峰值亮度',
      front: '24MP 前置摄像头', usb: 'USB 2 · 30W 快充', video: '28',
      frame: '一体成型铝金属中框', frameTitle: '7000 系铝金属。', frameSpec: '一体成型 · 双离子抛光工艺 · IP68',
      camTitle: '融合式双摄系统', camSpec: '4800 万主摄 + 4800 万超广角 · 无长焦',
      vcSpec: '高导热石墨膜（无均热板）', launch: '2027 年春季上市', event: 'Apple Event · 2027 春',
    },
    hw: { tele: false, vc: false, alu: true },
    locks: { phone: lockP18S },
    tabs: [['phone', '单屏']],
    screens: { phone: [1206, 2622] },
    imgKeys: { phone: 'imgsS' },
    storeKey: 'iphoneDuo.custom.p18s',
    engrave: { def: 'iPhone 18' },
    build: () => buildPhone18({ screenTex: lockP18S.texture, dims: P18_STD, label: DEVICES.p18s.label, hw: DEVICES.p18s.hw, engraveDefault: 'iPhone 18', eggs: eggOpts(eggs) }),
  },
  p18: {
    name: 'iPhone 18 Pro', hasFold: false,
    dims: P18,
    label: {
      size: '6.3', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4208, batWh: '16.44', batModel: 'A3611',
      colors: '黑色 · 银色 · 冰川蓝色 · 勃艮第酒红色',
      motion: 'ProMotion 120Hz 自适应', alwaysOn: '全天候显示', peak: '3000 尼特户外峰值亮度',
      front: '18MP Center Stage 前置摄像头', usb: 'USB 3 高速传输 · 40W 快充', video: '33',
      frame: '一体成型铝金属中框', frameTitle: '一体成型铝金属。', frameSpec: '阳极氧化铝 · 前后陶瓷晶体护面 · IP68',
      camTitle: 'Pro 融合式三摄系统', camSpec: '4800 万融合主摄 ƒ/1.48–ƒ/4 可变光圈 + 超广角 + 长焦',
      vcSpec: '新一代 VC 均热板 · 芯片裸片直连', launch: '9 月 12 日开启预购 · 9 月 18 日正式发售', event: 'Apple Event · 2026',
    },
    hw: { tele: true, vc: true, alu: false },
    locks: { phone: lockP18 },
    tabs: [['phone', '单屏']],
    screens: { phone: [1206, 2622] },
    imgKeys: { phone: 'imgsP' },
    storeKey: 'iphoneDuo.custom.p18',
    engrave: { def: 'iPhone 18 Pro' },
    build: () => buildPhone18({ screenTex: lockP18.texture, dims: P18, label: DEVICES.p18.label, hw: DEVICES.p18.hw, engraveDefault: 'iPhone 18 Pro', eggs: eggOpts(eggs) }),
  },
  p18m: {
    name: 'iPhone 18 Pro Max', hasFold: false,
    dims: P18_MAX,
    label: {
      size: '6.9', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4685, batWh: '18.31', batModel: 'A3613',
      colors: '黑色 · 银色 · 冰川蓝色 · 勃艮第酒红色',
      motion: 'ProMotion 120Hz 自适应', alwaysOn: '全天候显示', peak: '3000 尼特户外峰值亮度',
      front: '18MP Center Stage 前置摄像头', usb: 'USB 3 高速传输 · 45W 快充', video: '43',
      frame: '一体成型铝金属中框', frameTitle: '一体成型铝金属。', frameSpec: '阳极氧化铝 · 前后陶瓷晶体护面 · IP68',
      camTitle: 'Pro 融合式三摄系统', camSpec: '4800 万融合主摄 ƒ/1.48–ƒ/4 可变光圈 + 超广角 + 长焦',
      vcSpec: '新一代 VC 均热板 · 芯片裸片直连', launch: '9 月 12 日开启预购 · 9 月 18 日正式发售', event: 'Apple Event · 2026',
    },
    hw: { tele: true, vc: true, alu: false },
    locks: { phone: lockP18M },
    tabs: [['phone', '单屏']],
    screens: { phone: [1206, 2622] },
    imgKeys: { phone: 'imgsM' },
    storeKey: 'iphoneDuo.custom.p18m',
    engrave: { def: 'iPhone 18 Pro Max' },
    build: () => buildPhone18({ screenTex: lockP18M.texture, dims: P18_MAX, label: DEVICES.p18m.label, hw: DEVICES.p18m.hw, engraveDefault: 'iPhone 18 Pro Max', eggs: eggOpts(eggs) }),
  },
};
let CUR = 'duo';
const DEV = () => DEVICES[CUR];
const built = {};            // 每台设备的模型实例缓存（切换 <10ms 热替换）
const lockOf = (t) => DEV().locks[t];
const P18_IDS = ['p18s', 'p18', 'p18m'];      // 18 系列三档（共享发布会脚本与文案动态取 DEV()）
let stateImgs = { duo: { outer: [], inner: [] }, p18s: { phone: [] }, p18: { phone: [] }, p18m: { phone: [] } };  // 已预缩放 cover 的画布
let ssTarget = 'outer', thumbIdx = -1;

// 本地存储：按设备完全隔离（四台设备各自的照片库与刻字互不覆盖）
// 旧版单键 'iphoneDuo.custom' 视为 Duo 配置自动迁移。
const LEGACY = 'iphoneDuo.custom';
let store = {};
function loadStore(dev) {
  const k = DEVICES[dev].storeKey;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(k)); } catch { s = null; }
  if (!s && dev === 'duo') { try { s = JSON.parse(localStorage.getItem(LEGACY)); } catch { s = null; } }
  return s || {};
}
// 发布者默认配置里取当前设备那一份（兼容旧版扁平配置 = Duo）
function cfgFor(c, dev) {
  if (!c || typeof c !== 'object') return null;
  if (c.duo || c.p18 || c.p18s || c.p18m) return c[dev] || null;
  if (c.dev === 'p18') return dev === 'p18' ? c : null;   // 旧版两设备时代的 18 Pro 扁平配置
  return dev === 'duo' ? c : null;
}
let defaultCfg = null;   // 发布者默认配置（含照片），boot 时加载

async function loadDefaultConfig() {
  const sc = new URLSearchParams(location.search).get('sharecode');
  if (sc) {
    try {
      const r = await fetch(`share/${encodeURIComponent(sc)}.json`, { cache: 'no-store' });
      if (r.ok) {
        const o = await r.json();
        if (o && typeof o === 'object' && Object.keys(o).length) return { cfg: o, via: sc };
      }
    } catch { /* file:// 或离线：回落内嵌默认 */ }
  }
  try {
    const o = JSON.parse($('#defaultConfig').textContent);
    if (o && typeof o === 'object' && Object.keys(o).length) return { cfg: o, via: 'built-in' };
  } catch { /* 占位 {} 忽略 */ }
  return { cfg: null, via: null };
}
let saveTimer = 0;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const put = (o) => localStorage.setItem(DEV().storeKey, JSON.stringify(o));
    try { put(store); flashSaved(); }
    catch {
      try { put({ text: store.text, ex: store.ex, ey: store.ey, interval: store.interval, zoom: store.zoom, layers: store.layers }); flashSaved(); }
      catch { /* 私隐模式等极端情况：放弃持久化，本次会话内功能不受影响 */ }
    }
  }, 350);
}
function flashSaved() {
  const el = $('#customSaved');
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 1500);
}

// 用户上传的任意比例图片 → 预缩放到屏幕画布（cover 等比裁切），绘制成本只付一次
function toScreenCanvas(img, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  c.getContext('2d').drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return c;
}
const imgKey = (t) => DEV().imgKeys[t];
const screenSize = (t) => DEV().screens[t];
const imgsOf = () => stateImgs[CUR];

function addImages(files) {
  const key = imgKey(ssTarget), [W, H] = screenSize(ssTarget);
  (store[key] ||= []);
  const jobs = [...files].filter((f) => f.type.startsWith('image/')).map((f) => new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => { res(img); URL.revokeObjectURL(url); };
    img.onerror = () => { res(null); URL.revokeObjectURL(url); };
    img.src = url;
  }));
  Promise.all(jobs).then((imgs) => {
    let added = 0;
    for (const img of imgs) {
      if (!img) continue;
      const c = toScreenCanvas(img, W, H);
      imgsOf()[ssTarget].push(c);
      store[key].push(c.toDataURL('image/jpeg', 0.72));
      added++;
    }
    if (!added) return;
    lockOf(ssTarget).setImages(imgsOf()[ssTarget]);
    lockOf(ssTarget).show(imgsOf()[ssTarget].length - 1);  // 直接展示最新一张
    buildThumbs();
    saveStore();
  });
}

function removeImage(i) {
  imgsOf()[ssTarget].splice(i, 1);
  (store[imgKey(ssTarget)] ||= []).splice(i, 1);
  lockOf(ssTarget).setImages(imgsOf()[ssTarget]);
  buildThumbs();
  saveStore();
}

function clearImages() {
  imgsOf()[ssTarget] = [];
  store[imgKey(ssTarget)] = [];
  lockOf(ssTarget).setImages([]);
  buildThumbs();
  saveStore();
}

// 缩略图：直接把预缩放画布再采样到 96×136 小画布，避免每帧 toDataURL
function buildThumbs() {
  const box = $('#ssThumbs');
  box.innerHTML = '';
  imgsOf()[ssTarget].forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    const t = document.createElement('canvas');
    t.width = 96; t.height = 136;
    t.getContext('2d').drawImage(c, 0, 0, 96, 136);
    b.appendChild(t);
    const del = document.createElement('i');
    del.textContent = '×';
    del.onclick = (e) => { e.stopPropagation(); removeImage(i); };
    b.appendChild(del);
    b.onclick = () => { lockOf(ssTarget).show(i); markThumb(); };
    box.appendChild(b);
  });
  markThumb();
  $('#ssCount').textContent = `${imgsOf()[ssTarget].length} 张`;
}
function markThumb() {
  thumbIdx = lockOf(ssTarget).idx;
  [...$('#ssThumbs').children].forEach((el, i) => el.classList.toggle('active', i === thumbIdx));
}

function collectLayers() {
  const l = {};
  document.querySelectorAll('#layerToggles input').forEach((c) => (l[c.dataset.layer] = c.checked));
  return l;
}
function applyLayers(l) { Object.values(DEV().locks).forEach((k) => k.setLayers(l)); }

function restoreImages(key, target) {
  const list = store[key];
  if (!list || !list.length) return;
  const dev = CUR;   // 异步解码期间可能切了设备，落地前校验
  Promise.all(list.map((d) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = d;
  }))).then((imgs) => {
    if (dev !== CUR) return;
    const cs = imgs.filter(Boolean).map((img) => toScreenCanvas(img, ...screenSize(target)));
    if (!cs.length) return;
    stateImgs[CUR][target] = cs;
    lockOf(target).setImages(cs);
    if (ssTarget === target) buildThumbs();
  });
}

function syncCustomUI() {
  $('#engraveText').value = store.text ?? DEV().engrave.def;
  const ex = $('#engX'), ey = $('#engY');
  ex.value = Math.round((store.ex ?? 0) * 100);
  ey.value = Math.round((store.ey ?? 0.735) * 100);
  $('#engXVal').textContent = ex.value;
  $('#engYVal').textContent = ey.value;
  const iv = $('#ssInterval'), sc = $('#ssScale');
  iv.value = store.interval ?? 8;
  sc.value = Math.round((store.zoom ?? 1) * 100);
  $('#ssIntervalVal').textContent = `${iv.value}s`;
  $('#ssScaleVal').textContent = `${sc.value}%`;
  const ly = store.layers || {};
  document.querySelectorAll('#layerToggles input').forEach((c) => {
    if (c.dataset.layer in ly) c.checked = ly[c.dataset.layer];
  });
}

function bindCustom() {
  const panel = $('#custom');
  $('#btnCustom').onclick = () => {
    const on = panel.classList.toggle('on');
    if (on) { syncCustomUI(); buildThumbs(); }
  };
  $('#customClose').onclick = () => panel.classList.remove('on');
  // 抽屉内的发布会演示入口（移动端沉浸收起后触碰即可到达）
  $('#btnKeynoteM').onclick = () => startKeynote();

  // 鎏金激光雕刻：文字 + 位置（滑块值 /100 = 归一化偏移）
  const et = $('#engraveText');
  et.oninput = () => { model.setBackText(et.value); store.text = et.value; saveStore(); };
  const ex = $('#engX'), ey = $('#engY');
  const onPos = () => {
    const x = ex.value / 100, y = ey.value / 100;
    model.setEngravePos(x, y);
    $('#engXVal').textContent = ex.value;
    $('#engYVal').textContent = ey.value;
    store.ex = x; store.ey = y;
    saveStore();
  };
  ex.oninput = ey.oninput = onPos;

  // 屏保标签：按设备动态渲染（Duo 外屏/内屏；18 Pro 单屏），事件委托一次绑定
  const tabsBox = $('#ssTabs');
  const renderTabs = () => {
    tabsBox.innerHTML = DEV().tabs.map(([t, label], i) =>
      `<button data-tgt="${t}"${i === 0 ? ' class="active"' : ''}>${label}</button>`).join('');
  };
  renderTabs();
  tabsBox.onclick = (e) => {
    const b = e.target.closest('button[data-tgt]');
    if (!b) return;
    ssTarget = b.dataset.tgt;
    [...tabsBox.children].forEach((q) => q.classList.toggle('active', q === b));
    buildThumbs();
  };
  $('#ssUpload').onchange = (e) => { addImages(e.target.files); e.target.value = ''; };
  $('#ssNext').onclick = () => { lockOf(ssTarget).next(); markThumb(); };
  $('#ssClear').onclick = clearImages;

  // 轮播间隔 / 壁纸缩放：当前设备的所有屏幕保持同步
  const iv = $('#ssInterval'), sc = $('#ssScale');
  iv.oninput = () => {
    Object.values(DEV().locks).forEach((k) => k.setIntervalSec(+iv.value));
    $('#ssIntervalVal').textContent = `${iv.value}s`;
    store.interval = +iv.value; saveStore();
  };
  sc.oninput = () => {
    const z = sc.value / 100;
    Object.values(DEV().locks).forEach((k) => k.setZoom(z));
    $('#ssScaleVal').textContent = `${sc.value}%`;
    store.zoom = z; saveStore();
  };

  // 图层开关：当前设备所有屏幕同步
  document.querySelectorAll('#layerToggles input').forEach((c) => (c.onchange = () => {
    const l = collectLayers();
    applyLayers(l);
    store.layers = l; saveStore();
  }));

  // 恢复上次配置（含壁纸图片，异步解码后自动 setImages）
  applyStore();
  tabsBox._render = renderTabs;   // 设备切换时由 syncDeviceTabs 调用
}

// 把 store 应用到运行态（开机恢复 / 导入配置 / 设备切换共用）
function applyStore() {
  if (store.text !== undefined) model.setBackText(store.text);
  if (store.ex !== undefined || store.ey !== undefined) model.setEngravePos(store.ex ?? 0, store.ey ?? 0.735);
  if (store.dim !== undefined) { model.setDim(store.dim); $('#dim').value = Math.round(store.dim * 100); $('#dimVal').textContent = `${Math.round(store.dim * 100)}%`; }
  if (store.interval) Object.values(DEV().locks).forEach((k) => k.setIntervalSec(store.interval));
  if (store.zoom) Object.values(DEV().locks).forEach((k) => k.setZoom(store.zoom));
  if (store.layers) {
    applyLayers(store.layers);
    Object.entries(store.layers).forEach(([k, v]) => {
      const c = document.querySelector(`#layerToggles input[data-layer="${k}"]`);
      if (c) c.checked = v;
    });
  }
  syncCustomUI();
  DEV().tabs.forEach(([t]) => { stateImgs[CUR][t] = []; lockOf(t).setImages([]); });
  DEV().tabs.forEach(([t]) => restoreImages(DEV().imgKeys[t], t));
  buildThumbs();
}

// ---------------- 彩蛋系统：隐藏细节寻宝 + 彩蛋工坊 ----------------
// eggs.found  = 已发现的隐藏细节（聚焦对应部件即点亮）
// eggs.text   = 工坊定制的微雕文字；eggs.chipImgData = 上传贴画（Sobel 轮廓蚀刻）
// eggs.fx     = 找齐后解锁的虹彩中框 / Bloom 增强（持久化）
let eggs = loadEggs();

// 聚焦哪个部件会点亮哪枚彩蛋（Duo 电池叫 batA，18 系列叫 battery）
const EGG_TRIGGERS = {
  duo: { board: 'chip', batA: 'morse', vc: 'vc', usb: 'usb' },
  p18: { board: 'chip', battery: 'morse', vc: 'vc', frame: 'edge', usb: 'usb' },
};

function toastEgg(msg) {
  const t = $('#eggToast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 3400);
}

function renderEggList() {
  const ds = eggsForDev(CUR);
  const got = ds.filter((e) => eggs.found[e.id]).length;
  $('#eggList').innerHTML = ds.map((e) => {
    const f = eggs.found[e.id];
    return `<div class="egg ${f ? 'found' : ''}"><i>${e.icon}</i><div>
      <b>${f ? e.name : '？？？'}</b>
      <small>${f ? e.hint.replace(/^拆[出开]/, '已找到 · ') : e.hint}</small>
    </div>${f ? '<u>✓</u>' : ''}</div>`;
  }).join('');
  $('#eggProg').textContent = `${got} / ${ds.length}`;
  const badge = $('#eggBadge');
  badge.textContent = `◈ ${got}/${ds.length}`;
  badge.classList.toggle('full', got === ds.length && ds.length > 0);
}

function discoverEgg(id) {
  if (eggs.found[id]) return;
  const def = EGG_DEFS.find((e) => e.id === id);
  if (!def || !eggsForDev(CUR).some((e) => e.id === id)) return;
  eggs.found[id] = true;
  saveEggs(eggs);
  sfx('pop'); buzz([14, 50, 14]);
  const ds = eggsForDev(CUR);
  toastEgg(`◈ 发现隐藏细节「${def.name}」 ${ds.filter((e) => eggs.found[e.id]).length}/${ds.length}`);
  renderEggList();
  if (ds.every((e) => eggs.found[e.id])) unlockCelebrate();
}

// 找齐全部彩蛋：虹彩中框 + Bloom 炸场 + 彩带粒子 + 屏幕彩虹流光
function unlockCelebrate() {
  const again = eggs.fx;
  eggs.fx = true;
  saveEggs(eggs);
  model.setFrameIri(true);
  Object.values(DEV().locks).forEach((k) => k.flashRainbow());
  burstConfetti();
  // Bloom 呼吸：0.18 → 1.15 → 0.5（之后保持微增强，虹彩材质持续受益）
  tween(0.5, (k) => (bloom.strength = 0.18 + k * 0.97), ease.out).then(() =>
    tween(2.4, (k) => (bloom.strength = 1.15 - k * 0.65), ease.inOut));
  toastEgg(again ? '🏆 虹彩中框已就位' : '🏆 全部隐藏细节找齐！虹彩衍射中框已解锁');
}

// 彩带粒子：InstancedMesh 小纸片，重力 + 空气阻尼 + 翻滚，3.2s 后自清理
let confetti = null;
function burstConfetti() {
  if (confetti) { scene.remove(confetti.mesh); confetti.mesh.dispose(); confetti = null; }
  const N = 460, dummy = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.5, 2.8),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    N
  );
  const data = [];
  for (let i = 0; i < N; i++) {
    data.push({
      p: new THREE.Vector3((Math.random() - 0.5) * 70, 60 + Math.random() * 40, (Math.random() - 0.5) * 50),
      v: new THREE.Vector3((Math.random() - 0.5) * 150, 40 + Math.random() * 110, (Math.random() - 0.5) * 150),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14],
    });
    mesh.setColorAt(i, new THREE.Color().setHSL(Math.random(), 0.9, 0.62));
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti = { mesh, data, life: 3.4 };
  scene.add(mesh);
}
function tickConfetti(dt) {
  if (!confetti) return;
  confetti.life -= dt;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < confetti.data.length; i++) {
    const c = confetti.data[i];
    c.v.y -= 200 * dt;
    c.v.multiplyScalar(1 - 0.55 * dt);
    c.p.addScaledVector(c.v, dt);
    c.r.x += c.w[0] * dt; c.r.y += c.w[1] * dt; c.r.z += c.w[2] * dt;
    dummy.position.copy(c.p);
    dummy.rotation.copy(c.r);
    dummy.updateMatrix();
    confetti.mesh.setMatrixAt(i, dummy.matrix);
  }
  confetti.mesh.instanceMatrix.needsUpdate = true;
  if (confetti.life <= 0) { scene.remove(confetti.mesh); confetti.mesh.dispose(); confetti = null; }
}

// 彩蛋工坊：修改定制文字后热重建当前设备模型（纹理在 build 时烙进部件）
let eggRebuildTimer = 0;
function scheduleEggRebuild() {
  clearTimeout(eggRebuildTimer);
  eggRebuildTimer = setTimeout(rebuildModel, 260);
}
function rebuildModel() {
  const D = DEV();
  stage.remove(model.root);
  model = built[CUR] = D.build();
  stage.add(model.root);
  buildUI();
  selectPart(null);
  setScheme(S.scheme);
  model.setExplode(S.explode);
  model.setFold(S.fold);
  if (eggs.fx) model.setFrameIri(true);
  model.update(0);
  syncUI();
}

function bindEggs() {
  // 隐藏入口①：3 秒内连点顶部设备名 5 次（防误触）；②：Ctrl+Shift+E
  let taps = 0, tapTimer = 0;
  $('#brandName').addEventListener('pointerdown', () => {
    if (S.keynote) return;
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => (taps = 0), 3000);
    if (taps >= 5) { taps = 0; openEggs(); }
  });
  addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) { e.preventDefault(); openEggs(); }
  });
  $('#eggBadge').onclick = openEggs;
  const panel = $('#eggs');
  $('#eggsClose').onclick = () => panel.classList.remove('on');
  $('#eggReset').onclick = () => {
    eggs = { text: {}, found: {}, lab: false, fx: false };
    saveEggs(eggs);
    panel.classList.remove('on');
    model.setFrameIri(false);
    rebuildModel();
    renderEggList();
    toastEgg('寻宝进度已重置，细节重新藏好了');
  };

  // 定制文字 → 微雕（所有设备共享同一组刻字）
  for (const def of EGG_DEFS) {
    if (!def.field) continue;
    const inp = $(`#egg_${def.field}`);
    inp.oninput = () => { eggs.text[def.field] = inp.value; saveEggs(eggs); scheduleEggRebuild(); };
  }
  // 芯片贴画：上传图片 → Sobel 轮廓蚀刻到主芯片裸片角落
  $('#eggImg').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        eggs.chipImgData = rd.result;
        eggs.chipImg = null;
        saveEggs(eggs);
        decodeEggImage(eggs).then(() => { rebuildModel(); toastEgg('◈ 贴画已蚀刻到主芯片角落'); });
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  $('#eggImgClear').onclick = () => {
    delete eggs.chipImgData;
    eggs.chipImg = null;
    saveEggs(eggs);
    rebuildModel();
    toastEgg('贴画已移除');
  };
  renderEggList();
}
function openEggs() {
  const panel = $('#eggs');
  panel.classList.add('on');
  renderEggList();
  for (const def of EGG_DEFS) {
    if (!def.field) continue;
    $(`#egg_${def.field}`).value = eggs.text?.[def.field] || '';
  }
  $('#eggImgName').textContent = eggs.chipImgData ? '已蚀刻 1 张贴画' : '未上传';
}

// 导出配置：JSON 文件（含壁纸 dataURL，带设备标记），可跨设备迁移
$('#cfgExport').onclick = () => {
  const blob = new Blob([JSON.stringify({ dev: CUR, ...store })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `iphoneDuo-custom-${CUR}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// 导入配置：覆盖 store 并整体重放（文件属于另一台设备时先切换过去）
$('#cfgImport').onclick = () => $('#cfgFile').click();
$('#cfgFile').onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (typeof o !== 'object' || !o) throw 0;
      const dev = DEVICES[o.dev] ? o.dev : 'duo';
      delete o.dev;
      if (dev !== CUR) switchDevice(dev);
      store = o;
      applyStore();
      saveStore();
      flashSaved();
    } catch { alert('配置文件无效'); }
  };
  rd.readAsText(f);
};

// 恢复默认：清除本机配置，回到发布者照片（内置或 sharecode）
$('#cfgReset').onclick = () => {
  const dc = cfgFor(defaultCfg, CUR);
  if (!dc) { alert('本页面没有内置该设备的默认配置'); return; }
  localStorage.removeItem(DEV().storeKey);
  store = JSON.parse(JSON.stringify(dc));
  applyStore();
  flashSaved();
};

function setScheme(k) {
  S.scheme = k;
  model.setScheme(k);
  document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.scheme === k));
  document.body.dataset.scheme = k;
}

function syncUI() {
  $('#fold').value = Math.round(180 - THREE.MathUtils.radToDeg(S.fold));
  $('#foldVal').textContent = `${Math.round(180 - THREE.MathUtils.radToDeg(S.fold))}°`;
  $('#explode').value = Math.round(S.explode * 100);
  $('#explodeVal').textContent = `${Math.round(S.explode * 100)}%`;
}

// ---------------- 发布会演示 ----------------
let kToken = 0;
const ABORT = Symbol('abort');
function guard(tok) { if (tok !== kToken) throw ABORT; }
const wait = (s) => tween(s, () => {});

async function caption(title, sub, tok, eyebrow = '') {
  const c = $('#caption');
  c.classList.remove('on');
  await wait(0.45);
  if (tok !== kToken) return;
  $('#capEyebrow').textContent = eyebrow;
  $('#capTitle').textContent = title;
  $('#capSub').textContent = sub;
  c.classList.add('on');
}

const SCRIPT_DUO = [
  async (t) => {
    selectPart(null); setScheme('night');
    setExplode(0); setFold(PI);
    camera.position.set(0, -40, 900); controls.target.set(0, 0, 0);
    caption('iPhone Duo', '第一款可折叠 iPhone。', t, 'Apple Event · 2026');
    await flyTo([-150, 40, 300], [0, 0, 0], 4); guard(t);
    await orbit(3, 40); guard(t);
  },
  async (t) => {
    caption('合上，是 iPhone。', '5.4 英寸外屏 · 约为 iPhone 18 Pro 屏幕面积的 90% · 单手轻松握持', t, 'Outer Display');
    await flyTo([30, 10, 300], [0, 0, 0], 2.4); guard(t);
    await wait(2.6); guard(t);
  },
  async (t) => {
    caption('展开，是未来。', '7.6 英寸内屏，比 iPhone 18 Pro Max 大 50%。内外屏比例一致，内容无缝延展。', t, 'Inner Display');
    flyTo([-60, 30, 380], [0, 0, 0], 3);
    await animFold(0, 3.2); guard(t);
    await wait(1.8); guard(t);
  },
  async (t) => {
    caption('5.2 毫米。', '展开后，迄今最薄的 iPhone。合上 11.3 毫米，仅重 254 克。', t, 'Thinnest iPhone ever');
    await flyTo([360, 8, 70], [0, 0, 0], 2.6); guard(t);
    await orbit(2.5, 12); guard(t);
  },
  async (t) => {
    caption('拆开来看。', '20+ 个关键模组，在 5.2 毫米之内精密堆叠。', t, 'Exploded View');
    flyTo(...VIEWS.explode, 3);
    await animExplode(1, 3.2); guard(t);
    await orbit(4, 30); guard(t);
  },
  async (t) => {
    model.setFocus(['bar', 'core', 'swing', 'flex', 'spine', 'support']);
    caption('精密铰链', '超过 100 个组件 · 水滴形结构 · 四组弹簧与弧形导轨 · 中央支撑杆托平屏幕', t, 'Precision Hinge');
    await flyTo([-120, 70, 170], [0, 0, 22], 2.6); guard(t);
    await orbit(3.4, 26); guard(t);
  },
  async (t) => {
    model.setFocus(['board', 'vc']);
    caption('A20 Pro', '2 纳米工艺 · 裸片直连定制均热板 · 单层非堆叠主板', t, 'Performance');
    await flyTo([150, 120, 150], [34, 36, 0], 2.6); guard(t);
    await orbit(3.2, -20); guard(t);
  },
  async (t) => {
    model.setFocus(['batA', 'batB']);
    caption('双电池架构', '2962 mAh + 1921 mAh = 4883 mAh · 视频播放最长 31 小时（内屏）', t, 'All-day Battery');
    await flyTo([0, 160, 220], [0, -12, -24], 2.6); guard(t);
    await orbit(3, 18); guard(t);
  },
  async (t) => {
    model.setFocus(['cam', 'fcam', 'udc', 'back']);
    caption('融合式摄像头系统', '双 4800 万像素 · 光学品质 2 倍长焦 · 屏下 FaceTime 摄像头 · Center Stage', t, 'Camera');
    await flyTo([220, 120, -230], [40, 30, -30], 2.8); guard(t);
    await orbit(3, -20); guard(t);
  },
  async (t) => {
    model.setFocus(['cover', 'oled', 'support', 'outer']);
    caption('纳米纹理显示屏', 'ProMotion · 3000 尼特峰值亮度 · 圆形微凸起散射光线，弱化折痕', t, 'Display');
    await flyTo([-240, 170, 300], [0, 0, 40], 2.6); guard(t);
    await orbit(3, 20); guard(t);
  },
  async (t) => {
    model.setFocus(null);
    caption('5 级钛金属', '镜面抛光机身 · 3D 打印钛金属铰链护盖 · IP68', t, 'Design');
    animExplode(0, 2.4);
    await flyTo([-200, 60, 260], [0, 0, 0], 2.6); guard(t);
    setScheme('white');
    await orbit(2.2, 30); guard(t);
    setScheme('night');
    await orbit(2.2, 30); guard(t);
  },
  async (t) => {
    caption('iPhone Duo', '10 月 16 日开启预购 · 10 月 23 日正式发售 · RMB 15,999 起', t, '星光白色 · 夜空色');
    animFold(PI * 0.42, 2.6);
    await flyTo([-220, 90, 260], [0, 0, 0], 2.6); guard(t);
    await orbit(5, 80); guard(t);
  },
];

// ---------------- iPhone 18 系列发布会脚本（18 / 18 Pro / 18 Pro Max 共用，文案按机型动态） ----------------
const SCRIPT_P18 = [
  async (t) => {
    selectPart(null); setScheme('night');
    setExplode(0); setFold(0);
    camera.position.set(0, -30, 780); controls.target.set(0, 0, 0);
    caption(DEV().name, `${DEV().label.frameTitle.replace('。', '')}。${DEV().label.chipName}。一如既往的强。`, t, DEV().label.event);
    await flyTo([-140, 30, 280], [0, 0, 0], 4); guard(t);
    await orbit(3, 40); guard(t);
  },
  async (t) => {
    model.setFocus(['frame', 'buttons']);
    caption(DEV().label.frameTitle, `${DEV().label.frameSpec} · 两段式相机控制键`, t, 'Aluminium Unibody');
    await flyTo([330, 20, 110], [18, 8, 0], 2.6); guard(t);
    await orbit(2.8, 20); guard(t);
  },
  async (t) => {
    model.setFocus(null);
    caption('拆开来看。', `16 个关键模组，在 ${DEV().dims.T} 毫米之内精密堆叠。`, t, 'Exploded View');
    flyTo(...VIEWS.explode, 3);
    await animExplode(1, 3.2); guard(t);
    await orbit(4, 30); guard(t);
  },
  async (t) => {
    model.setFocus(['board', 'vc']);
    caption(DEV().label.chipName, `2 纳米工艺 · 全新架构 · 硬件光线追踪 · ${DEV().label.vcSpec}`, t, 'Performance');
    await flyTo([150, 110, 140], [15, 40, -6], 2.6); guard(t);
    await orbit(3.2, -20); guard(t);
  },
  async (t) => {
    model.setFocus(['battery', 'taptic', 'usb', 'spk']);
    caption('续航一整天。', `钢壳电池 ${DEV().label.bat} mAh · 视频播放最长 ${DEV().label.video} 小时 · ${DEV().label.usb}`, t, 'All-day Battery');
    await flyTo([40, 150, 200], [0, -40, -6], 2.6); guard(t);
    await orbit(3, 18); guard(t);
  },
  async (t) => {
    model.setFocus(['cam', 'fcam']);
    caption(DEV().label.camTitle, `${DEV().label.camSpec} · 灵动岛内的 Face ID 模组`, t, 'Camera');
    await flyTo([220, 110, -220], [-20, 40, -30], 2.8); guard(t);
    await orbit(3, -20); guard(t);
  },
  async (t) => {
    model.setFocus(['frontGlass', 'screen', 'support']);
    caption(`${DEV().label.size} 英寸超视网膜 XDR`, [DEV().label.motion, DEV().label.alwaysOn, DEV().label.peak].filter(Boolean).join(' · '), t, 'Display');
    await flyTo([-230, 150, 290], [0, 0, 30], 2.6); guard(t);
    await orbit(3, 20); guard(t);
  },
  async (t) => {
    model.setFocus(['back', 'mag']);
    caption('超瓷晶背板。', '磨砂质感玻璃 · MagSafe 最高 25W 无线充电 · 鎏金激光雕刻，独一无二', t, 'Design');
    animExplode(0, 2.4);
    await flyTo([-180, 70, -260], [0, 0, -20], 2.6); guard(t);
    setScheme('white');
    await orbit(2.2, 26); guard(t);
    setScheme('night');
    await orbit(2.2, 26); guard(t);
  },
  async (t) => {
    model.setFocus(null);
    caption(DEV().name, `${DEV().label.launch} · 一如既往的 Apple 价格`, t, DEV().label.colors);
    await flyTo([-200, 60, 260], [0, 0, 0], 2.6); guard(t);
    await orbit(5, 80); guard(t);
  },
];

DEVICES.duo.script = SCRIPT_DUO;
P18_IDS.forEach((id) => (DEVICES[id].script = SCRIPT_P18));

// ---------------- 设备切换：模型热替换 + UI / 存储 / 脚本整体切换 ----------------
// 工程套路：两台设备的模型实例全部缓存（built），切换只做 stage 子节点换血，
// 不重建场景/材质/纹理，开销 < 10ms；照片库与刻字随各自 store 恢复。
function switchDevice(dev) {
  if (!DEVICES[dev] || dev === CUR) return;
  if (S.keynote) stopKeynote();
  // 新玩法互斥退出：答题 / 拆装 / AR 绑定的是旧模型的部件表，切设备必须先收摊
  if (quiz.on) toggleQuiz(false);
  if ($('#asm').classList.contains('on')) toggleAsm(false);
  if ($('#daily').classList.contains('on')) toggleDaily(false);
  if ($('#badges').classList.contains('on')) toggleBadges(false);
  if ($('#tint').classList.contains('on')) toggleTint(false);
  if (ar.on) toggleAR();
  if (phys.on) { phys.on = false; stage.position.set(0, 0, 0); stage.rotation.set(0, 0, 0); }
  if (vis !== 'off') setVisMode('off');   // 旧模型的材质 swap 随旧 root 一起退役
  if (cut.on) setCut(false);
  kicks.clear();
  cancelTweens();
  CUR = dev;
  const D = DEVICES[dev];
  document.body.dataset.dev = dev;
  document.querySelectorAll('#devTabs button').forEach((b) => b.classList.toggle('active', b.dataset.dev === dev));
  $('#brandName').textContent = D.name;
  document.title = `${D.name} · 3D 爆炸图`;
  $('#hint').textContent = '拖拽旋转 · 滚轮缩放 · 右键平移 · E 爆炸 · F 开合 · L 标注 · K 演示 · Q 部件大师 · G 抛掷 · X 光 · B 蓝图 · C 剖面 · I 沉浸 · 爆炸态双击部件弹飞';
  sfx('whoosh'); buzz(10);
  // 模型热替换（首次切换才构建，之后走缓存）
  // 顺序：先构建成功再摘下旧模型，构建异常时保留旧画面而不是空场景
  built[dev] ||= D.build();
  stage.remove(model.root);
  model = built[dev];
  stage.add(model.root);
  // 先重建侧边栏/标注（新部件 listEl 落位），再复位选择态，避免引用旧 DOM
  buildUI();
  selectPart(null);
  // 视图 / 选择状态复位
  if (!D.hasFold) setFold(0);
  setExplode(0);
  setScheme(S.scheme);
  // 屏保标签重渲染 + 目标切到第一个屏幕
  ssTarget = D.tabs[0][0];
  $('#ssTabs')._render?.();
  // 本机配置（无记录时回落发布者默认）
  store = loadStore(dev);
  if (!localStorage.getItem(D.storeKey)) {
    const dc = cfgFor(defaultCfg, dev);
    if (dc) store = JSON.parse(JSON.stringify(dc));
  }
  applyStore();
  syncUI();
  if (eggs.fx) model.setFrameIri(true);   // 虹彩中框随设备恢复
  renderEggList();
  setTint(localStorage.getItem(`iphoneDuo.tint.${dev}`) || 'titan', false);   // 换色随设备恢复
  buildTintUI();
  model.update(0);
  flyTo(...VIEWS.hero, 1.4);
}

// 演示时画面整体上移，为底部字幕留出空间
function setShift(on) {
  if (on) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.13, innerWidth, innerHeight);
  else camera.clearViewOffset();
}

async function startKeynote() {
  if (S.keynote) return;
  cancelTweens();
  const tok = ++kToken;
  const SCRIPT = DEV().script;   // 每台设备自己的发布会脚本
  S.keynote = true; S.auto = false;
  $('#btnAuto').classList.remove('active');
  document.body.classList.add('keynote');
  controls.enabled = false;
  setShift(true);
  const bar = $('#kProgress');
  try {
    for (let i = 0; i < SCRIPT.length; i++) {
      bar.style.width = `${(i / SCRIPT.length) * 100}%`;
      $('#kChapter').textContent = `${i + 1} / ${SCRIPT.length}`;
      await SCRIPT[i](tok);
      guard(tok);
    }
    bar.style.width = '100%';
    await wait(1.5); guard(tok);
    stopKeynote();
  } catch (e) {
    if (e !== ABORT) throw e;
  }
}
function stopKeynote() {
  if (!S.keynote) return;
  kToken++;
  cancelTweens();
  S.keynote = false;
  document.body.classList.remove('keynote');
  $('#kProgress').style.width = '0%';
  $('#caption').classList.remove('on');
  controls.enabled = true;
  setShift(false);
  model.setFocus(S.selected ? [S.selected] : null);
  showSbGuide();   // 首次开机的发布会演示结束后，手机端补一轮左缘拉手引导
}

// ================================================================
//                      可玩性扩展：壁纸 / 测验 / 拆装 / 录制 / AR / 物理
// ================================================================

// 通用提示（复用彩蛋 toast 的容器与动效）
function toastMsg(msg) {
  const t = $('#eggToast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 3000);
}

// ---------------- 壁纸工厂：当前视角 → 机型原生分辨率 PNG ----------------
// 思路：把 WebGL 画布瞬时切到目标分辨率渲染一帧，再 canvas.toBlob 导出。
// 相比 RenderTarget 读像素，色彩管理 / 色调映射与屏幕所见完全一致，零偏色。
async function exportWallpaper() {
  const btn = $('#btnWall');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const [w, h] = DEV().screens[DEV().tabs[0][0]];
    const pr = pixelRatio;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);          // false：不动 CSS，屏幕上只模糊一瞬
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.render();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${DEV().name.replace(/\s+/g, '')}-壁纸-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    sfx('shutter'); buzz(12);
    award('wall');
    toastMsg(`⤓ 已导出 ${DEV().name} 壁纸 ${w}×${h}`);
  } finally {
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    btn.disabled = false;
  }
}

// ---------------- 部件大师：看图识名 / 盲拆找件 ----------------
// 看图识名：飞行特写一个部件，从 4 个名字里选对；
// 盲拆找件：只给名字，直接在 3D 模型上点出它（更难，连击翻倍加成）。
// 防作弊：答题期间隐藏部件列表与 hover 提示、强制关标注。
const quiz = {
  on: false, mode: 'name', ans: '', busy: false,
  streak: 0, best: +(localStorage.getItem('iphoneDuo.quizBest') || 0),
  keepLabels: true,
};
function quizPool() { return model.parts; }
function quizFly(id) {
  const p = model.parts.find((q) => q.id === id);
  if (!p) return;
  model.setFocus([id]);
  (async () => {
    if (S.fold > 0.01) await animFold(0, 1.2);
    if (S.explode < 0.99) await animExplode(1, 1.4);
    model.update(0);
    stage.updateMatrixWorld(true);
    const c = p.anchorObj.localToWorld(p.anchor.clone());
    const dir = camera.position.clone().sub(controls.target).normalize();
    // 特写方向随机绕目标转一拳，增加辨识难度
    const ang = (Math.random() - 0.5) * 2.4;
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    flyTo(c.clone().addScaledVector(dir, 270).toArray(), c.toArray(), 1.4);
  })();
}
function quizNext() {
  const pool = quizPool();
  if (pool.length < 4) return;
  quiz.ans = pool[(Math.random() * pool.length) | 0].id;
  quiz.busy = false;
  if (quiz.mode === 'name') {
    // 4 个选项：答案 + 3 个干扰项
    const opts = [quiz.ans];
    while (opts.length < 4) {
      const c = pool[(Math.random() * pool.length) | 0].id;
      if (!opts.includes(c)) opts.push(c);
    }
    quiz.opts = opts.sort(() => Math.random() - 0.5);
    $('#quizQ').innerHTML = `镜头对准的部件是？<small>从下面 4 个名字里选出它</small>`;
    $('#quizOpts').innerHTML = '';
    for (const id of quiz.opts) {
      const b = document.createElement('button');
      b.textContent = model.parts.find((p) => p.id === id).name;
      b.onclick = () => quizNameAnswer(id, b);
      $('#quizOpts').append(b);
    }
    quizFly(quiz.ans);
  } else {
    $('#quizQ').innerHTML = `在模型上点出：<b style="color:var(--acc)">${model.parts.find((p) => p.id === quiz.ans).name}</b><small>直接点击 3D 模型上对应的部件</small>`;
    $('#quizOpts').innerHTML = '<div class="meta" style="margin:0">旋转查看 · 点击你认为正确的部件</div>';
    selectPart(null);
  }
  quizScore();
}
function quizScore() {
  $('#quizScore').innerHTML = `连击 <b>${quiz.streak}</b> · 本次最高 ${quiz.streak > quiz.hi ? (quiz.hi = quiz.streak) : quiz.hi} · 纪录 ${quiz.best}`;
}
quiz.hi = 0;
function quizRight() {
  quiz.streak++;
  if (quiz.streak > quiz.best) {
    quiz.best = quiz.streak;
    localStorage.setItem('iphoneDuo.quizBest', quiz.best);
  }
  if (quiz.streak >= 5) award('quiz5');
  sfx('right'); buzz(12);
  quiz.busy = true;
  quizScore();
  clearTimeout(quiz.t);
  quiz.t = setTimeout(quizNext, 800);
}
function quizWrong(showName) {
  quiz.streak = 0;
  sfx('wrong'); buzz([26]);
  quiz.busy = true;
  quizScore();
  toastMsg(`✕ 是「${showName}」，连击清零`);
  clearTimeout(quiz.t);
  quiz.t = setTimeout(quizNext, 1300);
}
function quizNameAnswer(id, btn) {
  if (quiz.busy) return;
  const right = id === quiz.ans;
  btn.classList.add(right ? 'right' : 'wrong');
  if (!right) [...$('#quizOpts').children].find((b) => b.textContent === model.parts.find((p) => p.id === quiz.ans).name)?.classList.add('right');
  right ? quizRight() : quizWrong(model.parts.find((p) => p.id === quiz.ans).name);
}
function quizFindAnswer(id) {
  if (quiz.busy) return;
  if (id === quiz.ans) quizRight();
  else quizWrong(model.parts.find((p) => p.id === quiz.ans).name);
}
function toggleQuiz(force) {
  const want = force !== undefined ? force : !quiz.on;
  if (want === quiz.on) return;
  quiz.on = want;
  $('#quiz').classList.toggle('on', quiz.on);
  document.body.classList.toggle('quizing', quiz.on);
  $('#btnQuiz').classList.toggle('active', quiz.on);
  if (quiz.on) {
    if (asm.on) toggleAsm(false);
    quiz.keepLabels = S.labels;
    if (S.labels) { S.labels = false; $('#btnLabels').classList.remove('active'); }
    quiz.streak = 0; quiz.hi = 0;
    quizNext();
  } else {
    clearTimeout(quiz.t);   // 关面板时掐掉挂起的换题定时器（否则会飞相机）
    if (quiz.keepLabels && !S.labels) { S.labels = true; localStorage.setItem('iphoneDuo.labels', '1'); $('#btnLabels').classList.add('active'); }
    model.setFocus(null);
  }
}

// ---------------- 拆装挑战：爆炸打乱 → 按装配顺序点回 → 开机 ----------------
// 部件级爆炸覆盖（model.setPartK）让「逐个归位」成为可能：
// 全局 explode 保持 1，答对的部件单独 k→0 飞回原位；装错抖动提醒。
const asm = { on: false, queue: [], done: 0, total: 0, t0: 0 };
function asmBestKey() { return `iphoneDuo.asmBest.${CUR}`; }
function startAsm() {
  selectPart(null);
  cancelTweens();
  asm.on = true;
  $('#asm').classList.add('on');
  $('#btnAsm').classList.add('active');
  $('#asmNext').textContent = '准备中…';
  $('#asmProg').textContent = '';
  (async () => {
    if (S.fold > 0.01) await animFold(0, 1.2);
    if (S.explode < 0.99) await animExplode(1, 1.4);
    model.clearPartK();
    // 装配顺序 = 爆炸顺序倒序：越晚炸开的（外壳类）越先装回
    asm.queue = [...model.parts].sort((a, b) => b.order - a.order).map((p) => p.id);
    asm.total = asm.queue.length;
    asm.done = 0;
    asm.t0 = performance.now();
    updateAsmUI();
  })();
}
function updateAsmUI(finish, isRec) {
  if (finish !== undefined) {
    const best = localStorage.getItem(asmBestKey());
    $('#asmNext').textContent = `🎉 装配完成！用时 ${finish}s${isRec ? ' · 新纪录' : ` · 纪录 ${best}s`}`;
    $('#asmProg').textContent = `已装回 ${asm.total} / ${asm.total}`;
    return;
  }
  const next = model.parts.find((p) => p.id === asm.queue[0]);
  $('#asmNext').textContent = asm.queue.length ? `下一个装回：${next.name}` : '—';
  const t = asm.t0 ? ((performance.now() - asm.t0) / 1000).toFixed(1) : '0.0';
  const best = localStorage.getItem(asmBestKey());
  $('#asmProg').textContent = `已装回 ${asm.done} / ${asm.total} · 用时 ${t}s${best ? ` · 纪录 ${best}s` : ''}`;
}
function asmPick(p) {
  if (!asm.queue.length) return;
  if (p.id === asm.queue[0]) {
    const from = p.k || 1;
    tween(0.42, (k) => model.setPartK(p.id, from * (1 - k)));
    asm.queue.shift();
    asm.done++;
    sfx('snap'); buzz(10);
    updateAsmUI();
    if (!asm.queue.length) asmFinish();
  } else {
    sfx('wrong'); buzz([26]);
    $('#asmNext').animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
      { duration: 240 }
    );
  }
}
function asmFinish() {
  const t = ((performance.now() - asm.t0) / 1000).toFixed(1);
  const old = localStorage.getItem(asmBestKey());
  const isRec = !old || +t < +old;
  if (isRec) localStorage.setItem(asmBestKey(), t);
  asm.on = false;
  $('#btnAsm').classList.remove('active');
  award('asm');
  sfx('boot'); buzz([18, 60, 18, 60, 36]);
  burstConfetti();
  updateAsmUI(t, isRec);
  // 收拢爆炸 + 清覆盖，整机复原
  const e0 = S.explode;
  tween(0.9, (k) => { S.explode = e0 * (1 - k); }).then(() => model.clearPartK());
}
function toggleAsm(force, giveup) {
  const want = force !== undefined ? force : !asm.on && !$('#asm').classList.contains('on');
  if (!want) {
    if (giveup && asm.on) {
      asm.on = false;
      model.clearPartK();
      animExplode(0, 0.9);
    }
    asm.on = false;
    asm.queue = [];
    $('#asm').classList.remove('on');
    $('#btnAsm').classList.remove('active');
    if (giveup) toastMsg('已放弃本次拆装，整机复原');
  } else {
    if (quiz.on) toggleQuiz(false);
    startAsm();
  }
}

// ---------------- 运镜录制：canvas.captureStream → WebM ----------------
const rec = { on: false, mr: null, chunks: [] };
function toggleRec() {
  if (rec.on) {
    rec.mr?.stop();
    rec.on = false;
    $('#btnRec').classList.remove('active');
    $('#btnRec').textContent = '⏺ 录制';
    return;
  }
  let mime = 'video/webm;codecs=vp9';
  if (!window.MediaRecorder || !canvas.captureStream) { toastMsg('此浏览器不支持录屏，请改用 Chrome'); return; }
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
  try {
    rec.mr = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  } catch { toastMsg('录屏启动失败'); return; }
  rec.chunks = [];
  rec.mr.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
  rec.mr.onstop = () => {
    const blob = new Blob(rec.chunks, { type: rec.mr.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `iphoneDuo-${CUR}-${new Date().toISOString().slice(0, 10)}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toastMsg('⏺ 运镜已导出 WebM');
  };
  rec.mr.start(250);
  rec.on = true;
  $('#btnRec').classList.add('active');
  $('#btnRec').textContent = '⏹ 停止';
  toastMsg('⏺ 录制中：旋转 / 爆炸 / 开合都会被录下');
}

// ---------------- AR 预览：摄像头实拍做背景 ----------------
// canvas 本身 alpha:true，关掉页面底色后 3D 手机直接悬浮在真实桌面上
const ar = { on: false, stream: null, video: null };
async function toggleAR() {
  if (ar.on) {
    ar.stream?.getTracks().forEach((t) => t.stop());
    ar.video?.remove();
    ar.on = false;
    document.body.classList.remove('ar');
    $('#btnAR').classList.remove('active');
    return;
  }
  try {
    ar.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch { toastMsg('无法访问摄像头：请检查权限后重试'); return; }
  const v = document.createElement('video');
  v.id = 'arVideo';
  v.autoplay = true; v.muted = true; v.playsInline = true;
  v.srcObject = ar.stream;
  document.body.prepend(v);
  try { await v.play(); } catch { /* autoplay 拒绝也不致命 */ }
  ar.video = v;
  ar.on = true;
  document.body.classList.add('ar');
  $('#btnAR').classList.add('active');
  toastMsg('▣ AR 模式：把手机放到你的桌面上（再点一次退出）');
}

// ---------------- 物理玩具：抛掷 + 部件弹飞 ----------------
// 抛掷：整个 stage 变刚体——重力 / 弹跳 / 翻滚，落地弹两下后自动飞回原位；
// 弹飞：爆炸态双击部件，弹簧仿真沿爆炸方向过冲回弹，转着飞回队列。
const phys = { on: false, v: null, w: null, base: null, landY: -60 };
function tossPhone() {
  if (S.keynote || asm.on) return;
  phys.on = true;
  cancelTweens();
  if (S.fold > 0.01) setFold(0);           // 抛之前先合上（Duo），直板机无感
  model.update(0);
  stage.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  phys.landY = Math.min(-78 - box.min.y, -60);   // 让机身底部落在影子平面上
  phys.base = stage.position.clone();
  phys.v = new THREE.Vector3((Math.random() - 0.5) * 240, 480 + Math.random() * 180, (Math.random() - 0.5) * 240);
  phys.w = new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 7);
  sfx('whoosh'); buzz(16);
}
function tickPhys(dt) {
  if (!phys.on) return;
  phys.v.y -= 980 * dt;                     // 场景单位下的重力
  stage.position.addScaledVector(phys.v, dt);
  stage.rotation.x += phys.w.x * dt;
  stage.rotation.y += phys.w.y * dt;
  stage.rotation.z += phys.w.z * dt;
  if (stage.position.y <= phys.landY && phys.v.y < 0) {
    if (Math.abs(phys.v.y) > 150) {          // 还弹得动：反弹并衰减
      stage.position.y = phys.landY;
      phys.v.y *= -0.42;
      phys.v.x *= 0.62; phys.v.z *= 0.62;
      phys.w.multiplyScalar(0.55);
      sfx('thud'); buzz(14);
    } else {                                 // 弹够了：回正飞回原位
      phys.on = false;
      const p0 = stage.position.clone(), r0 = stage.rotation.clone();
      tween(1.1, (k) => {
        stage.position.lerpVectors(p0, phys.base, k);
        stage.rotation.set(r0.x * (1 - k), r0.y * (1 - k), r0.z * (1 - k));
      }, ease.inOut).then(() => {
        stage.position.copy(phys.base);
        stage.rotation.set(0, 0, 0);
        sfx('snap'); buzz(10);
      });
    }
  }
}
// 弹飞弹簧：k'' = -stiffness·(k - 全局位) - damping·k'
const kicks = new Map();
function kickPart(id) {
  const p = model.parts.find((q) => q.id === id);
  if (!p) return;
  kicks.set(id, { k: p.k, v: 3.5 + Math.random() * 5, g: p.k });
  sfx('pop'); buzz(12);
}
function tickKicks(dt) {
  for (const [id, s] of kicks) {
    const a = -46 * (s.k - s.g) - 5.2 * s.v;
    s.v += a * dt;
    s.k += s.v * dt;
    model.setPartK(id, s.k);
    if (Math.abs(s.k - s.g) < 0.02 && Math.abs(s.v) < 0.12) {
      model.delPartK(id);
      kicks.delete(id);
    }
  }
}

// ---------------- 视觉模式：X 光 / 蓝图 / 剖面 / 沉浸 / 分享链接 ----------------
// X 光：外壳（机身/屏幕类）换半透明加色幽灵材质、内部结构件换发光线框，
// 合上也能透视主板电池。用材质 swap 而非改属性——model.update() 每帧
// 管理原材质的 opacity/depthWrite，swap 后互不干扰，还原零残留。
const xrayShellMat = new THREE.MeshBasicMaterial({ color: 0x4d9fff, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false });
const xrayCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ffd5, wireframe: true, transparent: true, opacity: 0.55 });
const bpMat = new THREE.MeshBasicMaterial({ color: 0x8fd6ff, wireframe: true });
const bpGrid = new THREE.GridHelper(1400, 70, 0x1c4d7d, 0x0e2a4a);
bpGrid.position.y = -150;
bpGrid.visible = false;
scene.add(bpGrid);
let vis = 'off';
const shellOf = (p) => p.cat === 'body' || p.cat === 'display';
function setVisMode(mode) {
  if (vis === mode) mode = 'off';           // 再点一次关闭
  if (mode !== 'off') setCut(false);        // 三种视觉模式互斥：剖面作用于原材质
  vis = mode;
  for (const p of model.parts) for (const m of p.meshes) {
    if (vis === 'off') {
      if (m.userData._vm) { m.material = m.userData._vm; delete m.userData._vm; }
    } else {
      m.userData._vm ||= m.material;
      m.material = vis === 'xray' ? (shellOf(p) ? xrayShellMat : xrayCoreMat) : bpMat;
    }
  }
  bpGrid.visible = vis === 'blueprint';
  scene.background = vis === 'blueprint' ? new THREE.Color(0x08172c) : null;
  shadow.visible = vis !== 'blueprint';
  key.visible = rim.visible = hemi.visible = vis === 'off';   // 幽灵/线框材质不吃光照，顺手省开销
  $('#btnXray').classList.toggle('active', vis === 'xray');
  $('#btnBlue').classList.toggle('active', vis === 'blueprint');
  if (vis === 'xray') award('xray');
  if (vis === 'blueprint') award('blue');
  if (vis !== 'off') { sfx(vis === 'xray' ? 'whoosh' : 'ui'); buzz(8); }
}

// 剖面切面：clipping plane 沿机身深度方向（z 轴）从背板往屏幕推进，
// 保留 z >= threshold 一侧（屏幕朝 +z）；k=0 完整机身，k=1 切到只剩屏幕
const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 80);
const cut = { on: false, k: 0.35 };
function setCut(on) {
  if (cut.on === on) return;
  if (on) setVisMode('off');
  cut.on = on;
  renderer.localClippingEnabled = on;
  for (const p of model.parts) for (const m of p.mats) m.clippingPlanes = on ? [cutPlane] : null;
  $('#cutBar').classList.toggle('on', on);
  $('#btnCut').classList.toggle('active', on);
  if (on) { setCutDepth(cut.k); sfx('snap'); buzz(8); award('cut'); }
}
function setCutDepth(k) {
  cut.k = k;
  cutPlane.constant = THREE.MathUtils.lerp(80, -40, k);   // 保留侧阈值：-80(全留) → 40(切穿屏幕)
  $('#cutPct').textContent = Math.round(k * 100) + '%';
  $('#cutDepth').value = Math.round(k * 100);
}

// 沉浸模式：UI 静止自动隐没 + 鼠标活动唤出（视频播放器心智）+ 双击/Esc 退出
// 操作坞按钮在沉浸中照常可用——沉浸不牺牲操作，只牺牲干扰。
const zen = { on: false, t: 0, live: 0, moveT: 0 };
function zenUI(show) {
  clearTimeout(zen.live);
  document.body.classList.toggle('uiLive', show && zen.on);
  if (show && zen.on) zen.live = setTimeout(() => document.body.classList.remove('uiLive'), 2500);
}
function toggleZen(force) {
  const want = force !== undefined ? force : !zen.on;
  if (want === zen.on) return;
  zen.on = want;
  document.body.classList.toggle('zen', want);
  $('#btnZen').classList.toggle('active', want);
  if (want) {
    sfx('whoosh'); buzz(10);
    award('zen');
    document.documentElement.requestFullscreen?.().catch(() => {});
    zenUI(true);                                // 进场先亮 UI，随提示一起隐没——演示「会自己消失」
    const tip = $('#zenTip');
    tip.classList.add('on');
    clearTimeout(zen.t);
    zen.t = setTimeout(() => tip.classList.remove('on'), 3400);
  } else {
    zenUI(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

// ---------------- 芯片微观世界：进出场的电影化序列 ----------------
// 进入：收面板 → 飞向主板 → 持续推进“穿过”芯片表面（白闪遮衔接）→ 切 Scene 开跑
// 渲染复用：同一 composer，仅切 RenderPass 的 scene/camera；bloom 调强（游戏全是发光体）
let microBusy = false;                                // 进出序列互斥锁（含飞行/白闪期间）
let curGame = null;                                   // 当前游戏 key（micro/turret/shoot/wave/maze），主循环据此分流
let fromWorld = false;                                // 本局游戏是否从异世界传送门进入（退出时决定回哪）
const GAME_PRE = { micro: 'g', turret: 't', shoot: 's', wave: 'w', maze: 'z' };   // 游戏 HUD 前缀（DOM id 约定）
function gameOfPart(id) { return Object.keys(GAMES).find((k) => GAMES[k].parts.includes(id)); }
async function enterGameWorld(key, viaWorld = false) {
  const G = GAMES[key];
  if (!G || curGame || microBusy) return;
  microBusy = true;
  fromWorld = viaWorld;
  try {
    sfx('whoosh'); buzz(10);
    cancelTweens();
    if (viaWorld) {
      // 异世界传送门：主场景已不可见，无需飞入序列，白闪直切。
      // 必须先关 world（world.on=false + 撤 HUD），否则主循环 world 分支残留、游戏 tick 永远不跑
      $('#flash').classList.add('on');
      await sleepMs(340);
      closeWorld();
    } else {
      if (zen.on) toggleZen(false);
      selectPart(null);
      toggleBadges(false); toggleDaily(false); toggleQuiz(false);
      // 1) 收拢整机：合上折叠、收回爆炸，让主板归位
      if (S.fold > 0.01) await animFold(0, 1.0);
      if (S.explode > 0.01) await animExplode(0, 0.9);
      model.update(0); stage.updateMatrixWorld(true);
      // 2) 找到部件锚点，飞过去（部件 id 随设备不同：Duo 电池叫 batA、18 系叫 battery，取当前设备存在的那个）
      const pid = G.parts.find((id) => model.parts.some((p) => p.id === id));
      const bp = model.parts.find((q) => q.id === pid);
      const c = bp.anchorObj.localToWorld(bp.anchor.clone());
      const dir = camera.position.clone().sub(controls.target).normalize();
      await flyTo(c.clone().addScaledVector(dir, 130).toArray(), c.toArray(), 1.7);
      // 3) 持续推进——穿过芯片表面（推进到 55% 时白闪接管衔接）
      const p0 = camera.position.clone(), t0 = controls.target.clone();
      let flashed = false;
      await tween(1.5, (k) => {
        camera.position.lerpVectors(p0, c, k);
        controls.target.lerpVectors(t0, c, Math.min(k * 1.6, 1));
        if (!flashed && k > 0.55) { flashed = true; $('#flash').classList.add('on'); }
      }, ease.in);
    }
    // 4) 白屏峰值处切换世界（G.open 内部才 build 出场景/相机，之后再接管 RenderPass——
    //    live binding 更新变量，但已赋给 renderPass 的 null 不会跟着变，顺序反了会每帧崩）
    G.open();                                     // HUD + 开场字幕 + 倒计时 + 徽章
    renderPass.scene = G.scene(); renderPass.camera = G.cam();
    bloom.strength = 0.85; bloom.threshold = 0.5;
    curGame = key;
    if (viaWorld) {   // 结算面板返回按钮：从异世界来就回异世界
      $('#' + GAME_PRE[key] + 'Exit').textContent = '◈ 返回异世界';
    }
    await sleepMs(viaWorld ? 120 : 140);
    $('#flash').classList.remove('on');
  } finally { microBusy = false; }
}
window.__enterMicro = () => enterGameWorld('micro');   // 测试探针：直接触发进入序列，抓真实异常
// 测试探针：通用进入（arcade.mjs 用）——上一局退场动画未完（busy）时先等空闲，保证 e2e 时序确定
window.__enterGame = async (k) => {
  for (let i = 0; i < 100 && (microBusy || curGame); i++) await new Promise((r) => setTimeout(r, 100));
  return enterGameWorld(k);
};
window.__gstate = () => ({ busy: microBusy, cur: curGame, tapT: partTapT, sel: S.selected });   // 测试探针：进出序列/双击计时内部态
// 退出：白闪 → 回主场景 → 相机从部件前“退出来”，再拉回默认视角
async function exitGameWorld() {
  const gk = curGame, G = curGame && GAMES[curGame];
  if (!G || microBusy) return;
  microBusy = true;
  const viaWorld = fromWorld; fromWorld = false;
  const playedOk = viaWorld && G.st.over === true;   // 必须在 G.close() 重置 over 前读取：本局以结算面板收尾才回收碎片
  try {
    sfx('whoosh');
    $('#flash').classList.add('on');
    await sleepMs(340);
    G.close();
    curGame = null;
    $('#' + GAME_PRE[gk] + 'Exit').textContent = '⌂ 返回工坊';   // 还原结算面板按钮文案
    if (viaWorld) {
      // 回异世界：原地复活 + 碎片结算（worldResume 同步执行完才切 renderPass，
      // 两个赋值之间无 await，主循环不会插帧渲染到“游戏场景已关、异世界未接”的中间态）
      worldResume(playedOk);
      renderPass.scene = wdScene; renderPass.camera = wdCam;
      bloom.strength = 0.85; bloom.threshold = 0.5;
    } else {
      renderPass.scene = scene; renderPass.camera = camera;
      bloom.strength = 0.18; bloom.threshold = 0.9;
      // 相机落在部件前方，然后拉回全局视角（像从部件里退了出来）
      model.update(0); stage.updateMatrixWorld(true);
      const pid = G.parts.find((id) => model.parts.some((p) => p.id === id));
      const bp = model.parts.find((q) => q.id === pid);
      const c = bp.anchorObj.localToWorld(bp.anchor.clone());
      camera.position.copy(c).add(new THREE.Vector3(60, 40, 120));
      controls.target.copy(c);
      controls.update();
    }
    await sleepMs(120);
    $('#flash').classList.remove('on');
    if (!viaWorld) flyTo([-260, 120, 300], [0, 0, 0], 1.8);
  } finally { microBusy = false; }
}

// ---------------- 异世界进出（V 键 / 控制坞 ◈ 按钮 / vQuit）----------------
// 与游戏进出同构：白闪过渡 + renderPass 接管 wdScene/wdCam + bloom 拉满（霓虹夜景）
async function toggleWorld(force) {
  const want = force !== undefined ? force : !world.on;
  if (want === world.on || microBusy || curGame) return;
  if (!want) return exitWorld();
  microBusy = true;
  try {
    sfx('whoosh'); buzz(10);
    cancelTweens();
    selectPart(null);
    $('#flash').classList.add('on');
    await sleepMs(340);
    openWorld(false);
    renderPass.scene = wdScene; renderPass.camera = wdCam;
    bloom.strength = 0.85; bloom.threshold = 0.5;
    await sleepMs(120);
    $('#flash').classList.remove('on');
  } finally { microBusy = false; }
}
async function exitWorld() {
  if (!world.on || microBusy) return;
  microBusy = true;
  try {
    sfx('whoosh');
    $('#flash').classList.add('on');
    await sleepMs(340);
    closeWorld();
    renderPass.scene = scene; renderPass.camera = camera;
    bloom.strength = 0.18; bloom.threshold = 0.9;
    await sleepMs(120);
    $('#flash').classList.remove('on');
  } finally { microBusy = false; }
}
// 兼容别名（既有调用沿用旧名）；GAMES 注册表定义在使用前（函数声明可后置，const 表不行）
const GAMES = {
  micro:  { parts: ['board'],           nm: '深入芯片内部', open: openMicro,  close: closeMicroUI,  start: startMicroRun,  tick: tickMicro,  st: micro,  scene: () => mScene, cam: () => mCam },
  turret: { parts: ['batA', 'battery'], nm: '深入电池内部', open: openTurret, close: closeTurretUI, start: startTurretRun, tick: tickTurret, st: turret, scene: () => tScene, cam: () => tCam },
  shoot:  { parts: ['fcam'],            nm: '深入点阵空间', open: openShoot,  close: closeShootUI,  start: startShootRun,  tick: tickShoot,  st: shoot,  scene: () => sScene, cam: () => sCam },
  wave:   { parts: ['spk'],             nm: '深入扬声管',   open: openWave,   close: closeWaveUI,   start: startWaveRun,   tick: tickWave,   st: wave,   scene: () => wScene, cam: () => wCam },
  maze:   { parts: ['mag'],             nm: '深入磁环迷宫', open: openMaze,   close: closeMazeUI,   start: startMazeRun,   tick: tickMaze,   st: maze,   scene: () => zScene, cam: () => zCam },
};
const enterMicro = () => enterGameWorld('micro');
const exitMicro = () => exitGameWorld();
// 沉浸中鼠标/触摸活动 → 唤出操作坞（已显示时低频刷新静止计时）
addEventListener('pointermove', (e) => {
  if (!zen.on || e.pointerType === 'touch') return;
  const now = performance.now();
  const shown = document.body.classList.contains('uiLive');
  if (shown && now - zen.moveT < 200) return;
  zen.moveT = now;
  zenUI(true);
}, { passive: true });
// 用户直接 Esc 退全屏（浏览器手势）时同步状态，防止「半沉浸」残留
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && zen.on) toggleZen(false); });

// 分享链接：把设备/环境/配色/爆炸度编码进 URL，打开即还原现场
function buildShareURL() {
  const u = new URL(location.href);
  for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
  u.hash = '';
  u.searchParams.set('dev', CUR);
  if (curEnv !== 'studio') u.searchParams.set('env', curEnv);
  if (S.scheme !== 'white') u.searchParams.set('sch', S.scheme);
  if (S.explode > 0.02) u.searchParams.set('ex', (+S.explode).toFixed(2));
  return u.toString();
}
function shareLink() {
  const url = buildShareURL();
  (navigator.clipboard?.writeText(url) || Promise.reject()).then(
    () => toastMsg('⇗ 分享链接已复制 · 打开即还原当前状态'),
    () => toastMsg(url));
  sfx('pop'); buzz(8);
  award('share');
  return url;
}

// ---------------- 第五波 A：图鉴徽章 · 每日挑战 · 换色 DIY ----------------
// 徽章系统：探索行为 → award() 解锁 → toast + 徽章墙亮起。
// 全部存 localStorage，重开页面即恢复；未解锁的灰显（名称保留、描述可见，勾着再来）。
const BADGES = [
  { id: 'first',  ic: '🌱', nm: '初来乍到',   ds: '第一次打开这台 3D 手机' },
  { id: 'xray',   ic: '⊨',  nm: 'X 光医师',   ds: '用 X 光透视内部结构' },
  { id: 'blue',   ic: '⧉',  nm: '蓝图工程师', ds: '进入工程蓝图模式' },
  { id: 'cut',    ic: '∪',  nm: '解剖学家',   ds: '用剖面切开手机' },
  { id: 'zen',    ic: '⛶',  nm: '冥想者',     ds: '在沉浸模式里放空一次' },
  { id: 'quiz5',  ic: '🎯', nm: '百发百中',   ds: '部件大师连击答对 5 题' },
  { id: 'asm',    ic: '🔧', nm: '装机大师',   ds: '完整装回一台设备' },
  { id: 'power',  ic: '⏻',  nm: '见证开机',   ds: '完成一次开机序列' },
  { id: 'daily1', ic: '☀',  nm: '每日打卡',   ds: '完成一次每日挑战' },
  { id: 'daily7', ic: '🔥', nm: '七日之约',   ds: '每日挑战连续打卡 7 天' },
  { id: 'wall',   ic: '🖼', nm: '壁纸收藏家', ds: '导出一张机型原生壁纸' },
  { id: 'share',  ic: '⇗', nm: '分享家',     ds: '生成一条分享链接' },
  { id: 'micro',  ic: '⚛', nm: '微观访客',   ds: '深入 A20 芯片内部一次' },
  { id: 'racer',  ic: '⚡', nm: '超频骑手',   ds: '电流竞速单局拿下 2000 分' },
  { id: 'turret', ic: '🔋', nm: '电网工程师', ds: '深入电池布置离子塔防' },
  { id: 'shield', ic: '🛡', nm: '电芯守卫者', ds: '离子塔防守住全部 6 波电涌' },
  { id: 'shoot',  ic: '🎯', nm: '点阵射手',   ds: '进入 Face ID 点阵空间' },
  { id: 'scan',   ic: '✦', nm: '深度扫描',   ds: '点阵射击点亮 25 个目标' },
  { id: 'waver',  ic: '🌊', nm: '浪尖骑士',   ds: '踏上扬声器声波冲浪板' },
  { id: 'beat',   ic: '🎵', nm: '金牌混音师', ds: '声波冲浪单局拿下 1500 分' },
  { id: 'magnet', ic: '🧲', nm: '磁场行者',   ds: '进入 MagSafe 磁力迷阵' },
  { id: 'roll',   ic: '⚪', nm: '滚珠大师',   ds: '磁力迷阵三关全通' },
  { id: 'world1', ic: '◈', nm: '异世界旅人', ds: '接入 A20 内部的赛博都市' },
  { id: 'world5', ic: '❖', nm: '重启之心',   ds: '异世界集齐 5 枚核心碎片，重启 A20' },
];
let badgeStore = {};
try { badgeStore = JSON.parse(localStorage.getItem('iphoneDuo.badges') || '{}'); } catch { /* 损坏则重建 */ }
function award(id) {
  if (badgeStore[id]) return;
  const b = BADGES.find((x) => x.id === id);
  if (!b) return;
  badgeStore[id] = Date.now();
  localStorage.setItem('iphoneDuo.badges', JSON.stringify(badgeStore));
  const got = BADGES.filter((x) => badgeStore[x.id]).length;
  toastMsg(`${b.ic} 解锁徽章「${b.nm}」· ${got}/${BADGES.length}`);
  sfx('right'); buzz(12);
  renderBadges(id);
}
function renderBadges(popId) {
  const got = BADGES.filter((x) => badgeStore[x.id]).length;
  $('#badgeCount').textContent = `${got}/${BADGES.length}`;
  $('#badgeGrid').innerHTML = '';
  for (const b of BADGES) {
    const d = document.createElement('div');
    d.className = 'bd' + (badgeStore[b.id] ? ' got' : '') + (b.id === popId ? ' pop' : '');
    d.innerHTML = `<div class="ic">${b.ic}</div><div class="nm">${b.nm}</div><div class="ds">${b.ds}</div>`;
    $('#badgeGrid').append(d);
  }
}
function toggleBadges(force) {
  const want = force !== undefined ? force : !$('#badges').classList.contains('on');
  $('#badges').classList.toggle('on', want);
  $('#btnBadges').classList.toggle('active', want);
  if (want) renderBadges();
}

// 每日挑战：日期做种子 → 同一天全世界题目一样 → 答对 3/5 打卡 → 连续天数。
// 没达标可以当场重试（题序重新洗），打卡以当天最好成绩为准。
const daily = { on: false, qs: [], idx: 0, right: 0, ans: '' };
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dailyStore() {
  try { return JSON.parse(localStorage.getItem('iphoneDuo.daily') || '{}'); } catch { return {}; }
}
function dailyStreak(s) { return Math.max(1, (s.streak || 0)); }
function buildDaily() {
  const rnd = mulberry32(parseInt(dateKey().replaceAll('-', ''), 10) ^ 0x9E3779B9);
  const pool = [...model.parts];
  const qs = [];
  while (qs.length < Math.min(5, pool.length)) {
    const p = pool[(rnd() * pool.length) | 0];
    if (!qs.includes(p)) qs.push(p);
  }
  // 每题 4 选项：答案 + 3 个干扰（同样由日期种子决定 → 当天固定）
  return qs.map((p) => {
    const opts = [p.id];
    while (opts.length < 4) {
      const c = pool[(rnd() * pool.length) | 0];
      if (!opts.includes(c.id)) opts.push(c.id);
    }
    return { ans: p.id, opts: opts.sort(() => rnd() - 0.5) };
  });
}
function dailyRender() {
  const s = dailyStore();
  if (s.date === dateKey() && s.done) {         // 今日已打卡：展示结算
    $('#dailyBody').innerHTML = `<div class="done"><div class="big">✅</div>
      <p>今日挑战完成<br>连续打卡 <b>${dailyStreak(s)}</b> 天</p></div>`;
    return;
  }
  const q = daily.qs[daily.idx];
  $('#dailyBody').innerHTML = `
    <div class="prog">第 ${daily.idx + 1} / ${daily.qs.length} 题 · 已答对 ${daily.right} 题（需 3 题）</div>
    <div class="q">镜头对准的部件是？<small>从 4 个名字里选出它</small></div>
    <div class="opts">${q.opts.map((id) => `<button data-id="${id}">${model.parts.find((p) => p.id === id).name}</button>`).join('')}</div>`;
  $('#dailyBody').querySelectorAll('.opts button').forEach((b) => b.onclick = () => dailyAnswer(b.dataset.id, b));
  quizFly(q.ans);                                 // 复用部件大师的特写飞行
}
function dailyAnswer(id, btn) {
  if (daily.ans) return;
  daily.ans = id;
  const right = id === daily.qs[daily.idx].ans;
  btn.classList.add(right ? 'right' : 'wrong');
  if (right) { daily.right++; sfx('right'); buzz(12); } else { sfx('wrong'); buzz([26]); }
  setTimeout(() => {
    daily.ans = '';
    daily.idx++;
    if (daily.idx < daily.qs.length) dailyRender();
    else dailyFinish();
  }, right ? 650 : 1100);
}
function dailyFinish() {
  if (daily.right >= 3) {
    const s = dailyStore();
    const today = dateKey();
    const yest = dateKey(new Date(Date.now() - 86400000));
    const streak = s.date === yest && s.streak ? s.streak + 1 : 1;   // 昨天打过 → 续连击
    const rec = { date: today, done: 1, streak };
    localStorage.setItem('iphoneDuo.daily', JSON.stringify(rec));
    award('daily1');
    if (streak >= 7) award('daily7');
    burstConfetti();
    $('#dailyBody').innerHTML = `<div class="done"><div class="big">🎉</div>
      <p>打卡成功 · 答对 <b>${daily.right}</b> / ${daily.qs.length} 题<br>连续打卡 <b>${streak}</b> 天</p></div>`;
    sfx('boot'); buzz([18, 60, 18, 60, 36]);
  } else {
    $('#dailyBody').innerHTML = `<div class="done"><div class="big">💪</div>
      <p>答对 ${daily.right} / ${daily.qs.length} 题，差一点点<br>再试一次，今天还来得及</p></div>
      <div class="row" style="margin-top:12px"><button id="dailyRetry" class="ghost">再试一次</button></div>`;
    $('#dailyRetry').onclick = () => { daily.qs = buildDaily(); daily.idx = 0; daily.right = 0; dailyRender(); };
  }
}
function toggleDaily(force) {
  const want = force !== undefined ? force : !$('#daily').classList.contains('on');
  $('#daily').classList.toggle('on', want);
  $('#btnDaily').classList.toggle('active', want);
  if (want) {
    const s = dailyStore();
    const fresh = !(s.date === dateKey() && s.done);
    if (fresh || daily.idx >= daily.qs.length || !daily.qs.length) {
      daily.qs = buildDaily(); daily.idx = 0; daily.right = 0;
    }
    dailyRender();
  } else {
    model.setFocus(null);   // 收回 quizFly 的特写
  }
}

// 换色 DIY：机身/背板件 tint 上色（材质 color 覆写），按设备持久化。
// 首次上色时记录 baseColor，恢复原色零残留；与 X 光/蓝图无冲突（它们 swap 的是材质指针）。
const TINTS = [
  { id: 'titan',   nm: '钛原色', hex: null,       css: '#8e959e' },
  { id: 'black',   nm: '钛黑',   hex: '#2a2c30', css: '#2a2c30' },
  { id: 'star',    nm: '星光白', hex: '#e8e4da', css: '#e8e4da' },
  { id: 'gold',    nm: '沙漠金', hex: '#c9a86a', css: '#c9a86a' },
  { id: 'blue',    nm: '深空蓝', hex: '#3a5a8c', css: '#3a5a8c' },
  { id: 'red',     nm: '绯红',   hex: '#b04040', css: '#b04040' },
  { id: 'green',   nm: '松岭绿', hex: '#3d6b4f', css: '#3d6b4f' },
  { id: 'purple',  nm: '暮山紫', hex: '#6b5a8c', css: '#6b5a8c' },
];
let tintCur = null;   // 当前色 id（null = 原色）
function tintTargets() { return model.parts.filter((p) => p.cat === 'body' || p.cat === 'display'); }
function applyTint(hex) {
  for (const p of tintTargets()) for (const m of p.mats) {
    m.userData.baseColor ||= m.color.clone();
    if (hex) m.color.set(hex);
    else m.color.copy(m.userData.baseColor);
  }
}
function setTint(id, save = true) {
  const t = TINTS.find((x) => x.id === id);
  tintCur = t && t.hex ? t.id : null;
  applyTint(t?.hex || null);
  if (save) {
    if (tintCur) localStorage.setItem(`iphoneDuo.tint.${CUR}`, tintCur);
    else localStorage.removeItem(`iphoneDuo.tint.${CUR}`);
  }
  document.querySelectorAll('#tintSwatches button').forEach((b) => b.classList.toggle('active', b.dataset.tint === (tintCur || 'titan')));
  if (t && t.hex) { sfx('snap'); buzz(8); }
}
function buildTintUI() {
  $('#tintSwatches').innerHTML = TINTS.map((t) =>
    `<button data-tint="${t.id}" style="background:${t.css}" title="${t.nm}"><small>${t.nm}</small></button>`).join('');
  document.querySelectorAll('#tintSwatches button').forEach((b) => b.onclick = () => setTint(b.dataset.tint));
  $('#tintReset').onclick = () => setTint('titan');
  const saved = localStorage.getItem(`iphoneDuo.tint.${CUR}`);
  setTint(saved || 'titan', false);
}
function toggleTint(force) {
  const want = force !== undefined ? force : !$('#tint').classList.contains('on');
  $('#tint').classList.toggle('on', want);
  $('#btnTint').classList.toggle('active', want);
}

// ---------------- 第五波 B：开机序列 · 分享卡片 ----------------
// 开机序列：全屏黑幕 → 品牌 Logo 亮起 → 退场时屏幕辉光脉冲，像真的按下了电源键。
// 相位延时走墙钟（不走 tween 帧时钟）：电影化时间线不该被低帧率拖长。
const power = { on: false };
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function powerOn() {
  if (power.on) return;
  power.on = true;
  $('#btnPower').classList.add('active');
  const ov = $('#powerOverlay');
  $('#powerLogo').textContent = DEV().name.toUpperCase();
  ov.classList.add('on');                    // 黑幕淡入
  sfx('ui'); buzz(10);
  await sleepMs(1400);
  ov.classList.add('lit');                   // Logo 亮起
  await sleepMs(2400);
  ov.classList.remove('lit');
  await sleepMs(700);
  ov.classList.remove('on');                 // 黑幕退场
  // 屏幕辉光脉冲：bloom 短暂拉满再回落，模拟背光点亮
  const b0 = bloom.strength, t0 = bloom.threshold;
  tween(1.6, (k) => { bloom.strength = b0 + 1.1 * Math.sin(PI * Math.min(k * 1.6, 1)); bloom.threshold = t0 + 0.25 * k; })
    .then(() => { bloom.strength = b0; bloom.threshold = t0; });
  sfx('boot'); buzz([18, 60, 18, 60, 36]);
  award('power');
  power.on = false;
  $('#btnPower').classList.remove('active');
}

// 分享卡片：当前视角截图 → 合成 1080×1440 海报（品牌 + 视角 + 链接条）→ 下载 PNG。
// 截图走壁纸工厂同款路子（瞬时改分辨率渲染一帧再 toBlob），色彩与屏幕所见一致。
async function exportCard() {
  const btn = $('#btnCard');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const pr = pixelRatio;
    const [w, h] = [Math.round(innerWidth * 1.5), Math.round(innerHeight * 1.5)];
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.render();
    const shot = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    // 还原渲染尺寸（屏幕只模糊一瞬）
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    // 合成海报
    const W = 1080, H = 1440;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171821'); g.addColorStop(1, '#0a0b10');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    x.fillStyle = '#fff'; x.font = '600 66px -apple-system, "PingFang SC", sans-serif';
    x.fillText(DEV().name, W / 2, 128);
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '400 26px sans-serif';
    x.fillText('3D 爆炸图 · 拖一拖，拆开看看', W / 2, 178);
    // 视角截图：圆角裁剪 + cover 填充
    const img = await createImageBitmap(shot);
    const iw = 920, ih = 980, ix = (W - iw) / 2, iy = 226;
    const s = Math.max(iw / img.width, ih / img.height);
    const dw = img.width * s, dh = img.height * s;
    x.save();
    x.beginPath(); x.roundRect(ix, iy, iw, ih, 30); x.clip();
    x.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    x.restore();
    // 链接条
    const url = buildShareURL();
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.beginPath(); x.roundRect(90, H - 148, W - 180, 72, 36); x.fill();
    x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '500 23px ui-monospace, monospace';
    x.fillText(url.length > 52 ? url.slice(0, 51) + '…' : url, W / 2, H - 102);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.font = '400 20px sans-serif';
    x.fillText('打开链接 · 还原这个视角', W / 2, H - 46);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${DEV().name.replace(/\s+/g, '')}-分享卡片.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    sfx('shutter'); buzz(12);
    toastMsg('▣ 分享卡片已导出');
    award('share');   // 卡片也算分享家
  } finally {
    btn.disabled = false;
  }
}

// ---------------- 新玩法按钮绑定 ----------------
function bindFun() {
  const sb = $('#btnSfx');
  const syncSfxBtn = () => { sb.classList.toggle('active', !sfxMuted()); sb.textContent = sfxMuted() ? '♪ 静音' : '♪ 音效'; };
  sb.onclick = () => { toggleSfx(); syncSfxBtn(); };
  syncSfxBtn();
  $('#btnEnv').onclick = () => {
    const ks = Object.keys(ENVS);
    setEnv(ks[(ks.indexOf(curEnv) + 1) % ks.length]);
    sfx('ui'); buzz(8);
  };
  $('#btnWall').onclick = exportWallpaper;
  $('#btnQuiz').onclick = () => toggleQuiz();
  $('#quizClose').onclick = () => toggleQuiz(false);
  document.querySelectorAll('#quizModes button').forEach((b) => (b.onclick = () => {
    if (quiz.mode === b.dataset.qm) return;
    quiz.mode = b.dataset.qm;
    document.querySelectorAll('#quizModes button').forEach((x) => x.classList.toggle('active', x === b));
    quiz.streak = 0;
    clearTimeout(quiz.t);
    quizNext();
  }));
  $('#btnAsm').onclick = () => toggleAsm();
  $('#asmClose').onclick = () => toggleAsm(false);
  $('#asmGiveup').onclick = () => toggleAsm(false, true);
  $('#btnRec').onclick = toggleRec;
  $('#btnAR').onclick = toggleAR;
  $('#btnToss').onclick = tossPhone;
  $('#btnXray').onclick = () => setVisMode('xray');
  $('#btnBlue').onclick = () => setVisMode('blueprint');
  $('#btnCut').onclick = () => setCut(!cut.on);
  $('#btnZen').onclick = () => toggleZen();
  $('#btnShare').onclick = shareLink;
  $('#btnDaily').onclick = () => toggleDaily();
  $('#btnBadges').onclick = () => toggleBadges();
  $('#btnTint').onclick = () => toggleTint();
  $('#btnPower').onclick = powerOn;
  $('#btnCard').onclick = exportCard;
  $('#btnWorld').onclick = () => toggleWorld();
  $('#cutDepth').oninput = (e) => setCutDepth(e.target.value / 100);
  $('#dailyClose').onclick = () => toggleDaily(false);
  $('#badgesClose').onclick = () => toggleBadges(false);
  $('#tintClose').onclick = () => toggleTint(false);
}

// 测试探针：新玩法状态（e2e 断言用）
window.__fun = () => ({
  env: curEnv, sfx: !sfxMuted(), ex: S.explode,
  vis, cutOn: cut.on, cutK: cut.k, zen: zen.on,
  quiz: { on: quiz.on, mode: quiz.mode, streak: quiz.streak, best: quiz.best, ans: quiz.ans, ansName: model.parts.find((p) => p.id === quiz.ans)?.name },
  asm: { on: asm.on, left: asm.queue.length, done: asm.done, total: asm.total, next: asm.queue[0] || null, nextName: model.parts.find((p) => p.id === asm.queue[0])?.name },
  phys: phys.on, rec: rec.on, ar: ar.on, wallW: DEV().screens[DEV().tabs[0][0]][0],
  bg: scene.background ? '#' + scene.background.getHexString() : null, grid: bpGrid.visible,
  rpass: renderPass.scene === scene && renderPass.camera === camera,   // e2e：微观退出后渲染管线已切回主场景
  micro: {
    on: micro.on, run: micro.run, over: micro.over,
    score: micro.score, lives: micro.lives, combo: micro.combo, speed: Math.round(micro.speed),
    best: micro.best, gotE: micro.gotE,
    gameOn: $('#game').classList.contains('on'),
    overOn: document.querySelector('#gOver').classList.contains('on'),
  },
  arcade: {                                            // e2e：四款部件小游戏的状态快照
    cur: curGame,
    turret: { on: turret.on, run: turret.run, over: turret.over, gold: turret.gold, score: turret.score, coreHp: turret.coreHp, wave: turret.wave, kills: turret.kills,
      hudOn: document.querySelector('#tgame')?.classList.contains('on') },
    shoot: { on: shoot.on, run: shoot.run, over: shoot.over, score: shoot.score, hit: shoot.hit, combo: shoot.combo, need: shoot.need,
      hudOn: document.querySelector('#sgame')?.classList.contains('on') },
    waver: { on: wave.on, run: wave.run, over: wave.over, score: wave.score, vol: wave.vol, combo: wave.combo,
      hudOn: document.querySelector('#wgame')?.classList.contains('on') },
    maze: { on: maze.on, run: maze.run, over: maze.over, lv: maze.lv, score: maze.score, time: Math.ceil(maze.time),
      hudOn: document.querySelector('#zgame')?.classList.contains('on') },
  },
  world: {                                            // e2e：异世界（第一人称元器件都市）状态快照
    on: world.on, cur: curGame, viaWorld: fromWorld,
    frags: world.frags.length, fragIds: [...world.frags], finale: world.finale, near: world.near,
    layerOn: document.querySelector('#vgame')?.classList.contains('on'),
    rpassWd: renderPass.scene === wdScene && renderPass.camera === wdCam,   // 渲染管线是否已接管异世界
  },
  fifth: {
    dev: CUR,
    badgeN: Object.keys(badgeStore).filter((k) => BADGES.some((b) => b.id === k)).length,
    badgeIds: Object.keys(badgeStore),
    tint: tintCur,
    tintHex: (() => { const p = model.parts.find((x) => x.cat === 'body'); const m = p?.mats?.[0]; return m ? '#' + m.color.getHexString() : null; })(),
    dailyOn: $('#daily').classList.contains('on'),
    dailyIdx: daily.idx, dailyRight: daily.right, dailyTotal: daily.qs.length,
    dailyAns: daily.qs[daily.idx]?.ans || null,
    dailyDone: dailyStore().done === 1 && dailyStore().date === dateKey(),
    dailyStreak: dailyStreak(dailyStore()),
    powerOn: power.on,
  },
});
window.__share = shareLink;
// 材质 swap 抽样：外壳件 / 内部件各取首个 mesh 的当前材质特征（e2e 断言 X 光/蓝图生效）
window.__mats = () => {
  const body = model.parts.find((p) => shellOf(p)), core = model.parts.find((p) => !shellOf(p));
  const f = (p) => { const m = p?.meshes[0]?.material; return m ? { wire: !!m.wireframe, color: '#' + m.color?.getHexString() } : null; };
  return { body: f(body), core: f(core) };
};

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  runTweens(dt);
  // 异世界：第一人称独立分支（行走 tick + 直接出图，controls/模型/物理全部挂起）
  if (world.on) {
    tickWorld(dt);
    composer.render();
    requestAnimationFrame(frame);
    return;
  }
  // 微观世界：独立分支——游戏 tick + 直接出图（controls/模型/物理全部挂起）
  if (micro.on) {
    tickMicro(dt);
    composer.render();
    requestAnimationFrame(frame);
    return;
  }
  // 部件小游戏四件套：同构独立分支（进入时 renderPass 已切到对应游戏场景/相机）
  if (turret.on) { tickTurret(dt); composer.render(); requestAnimationFrame(frame); return; }
  if (shoot.on) { tickShoot(dt); composer.render(); requestAnimationFrame(frame); return; }
  if (wave.on) { tickWave(dt); composer.render(); requestAnimationFrame(frame); return; }
  if (maze.on) { tickMaze(dt); composer.render(); requestAnimationFrame(frame); return; }
  controls.autoRotate = (S.auto || zen.on) && !S.keynote;   // 沉浸模式 = 展台自转
  controls.update();

  model.setFold(S.fold);
  model.setExplode(S.explode);
  model.update(dt);

  // 物理玩具：抛掷刚体 + 爆炸态部件弹飞弹簧
  tickPhys(dt);
  tickKicks(dt);

  // 屏保内部自调度：仅交叉淡入 / 分钟跳变 / 脏标记时才重绘，功耗极低
  Object.values(DEV().locks).forEach((k) => k.tick(dt));
  if ($('#custom').classList.contains('on') && lockOf(ssTarget).idx !== thumbIdx) markThumb();
  // 抛掷进行中 stage 由物理接管，跳过常规定位（否则每帧被拉回原位）
  if (phys.on) {
    shadow.scale.set(300, 120, 1);
    shadow.material.opacity = 0.5;
  } else if (DEV().hasFold) {
    const f = S.fold / PI;
    stage.position.set(-40 * f, 0, -1.75 * f);
    shadow.scale.set(220 - 110 * f + S.explode * 30, 70 + S.explode * 240 + f * 10, 1);
    shadow.material.opacity = 0.85 - S.explode * 0.35;
  } else {
    stage.position.set(0, 0, 0);
    shadow.scale.set(220 + S.explode * 30, 70 + S.explode * 240, 1);
    shadow.material.opacity = 0.85 - S.explode * 0.35;
  }
  // 拆装挑战计时实时刷新（不另开定时器）
  if (asm.on) updateAsmUI();

  if (mouseDirty && !S.keynote) { mouseDirty = false; pick(); }
  tickConfetti(dt);
  composer.render();          // Bloom 后处理渲染（常态阈值 0.9，几乎只有屏幕高光受益）
  updateLabels();
  syncUI();

  // 自适应分辨率
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc;
    if (fps < 38 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
    }
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  document.body.classList.toggle('mobile', isMobile());
  fitCamera();
  setShift(S.keynote);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
});

// ---------------- 启动 ----------------
let loaderDone = false;
async function boot() {
  const bar = $('#loadBar');
  // file:// / 老旧内置浏览器（如微信 X5）可能不支持 ES module + importmap：
  // 模块加载失败时 loader 永远不动，12s 后给出人话指引而不是黑屏干等
  setTimeout(() => {
    if (loaderDone) return;
    const ls = $('#loader .ls');
    if (ls) ls.textContent = '加载缓慢或此浏览器暂不支持。请改用 Chrome / Safari 打开本文件，或使用在线演示链接';
  }, 12000);
  const step = (p) => new Promise((r) => { bar.style.width = `${p}%`; requestAnimationFrame(() => setTimeout(r, 30)); });
  await step(15);
  // 发布者默认配置：本机无记录时启用（用户上传过自己的配置则本机优先）
  const d = await loadDefaultConfig();
  defaultCfg = d.cfg;
  store = loadStore('duo');
  const dc = cfgFor(d.cfg, 'duo');
  if (dc && !localStorage.getItem(DEVICES.duo.storeKey) && !localStorage.getItem(LEGACY)) store = dc;
  // 彩蛋贴画（如有）先解码成轮廓画布，再进 build——微雕一次性烙进部件纹理
  await decodeEggImage(eggs);
  // 动态锁屏纹理直接注入材质（emissiveMap 引用 CanvasTexture，之后靠 needsUpdate 刷新）
  model = built.duo = DEVICES.duo.build();
  stage.add(model.root);
  await step(55);
  buildUI();
  bindUI();
  bindCustom();
  bindEggs();
  bindFun();
  setScheme('white');
  svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  model.update(0);
  if (eggs.fx) model.setFrameIri(true);   // 曾找齐彩蛋：虹彩中框开机即恢复
  buildTintUI();                           // 换色 DIY：色板 + 本机记忆色恢复
  award('first');                          // 初来乍到：第一次打开这台 3D 手机
  await step(75);
  await renderer.compileAsync?.(scene, camera);
  await step(100);
  loaderDone = true;
  $('#loader').classList.add('done');
  requestAnimationFrame(frame);
  showSbGuide();   // 手机端进场引导：loader 一结束就亮拉手 + 气泡（不等开场展开动画）
  // URL ?dev= 直达指定设备（分享直链 / 无障碍入口），需在 keynote 之前切换
  const q = new URLSearchParams(location.search);
  const qdev = DEVICES[q.get('dev')] ? q.get('dev') : null;
  if (qdev && qdev !== 'duo') switchDevice(qdev);
  // 分享链接状态还原：环境 / 配色 / 爆炸度（打开即还原现场，并跳过开场演示）
  const shared = qdev || q.has('env') || q.has('ex') || q.has('sch');
  if (ENVS[q.get('env')]) setEnv(q.get('env'));
  if (q.get('sch')) setScheme(q.get('sch'));
  const exq = parseFloat(q.get('ex'));
  if (!isNaN(exq)) setExplode(exq);
  // ?eggs / #eggs：彩蛋工坊专属直链（移动端无键盘也能直达定制页），并跳过开场演示
  const eggDirect = q.has('eggs') || location.hash === '#eggs';
  // 首次打开（或 ?demo）：像宣传片一样自动播放发布会演示，Esc / 「退出演示」可随时打断
  const SEEN = 'iphoneDuo.seen';
  const first = (!localStorage.getItem(SEEN) || q.has('demo')) && !eggDirect && !shared;
  if (first) {
    localStorage.setItem(SEEN, '1');
    setFold(PI); setExplode(0);
    await wait(0.5);
    startKeynote();
    return;
  }
  // 非首次：开场从合上状态展开
  if (eggDirect) { localStorage.setItem(SEEN, '1'); openEggs(); }
  setFold(PI);
  await wait(0.4);
  flyTo(...VIEWS.hero, 2.6);
  await animFold(0, 2.6);
}
boot();
