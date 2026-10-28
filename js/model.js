// iPhone Duo 3D 模型：结构、折叠、爆炸、聚焦
import * as THREE from 'three';
import * as TX from './textures.js';
import { D, P18, fullRect, rrShape, halfRect, slab, planarUV, roundedGrid, bend, gearGeometry, springGeometry, materials, SCHEMES } from './geo.js';

const { H, T, XI, XO } = D;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 彩蛋微雕贴片：透明纹理 plane 紧贴部件表面（挂为 mesh 子节点，爆炸时随部件一起位移）
const eggPlane = (tex, w, h, parent, pos, rotX = 0) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  if (rotX) m.rotation.x = rotX;
  m.position.copy(pos);
  m.userData.egg = true;   // 调试 / 测试探针标记
  parent.add(m);
  return m;
};

export function buildPhone(opts = {}) {
  const EG = opts.eggs || {};
  const tex = {
    inner: opts.innerTex || TX.innerScreen(), outer: opts.outerTex || TX.outerScreen(), nano: TX.nanoNormal(), pcb: TX.pcb(),
    batA: TX.battery(2962, '11.567', 'A3527'), batB: TX.battery(1921, '7.506', 'A3528'),
    lattice: TX.latticeAlpha(166, 20), backRough: TX.backGlassRoughness(), vc: TX.vaporChamber(),
    coil: TX.coil(), flex: TX.flex(),
    engrave: TX.createEngraving(),
  };
  const M = materials(tex);

  const root = new THREE.Group();          // 右半机身坐标系（固定）
  const left = new THREE.Group();          // 左半机身（随折叠刚体运动）
  const mid = new THREE.Group();           // 铰链核心（转动一半角度）
  root.add(left, mid);

  const parts = [];
  const deformables = [];
  const mesh = (geo, mat, parent, pos) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    parent && parent.add(m);
    return m;
  };
  const group = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); parent.add(g); return g; };
  const addPart = (id, info, items) => parts.push({ id, ...info, items: items.map(([obj, dir]) => ({ obj, dir, base: obj.position.clone() })) });
  const deformable = (m) => { m.geometry.userData.orig = m.geometry.attributes.position.array.slice(); deformables.push(m); return m; };

  // ---------------- 内屏堆叠（跨越铰链，可弯折） ----------------
  const DW = 2 * XO - 1.4, DH = H - 1.4;
  const cover = deformable(mesh(roundedGrid(DW, DH, 7.6, 320, 60, 0), M.cover, root));
  cover.renderOrder = 2;
  const oled = deformable(mesh(roundedGrid(DW, DH, 7.6, 320, 60, -0.07), M.innerOLED, root));
  const support = deformable(mesh(roundedGrid(DW - 1, DH - 1, 7, 320, 40, -0.13), M.support, root));
  addPart('cover', { name: '纳米纹理内屏盖板', en: 'Nano-texture Cover', spec: '超薄柔性玻璃 · 圆形微凸起散射光线，弱化折痕', cat: 'display' }, [[cover, V(0, 0, 118)]]);
  addPart('oled', { name: '7.6 英寸柔性 OLED 内屏', en: 'Super Retina XDR', spec: 'ProMotion · Always On · 3000 尼特户外峰值亮度', cat: 'display' }, [[oled, V(0, 0, 92)]]);
  addPart('support', { name: '显示屏支撑板', en: 'Display Support Plate', spec: '弯折区激光镂空格栅，兼顾柔性与平整度', cat: 'display' }, [[support, V(0, 0, 68)]]);

  // ---------------- 钛金属中框（左右各一） ----------------
  function frame(side, parent) {
    const g = group(parent);
    const o = halfRect(side, 0.35), i = halfRect(side, 1.5, D.CR, 0.8);
    const sh = rrShape(o.x0, o.y0, o.x1, o.y1, o.radii);
    sh.holes.push(rrShape(i.x0, i.y0, i.x1, i.y1, i.radii, THREE.Path));
    mesh(slab(sh, -T, -0.15, 0.35, 32), M.titanium, g);
    const mp = halfRect(side, 1.2, D.CR, 0.6);
    mesh(slab(rrShape(mp.x0, mp.y0, mp.x1, mp.y1, mp.radii), -T + 1.0, -T + 1.3, 0, 16), M.midplate, g);
    // 天线断点
    const xo = side * XO;
    [-46, 46].forEach(y => mesh(new THREE.BoxGeometry(0.6, 1.0, T - 0.9), M.antenna, g, V(xo - side * 0.28, y, -T / 2 - 0.05)));
    [side * (XI + 22), side * (XO - 22)].forEach(x => {
      mesh(new THREE.BoxGeometry(1.0, 0.6, T - 0.9), M.antenna, g, V(x, H / 2 - 0.28, -T / 2 - 0.05));
      mesh(new THREE.BoxGeometry(1.0, 0.6, T - 0.9), M.antenna, g, V(x, -H / 2 + 0.28, -T / 2 - 0.05));
    });
    return g;
  }
  const frameR = frame(1, root);
  const frameL = frame(-1, left);
  // 左半底部：USB-C 开孔、扬声器孔
  const ports = group(frameL);
  const usbHole = new THREE.Mesh(slab(rrShape(-4.4, -1.3, 4.4, 1.3, [1.3, 1.3, 1.3, 1.3]), 0, 0.4, 0, 10), M.rubber);
  usbHole.rotation.x = Math.PI / 2; usbHole.position.set(-40, -H / 2 + 0.25, -T / 2); ports.add(usbHole);
  eggPlane(TX.usbBatch(), 6, 1.5, ports, V(-40, -H / 2 + 0.06, -T / 2), Math.PI / 2);   // 彩蛋：USB-C 口最深处批号（俯身才可见）
  for (let k = 0; k < 6; k++) {
    mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 12), M.rubber, ports, V(-24 + k * 1.6, -H / 2 + 0.1, -T / 2));
    mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 12), M.rubber, ports, V(-56 - k * 1.6, -H / 2 + 0.1, -T / 2));
  }
  addPart('frame', { name: '5 级钛金属中框', en: 'Grade 5 Titanium', spec: '镜面抛光 · IP68 防溅抗水防尘', cat: 'body' }, [[frameR, V(0, 0, 0)], [frameL, V(0, 0, 0)]]);

  // ---------------- 侧边按键 ----------------
  const btn = group(root);
  const button = (y0, y1, mat = M.titanium) => {
    const L = y1 - y0;
    const g = new THREE.CapsuleGeometry(0.9, L - 1.8, 6, 16);
    const m = mesh(g, mat, btn, V(XO + 0.15, (y0 + y1) / 2, -T / 2 - 0.1));
    m.scale.set(0.7, 1, 1.25);
    return m;
  };
  button(44, 54); button(32, 42); button(8, 26);
  const cc = button(-30, -18, M.plateau);
  const ccRing = mesh(new THREE.BoxGeometry(0.2, 12.4, 2.8), M.steel, btn, V(XO - 0.1, -24, -T / 2 - 0.1));
  addPart('buttons', { name: '侧边按键 · Touch ID', en: 'Side Button & Camera Control', spec: '电源键集成 Touch ID · 音量键 · 相机控制', cat: 'body' }, [[btn, V(22, 0, 0)]]);
  cc.userData.cc = true; ccRing.userData.cc = true;

  // ---------------- 铰链 ----------------
  // 中央支撑杆
  const bar = mesh(new THREE.BoxGeometry(4.4, H - 10, 0.22), M.steel, mid, V(0, 0, -0.42));
  addPart('bar', { name: '中央支撑杆', en: 'Center Support Bar', spec: '展开时托平屏幕中心，合上时下沉让位', cat: 'hinge' }, [[bar, V(0, 0, 52)]]);
  // 铰链核心 + 同步齿轮
  const core = group(mid);
  const coreShape = rrShape(-2.2, -T + 0.55, 2.2, -0.75, [1.4, 0.6, 0.6, 1.4]);
  const coreGeo = new THREE.ExtrudeGeometry(coreShape, { depth: H - 8, bevelEnabled: false, curveSegments: 10 });
  coreGeo.rotateX(Math.PI / 2); coreGeo.translate(0, (H - 8) / 2, 0);
  mesh(coreGeo, M.darkSteel, core);
  const gearG = gearGeometry(1.25, 14, 2.2), gearS = gearGeometry(0.75, 10, 2.2);
  [-42, -14, 14, 42].forEach(y => {
    mesh(gearG, M.steel, core, V(-1.15, y, -2.9)).rotation.y = 0.12;
    mesh(gearG, M.steel, core, V(1.15, y, -2.9));
    mesh(gearS, M.gold, core, V(0, y, -1.55));
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 10), M.steel, core, V(-1.15, y, -2.9));
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 10), M.steel, core, V(1.15, y, -2.9));
  });
  addPart('core', { name: '铰链核心 · 同步齿轮', en: 'Hinge Core & Gears', spec: '100+ 个组件 · 水滴形结构 · 齿轮同步开合', cat: 'hinge' }, [[core, V(0, 0, 36)]]);
  // 摆臂、弧形导轨与弹簧（左右两侧各随机身运动）
  function swing(side, parent) {
    const g = group(parent);
    const springG = springGeometry(7, 0.75, 9, 0.13);
    [-42, -14, 14, 42].forEach(y => {
      const x0 = side * (XI + 0.4), x1 = side * (XI + 13);
      const sh = rrShape(Math.min(x0, x1), y - 4, Math.max(x0, x1), y + 4, [1, 1, 1, 1]);
      mesh(slab(sh, -1.5, -0.8, 0.12, 8), M.steel, g);
      // 弧形导轨（水滴形）
      const rail = new THREE.TorusGeometry(3.4, 0.38, 8, 28, Math.PI * 0.62);
      rail.rotateX(Math.PI / 2);
      rail.rotateY(side > 0 ? -Math.PI : Math.PI * 0.62);
      [-2.6, 2.6].forEach(dy => mesh(rail, M.darkSteel, g, V(side * (XI + 4.1), y + dy, -0.7)));
      // 凸轮与限位块
      mesh(new THREE.BoxGeometry(2.4, 6, 1.6), M.darkSteel, g, V(side * (XI + 10.8), y, -2.4));
      if (Math.abs(y) > 20) {
        [-1.8, 1.8].forEach(dy => mesh(springG, M.steel, g, V(side * (XI + 6.2), y + dy, -2.6)));
      }
    });
    // 磁吸阵列
    const mg = new THREE.BoxGeometry(1.3, 6, 1.4);
    [-28, 0, 28].forEach(y => mesh(mg, M.magnet, g, V(side * (XO - 2.2), y + 2, -2.6)));
    return g;
  }
  const swingR = swing(1, root), swingL = swing(-1, left);
  addPart('swing', { name: '弧形导轨 · 四组弹簧', en: 'Arc Guides & Springs', spec: '精确控制开合阻尼 · 集成磁吸阵列稳固闭合', cat: 'hinge' }, [[swingR, V(0, 0, 26)], [swingL, V(0, 0, 26)]]);
  // 跨铰链柔性排线
  const flexG = group(mid);
  mesh(new THREE.PlaneGeometry(4.6, 9), M.flex, flexG, V(0, -24, -3.0));
  const flexR = mesh(new THREE.PlaneGeometry(14, 9), M.flex, root, V(XI + 7, -24, -3.0));
  const flexL = mesh(new THREE.PlaneGeometry(14, 9), M.flex, left, V(-XI - 7, -24, -3.0));
  addPart('flex', { name: '跨铰链柔性排线', en: 'Cross-hinge Flex', spec: '连接左右机身信号与供电，高弯折寿命', cat: 'hinge' }, [[flexG, V(0, 0, 16)], [flexR, V(0, 0, 16)], [flexL, V(0, 0, 16)]]);

  // 铰链护盖（脊）+ 端盖：可弯折
  const spine = deformable(mesh(new THREE.PlaneGeometry(D.B + 1.4, H - 1.6, 48, 1).translate(0, 0, -T + 0.02), M.spine, root));
  const capGeo = (y) => {
    const g = new THREE.PlaneGeometry(D.B + 0.4, T - 0.2, 24, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), y, p.getY(i) - T / 2 - 0.05);
    return g;
  };
  const capT = deformable(mesh(capGeo(H / 2 - 0.9), M.spine, root));
  const capB = deformable(mesh(capGeo(-H / 2 + 0.9), M.spine, root));
  addPart('spine', { name: '铰链护盖', en: 'Hinge Cover', spec: '3D 打印钛金属 · 微喷砂质感', cat: 'body' }, [[spine, V(0, 0, -96)], [capT, V(0, 18, -96)], [capB, V(0, -18, -96)]]);

  // ---------------- 右半：主板 / 均热板 / 电池 / 相机 / MagSafe / 背板 ----------------
  // 均热板
  const vcShape = rrShape(16, -2, 54, 44, [3, 3, 3, 3]);
  const vc = mesh(planarUV(slab(vcShape, -1.13, -0.77, 0.08, 12)), M.copper, root);
  eggPlane(TX.vcSignature(EG.vcText), 32, 8, vc, V(35, 20, -0.76));   // 彩蛋：铜面激光签名
  addPart('vc', { name: '定制均热板', en: 'Vapor Chamber', spec: 'A20 Pro 裸片直连均热板，高效导热', cat: 'perf' }, [[vc, V(0, 0, 14)]]);

  // 主板
  const board = group(root);
  const bShape = rrShape(17, 26, 53, 57, [2, 2, 2, 2]);
  mesh(planarUV(slab(bShape, -3.4, -2.6, 0.05, 12)), [M.pcb, M.pcbSide], board);
  const chip = (w, h, d, x, y, label) => {
    const top = new THREE.MeshStandardMaterial({ map: label, roughness: 0.45, metalness: 0.25 });
    return mesh(new THREE.BoxGeometry(w, h, d), [M.chipSide, M.chipSide, M.chipSide, M.chipSide, top, M.chipSide], board, V(x, y, -2.6 + d / 2));
  };
  chip(12, 12, 1.0, 33, 36, TX.chipLabel('A20 PRO', ['APL1V07  2nm', '2626 X7G MK'], { micro: { text: EG.chipText, img: EG.chipImg } }));
  chip(7, 7, 0.8, 47, 50, TX.chipLabel('C2', ['APPLE MODEM', '5G NR'], { logo: true }));
  chip(9, 7, 0.9, 46, 37, TX.chipLabel('NAND', ['256GB TLC', 'KIOXIA'], { logo: false, bg: '#24262b' }));
  chip(6, 6, 0.7, 21, 31, TX.chipLabel('PMU', ['APL2040'], { logo: true }));
  chip(5, 5, 0.6, 40, 53, TX.chipLabel('N2', ['Wi-Fi 7', 'BT 6'], { logo: true }));
  // 屏蔽罩围框
  const fence = (x0, y0, x1, y1) => {
    const s = rrShape(x0, y0, x1, y1, [0.6, 0.6, 0.6, 0.6]);
    s.holes.push(rrShape(x0 + 0.35, y0 + 0.35, x1 - 0.35, y1 - 0.35, [0.3, 0.3, 0.3, 0.3], THREE.Path));
    mesh(slab(s, -2.6, -1.55, 0, 6), M.shield, board);
  };
  fence(26, 29, 40, 43); fence(42, 46, 51.5, 55.5); fence(41, 32.5, 51.5, 41.5);
  // 连接器
  [[19, 46, 6, 2.2], [19, 40, 6, 2.2], [36, 55, 2.2, 5], [28, 27.5, 6, 2], [52, 28, 2, 6]].forEach(([x, y, w, h]) => {
    mesh(new THREE.BoxGeometry(w, h, 0.9), M.connector, board, V(x, y, -2.15));
    mesh(new THREE.BoxGeometry(w * 0.85, h * 0.6, 0.05), M.gold, board, V(x, y, -1.68));
  });
  // 被动元件（实例化）
  {
    const geo = new THREE.BoxGeometry(0.7, 0.38, 0.32);
    const N = 420, inst = new THREE.InstancedMesh(geo, M.passive, N);
    const dummy = new THREE.Object3D();
    const avoid = [[20.5, 48.5, 26.5, 57], [25.5, 28.5, 40.5, 43.5], [41.5, 45.5, 52, 56], [40.5, 32, 52, 42], [16, 38, 23, 48.5], [34, 51.5, 39, 57], [23, 26, 33, 29], [17.5, 27.5, 24.5, 34.5], [37, 50, 43, 56]];
    let n = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (n < N) {
      const x = 17.8 + rnd() * 34.4, y = 26.8 + rnd() * 29.4;
      if (avoid.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
      dummy.position.set(x, y, -2.42);
      dummy.rotation.z = rnd() > 0.5 ? 0 : Math.PI / 2;
      const s = 0.6 + rnd() * 1.1;
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      inst.setColorAt(n, new THREE.Color().setHSL(0.08 + rnd() * 0.06, 0.35, 0.25 + rnd() * 0.3));
      n++;
    }
    board.add(inst);
  }
  addPart('board', { name: 'A20 Pro 单层主板', en: 'Logic Board · A20 Pro', spec: '2nm 工艺 · 自 iPhone 8 后首款单层非堆叠主板', cat: 'perf' }, [[board, V(0, 0, -16)]]);

  // 屏下 FaceTime 摄像头
  const udc = group(root, V(23.5, 51.5, 0));
  mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.4, 32).rotateX(Math.PI / 2), M.darkSteel, udc, V(0, 0, -1.65));
  mesh(new THREE.CircleGeometry(1.4, 32), M.lens, udc, V(0, 0, -0.93));
  mesh(new THREE.BoxGeometry(3, 4, 0.2), M.flex, udc, V(0, -3.6, -2.2));
  addPart('udc', { name: '屏下 FaceTime 摄像头', en: 'Under-display Camera', spec: '隐藏于内屏下方，需要时才出现', cat: 'camera' }, [[udc, V(0, 0, 56)]]);

  // 主电池
  const batA = mesh(planarUV(slab(rrShape(18.5, -55, 80.5, 21, [2.5, 2.5, 2.5, 2.5]), -3.85, -1.2, 0.5, 12)), M.batteryA, root);
  eggPlane(TX.morseTexture(EG.morseText), 36, 9, batA, V(49.5, -17, -1.19));   // 彩蛋：电池正面 Morse 电码带
  addPart('batA', { name: '主电池 2962 mAh', en: 'Battery A · 11.567 Wh', spec: '位于背板玻璃一侧 · 电控可释放胶', cat: 'power' }, [[batA, V(0, 0, -22)]]);

  // 后置摄像头模组
  const cam = group(root);
  mesh(slab(rrShape(56, 28, 80.5, 56.5, [4, 4, 4, 4]), -4.1, -1.3, 0.3, 12), M.darkSteel, cam);
  const lensAt = (x, y, r) => {
    mesh(new THREE.CylinderGeometry(r, r * 1.05, 4.6, 48).rotateX(Math.PI / 2), M.rubber, cam, V(x, y, -T - 0.6));
    mesh(new THREE.TorusGeometry(r + 0.15, 0.32, 16, 64), M.titanium, cam, V(x, y, -T - 2.85));
    mesh(new THREE.CircleGeometry(r, 64).rotateY(Math.PI), M.lens, cam, V(x, y, -T - 2.88));
    mesh(new THREE.CircleGeometry(r * 0.45, 48).rotateY(Math.PI), M.lensInner, cam, V(x, y, -T - 2.86));
    mesh(new THREE.CircleGeometry(r + 0.1, 64).rotateY(Math.PI), M.sapphire, cam, V(x, y, -T - 2.95));
  };
  lensAt(69.5, 49.5, 5.0);
  lensAt(69.5, 35.0, 5.0);
  mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.6, 32).rotateX(Math.PI / 2), M.flash, cam, V(60.5, 42.2, -T - 0.9));
  mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 16).rotateX(Math.PI / 2), M.rubber, cam, V(60.5, 36.5, -T - 0.9));
  mesh(new THREE.BoxGeometry(10, 5, 0.25), M.flex, cam, V(53, 32, -2.0));
  addPart('cam', { name: '4800 万像素融合式双摄', en: 'Fusion Main + Ultra Wide', spec: '零快门延迟 · 光学品质 2 倍长焦 · 微距摄影', cat: 'camera' }, [[cam, V(0, 0, -40)]]);

  // MagSafe 线圈 + 磁环
  const mag = group(root, V(D.XI + D.HW / 2, -14, 0));
  mesh(new THREE.CircleGeometry(25, 96), M.coil, mag, V(0, 0, -4.48)).rotation.y = Math.PI;
  {
    const N = 22, inst = new THREE.InstancedMesh(new THREE.BoxGeometry(5.4, 2.2, 0.3), M.magnet, N);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      d.position.set(Math.cos(a) * 27.8, Math.sin(a) * 27.8, -4.42);
      d.rotation.z = a + Math.PI / 2; d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    mag.add(inst);
    mesh(new THREE.BoxGeometry(3, 9, 0.3), M.magnet, mag, V(0, -35, -4.42));
  }
  addPart('mag', { name: 'MagSafe 线圈', en: 'MagSafe · Qi2', spec: '最高 15W 无线充电 · 磁吸对位', cat: 'power' }, [[mag, V(0, 0, -54)]]);

  // 背板玻璃（超瓷晶）+ 镜头台 + 鎏金激光雕刻层
  const back = group(root);
  const bg = halfRect(1, 0.9, D.CR - 0.6, 0.6);
  const bGeo = planarUV(slab(rrShape(bg.x0, bg.y0, bg.x1, bg.y1, bg.radii), -T - 0.05, -T + 0.62, 0.25, 32), true);
  mesh(bGeo, M.backGlass, back);
  const plat = rrShape(55.2, 27.2, 81.3, 57.3, [5.5, 5.5, 5.5, 5.5]);
  [[69.5, 49.5], [69.5, 35]].forEach(([x, y]) => plat.holes.push(new THREE.Path().absarc(x, y, 5.5, 0, Math.PI * 2, true)));
  plat.holes.push(new THREE.Path().absarc(60.5, 42.2, 1.9, 0, Math.PI * 2, true));
  mesh(slab(plat, -T - 1.55, -T - 0.05, 0.45, 32), M.plateau, back);
  // 鎏金激光雕刻：贴在背板外表面之外 0.07mm，与背板共用平面投影 UV（mirror 保证背面视角文字为正）
  const eGeo = planarUV(slab(rrShape(bg.x0, bg.y0, bg.x1, bg.y1, bg.radii), -T - 0.12, -T + 0.05, 0.02, 32), true);
  mesh(eGeo, M.engrave, back);
  addPart('back', { name: '超瓷晶背板', en: 'Ceramic Shield Back', spec: '磨砂质感玻璃 · 镜面 Apple 标志 · 鎏金激光雕刻', cat: 'body' }, [[back, V(0, 0, -74)]]);

  // ---------------- 左半：副电池 / 外屏 / 前摄 / Taptic / USB-C / 扬声器 / 副板 ----------------
  const batB = mesh(planarUV(slab(rrShape(-80.5, -38, -18.5, 21, [2.5, 2.5, 2.5, 2.5]), -3.85, -1.2, 0.5, 12)), M.batteryB, left);
  addPart('batB', { name: '副电池 1921 mAh', en: 'Battery B · 7.506 Wh', spec: '位于外屏一侧 · 双电芯合计 4883 mAh / 19.073 Wh', cat: 'power' }, [[batB, V(0, 0, -22)]]);

  const taptic = group(left);
  mesh(slab(rrShape(-80, -56.5, -52, -42, [2, 2, 2, 2]), -3.85, -1.4, 0.3, 8), M.darkSteel, taptic);
  mesh(new THREE.BoxGeometry(18, 0.6, 0.6), M.gold, taptic, V(-66, -49, -1.3));
  addPart('taptic', { name: 'Taptic Engine', en: 'Taptic Engine', spec: '线性马达 · 精准细腻的触感反馈', cat: 'power' }, [[taptic, V(0, 0, -20)]]);

  const usb = group(left);
  mesh(planarUV(slab(rrShape(-49, -58, -31, -43, [1.5, 1.5, 1.5, 1.5]), -3.3, -2.6, 0.05, 8)), [M.pcb, M.pcbSide], usb);
  const shell = new THREE.Mesh(slab(rrShape(-4.4, -1.6, 4.4, 1.6, [1.6, 1.6, 1.6, 1.6]), 0, 7, 0.15, 12), M.steel);
  shell.rotation.x = Math.PI / 2; shell.position.set(-40, -51, -2.6); usb.add(shell);
  addPart('usb', { name: 'USB-C 接口', en: 'USB-C', spec: '60W 及以上适配器 20 分钟充至 50%', cat: 'power' }, [[usb, V(0, -16, -18)]]);

  const spk = group(left);
  mesh(slab(rrShape(-28.5, -57, -16, -42, [2, 2, 2, 2]), -3.85, -1.4, 0.25, 8), M.rubber, spk);
  mesh(new THREE.BoxGeometry(10, 12, 0.1), M.speakerMesh, spk, V(-22.25, -49.5, -1.32));
  addPart('spk', { name: '立体声扬声器', en: 'Speaker Module', spec: '空间音频 · 横竖屏双向立体声', cat: 'power' }, [[spk, V(0, 0, -18)]]);

  const sub = group(left);
  mesh(planarUV(slab(rrShape(-80, 28, -52, 56, [2, 2, 2, 2]), -3.3, -2.6, 0.05, 8)), [M.pcb, M.pcbSide], sub);
  mesh(new THREE.BoxGeometry(6, 6, 0.8), M.shield, sub, V(-70, 42, -2.2));
  mesh(new THREE.BoxGeometry(5, 4, 0.7), M.shield, sub, V(-60, 48, -2.2));
  addPart('sub', { name: '天线模块 · 副板', en: 'Antenna & Sub-board', spec: 'Wi-Fi 7 · 蓝牙 6 · 5G 天线', cat: 'perf' }, [[sub, V(0, 0, -16)]]);

  const fcam = group(left, V(-43.2, 51.8, 0));
  mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.4, 32).rotateX(Math.PI / 2), M.darkSteel, fcam, V(0, 0, -3.3));
  mesh(new THREE.CircleGeometry(1.6, 32).rotateY(Math.PI), M.lens, fcam, V(0, 0, -4.55));
  mesh(new THREE.BoxGeometry(5, 4, 1.4), M.darkSteel, fcam, V(6, 0, -3.3));
  addPart('fcam', { name: 'Center Stage 前置摄像头', en: '12MP Center Stage', spec: '任意方向拍摄横向自拍', cat: 'camera' }, [[fcam, V(0, 0, -36)]]);

  const outer = group(left);
  const og = halfRect(-1, 0.9, D.CR - 0.6, 0.6);
  mesh(slab(rrShape(og.x0, og.y0, og.x1, og.y1, og.radii), -T - 0.05, -T + 0.62, 0.25, 32), M.blackGlass, outer);
  const os = new THREE.PlaneGeometry(og.x1 - og.x0 - 1.0, og.y1 - og.y0 - 1.0).rotateY(Math.PI);
  mesh(os, M.outerOLED, outer, V((og.x0 + og.x1) / 2, 0, -T - 0.07));
  addPart('outer', { name: '5.4 英寸外屏', en: 'Super Retina XDR · Ceramic Shield 2', spec: '约为 iPhone 18 Pro 屏幕面积的 90%', cat: 'display' }, [[outer, V(0, 0, -74)]]);

  // ---------------- 材质克隆（用于聚焦淡化） ----------------
  for (const p of parts) {
    p.meshes = [];
    const cache = new Map();
    const cl = (m) => { if (!cache.has(m)) { const c = m.clone(); c.userData.baseOpacity = m.opacity; c.userData.baseTransparent = m.transparent; c.userData.baseDepthWrite = m.depthWrite; cache.set(m, c); } return cache.get(m); };
    p.items.forEach(it => it.obj.traverse(o => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
      o.userData.partId = p.id;
      p.meshes.push(o);
    }));
    p.mats = [...cache.values()];
    p.fade = 1; p.fadeTarget = 1;
  }
  parts.forEach((p, i) => { p.order = i; });

  // 部件标注锚点
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const p of parts) {
    const o = p.items[0].obj;
    box.setFromObject(o);
    p.anchorObj = o;
    p.anchor = o.worldToLocal(box.getCenter(new THREE.Vector3()));
  }

  // ---------------- 状态 ----------------
  const state = { fold: 0, explode: 0, dirtyFold: true, dim: 0.04 };
  const tmp = [0, 0];

  function applyFold() {
    const th = state.fold;
    if (th < 1e-5) {
      left.position.set(0, 0, 0); left.rotation.set(0, 0, 0);
      mid.position.set(0, 0, 0); mid.rotation.set(0, 0, 0);
    } else {
      const R = D.B / th, s = Math.sin(th), c = Math.cos(th);
      const ex = XI - R * s, ez = R - R * c;
      left.rotation.set(0, th, 0);
      left.position.set(ex + XI * c, 0, ez - XI * s);
      const p = th / 2;
      mid.rotation.set(0, p, 0);
      mid.position.set(XI - R * Math.sin(p), 0, R - R * Math.cos(p));
    }
    for (const m of deformables) {
      const o = m.geometry.userData.orig, a = m.geometry.attributes.position.array;
      for (let i = 0; i < o.length; i += 3) {
        bend(o[i], o[i + 2], th, tmp);
        a[i] = tmp[0]; a[i + 1] = o[i + 1]; a[i + 2] = tmp[1];
      }
      m.geometry.attributes.position.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.geometry.computeBoundingSphere();
    }
  }

  const smooth = (t) => t * t * (3 - 2 * t);
  // 部件级爆炸覆盖：拆装挑战「逐个归位」与爆炸态「弹飞」需要单控某个部件的位移量，
  // 未覆盖（undefined）的部件仍走全局 smooth 曲线
  state.partK = null;
  function applyExplode() {
    const e = state.explode, N = parts.length;
    for (const p of parts) {
      const d = 0.3 * (p.order / N);
      const k = state.partK && p.id in state.partK ? state.partK[p.id]
        : smooth(THREE.MathUtils.clamp((e - d) / 0.7, 0, 1));
      p.k = k;
      for (const it of p.items) it.obj.position.copy(it.base).addScaledVector(it.dir, k);
    }
  }

  function setScheme(key) {
    const s = SCHEMES[key];
    for (const p of parts) for (const m of p.mats) {
      const k = m.userData.key;
      if (k && s[k] !== undefined) m.color.setHex(s[k]);
    }
  }
  setScheme('white');

  function setFocus(ids) {
    state.lastFocus = ids || null;
    for (const p of parts) p.fadeTarget = !ids || ids.includes(p.id) ? 1 : state.dim;
  }

  function update(dt) {
    if (state.dirtyFold) { applyFold(); state.dirtyFold = false; }
    applyExplode();
    const a = 1 - Math.exp(-dt * 6);
    for (const p of parts) {
      if (Math.abs(p.fade - p.fadeTarget) < 1e-3) { if (p.fade === p.fadeTarget) continue; p.fade = p.fadeTarget; }
      else p.fade += (p.fadeTarget - p.fade) * a;
      const dim = p.fade < 0.999;
      for (const m of p.mats) {
        const want = dim || m.userData.baseTransparent;
        if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
        m.opacity = m.userData.baseOpacity * p.fade;
        m.depthWrite = dim ? false : m.userData.baseDepthWrite;
      }
      p.meshes.forEach(o => { o.visible = p.fade > 0.02; });
    }
  }

  return {
    root, parts, tex, M, state, update, setScheme, setFocus,
    setFold(th) { if (th !== state.fold) { state.fold = th; state.dirtyFold = true; } },
    setExplode(e) { state.explode = e; },
    setPartK(id, k) { (state.partK ||= {})[id] = k; },
    delPartK(id) { if (state.partK) delete state.partK[id]; },
    clearPartK() { state.partK = null; },
    setDim(v) {
      state.dim = THREE.MathUtils.clamp(v, 0, 1);
      setFocus(state.lastFocus);
    },
    setBackText(t) { tex.engrave.setText(t); },
    setEngravePos(x, y) { tex.engrave.setPosition(x, y); },
    // 彩蛋特效：找齐全部隐藏细节后解锁的虹彩衍射中框
    setFrameIri(on) {
      const p = parts.find(q => q.id === 'frame');
      p && p.mats.forEach(m => {
        if (!(m instanceof THREE.MeshPhysicalMaterial)) return;
        m.iridescence = on ? 1 : 0;
        m.iridescenceIOR = 1.9;
        m.iridescenceThicknessRange = [120, 480];
        m.needsUpdate = true;
      });
    },
    pickables: () => parts.flatMap(p => p.fade > 0.5 ? p.meshes : []),
  };
}

