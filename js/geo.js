// 几何与材质工具
import * as THREE from 'three';

// 尺寸（单位 mm）：展开 168 x 120 x 5.2，合上约 84 x 120 x 13.9
export const D = { H: 120, HW: 81, B: 5.5, T: 5.2, CR: 9 };
D.XI = D.B / 2;          // 铰链半宽
D.XO = D.XI + D.HW;      // 机身外缘

// iPhone 18 Pro（直板单屏）：71 x 149.6 x 8.25，6.3 英寸 19.5:9
// iPhone 18 系列三围（mm）：几何建模统一以 Pro 为基准，标准版 / Max 通过模型 body 组缩放
export const P18 = { W: 71, H: 149.6, T: 8.25, CR: 10.2 };            // 18 Pro（基准）
export const P18_STD = { W: 71.6, H: 147.9, T: 7.8, CR: 9.6 };        // 18 标准版
export const P18_MAX = { W: 77.6, H: 163.4, T: 8.25, CR: 12.2 };      // 18 Pro Max
P18.HW = P18.W / 2;

// 整机圆角矩形（inset 内缩），四角同圆角
export function fullRect(inset = 0, cr = P18.CR) {
  const r = Math.max(cr - inset, 0.3);
  return { x0: -P18.HW + inset, y0: -P18.H / 2 + inset, x1: P18.HW - inset, y1: P18.H / 2 - inset, radii: [r, r, r, r] };
}

export function rrShape(x0, y0, x1, y1, [tl, tr, br, bl], ShapeCls = THREE.Shape) {
  const s = new ShapeCls();
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0);
  if (br) s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - tr);
  if (tr) s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, y1);
  if (tl) s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + bl);
  if (bl) s.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

// 半机身矩形：side=1 右半（铰链在 x 小端），side=-1 左半
export function halfRect(side, inset = 0, cr = D.CR, hr = 1.2) {
  const a = side > 0 ? D.XI : -D.XO, b = side > 0 ? D.XO : -D.XI;
  const r1 = Math.max(cr - inset, 0.3), r0 = Math.max(hr - inset * 0.3, 0.3);
  const radii = side > 0 ? [r0, r1, r1, r0] : [r1, r0, r0, r1];
  return { x0: a + inset, y0: -D.H / 2 + inset, x1: b - inset, y1: D.H / 2 - inset, radii };
}

// 挤出圆角板：z 范围 [z0, z1]，带倒角
export function slab(shape, z0, z1, bevel = 0.3, curveSegments = 24) {
  const depth = Math.max(z1 - z0 - 2 * bevel, 0.01);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4,
  });
  g.translate(0, 0, z0 + bevel);
  return g;
}

// 平面投影 UV（用于印刷贴图）
export function planarUV(g, mirror = false) {
  g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - bb.min.x) / w;
    uv.setXY(i, mirror ? 1 - u : u, (p.getY(i) - bb.min.y) / h);
  }
  uv.needsUpdate = true;
  return g;
}

// 高密度圆角网格（可弯折）
export function roundedGrid(w, h, r, sx, sy, z = 0) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const ax = Math.abs(x) - (w / 2 - r), ay = Math.abs(y) - (h / 2 - r);
    if (ax > 0 && ay > 0) {
      const k = Math.max(ax, ay) / Math.hypot(ax, ay);
      x = Math.sign(x) * (w / 2 - r + ax * k);
      y = Math.sign(y) * (h / 2 - r + ay * k);
    }
    p.setXYZ(i, x, y, z);
  }
  return g;
}

// 弯折映射：右半固定，弯折区为圆弧，左半刚体跟随（参见 model.setFold）
export function bend(x, z, th, out) {
  const XI = D.XI, B = D.B;
  if (x >= XI || th < 1e-5) { out[0] = x; out[1] = z; return out; }
  const R = B / th, t = XI - x;
  if (t <= B) {
    const p = t / R, s = Math.sin(p), c = Math.cos(p);
    out[0] = XI - R * s + z * s;
    out[1] = R - R * c + z * c;
  } else {
    const s = Math.sin(th), c = Math.cos(th);
    const ex = XI - R * s, ez = R - R * c, d = t - B;
    out[0] = ex - d * c + z * s;
    out[1] = ez + d * s + z * c;
  }
  return out;
}

export function gearGeometry(r, teeth, len) {
  const s = new THREE.Shape();
  const ri = r * 0.8, n = teeth, st = Math.PI * 2 / n;
  for (let k = 0; k < n; k++) {
    const a = k * st;
    const pts = [[ri, a], [r, a + st * 0.22], [r, a + st * 0.5], [ri, a + st * 0.72]];
    pts.forEach(([rad, ang], j) => {
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      (k === 0 && j === 0) ? s.moveTo(x, y) : s.lineTo(x, y);
    });
  }
  s.closePath();
  s.holes.push(new THREE.Path().absarc(0, 0, r * 0.3, 0, Math.PI * 2, true));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -len / 2);
  g.rotateX(Math.PI / 2); // 轴向 Y
  return g;
}

