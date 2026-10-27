// 临时冒烟测试：node 环境验证 buildPhone / buildPhone18 几何生成是否正常
// mock canvas（2D context 全 no-op Proxy），仅验证构建链路不抛错、几何有实体
function stubCanvas() {
  const c = { width: 0, height: 0, addEventListener() {} };
  c.getContext = () => new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 42 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'createImageData' || k === 'getImageData') return (a, b, w, h) => {
        const [W, H] = h !== undefined ? [w, h] : [a, b];
        return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
      };
      if (k === 'canvas') return c;
      if (typeof k === 'string') return () => {};
      return undefined;
    },
    set() { return true; },
  });
  return c;
}
globalThis.document = { createElement: (t) => stubCanvas() };
globalThis.window = { devicePixelRatio: 2, addEventListener() {} };
globalThis.self = globalThis;

const THREE = await import('three');
const { buildPhone, buildPhone18 } = await import('../js/model.js');

function fakeTex() { return new THREE.CanvasTexture(stubCanvas()); }

function audit(name, model) {
  const box = new THREE.Box3().setFromObject(model.root);
  const meshes = [];
  model.root.traverse((o) => o.isMesh && meshes.push(o));
  const degenerate = meshes.filter((m) => {
    const b = new THREE.Box3().setFromObject(m);
    return !isFinite(b.min.x + b.min.y + b.min.z + b.max.x + b.max.y + b.max.z);
  });
  const size = box.getSize(new THREE.Vector3());
  console.log(`[${name}] parts=${model.parts.length} meshes=${meshes.length} box=(${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}) degenerate=${degenerate.length}`);
  model.parts.forEach((p) => {
    const n = p.meshes.length;
    const b = new THREE.Box3().setFromObject(p.items[0].obj);
    const c = b.getCenter(new THREE.Vector3());
    console.log(`  - ${p.id.padEnd(12)} meshes=${String(n).padStart(3)} center=(${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
  });
  // 更新若干帧（fade / explode / focus 状态机）
  model.setExplode(0); model.update(0.016); model.setExplode(1); model.update(0.016);
  model.setFocus(['frame']); model.update(0.016); model.setFocus(null); model.update(0.016);
  model.setScheme('night'); model.setDim(0.2); model.update(0.016);
  const visible = meshes.filter((m) => m.visible).length;
  console.log(`  状态机跑通 visible=${visible}/${meshes.length} pickables=${model.pickables().length}`);
}

const m1 = buildPhone({ outerTex: fakeTex(), innerTex: fakeTex() });
audit('Duo', m1);
const { P18, P18_STD, P18_MAX } = await import('../js/geo.js');
const HW_PRO = { tele: true, vc: true, alu: false }, HW_STD = { tele: false, vc: false, alu: true };
const m2 = buildPhone18({ screenTex: fakeTex(), dims: P18, hw: HW_PRO, label: { size: '6.3', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4208, batWh: '16.44', batModel: 'A3611' } });
audit('P18 Pro', m2);
const m3 = buildPhone18({ screenTex: fakeTex(), dims: P18_STD, hw: HW_STD, label: { size: '6.1', chip: 'A20', chipName: 'A20', bat: 3561, batWh: '13.87', batModel: 'A3609' } });
audit('P18 std', m3);
const m4 = buildPhone18({ screenTex: fakeTex(), dims: P18_MAX, hw: HW_PRO, label: { size: '6.9', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4685, batWh: '18.31', batModel: 'A3613' } });
audit('P18 max', m4);
// 部件差异断言：标准版双摄（cam 少 5 个 mesh）· 无长焦镜头 · vc 名为石墨散热膜
const camMeshes = (m) => m.parts.find((p) => p.id === 'cam').meshes.length;
console.log(`[assert] cam meshes: pro=${camMeshes(m2)} std=${camMeshes(m3)} max=${camMeshes(m4)}`);
if (!(camMeshes(m2) > camMeshes(m3))) throw new Error('标准版应比 Pro 少长焦镜头 mesh');
const vcName = (m) => m.parts.find((p) => p.id === 'vc').name;
console.log(`[assert] vc: pro="${vcName(m2)}" std="${vcName(m3)}"`);
if (vcName(m2) !== '定制均热板' || vcName(m3) !== '石墨散热膜') throw new Error('vc 部件未按档位区分');
const camName = (m) => m.parts.find((p) => p.id === 'cam').name;
console.log(`[assert] cam: pro="${camName(m2)}" std="${camName(m3)}"`);
if (!camName(m3).includes('双摄')) throw new Error('标准版相机部件名应为双摄系统');
// 相机模组几何（真机布局对照）：Pro 全宽矩阵品字三摄，Std 全宽条双摄
const camBox = (m) => {
  const b = new THREE.Box3();
  m.parts.find((p) => p.id === 'cam').items.forEach((it) => b.expandByObject(it.obj));
  const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  return { w: +s.x.toFixed(1), h: +s.y.toFixed(1), cx: +c.x.toFixed(1), cy: +c.y.toFixed(1) };
};
const bp = camBox(m2), bs = camBox(m3);
console.log(`[assert] cam bbox pro=${JSON.stringify(bp)} (占宽 ${(bp.w / 71 * 100).toFixed(0)}%) std=${JSON.stringify(bs)} (占宽 ${(bs.w / 71.6 * 100).toFixed(0)}%)`);
if (Math.abs(bp.cx) > 1 || Math.abs(bs.cx) > 1) throw new Error('相机模组应横向居中（全宽布局）');
if (bp.h < 45 || bs.h > 30) throw new Error('Pro 矩阵高 / Std 条高度与真机布局不符');

// ---- 彩蛋链路：eggOpts 注入 build，验证微雕贴片挂载 + 虹彩中框接口 ----
const { eggOpts } = await import('../js/eggs.js');
const eg = eggOpts({ text: { chipText: 'FOR YOU', morseText: 'HELLO', vcText: 'VC TEST', edgeText: 'EDGE TEST' }, found: {} });
const e1 = buildPhone({ outerTex: fakeTex(), innerTex: fakeTex(), eggs: eg });
const e2 = buildPhone18({ screenTex: fakeTex(), dims: P18, hw: HW_PRO, label: { size: '6.3', chip: 'A20 PRO', chipName: 'A20 Pro', bat: 4208, batWh: '16.44', batModel: 'A3611' }, eggs: eg });
for (const [name, m] of [['Duo+eggs', e1], ['P18+eggs', e2]]) {
  const planes = [];
  m.root.traverse((o) => o.isMesh && o.material.transparent && o.userData.egg && planes.push(o.userData.egg));
  console.log(`[eggs] ${name} eggPlanes=${planes.length} unique=${new Set(planes).size}`);
  if (!planes.length) throw new Error(`${name} 彩蛋贴片未挂载`);
  m.setFrameIri(true); m.setFrameIri(false);   // 虹彩接口不抛错
}
console.log('SMOKE-OK');