// ================= iPhone 18 系列（直板单屏：18 / 18 Pro / 18 Pro Max） =================
// 与 buildPhone 完全同构的接口（root/parts/update/setScheme/setFocus/...），
// 但没有折叠/铰链：整机一体成型，显示面朝 +z、背板朝 -z，与 Duo 坐标约定一致。
// 几何按 Pro 基准（71×149.6×8.25）建模，标准版 / Max 通过 body 组整体缩放三围
// （内部件同比缩小放大，视觉与真实机型一致）；雕刻画布按各档真实机身比例，
// 与 Duo 的 1024×1536 完全独立。锁屏 19.5:9 三档共用构图、实例独立。
export function buildPhone18(opts = {}) {
  const dims = opts.dims || P18;                     // 本档三围（mm）
  // 硬件差异开关：tele=长焦镜头（三摄） · vc=均热板 · alu=标准版铝框配色
  const HW_CONFIG = { tele: true, vc: true, alu: false, ...(opts.hw || {}) };
  // 文案配置（Pro 为基准；标准版 / Max 在 DEVICES.label 里覆盖）
  const LB = {
    size: '6.3', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4208, batWh: '16.44', batModel: 'A3611',
    colors: '黑色 · 银色 · 冰川蓝色 · 勃艮第酒红色',
    motion: 'ProMotion 120Hz 自适应', alwaysOn: '全天候显示', peak: '3000 尼特户外峰值亮度',
    front: '18MP Center Stage 前置摄像头', usb: 'USB 3 高速传输 · 40W 快充', video: '33',
    frame: '一体成型铝金属中框', frameTitle: '一体成型铝金属。', frameSpec: '阳极氧化铝 · 前后陶瓷晶体护面 · IP68',
    camTitle: HW_CONFIG.tele ? 'Pro 融合式三摄系统' : '融合式双摄系统',
    camSpec: HW_CONFIG.tele ? '4800 万融合主摄 ƒ/1.48–ƒ/4 可变光圈 + 超广角 + 长焦' : '4800 万主摄 + 4800 万超广角 · 无长焦',
    vcSpec: HW_CONFIG.vc ? '新一代 VC 均热板 · 芯片裸片直连' : '高导热石墨膜 · 全机均温',
    launch: '9 月 12 日开启预购 · 9 月 18 日正式发售',
    ...(opts.label || {})
  };
  const { H, T, CR } = P18;                          // 几何建模基准 = Pro
  const EG = opts.eggs || {};
  const HW = P18.HW;                                  // 35.5
  const EW = Math.round(dims.W * 10.8), EH = Math.round(dims.H * 10.8);   // 雕刻/背板画布：各档真实比例
  const tex = {
    inner: opts.screenTex, outer: opts.screenTex, nano: TX.nanoNormal(), pcb: TX.pcb(),
    batA: TX.battery(LB.bat, LB.batWh, LB.batModel), batB: TX.battery(LB.bat, LB.batWh, LB.batModel),
    lattice: TX.latticeAlpha(120, 18), backRough: TX.backGlassRoughness(EW, EH), vc: TX.vaporChamber(),
    coil: TX.coil(), flex: TX.flex(),
    engrave: TX.createEngraving(EW, EH, opts.engraveDefault || 'iPhone 18 Pro'),
  };
  const M = materials(tex);
  // 6.3 英寸单屏：超视网膜 XDR（高刷亮面，无纳米纹理）
  M.screen = new THREE.MeshPhysicalMaterial({ color: 0x020203, emissive: 0xffffff, emissiveMap: tex.inner, emissiveIntensity: 1.05, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0 });

  const root = new THREE.Group();
  const body = new THREE.Group();                    // 机型缩放层：基准几何 → 本档三围
  body.scale.set(dims.W / P18.W, dims.H / P18.H, dims.T / P18.T);
  root.add(body);
  const parts = [];
  const mesh = (geo, mat, parent, pos) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    parent && parent.add(m);
    return m;
  };
  const group = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); parent.add(g); return g; };
  const addPart = (id, info, items) => parts.push({ id, ...info, items: items.map(([obj, dir]) => ({ obj, dir, base: obj.position.clone() })) });
  const rect = (inset, cr) => fullRect(inset, cr);                                       // 圆角矩形参数
  const rectShape = (inset, cr) => { const r = fullRect(inset, cr); return rrShape(r.x0, r.y0, r.x1, r.y1, r.radii); };   // 圆角 Shape

  // ---------------- 钛金属中框（一体成型） ----------------
  const frame = group(body);
  {
    const sh = rectShape(0.35, CR);
    const hole = rect(1.45, CR - 0.5);
    sh.holes.push(rrShape(hole.x0, hole.y0, hole.x1, hole.y1, hole.radii, THREE.Path));
    mesh(slab(sh, -T + 0.15, -0.1, 0.4, 32), M.titanium, frame);
    const mp = rect(1.3, CR - 0.4);
    mesh(slab(rrShape(mp.x0, mp.y0, mp.x1, mp.y1, mp.radii), -T + 1.0, -T + 1.3, 0, 16), M.midplate, frame);
    // 天线断点
    [-46, 46].forEach(y => mesh(new THREE.BoxGeometry(0.6, 1.0, T - 1.1), M.antenna, frame, V(HW - 0.9, y, -T / 2)));
    [-46, 46].forEach(y => mesh(new THREE.BoxGeometry(0.6, 1.0, T - 1.1), M.antenna, frame, V(-HW + 0.9, y, -T / 2)));
    [-HW + 10, HW - 10].forEach(x => {
      mesh(new THREE.BoxGeometry(1.0, 0.6, T - 1.1), M.antenna, frame, V(x, H / 2 - 0.9, -T / 2));
      mesh(new THREE.BoxGeometry(1.0, 0.6, T - 1.1), M.antenna, frame, V(x, -H / 2 + 0.9, -T / 2));
    });
    // 底部 USB-C 开孔 + 扬声器孔
    const usbHole = new THREE.Mesh(slab(rrShape(-4.4, -1.3, 4.4, 1.3, [1.3, 1.3, 1.3, 1.3]), 0, 1.2, 0, 10), M.rubber);
    usbHole.rotation.x = Math.PI / 2; usbHole.position.set(0, -H / 2 + 0.9, -T / 2); frame.add(usbHole);
    eggPlane(TX.usbBatch(), 6, 1.5, frame, V(0, -H / 2 + 0.32, -T / 2), Math.PI / 2);          // 彩蛋：USB-C 口深处批号
    eggPlane(TX.edgeEngraving(EG.edgeText), 30, 1.0, frame, V(0, -H / 2 - 0.04, -T / 2 + 1.4), Math.PI / 2);   // 彩蛋：底边法规微雕
    for (let k = 0; k < 6; k++) {
      mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 12), M.rubber, frame, V(-11 - k * 1.5, -H / 2 + 0.9, -T / 2));
      mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 12), M.rubber, frame, V(11 + k * 1.5, -H / 2 + 0.9, -T / 2));
    }
  }
  addPart('frame', { name: LB.frame, en: 'Aluminium Unibody Frame', spec: LB.frameSpec, cat: 'body' }, [[frame, V(0, 0, 0)]]);

  // ---------------- 侧边按键（右侧电源 + 相机控制；左侧操作 / 音量） ----------------
  const btn = group(body);
  const button = (side, y0, y1, mat = M.titanium) => {
    const L = y1 - y0;
    const m = mesh(new THREE.CapsuleGeometry(0.95, L - 1.9, 6, 16), mat, btn, V(side * (HW + 0.15), (y0 + y1) / 2, -T / 2));
    m.scale.set(0.7, 1, 1.3);
    return m;
  };
  button(1, 28, 44);            // 电源
  button(1, -38, -26);          // 相机控制
  const cc = button(1, -38, -26, M.plateau);
  button(-1, 48, 58);           // 操作按钮
  button(-1, 30, 40);           // 音量 +
  button(-1, 16, 26);           // 音量 -
  cc.userData.cc = true;
  addPart('buttons', { name: '侧边按键 · 相机控制', en: 'Side & Camera Control', spec: '操作按钮 · 音量键 · 两段式相机控制键', cat: 'body' }, [[btn, V(24, 0, 0)]]);

  // ---------------- 前玻璃 + OLED ----------------
  const fg = rect(1.0, CR - 0.7);
  const frontGlass = mesh(slab(rrShape(fg.x0, fg.y0, fg.x1, fg.y1, fg.radii), -0.15, 0.55, 0.12, 32), M.frontGlass, body);
  frontGlass.renderOrder = 2;
  addPart('frontGlass', { name: '超瓷晶前玻璃', en: 'Ceramic Shield Front', spec: '抗刮划能力 3 倍于其他玻璃 · 纳米级防指纹镀膜', cat: 'display' }, [[frontGlass, V(0, 0, 140)]]);

  const SW = 2 * HW - 5, SH = H - 5;   // 屏幕可视区 66 × 144.6
  const screen = mesh(roundedGrid(SW, SH, 8.4, 24, 40, -0.85), M.screen, body);
  addPart('screen', { name: `${LB.size} 英寸超视网膜 XDR`, en: 'Super Retina XDR', spec: [LB.motion, LB.alwaysOn, LB.peak].filter(Boolean).join(' · '), cat: 'display' }, [[screen, V(0, 0, 104)]]);

  // 显示支撑板
  const sup = rect(2.0, CR - 1.8);
  const support = mesh(slab(rrShape(sup.x0, sup.y0, sup.x1, sup.y1, sup.radii), -1.55, -1.15, 0.12, 20), M.midplate, body);
  addPart('support', { name: '显示屏支撑板', en: 'Display Support Plate', spec: '镁铝合金一体冲压，平整度 ±50µm', cat: 'display' }, [[support, V(0, 0, 76)]]);

  // ---------------- 前置摄像头 / Face ID 模组（灵动岛内） ----------------
  const fcam = group(body, V(0, H / 2 - 5.4, -1.35));
  mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.9, 32), M.darkSteel, fcam, V(-6.2, 0, 0.35)).rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(1.05, 32), M.lens, fcam, V(-6.2, 0, 0.82));
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 32), M.darkSteel, fcam, V(-2.6, 0, 0.32)).rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.75, 32), M.lens, fcam, V(-2.6, 0, 0.74));
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 32), M.darkSteel, fcam, V(2.6, 0, 0.32)).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(13, 4, 0.5), M.flex, fcam, V(0, -0.2, -0.55));
  addPart('fcam', { name: '灵动岛 · Face ID 模组', en: 'Dynamic Island · Face ID', spec: `${LB.front} · 点阵投影器 · 红外镜头`, cat: 'camera' }, [[fcam, V(0, 10, 54)]]);

  // ---------------- 主板（位于背板一侧顶部） ----------------
  const board = group(body);
  {
    const b = rrShape(4, 28, 30, 66, [2, 2, 2, 2]);
    mesh(planarUV(slab(b, -7.4, -6.4, 0.05, 12)), [M.pcb, M.pcbSide], board);
    const chip = (w, h, d, x, y, label) => {
      const top = new THREE.MeshStandardMaterial({ map: label, roughness: 0.45, metalness: 0.25 });
      return mesh(new THREE.BoxGeometry(w, h, d), [M.chipSide, M.chipSide, M.chipSide, M.chipSide, top, M.chipSide], board, V(x, y, -6.4 + d / 2));
    };
    chip(11, 11, 0.9, 18, 36, TX.chipLabel(LB.chip, ['APL1V07  2nm', '2626 X7G MK'], { micro: { text: EG.chipText, img: EG.chipImg } }));
    chip(7, 7, 0.8, 24, 51, TX.chipLabel('C2', ['APPLE MODEM', '5G NR'], { logo: true }));
    chip(9, 7, 0.8, 22, 39, TX.chipLabel('NAND', ['512GB TLC', 'KIOXIA'], { logo: false, bg: '#24262b' }));
    chip(6, 6, 0.7, 10, 31, TX.chipLabel('PMU', ['APL2040'], { logo: true }));
    chip(5, 5, 0.6, 10, 52, TX.chipLabel('N2', ['Wi-Fi 7', 'BT 6'], { logo: true }));
    const fence = (x0, y0, x1, y1) => {
      const s = rrShape(x0, y0, x1, y1, [0.6, 0.6, 0.6, 0.6]);
      s.holes.push(rrShape(x0 + 0.35, y0 + 0.35, x1 - 0.35, y1 - 0.35, [0.3, 0.3, 0.3, 0.3], THREE.Path));
      mesh(slab(s, -6.4, -5.45, 0, 6), M.shield, board);
    };
    fence(12, 30, 24.5, 42.5); fence(20.5, 46, 29, 55); fence(18, 36, 29, 44);
    [[6, 62, 6, 2.2], [6, 55, 6, 2.2], [17, 65, 2.2, 5], [14, 29, 6, 2], [28, 30, 2, 6]].forEach(([x, y, w, h]) => {
      mesh(new THREE.BoxGeometry(w, h, 0.9), M.connector, board, V(x, y, -5.9));
      mesh(new THREE.BoxGeometry(w * 0.85, h * 0.6, 0.05), M.gold, board, V(x, y, -5.42));
    });
    const geo = new THREE.BoxGeometry(0.7, 0.38, 0.32);
    const N = 300, inst = new THREE.InstancedMesh(geo, M.passive, N);
    const dummy = new THREE.Object3D();
    const avoid = [[7, 51.5, 28, 58.5], [11, 29.5, 25, 43.5], [19, 35.5, 30, 45], [19.5, 45.5, 29.5, 56], [5, 29.5, 11, 34.5], [15, 62.5, 20, 67], [4.8, 28.8, 8, 66.5]];
    let n = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (n < N) {
      const x = 5 + rnd() * 24, y = 29 + rnd() * 36;
      if (avoid.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
      dummy.position.set(x, y, -6.2);
      dummy.rotation.z = rnd() > 0.5 ? 0 : Math.PI / 2;
      const s = 0.6 + rnd() * 1.0;
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      inst.setColorAt(n, new THREE.Color().setHSL(0.08 + rnd() * 0.06, 0.35, 0.25 + rnd() * 0.3));
      n++;
    }
    board.add(inst);
  }
  addPart('board', { name: `${LB.chipName} 主板`, en: `Logic Board · ${LB.chipName}`, spec: '2nm 工艺 · 全新 CPU/GPU 架构 · 硬件光线追踪', cat: 'perf' }, [[board, V(0, 0, -18)]]);

  // 均热板（大面积，覆盖主板与电池之间）——Pro / Pro Max 专属，标准版为石墨散热
  if (HW_CONFIG.vc) {
    const vcShape = rrShape(-1, -2, 31, 30, [3, 3, 3, 3]);
    const vc = mesh(planarUV(slab(vcShape, -6.0, -5.55, 0.08, 12)), M.copper, body);
    eggPlane(TX.vcSignature(EG.vcText), 32, 8, vc, V(15, 14, -5.54));   // 彩蛋：铜面激光签名
    addPart('vc', { name: '定制均热板', en: 'Vapor Chamber', spec: LB.vcSpec, cat: 'perf' }, [[vc, V(0, 0, -13)]]);
  } else {
    const gShape = rrShape(-1, -2, 31, 30, [3, 3, 3, 3]);
    const graphite = mesh(planarUV(slab(gShape, -6.0, -5.75, 0.12, 12)), M.darkSteel, body);
    eggPlane(TX.vcSignature(EG.vcText), 32, 8, graphite, V(15, 14, -5.74));   // 彩蛋：石墨膜蚀刻签名
    addPart('vc', { name: '石墨散热膜', en: 'Graphite Thermal Sheet', spec: '高导热石墨片 · 全机均温散热', cat: 'perf' }, [[graphite, V(0, 0, -13)]]);
  }

  // ---------------- 钢壳电池（左侧） ----------------
  const bat = mesh(planarUV(slab(rrShape(-31, -58, -3, 20, [2.5, 2.5, 2.5, 2.5]), -7.3, -3.0, 0.5, 12)), M.batteryA, body);
  eggPlane(TX.morseTexture(EG.morseText), 36, 9, bat, V(-17, -19, -2.99));   // 彩蛋：电池正面 Morse 电码带
  addPart('battery', { name: `钢壳电池 ${LB.bat} mAh`, en: `Battery · ${LB.batWh} Wh`, spec: `不锈钢壳体 · 视频播放最长 ${LB.video} 小时 · 电控可释放胶`, cat: 'power' }, [[bat, V(0, 0, -26)]]);

  // Taptic Engine（底部）
  const taptic = group(body);
  mesh(slab(rrShape(6, -70, 24, -58, [2, 2, 2, 2]), -6.8, -4.0, 0.3, 8), M.darkSteel, taptic);
  mesh(new THREE.BoxGeometry(14, 0.6, 0.6), M.gold, taptic, V(15, -64, -4.6));
  addPart('taptic', { name: 'Taptic Engine', en: 'Taptic Engine', spec: '线性马达 · 精准细腻的触感反馈', cat: 'power' }, [[taptic, V(0, -8, -21)]]);

  // USB-C（底部）
  const usb = group(body);
  mesh(planarUV(slab(rrShape(-9, -72, 9, -62, [1.5, 1.5, 1.5, 1.5]), -4.55, -3.85, 0.05, 8)), [M.pcb, M.pcbSide], usb);
  const shell = new THREE.Mesh(slab(rrShape(-4.4, -1.6, 4.4, 1.6, [1.6, 1.6, 1.6, 1.6]), 0, 7, 0.15, 12), M.steel);
  shell.rotation.x = Math.PI / 2; shell.position.set(0, -67, -4.1); usb.add(shell);
  addPart('usb', { name: 'USB-C 接口', en: 'USB-C', spec: LB.usb, cat: 'power' }, [[usb, V(0, -16, -16)]]);

  // 扬声器（底部）
  const spk = group(body);
  mesh(slab(rrShape(-28, -70, -12, -58, [2, 2, 2, 2]), -6.8, -4.2, 0.25, 8), M.rubber, spk);
  mesh(new THREE.BoxGeometry(11, 8, 0.1), M.speakerMesh, spk, V(-20, -64, -4.15));
  addPart('spk', { name: '立体声扬声器', en: 'Speaker Module', spec: '空间音频 · 与听筒组成立体声对', cat: 'power' }, [[spk, V(-10, 0, -18)]]);

  // ---------------- 后置相机模组（真机布局，突出背板） ----------------
  // Pro / Pro Max：全宽相机矩阵（iPhone 17 Pro 设计语言）：左列主摄+超广、右上长焦、右列闪光/LiDAR
  // 标准版：全宽相机条（iPhone 17 设计语言）：双摄与闪光横向排列
  const cam = group(body);
  {
    const LAYOUT = HW_CONFIG.tele
      ? {
          plat: [-31.5, 16, 31.5, 71], cr: [14, 14, 14, 14], depth: 1.4,
          lenses: [[-16.5, 55, 9.5], [-16.5, 31, 9.5], [16.5, 55, 9.5]],   // 主摄 / 超广角 / 长焦
          flash: [16.5, 36, 3.0], lidar: [16.5, 22, 3.2], mic: [0, 66.5],
        }
      : {
          plat: [-31.5, 46, 31.5, 71], cr: [12.5, 12.5, 12.5, 12.5], depth: 1.2,
          lenses: [[-18, 58.5, 9.2], [2, 58.5, 9.2]],                       // 主摄 / 超广角
          flash: [20, 58.5, 2.8], lidar: null, mic: [12.5, 63.5],
        };
    const [px0, py0, px1, py1] = LAYOUT.plat;
    const plat = rrShape(px0, py0, px1, py1, LAYOUT.cr);
    LAYOUT.lenses.forEach(([x, y, r]) => plat.holes.push(new THREE.Path().absarc(x, y, r + 1.0, 0, Math.PI * 2, true)));
    if (LAYOUT.flash) plat.holes.push(new THREE.Path().absarc(LAYOUT.flash[0], LAYOUT.flash[1], LAYOUT.flash[2] + 0.7, 0, Math.PI * 2, true));
    if (LAYOUT.lidar) plat.holes.push(new THREE.Path().absarc(LAYOUT.lidar[0], LAYOUT.lidar[1], LAYOUT.lidar[2], 0, Math.PI * 2, true));
    mesh(slab(plat, -T - LAYOUT.depth, -T - 0.1, 0.45, 32), M.plateau, cam);
    // 镜头（凸出平台）
    const lensAt = (x, y, r) => {
      mesh(new THREE.CylinderGeometry(r, r * 1.05, 4.8, 48).rotateX(Math.PI / 2), M.rubber, cam, V(x, y, -T - 1.1));
      mesh(new THREE.TorusGeometry(r + 0.15, 0.34, 16, 64), M.titanium, cam, V(x, y, -T - 3.45));
      mesh(new THREE.CircleGeometry(r, 64).rotateY(Math.PI), M.lens, cam, V(x, y, -T - 3.48));
      mesh(new THREE.CircleGeometry(r * 0.45, 48).rotateY(Math.PI), M.lensInner, cam, V(x, y, -T - 3.46));
      mesh(new THREE.CircleGeometry(r + 0.1, 64).rotateY(Math.PI), M.sapphire, cam, V(x, y, -T - 3.55));
    };
    LAYOUT.lenses.forEach(([x, y, r]) => lensAt(x, y, r));
    if (LAYOUT.flash) {
      const [fx, fy, fr] = LAYOUT.flash;
      mesh(new THREE.CylinderGeometry(fr, fr, 1.6, 32).rotateX(Math.PI / 2), M.flash, cam, V(fx, fy, -T - 1.2));
    }
    if (LAYOUT.lidar) {
      const [lx, ly, lr] = LAYOUT.lidar;
      mesh(new THREE.CircleGeometry(lr, 48).rotateY(Math.PI), M.lensInner, cam, V(lx, ly, -T - LAYOUT.depth - 0.08));
    }
    if (LAYOUT.mic) {
      const [mx, my] = LAYOUT.mic;
      mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12).rotateX(Math.PI / 2), M.rubber, cam, V(mx, my, -T - 1.2));
    }
  }
  addPart('cam', { name: LB.camTitle, en: HW_CONFIG.tele ? 'Pro Fusion Triple Camera' : 'Fusion Dual Camera', spec: LB.camSpec, cat: 'camera' }, [[cam, V(0, 0, -42)]]);

  // ---------------- MagSafe 线圈 + 磁环（贴背板内侧） ----------------
  const mag = group(body, V(0, -6, 0));
  mesh(new THREE.CircleGeometry(23, 96), M.coil, mag, V(0, 0, -7.55)).rotation.y = Math.PI;
  {
    const N = 22, inst = new THREE.InstancedMesh(new THREE.BoxGeometry(5.2, 2.1, 0.3), M.magnet, N);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      d.position.set(Math.cos(a) * 25.8, Math.sin(a) * 25.8, -7.5);
      d.rotation.z = a + Math.PI / 2; d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    mag.add(inst);
  }
  addPart('mag', { name: 'MagSafe 线圈', en: 'MagSafe · Qi2', spec: '最高 25W 无线充电 · 磁吸对位', cat: 'power' }, [[mag, V(0, 0, -54)]]);

  // ---------------- 背板玻璃 + 鎏金激光雕刻层 ----------------
  const back = group(body);
  const bg = fullRect(0.9, CR - 0.5);
  const bGeo = planarUV(slab(rrShape(bg.x0, bg.y0, bg.x1, bg.y1, bg.radii), -T - 0.1, -T + 0.55, 0.25, 32), true);
  mesh(bGeo, M.backGlass, back);
  const eGeo = planarUV(slab(rrShape(bg.x0, bg.y0, bg.x1, bg.y1, bg.radii), -T - 0.18, -T - 0.05, 0.02, 32), true);
  mesh(eGeo, M.engrave, back);
  addPart('back', { name: '超瓷晶背板', en: 'Ceramic Shield Back', spec: '磨砂质感玻璃 · 镜面 Apple 标志 · 鎏金激光雕刻', cat: 'body' }, [[back, V(0, 0, -74)]]);

  // ---------------- 材质克隆（聚焦淡化） / 标注锚点 ----------------
  for (const p of parts) {
    p.meshes = [];
    const cache = new Map();
    const cl = (m) => { if (!cache.has(m)) { const c = m.clone(); c.userData.baseOpacity = m.opacity; c.userData.baseTransparent = m.transparent; c.userData.baseDepthWrite = m.depthWrite; cache.set(m, c); } return cache.get(m); };
    p.items.forEach(it => it.obj.traverse(o => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
      o.userData.partId = p.id;
      p.meshes.push(o);
    }));
    p.mats = [...cache.values()];
    p.fade = 1; p.fadeTarget = 1;
  }
  parts.forEach((p, i) => { p.order = i; });

  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const p of parts) {
    const o = p.items[0].obj;
    box.setFromObject(o);
    p.anchorObj = o;
    p.anchor = o.worldToLocal(box.getCenter(new THREE.Vector3()));
  }

  // ---------------- 状态（无折叠） ----------------
  const state = { fold: 0, explode: 0, dim: 0.04 };
  const smooth = (t) => t * t * (3 - 2 * t);
  // 部件级爆炸覆盖：拆装挑战「逐个归位」与爆炸态「弹飞」需要单控某个部件的位移量，
  // 未覆盖（undefined）的部件仍走全局 smooth 曲线
  state.partK = null;
  function applyExplode() {
    const e = state.explode, N = parts.length;
    for (const p of parts) {
      const d = 0.3 * (p.order / N);
      const k = state.partK && p.id in state.partK ? state.partK[p.id]
        : smooth(THREE.MathUtils.clamp((e - d) / 0.7, 0, 1));
      p.k = k;
      for (const it of p.items) it.obj.position.copy(it.base).addScaledVector(it.dir, k);
    }
  }
  function setScheme(key) {
    const s = SCHEMES[key];
    for (const p of parts) for (const m of p.mats) {
      const k = m.userData.key;
      if (k && s[k] !== undefined) {
        m.color.setHex(s[k]);
        // 标准版铝框更银亮（与 Pro 的阳极氧化铝做区分）
        if (HW_CONFIG.alu && k === 'titanium') m.color.multiplyScalar(1.1);
      }
    }
  }
  setScheme('white');
  function setFocus(ids) {
    state.lastFocus = ids || null;
    for (const p of parts) p.fadeTarget = !ids || ids.includes(p.id) ? 1 : state.dim;
  }
  function update(dt) {
    applyExplode();
    const a = 1 - Math.exp(-dt * 6);
    for (const p of parts) {
      if (Math.abs(p.fade - p.fadeTarget) < 1e-3) { if (p.fade === p.fadeTarget) continue; p.fade = p.fadeTarget; }
      else p.fade += (p.fadeTarget - p.fade) * a;
      const dim = p.fade < 0.999;
      for (const m of p.mats) {
        const want = dim || m.userData.baseTransparent;
        if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
        m.opacity = m.userData.baseOpacity * p.fade;
        m.depthWrite = dim ? false : m.userData.baseDepthWrite;
      }
      p.meshes.forEach(o => { o.visible = p.fade > 0.02; });
    }
  }

  return {
    root, parts, tex, M, state, update, setScheme, setFocus,
    setFold() {},   // 直板机无折叠
    setExplode(e) { state.explode = e; },
    setPartK(id, k) { (state.partK ||= {})[id] = k; },
    delPartK(id) { if (state.partK) delete state.partK[id]; },
    clearPartK() { state.partK = null; },
    setDim(v) {
      state.dim = THREE.MathUtils.clamp(v, 0, 1);
      setFocus(state.lastFocus);
    },
    setBackText(t) { tex.engrave.setText(t); },
    setEngravePos(x, y) { tex.engrave.setPosition(x, y); },
    setFrameIri(on) {
      const p = parts.find(q => q.id === 'frame');
      p && p.mats.forEach(m => {
        if (!(m instanceof THREE.MeshPhysicalMaterial)) return;
        m.iridescence = on ? 1 : 0;
        m.iridescenceIOR = 1.9;
        m.iridescenceThicknessRange = [120, 480];
        m.needsUpdate = true;
      });
    },
    pickables: () => parts.flatMap(p => p.fade > 0.5 ? p.meshes : []),
  };
}