class Helix extends THREE.Curve {
  constructor(len, r, turns) { super(); this.len = len; this.r = r; this.turns = turns; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return out.set(t * this.len - this.len / 2, Math.cos(a) * this.r, Math.sin(a) * this.r);
  }
}
export function springGeometry(len, r, turns, wire) {
  return new THREE.TubeGeometry(new Helix(len, r, turns), turns * 16, wire, 6, false);
}

// 材质库
export function materials(T) {
  const M = {};
  M.titanium = new THREE.MeshPhysicalMaterial({ color: 0xdedad2, metalness: 1, roughness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.08 });
  M.titanium.userData.key = 'titanium';
  M.spine = new THREE.MeshPhysicalMaterial({ color: 0xcfcbc2, metalness: 1, roughness: 0.42, side: THREE.DoubleSide });
  M.spine.userData.key = 'spine';
  M.backGlass = new THREE.MeshPhysicalMaterial({ color: 0xefece6, metalness: 0, roughness: 1, roughnessMap: T.backRough, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: 0xffffff });
  M.backGlass.userData.key = 'backGlass';
  M.plateau = new THREE.MeshPhysicalMaterial({ color: 0xefece6, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  M.plateau.userData.key = 'backGlass';
  // 鎏金激光雕刻层：金属度 1 + 低粗糙度（roughnessMap 由文字区域控制）+ 清漆高光，
  // 环境影棚灯条在笔画上流动形成“熠熠生辉”；alpha 通道限定只在文字处可见
  M.engrave = new THREE.MeshPhysicalMaterial({
    map: T.engrave.map, roughnessMap: T.engrave.rough, metalness: 1, roughness: 0.35,
    transparent: true, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.5,
  });
  M.innerOLED = new THREE.MeshPhysicalMaterial({ color: 0x020203, emissive: 0xffffff, emissiveMap: T.inner, emissiveIntensity: 1.05, roughness: 0.32, metalness: 0, side: THREE.DoubleSide });
  M.cover = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.38, metalness: 0, normalMap: T.nano, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1, clearcoatRoughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
  M.outerOLED = new THREE.MeshPhysicalMaterial({ color: 0x020203, emissive: 0xffffff, emissiveMap: T.outer, emissiveIntensity: 1.05, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0 });
  // iPhone 18 Pro 前玻璃（超瓷晶，无纳米纹理）
  M.frontGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.25, side: THREE.DoubleSide, depthWrite: false });
  M.blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.1, metalness: 0.1, clearcoat: 1 });
  M.support = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 1, roughness: 0.32, alphaMap: T.lattice, alphaTest: 0.5, side: THREE.DoubleSide });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 1, roughness: 0.22 });
  M.darkSteel = new THREE.MeshStandardMaterial({ color: 0x4a4e56, metalness: 1, roughness: 0.35 });
  M.midplate = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.9, roughness: 0.45 });
  M.pcb = new THREE.MeshStandardMaterial({ map: T.pcb, roughness: 0.55, metalness: 0.15 });
  M.pcbSide = new THREE.MeshStandardMaterial({ color: 0x0c1c24, roughness: 0.6 });
  M.chipSide = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.2 });
  M.shield = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.28 });
  M.passive = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.5 });
  M.connector = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.6 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xd8b060, metalness: 1, roughness: 0.25 });
  M.batteryA = new THREE.MeshStandardMaterial({ map: T.batA, roughness: 0.42, metalness: 0.1 });
  M.batteryB = new THREE.MeshStandardMaterial({ map: T.batB, roughness: 0.42, metalness: 0.1 });
  M.copper = new THREE.MeshStandardMaterial({ map: T.vc, metalness: 1, roughness: 0.3, color: 0xffffff });
  M.coil = new THREE.MeshStandardMaterial({ map: T.coil, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  M.magnet = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.9, roughness: 0.4 });
  M.flex = new THREE.MeshStandardMaterial({ map: T.flex, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.75 });
  M.lens = new THREE.MeshPhysicalMaterial({ color: 0x030405, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 520] });
  M.lensInner = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.15, metalness: 0.6 });
  M.sapphire = new THREE.MeshPhysicalMaterial({ color: 0x9aa4b4, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false });
  M.flash = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.3, emissive: 0x332a18 });
  M.antenna = new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.6 });
  M.speakerMesh = new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.6, roughness: 0.5 });
  return M;
}

export const SCHEMES = {
  white: { name: '星光白', titanium: 0xe4e0d8, spine: 0xd2cec6, backGlass: 0xf1eee8 },
  night: { name: '夜空色', titanium: 0x3b414e, spine: 0x2f343e, backGlass: 0x1c212c },
};
