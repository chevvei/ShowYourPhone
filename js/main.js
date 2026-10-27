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

// 影棚环境：柔光箱 + 灯条，用于钛金属镜面反射
function studioEnv() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x07080a, side: THREE.BackSide })));
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
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioEnv(), 0.03).texture;

// 后处理：UnrealBloom 泛光——常态只给屏幕高光一点辉光（阈值以上才生效，几乎无感），
// 找齐全部隐藏细节后短暂增强，让虹彩中框 / 彩带 / 灵动岛流光“炸”开
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(-200, 300, 250);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbcd4ff, 1.0);
rim.position.set(250, 120, -300);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.35));

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
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || S.keynote) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > (e.pointerType === 'touch' ? 10 : 4)) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick();
  // 屏幕内「假手机」交互：命中屏幕时先把点击交给锁屏 UI（照片 App / 手电筒），
  // 被吃掉就不再触发部件选择——像真的在用这台 3D 手机
  if (lastHit && lastHit.uv) {
    const scr = (SCREEN_LOCKS[CUR] || {})[lastHit.object.userData.partId];
    if (scr) {
      const [sw, sh] = DEV().screens[scr];
      if (lockOf(scr).hit(lastHit.uv.x * sw, (1 - lastHit.uv.y) * sh)) { pokeUI(); return; }
    }
  }
  selectPart(hovered ? hovered.id : null, false);
});

// 移动端：触碰哪半边就滑出哪一侧（部件栏 / 控制坞不同时占屏），静置 5 秒自动收起
let uiTimer = 0;
function pokeUI(e) {
  if (!document.body.classList.contains('mobile') || S.keynote) return;
  document.body.classList.add('ui', 'touched');
  if (e && e.clientX !== undefined) {
    const left = e.clientX < innerWidth * 0.5;
    document.body.classList.toggle('uiL', left);
    document.body.classList.toggle('uiR', !left);
  }
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => document.body.classList.remove('ui', 'uiL', 'uiR'), 5000);
}
for (const ev of ['pointerdown', 'touchstart', 'input']) addEventListener(ev, pokeUI, { capture: true, passive: true });
for (const el of ['#parts', '#dock']) $(el).addEventListener('scroll', pokeUI, { passive: true });

// 桌面端：鼠标贴左缘 / 底缘滑出侧栏与底栏，离开后自动隐藏——与移动端同为全屏沉浸
let edgeTimer = 0;
addEventListener('pointermove', (e) => {
  if (document.body.classList.contains('mobile') || S.keynote) return;
  const nearL = e.clientX < 28, nearB = e.clientY > innerHeight - 28;
  if (!nearL && !nearB && e.clientX > 320 && e.clientY < innerHeight - 220) {
    // 远离两块面板：延时收起（期间移回可取消）
    clearTimeout(edgeTimer);
    edgeTimer = setTimeout(() => document.body.classList.remove('edgeL', 'edgeB'), 2400);
    return;
  }
  clearTimeout(edgeTimer);
  if (nearL) document.body.classList.add('edgeL');
  if (nearB) document.body.classList.add('edgeB');
}, { passive: true });

let lastHit = null;   // 最近一次射线命中（pointerup 用它的 uv 做屏幕内交互）
function pick() {
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(model.pickables(), false)[0];
  lastHit = hit || null;
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

function selectPart(id, fly) {
  S.selected = id;
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
  $('#btnOpen').onclick = () => { cancelTweens(); animExplode(0, 0.8).then(() => animFold(0)); };
  $('#btnClose').onclick = () => { cancelTweens(); selectPart(null); animExplode(0, 0.8).then(() => animFold(PI)); };
  $('#btnExplode').onclick = async () => {
    cancelTweens();
    if (S.explode > 0.5) { animExplode(0); return; }
    if (S.fold > 0.01) await animFold(0, 1.2);
    animExplode(1);
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
  document.querySelectorAll('#devTabs button').forEach((b) => (b.onclick = () => switchDevice(b.dataset.dev)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S.keynote) stopKeynote();
      else if ($('#custom').classList.contains('on')) $('#custom').classList.remove('on');
      else selectPart(null);
    }
    if (S.keynote) return;
    if (e.key === 'e' || e.key === 'E') $('#btnExplode').click();
    if ((e.key === 'f' || e.key === 'F') && DEV().hasFold) (S.fold > 1 ? $('#btnOpen') : $('#btnClose')).click();
    if (e.key === 'k' || e.key === 'K') startKeynote();
    if (e.key === 'l' || e.key === 'L') $('#btnLabels').click();   // 标注 隐藏/显示
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
  cancelTweens();
  CUR = dev;
  const D = DEVICES[dev];
  document.body.dataset.dev = dev;
  document.querySelectorAll('#devTabs button').forEach((b) => b.classList.toggle('active', b.dataset.dev === dev));
  $('#brandName').textContent = D.name;
  document.title = `${D.name} · 3D 爆炸图`;
  $('#hint').textContent = D.hasFold
    ? '拖拽旋转 · 滚轮缩放 · 右键平移 · E 爆炸 · F 开合 · K 演示'
    : '拖拽旋转 · 滚轮缩放 · 右键平移 · E 爆炸 · K 演示';
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
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  runTweens(dt);
  controls.autoRotate = S.auto && !S.keynote;
  controls.update();

  model.setFold(S.fold);
  model.setExplode(S.explode);
  model.update(dt);

  // 屏保内部自调度：仅交叉淡入 / 分钟跳变 / 脏标记时才重绘，功耗极低
  Object.values(DEV().locks).forEach((k) => k.tick(dt));
  if ($('#custom').classList.contains('on') && lockOf(ssTarget).idx !== thumbIdx) markThumb();
  // 合上时让机身保持居中（Duo）；直板机固定居中
  if (DEV().hasFold) {
    const f = S.fold / PI;
    stage.position.set(-40 * f, 0, -1.75 * f);
    shadow.scale.set(220 - 110 * f + S.explode * 30, 70 + S.explode * 240 + f * 10, 1);
  } else {
    stage.position.set(0, 0, 0);
    shadow.scale.set(220 + S.explode * 30, 70 + S.explode * 240, 1);
  }
  shadow.material.opacity = 0.85 - S.explode * 0.35;

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
  setScheme('white');
  svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  model.update(0);
  if (eggs.fx) model.setFrameIri(true);   // 曾找齐彩蛋：虹彩中框开机即恢复
  await step(75);
  await renderer.compileAsync?.(scene, camera);
  await step(100);
  loaderDone = true;
  $('#loader').classList.add('done');
  requestAnimationFrame(frame);
  // URL ?dev= 直达指定设备（分享直链 / 无障碍入口），需在 keynote 之前切换
  const q = new URLSearchParams(location.search);
  const qdev = DEVICES[q.get('dev')] ? q.get('dev') : null;
  if (qdev && qdev !== 'duo') switchDevice(qdev);
  // ?eggs / #eggs：彩蛋工坊专属直链（移动端无键盘也能直达定制页），并跳过开场演示
  const eggDirect = q.has('eggs') || location.hash === '#eggs';
  // 首次打开（或 ?demo）：像宣传片一样自动播放发布会演示，Esc / 「退出演示」可随时打断
  const SEEN = 'iphoneDuo.seen';
  const first = (!localStorage.getItem(SEEN) || q.has('demo')) && !eggDirect;
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
