// 程序化贴图：全部由 Canvas 实时生成，无需外部图片资源
import * as THREE from 'three';

let maxAniso = 8;
export function setAnisotropy(v) { maxAniso = v; }

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 简易伪随机，保证每次生成一致
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const FONT = '-apple-system, "SF Pro Display", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';

function wallpaper(g, w, h, palette, seed) {
  const r = rng(seed);
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, palette[0]);
  bg.addColorStop(1, palette[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.save();
  g.globalCompositeOperation = 'screen';
  g.filter = `blur(${Math.round(w * 0.03)}px)`;
  for (let i = 0; i < 9; i++) {
    const x = r() * w, y = r() * h, rad = (0.25 + r() * 0.45) * Math.max(w, h) * 0.6;
    const col = palette[2 + (i % (palette.length - 2))];
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // 丝带状光带
  g.save();
  g.globalCompositeOperation = 'screen';
  g.filter = `blur(${Math.round(w * 0.006)}px)`;
  for (let k = 0; k < 5; k++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 + k * 0.025})`;
    g.lineWidth = w * (0.01 + k * 0.004);
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = t * w;
      const y = h * (0.55 + 0.18 * Math.sin(t * 5 + k * 0.7) * Math.cos(t * 2 + k));
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

const ICONS = [
  ['信息', '#34c759', '#30d158'], ['电话', '#30d158', '#28a745'], ['相机', '#8e8e93', '#3a3a3c'],
  ['照片', '#ffffff', '#f2f2f7'], ['地图', '#64d2ff', '#30b0c7'], ['天气', '#5ac8fa', '#007aff'],
  ['音乐', '#ff375f', '#ff2d55'], ['备忘录', '#ffd60a', '#ffcc00'], ['日历', '#ffffff', '#e5e5ea'],
  ['邮件', '#64d2ff', '#0a84ff'], ['Safari', '#e5f3ff', '#0a84ff'], ['设置', '#aeaeb2', '#636366'],
  ['App Store', '#5ac8fa', '#0a60ff'], ['健康', '#ffffff', '#f2f2f7'], ['钱包', '#1c1c1e', '#000000'],
  ['播客', '#bf5af2', '#8944ab'], ['图书', '#ff9f0a', '#ff6b00'], ['Fitness', '#1c1c1e', '#000000'],
  ['TV', '#1c1c1e', '#000000'], ['提醒事项', '#ffffff', '#f2f2f7'], ['文件', '#ffffff', '#e5f0ff'],
  ['计算器', '#2c2c2e', '#1c1c1e'], ['时钟', '#1c1c1e', '#000000'], ['FaceTime', '#30d158', '#248a3d'],
];

function glyph(g, name, x, y, s) {
  g.save();
  g.translate(x + s / 2, y + s / 2);
  g.lineWidth = s * 0.07;
  g.strokeStyle = g.fillStyle = '#fff';
  const u = s / 2;
  switch (name) {
    case '信息': case 'FaceTime':
      g.beginPath(); g.ellipse(0, -u * 0.05, u * 0.58, u * 0.46, 0, 0, Math.PI * 2); g.fill(); break;
    case '电话':
      g.beginPath(); g.arc(0, 0, u * 0.45, Math.PI * 0.75, Math.PI * 1.75); g.lineWidth = s * 0.14; g.stroke(); break;
    case '相机':
      g.beginPath(); g.arc(0, 0, u * 0.42, 0, 7); g.fillStyle = '#1c1c1e'; g.fill();
      g.beginPath(); g.arc(0, 0, u * 0.24, 0, 7); g.fillStyle = '#4a6fa5'; g.fill(); break;
    case '照片': {
      const cs = ['#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#007aff', '#af52de', '#ff2d55', '#ff3b30'];
      for (let i = 0; i < 8; i++) {
        g.save(); g.rotate(i * Math.PI / 4); g.globalAlpha = 0.85; g.fillStyle = cs[i];
        g.beginPath(); g.ellipse(0, -u * 0.32, u * 0.17, u * 0.34, 0, 0, 7); g.fill(); g.restore();
      }
      break;
    }
    case '天气':
      g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(-u * 0.2, -u * 0.15, u * 0.28, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(u * 0.1, u * 0.18, u * 0.45, u * 0.22, 0, 0, 7); g.fill(); break;
    case '音乐':
      g.fillRect(-u * 0.05, -u * 0.5, u * 0.1, u * 0.75); g.beginPath(); g.arc(-u * 0.2, u * 0.28, u * 0.2, 0, 7); g.fill(); break;
    case '日历':
      g.fillStyle = '#ff3b30'; g.font = `600 ${s * 0.16}px ${FONT}`; g.textAlign = 'center'; g.fillText('星期五', 0, -u * 0.45);
      g.fillStyle = '#000'; g.font = `300 ${s * 0.48}px ${FONT}`; g.fillText('23', 0, u * 0.45); break;
    case '时钟':
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, u * 0.7, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -u * 0.5); g.moveTo(0, 0); g.lineTo(u * 0.35, u * 0.1); g.stroke();
      g.strokeStyle = '#ff9500'; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(0, u * 0.2); g.lineTo(-u * 0.2, -u * 0.55); g.stroke(); break;
    case '设置':
      g.strokeStyle = '#3a3a3c'; g.lineWidth = s * 0.1; g.beginPath(); g.arc(0, 0, u * 0.42, 0, 7); g.stroke();
      for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.fillStyle = '#3a3a3c'; g.fillRect(-u * 0.06, -u * 0.68, u * 0.12, u * 0.2); g.restore(); }
      break;
    case '健康':
      g.fillStyle = '#ff2d55'; g.beginPath(); g.moveTo(0, u * 0.45);
      g.bezierCurveTo(-u * 0.9, -u * 0.1, -u * 0.35, -u * 0.75, 0, -u * 0.25);
      g.bezierCurveTo(u * 0.35, -u * 0.75, u * 0.9, -u * 0.1, 0, u * 0.45); g.fill(); break;
    case 'Safari':
      g.strokeStyle = '#0a84ff'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(0, 0, u * 0.62, 0, 7); g.stroke();
      g.fillStyle = '#ff3b30'; g.beginPath(); g.moveTo(u * 0.35, -u * 0.35); g.lineTo(u * 0.08, u * 0.08); g.lineTo(-u * 0.08, -u * 0.08); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-u * 0.35, u * 0.35); g.lineTo(u * 0.08, u * 0.08); g.lineTo(-u * 0.08, -u * 0.08); g.fill(); break;
    default:
      g.globalAlpha = 0.95; g.beginPath(); g.arc(0, 0, u * 0.36, 0, 7); g.fill();
  }
  g.restore();
}

function appIcon(g, i, x, y, s, label) {
  const [name, c1, c2] = ICONS[i % ICONS.length];
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = s * 0.12; g.shadowOffsetY = s * 0.04;
  const gr = g.createLinearGradient(x, y, x, y + s);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; rr(g, x, y, s, s, s * 0.225); g.fill();
  g.restore();
  glyph(g, name, x, y, s);
  if (label) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.font = `500 ${s * 0.2}px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(name, x + s / 2, y + s * 1.28);
  }
}

function statusBar(g, w, y, s, light = true, clock = '9:41') {
  g.fillStyle = light ? '#fff' : '#000';
  g.font = `600 ${s}px ${FONT}`;
  g.textAlign = 'left';
  g.fillText(clock, s * 2.2, y);
  const x = w - s * 2.2;
  // 电池
  g.lineWidth = s * 0.08; g.strokeStyle = g.fillStyle;
  rr(g, x - s * 1.6, y - s * 0.72, s * 1.5, s * 0.72, s * 0.18); g.stroke();
  rr(g, x - s * 1.5, y - s * 0.62, s * 1.15, s * 0.52, s * 0.1); g.fill();
  // 信号
  for (let i = 0; i < 4; i++) g.fillRect(x - s * 4.2 + i * s * 0.32, y - s * 0.2 - i * s * 0.15, s * 0.2, s * 0.2 + i * s * 0.15);
  // Wi-Fi
  g.beginPath(); g.arc(x - s * 2.3, y - s * 0.05, s * 0.6, Math.PI * 1.25, Math.PI * 1.75); g.lineWidth = s * 0.12; g.stroke();
  g.beginPath(); g.arc(x - s * 2.3, y - s * 0.05, s * 0.3, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
}

// 7.6 英寸内屏：主屏幕 + 小组件 + 程序坞
export function innerScreen() {
  const W = 2048, H = 1448;
  const [c, g] = cv(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const m = 22;
  g.save(); rr(g, m, m, W - 2 * m, H - 2 * m, 70); g.clip();
  wallpaper(g, W, H, ['#07102e', '#2a0b3d', '#ff4d6d', '#7b5cff', '#00c6ff', '#ff9e3d', '#3dffb5'], 7);
  statusBar(g, W, 84, 34);
  // 小组件（右侧）
  const wx = W * 0.62, wy = 150, ww = W * 0.33;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.16)'; rr(g, wx, wy, ww, 330, 50); g.fill();
  g.fillStyle = '#fff'; g.font = `600 40px ${FONT}`; g.textAlign = 'left';
  g.fillText('上海', wx + 40, wy + 70);
  g.font = `200 150px ${FONT}`; g.fillText('22°', wx + 30, wy + 220);
  g.font = `500 32px ${FONT}`; g.fillText('晴间多云  最高 25° 最低 16°', wx + 40, wy + 290);
  g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(wx + ww - 110, wy + 130, 60, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)'; rr(g, wx, wy + 370, ww, 420, 50); g.fill();
  g.fillStyle = '#ff453a'; g.font = `600 34px ${FONT}`; g.fillText('10月23日 星期五', wx + 40, wy + 440);
  const ev = [['iPhone Duo 发售', '#0a84ff', '08:00'], ['Apple Park 设计评审', '#ff9f0a', '10:30'], ['铰链可靠性测试', '#30d158', '14:00'], ['A20 Pro 性能调优', '#bf5af2', '16:30']];
  ev.forEach((e, i) => {
    const y = wy + 500 + i * 70;
    g.fillStyle = e[1]; rr(g, wx + 40, y - 34, 8, 50, 4); g.fill();
    g.fillStyle = '#fff'; g.font = `600 34px ${FONT}`; g.fillText(e[0], wx + 70, y);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `400 26px ${FONT}`; g.fillText(e[2], wx + ww - 120, y);
  });
  g.restore();
  // 应用网格
  const s = 150, gx = 210, gy = 240;
  let k = 0;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    appIcon(g, k++, 110 + col * gx, 170 + row * gy, s, true);
  }
  // 程序坞
  g.fillStyle = 'rgba(255,255,255,0.22)';
  rr(g, W * 0.18, H - 250, W * 0.64, 200, 64); g.fill();
  for (let i = 0; i < 7; i++) appIcon(g, [1, 10, 0, 6, 2, 3, 11][i], W * 0.2 + 40 + i * 168, H - 225, 150, false);
  g.restore();
  return toTex(c);
}

// 5.4 英寸外屏：锁屏
export function outerScreen() {
  const W = 1024, H = 1448;
  const [c, g] = cv(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.save(); rr(g, 14, 14, W - 28, H - 28, 96); g.clip();
  wallpaper(g, W, H, ['#020615', '#0b1d3a', '#2f6bff', '#8a3cff', '#00e0c6', '#ff6a3d'], 23);
  statusBar(g, W, 72, 30);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.textAlign = 'center';
  g.font = `600 44px ${FONT}`; g.fillText('10月23日 星期五', W / 2, 250);
  g.font = `600 300px ${FONT}`; g.fillText('9:41', W / 2, 540);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  rr(g, 110, 620, 380, 160, 40); g.fill(); rr(g, 534, 620, 380, 160, 40); g.fill();
  g.fillStyle = '#fff'; g.font = `500 34px ${FONT}`; g.textAlign = 'left';
  g.fillText('电池  100%', 150, 690); g.fillText('A20 Pro · 2nm', 574, 690);
  g.font = `400 26px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('双电芯 · 4883 mAh', 150, 740); g.fillText('均热板散热', 574, 740);
  [[160, H - 180], [W - 160, H - 180]].forEach(([x, y]) => {
    g.fillStyle = 'rgba(30,30,40,0.55)'; g.beginPath(); g.arc(x, y, 70, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill();
  });
  g.fillStyle = 'rgba(255,255,255,0.9)'; rr(g, W / 2 - 150, H - 50, 300, 12, 6); g.fill();
  // 灵动岛（前置 Center Stage 摄像头开孔）
  g.fillStyle = '#000'; rr(g, W / 2 - 150, 36, 300, 86, 43); g.fill();
  g.restore();
  return toTex(c);
}

// 纳米纹理法线贴图（圆形微凸起，散射光线弱化折痕）
export function nanoNormal() {
  const N = 128;
  const [c, g] = cv(N, N);
  const img = g.createImageData(N, N);
  const hgt = new Float32Array(N * N);
  const pts = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) pts.push([(i + (j % 2) * 0.5) * N / 6, (j + 0.5) * N / 6]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [px, py] of pts) {
      let dx = Math.abs(x - px); dx = Math.min(dx, N - dx);
      let dy = Math.abs(y - py); dy = Math.min(dy, N - dy);
      const d = Math.hypot(dx, dy) / (N / 13);
      if (d < 1) v = Math.max(v, Math.cos(d * Math.PI / 2) ** 2);
    }
    hgt[y * N + x] = v;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)];
    const hy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
    const nx = -hx * 2, ny = -hy * 2, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const o = (y * N + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255;
    img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, { srgb: false, repeat: [90, 64] });
}

// OLED 像素层（拆开后可见的 RGB 子像素纹理）
export function oledPixels() {
  const [c, g] = cv(64, 64);
  g.fillStyle = '#05060a'; g.fillRect(0, 0, 64, 64);
  const cols = ['#ff2a3a', '#2aff6a', '#3a6bff'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    cols.forEach((col, k) => {
      g.fillStyle = col; g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(x * 16 + 3 + k * 5, y * 16 + 8 + (k === 1 ? -3 : 2), 2, k === 2 ? 4 : 3, 0, 0, 7); g.fill();
    });
  }
  return toTex(c, { repeat: [300, 200] });
}

// 主板 PCB（单层非堆叠设计）
export function pcb(seed = 3) {
  const W = 1024, H = 800;
  const r = rng(seed);
  const [c, g] = cv(W, H);
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0e2430'); bg.addColorStop(1, '#0a1820');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 走线
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(80,150,160,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    let x = r() * W, y = r() * H;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (k % 2) x += (r() - 0.5) * 300; else y += (r() - 0.5) * 300;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // 过孔
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() > 0.5 ? '#c9a24a' : '#7aa0a8';
    g.beginPath(); g.arc(r() * W, r() * H, 1.5 + r() * 2.5, 0, 7); g.fill();
  }
  // 金色焊盘与测试点
  for (let i = 0; i < 160; i++) {
    g.fillStyle = '#d6ae55';
    g.fillRect(r() * W, r() * H, 4 + r() * 10, 4 + r() * 10);
  }
  // 边缘接地铜带
  g.strokeStyle = '#c9a24a'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  // 丝印
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `600 22px monospace`;
  g.fillText('820-03561-A', 30, H - 30);
  g.fillText('APPLE INC. ©2026', W - 260, H - 30);
  g.font = `500 14px monospace`;
  for (let i = 0; i < 50; i++) g.fillText(['C', 'R', 'L', 'U', 'J', 'FL'][i % 6] + Math.floor(r() * 9000 + 100), r() * W, r() * H);
  return toTex(c);
}

// 芯片顶部激光刻字
export function chipLabel(title, lines = [], { bg = '#1b1c20', fg = 'rgba(220,225,235,0.8)', logo = true, micro } = {}) {
  const W = 512, H = 512;
  const [c, g] = cv(W, H);
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, bg); gr.addColorStop(1, '#0d0e11');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = fg; g.textAlign = 'center';
  if (logo) {
    appleLogo(g, W / 2, 140, 90, fg);
  }
  g.font = `700 ${title.length > 6 ? 64 : 84}px ${FONT}`;
  g.fillText(title, W / 2, logo ? 300 : 220);
  g.font = `500 30px monospace`;
  lines.forEach((l, i) => g.fillText(l, W / 2, (logo ? 360 : 290) + i * 42));
  g.beginPath(); g.arc(40, H - 40, 12, 0, 7); g.fill();
  // 彩蛋：芯片裸片角落的微米级刻字 + 轮廓蚀刻画（放大才能看清）
  if (micro && micro.text) {
    g.font = `400 13px monospace`;
    g.fillStyle = 'rgba(200,208,222,0.66)';
    g.textAlign = 'left';
    g.fillText(micro.text.slice(0, 30), 22, H - 18);
    if (micro.img) { g.drawImage(micro.img, W - 96, H - 96, 78, 78); g.strokeStyle = 'rgba(200,208,222,0.4)'; g.strokeRect(W - 96, H - 96, 78, 78); }
  }
  return toTex(c);
}

// ---------------- 彩蛋 · 隐藏细节纹理 ----------------
// 「彩蛋工坊」定制的文字会实时烙进这些微雕里；发现方式 = 拆机后聚焦对应部件
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
export function morseOf(text) {
  return [...String(text).toUpperCase()].map((ch) => (ch === ' ' ? '/' : MORSE[ch] || '')).filter(Boolean).join(' ');
}

// 电池正面 Morse 电码带（解码即彩蛋短语）
export function morseTexture(text) {
  const W = 1024, H = 256;
  const [c, g] = cv(W, H);
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, H);
  const code = morseOf(text) || morseOf('HELLO');
  g.fillStyle = 'rgba(232,232,234,0.85)';
  g.textAlign = 'center'; g.font = `500 34px monospace`;
  g.fillText('· SERIAL ·', W / 2, 52);
  let x = 60;
  for (const ch of code) {
    if (ch === '/') { x += 34; continue; }
    if (ch === '.') { g.beginPath(); g.arc(x, 128, 9, 0, 7); g.fill(); x += 30; }
    else { g.fillRect(x, 118, 34, 20); x += 54; }
    if (x > W - 40) break;
  }
  g.font = `400 22px monospace`; g.fillStyle = 'rgba(232,232,234,0.5)';
  g.fillText('(decode me)', W / 2, H - 34);
  return toTex(c, { srgb: true });
}

// 中框底边「法规刻字」：浅色微字长条，透明底
export function edgeEngraving(text) {
  const W = 2048, H = 64;
  const [c, g] = cv(W, H);
  const t = (text || 'Designed by Apple in California').slice(0, 44);
  g.fillStyle = 'rgba(255,255,255,0.82)';
  g.textAlign = 'center'; g.font = `500 30px monospace`;
  g.fillText(`${t} · Model A3611 · FCC ID BCG-A3611 · IC 579C-A3611`, W / 2, 42);
  return toTex(c, { srgb: true });
}

// 均热板铜面激光签名（深色蚀刻）
export function vcSignature(text) {
  const W = 1024, H = 256;
  const [c, g] = cv(W, H);
  g.fillStyle = 'rgba(0,0,0,0)';
  const t = (text || 'VAPOR CHAMBER · CALIBRATED').slice(0, 40);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(58,30,18,0.78)';
  g.font = `700 52px monospace`;
  g.fillText(t, W / 2, 108);
  g.font = `500 26px monospace`;
  g.fillText('LASER ENGRAVED · DO NOT COVER · Ⓥ 2026', W / 2, 168);
  return toTex(c, { srgb: true });
}

// USB-C 口深处批号（最隐蔽的一枚）
export function usbBatch() {
  const W = 512, H = 128;
  const [c, g] = cv(W, H);
  g.fillStyle = 'rgba(0,0,0,0)';
  g.textAlign = 'center'; g.fillStyle = 'rgba(210,215,224,0.8)';
  g.font = `600 40px monospace`;
  g.fillText('A3611-C4 · 2647', W / 2, 58);
  g.font = `500 26px monospace`;
  g.fillText('Ⓥ · SHENZEN · 2026.09', W / 2, 102);
  return toTex(c, { srgb: true });
}

// 上传图片 → Sobel 边缘轮廓蚀刻画（黑底亮线，芯片裸片角落贴画）
export function edgeSketch(img, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = Math.max(size / img.width, size / img.height);
  g.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
  const d = g.getImageData(0, 0, size, size);
  const L = (i) => d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114;
  const out = g.createImageData(size, size);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = (y * size + x) * 4;
    const gx = -L(i - size * 4 - 4) + L(i - size * 4 + 4) - 2 * L(i - 4) + 2 * L(i + 4) - L(i + size * 4 - 4) + L(i + size * 4 + 4);
    const gy = -L(i - size * 4 - 4) - 2 * L(i - size * 4) - L(i - size * 4 + 4) + L(i + size * 4 - 4) + 2 * L(i + size * 4) + L(i + size * 4 + 4);
    const m = Math.hypot(gx, gy) > 72 ? 235 : 12;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = m;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

// Apple 标志（几何近似绘制）
export function appleLogo(g, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -28);
  g.bezierCurveTo(14, -40, 40, -38, 48, -20);
  g.bezierCurveTo(30, -8, 32, 22, 52, 30);
  g.bezierCurveTo(44, 52, 30, 70, 16, 68);
  g.bezierCurveTo(6, 67, 4, 62, -6, 62);
  g.bezierCurveTo(-16, 62, -20, 68, -30, 68);
  g.bezierCurveTo(-48, 68, -72, 30, -64, -2);
  g.bezierCurveTo(-58, -30, -34, -40, -18, -34);
  g.bezierCurveTo(-10, -31, -6, -28, 0, -28);
  g.fill();
  g.beginPath();
  g.moveTo(2, -40);
  g.bezierCurveTo(0, -56, 14, -70, 28, -72);
  g.bezierCurveTo(30, -56, 18, -42, 2, -40);
  g.fill();
  g.restore();
}

// 电池外包装印刷
export function battery(mah, wh, model) {
  const W = 1024, H = 1024;
  const [c, g] = cv(W, H);
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#1a1b1f'); gr.addColorStop(0.5, '#0f1013'); gr.addColorStop(1, '#1d1e22');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 40; i++) g.fillRect(0, i * 26, W, 1);
  g.fillStyle = '#e8e8ea';
  g.textAlign = 'left';
  appleLogo(g, 120, 160, 80, '#e8e8ea');
  g.font = `600 56px ${FONT}`; g.fillText('Li-ion Polymer Battery', 200, 180);
  g.font = `500 40px ${FONT}`;
  g.fillText(`Model ${model}`, 90, 300);
  g.font = `700 92px ${FONT}`; g.fillText(`${mah} mAh`, 90, 430);
  g.font = `500 46px ${FONT}`; g.fillText(`${wh} Wh   3.88 V ⎓   Typ.`, 90, 510);
  g.font = `400 26px ${FONT}`;
  g.fillStyle = 'rgba(232,232,234,0.75)';
  ['警告：请勿拆解、挤压、刺穿或焚烧。', 'Electrically releasable adhesive · 电控可释放胶', 'Designed by Apple in California  Assembled in China'].forEach((t, i) => g.fillText(t, 90, 620 + i * 44));
  // 二维码 & 认证图标
  const r = rng(mah);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (r() > 0.5 || (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)) {
    g.fillStyle = '#e8e8ea'; g.fillRect(W - 330 + x * 11, H - 330 + y * 11, 10, 10);
  }
  g.strokeStyle = '#e8e8ea'; g.lineWidth = 6;
  [0, 1, 2].forEach(i => { g.beginPath(); g.arc(120 + i * 110, H - 140, 40, 0, 7); g.stroke(); });
  // 电控胶导电条（金色）
  g.fillStyle = '#c99a3a';
  g.fillRect(0, H - 30, W, 30);
  return toTex(c);
}

// 屏幕支撑板：中部激光镂空格栅（柔性弯折区）
export function latticeAlpha(widthMM, bandMM) {
  const W = 2048, H = 256;
  const [c, g] = cv(W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const band = bandMM / widthMM * W;
  const x0 = W / 2 - band / 2;
  g.fillStyle = '#000';
  const cols = 14, rows = 22;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + (i + 0.5) * band / cols;
    const y = (j + (i % 2) * 0.5) * H / rows;
    rr(g, x - 1.6, y + 1, 3.2, H / rows - 3, 1.6); g.fill();
  }
  const t = toTex(c, { srgb: false });
  t.anisotropy = 1;
  return t;
}

// 背板玻璃粗糙度贴图：磨砂玻璃 + 抛光 Apple 标志（按设备背板比例参数化）
export function backGlassRoughness(W = 1024, H = 1536) {
  const [c, g] = cv(W, H);
  g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, H);
  const r = rng(9);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},0,0,0.03)`; g.fillRect(r() * W, r() * H, 2, 2); }
  appleLogo(g, W / 2, H / 2 + 40, Math.min(W, H) * 0.22, 'rgb(20,20,20)');
  return toTex(c, { srgb: false });
}

// 拉丝金属（均热板铜面）
export function brushed(base = '#c47c4c', seed = 5) {
  const W = 512, H = 512;
  const r = rng(seed);
  const [c, g] = cv(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '255,230,200' : '60,25,10'},${r() * 0.12})`;
    g.lineWidth = r() * 2;
    const y = r() * H;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (r() - 0.5) * 6); g.stroke();
  }
  return toTex(c);
}

// 均热板表面：铜底 + 激光刻印
export function vaporChamber() {
  const t = brushed('#c27a4a', 11);
  const c = t.image, g = c.getContext('2d');
  g.strokeStyle = 'rgba(80,35,15,0.35)'; g.lineWidth = 3;
  rr(g, 20, 20, c.width - 40, c.height - 40, 24); g.stroke();
  g.fillStyle = 'rgba(70,30,10,0.55)';
  g.font = `600 26px ${FONT}`;
  g.fillText('VAPOR CHAMBER · A20 PRO DIE-DIRECT', 40, c.height - 50);
  t.needsUpdate = true;
  return t;
}

// MagSafe 线圈
export function coil() {
  const W = 1024;
  const [c, g] = cv(W, W);
  g.fillStyle = '#111'; g.fillRect(0, 0, W, W);
  for (let rad = 160; rad < 470; rad += 7) {
    g.strokeStyle = rad % 14 ? '#b8703c' : '#e09a60';
    g.lineWidth = 5;
    g.beginPath(); g.arc(W / 2, W / 2, rad, 0, 7); g.stroke();
  }
  g.fillStyle = '#111'; g.fillRect(W / 2 - 18, W / 2, 36, 470);
  g.fillStyle = '#d6ae55'; g.fillRect(W / 2 - 14, W / 2 + 330, 28, 140);
  return toTex(c);
}

// 地面接触阴影
export function contactShadow() {
  const W = 512;
  const [c, g] = cv(W, W);
  const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, W);
  return toTex(c, { srgb: false });
}

// 柔性排线
export function flex() {
  const W = 256, H = 64;
  const [c, g] = cv(W, H);
  g.fillStyle = '#d18a2a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(120,60,10,0.6)'; g.fillRect(0, 4 + i * 4.3, W, 1.4); }
  g.fillStyle = '#1a1a1a'; g.fillRect(40, 0, 60, H); g.fillRect(160, 0, 50, H);
  return toTex(c);
}

// ---------------- 鎏金激光雕刻（背板自定义文字） ----------------
// 工程套路：鎏金≠亮黄。用「低饱和香槟金竖向渐变 + 激光扫描线 + 边缘熔融晕」三层叠加，
// 金属度 1 + 低粗糙度让环境灯条在笔画表面流动，得到“熠熠生辉”而非“金漆”。
// alpha 通道控制可见范围：文字区域不透明，其余完全透明，直接贴在背板玻璃外表面。
export function createEngraving(W = 1024, H = 1536, text = 'iPhone Duo') {
  const [cc, cg] = cv(W, H);      // 颜色 + alpha
  const [rc, rg] = cv(W, H);      // 粗糙度
  const map = toTex(cc);
  const rough = toTex(rc, { srgb: false });

  // 位置（归一化）：x ∈ [-0.17, 0.17] 相对画布宽；y ∈ [0.28, 0.92] 相对画布高（默认 0.735 在 Apple 标志下方）
  const pos = { x: 0, y: 0.735 };
  let str = text;

  // 带字距的居中绘制（中英文均适用），含横向偏移
  function layout(fs, gap) {
    const font = `500 ${fs}px ${FONT}`;
    cg.font = font; rg.font = font;
    const chars = [...str];
    const ws = chars.map(ch => cg.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    return { chars, ws, total, x0: W / 2 + pos.x * W - total / 2 };
  }
  function drawSpaced(g, L, y, fs, gap) {
    g.font = `500 ${fs}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let x = L.x0;
    L.chars.forEach((ch, i) => { g.fillText(ch, x, y); x += L.ws[i] + gap; });
  }

  function draw() {
    // 清空（颜色画布全透明，粗糙度画布回中性）
    cg.clearRect(0, 0, W, H);
    rg.fillStyle = 'rgb(210,210,210)'; rg.fillRect(0, 0, W, H);
    map.needsUpdate = true; rough.needsUpdate = true;
    if (!str) return;

    // ---- 自适应字号：总宽限制在 0.62W ----
    const y = H * pos.y;
    const maxW = W * 0.62;
    let fs = 118, gap = 12;
    let L = layout(fs, gap);
    if (L.total > maxW) { const k = maxW / L.total; fs *= k; gap *= k; L = layout(fs, gap); }
    const top = y - fs * 0.78, bot = y + fs * 0.24;

    // ---- 1. 暗色烧蚀晕（激光切入玻璃的熔融边缘） ----
    cg.save();
    cg.globalAlpha = 1;
    cg.font = `500 ${fs}px ${FONT}`; cg.textAlign = 'left';
    cg.shadowColor = 'rgba(46,30,8,0.9)'; cg.shadowBlur = fs * 0.11;
    cg.fillStyle = 'rgba(70,50,18,0.75)';
    cg.shadowOffsetY = fs * 0.015;
    drawSpaced(cg, L, y, fs, gap);
    cg.restore();

    // ---- 2. 香槟金主体（竖向三段渐变，饱和度压低） ----
    const grad = cg.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, '#f0e4bb');
    grad.addColorStop(0.3, '#d3b269');
    grad.addColorStop(0.52, '#8f6f35');
    grad.addColorStop(0.78, '#e6d29a');
    grad.addColorStop(1, '#a8853f');
    cg.save();
    cg.shadowColor = 'rgba(255,226,150,0.5)'; cg.shadowBlur = fs * 0.16;   // 边缘亮金微光
    cg.fillStyle = grad;
    drawSpaced(cg, L, y, fs, gap);
    cg.restore();

    // ---- 3. 激光扫描线（笔画内的横向微纹，source-atop 只作用于文字） ----
    cg.save();
    cg.globalCompositeOperation = 'source-atop';
    cg.beginPath(); cg.rect(0, top - 10, W, bot - top + 20); cg.clip();
    for (let ly = top; ly < bot; ly += 3) {
      const bright = ((ly / 3) | 0) % 2 === 0;
      cg.fillStyle = bright ? 'rgba(255,246,214,0.16)' : 'rgba(96,72,30,0.14)';
      cg.fillRect(L.x0 - fs * 0.2, ly, L.total + fs * 0.4, 1.4);
    }
    // 45° 拉丝高光带（金属反光随视角流动）
    const sheen = cg.createLinearGradient(L.x0, top, L.x0 + L.total, bot);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,250,230,0.34)');
    sheen.addColorStop(0.52, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.8, 'rgba(255,240,200,0.18)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = sheen; cg.fillRect(L.x0 - fs * 0.2, top - 10, L.total + fs * 0.4, bot - top + 20);
    // 少量金噪点
    const r = rng(37);
    for (let i = 0; i < 260; i++) {
      cg.fillStyle = `rgba(${r() > 0.4 ? '255,240,190' : '80,60,25'},${0.06 + r() * 0.12})`;
      cg.fillRect(L.x0 + r() * L.total, top + r() * (bot - top), 1.6, 1.6);
    }
    cg.restore();

    // ---- 4. 边缘高光描边（激光重熔亮线） ----
    cg.save();
    cg.lineWidth = Math.max(1, fs * 0.012);
    cg.strokeStyle = 'rgba(255,242,205,0.6)';
    cg.font = `500 ${fs}px ${FONT}`; cg.textAlign = 'left';
    let x = L.x0;
    L.chars.forEach((ch, i) => { cg.strokeText(ch, x, y); x += L.ws[i] + gap; });
    cg.restore();

    // ---- 5. 粗糙度画布：文字区域低粗糙（高反射 = 熠熠生辉），叠加扫描线微差 ----
    rg.save();
    rg.fillStyle = '#3a3a3a';
    drawSpaced(rg, L, y, fs, gap);
    rg.globalCompositeOperation = 'source-atop';
    for (let ly = top; ly < bot; ly += 3) {
      rg.fillStyle = ((ly / 3) | 0) % 2 === 0 ? 'rgba(120,120,120,0.5)' : 'rgba(30,30,30,0.5)';
      rg.fillRect(L.x0 - fs * 0.2, ly, L.total + fs * 0.4, 1.4);
    }
    rg.restore();

    map.needsUpdate = true; rough.needsUpdate = true;
  }

  function setText(text) {
    str = (text ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, 14);
    draw();
  }
  function setPosition(x, y) {
    pos.x = Math.min(0.17, Math.max(-0.17, +x || 0));
    pos.y = Math.min(0.92, Math.max(0.28, +y || 0.735));
    draw();
  }

  draw();
  return { map, rough, setText, setPosition };
}

// ---------------- 图层化实时锁屏 / 轮播屏保 ----------------
// 工程套路：分层合成 = 底层（默认壁纸 / 用户图片 cover 铺满）→ 暗化渐晕 →
// 组件层（实时时钟、日期、状态栏、灵动岛、信息卡、底部控件）永远盖在图片上方，
// 才有 iOS 锁屏“图片是壁纸、组件浮在上面”的真实层次。轮播切换用 1.6s 交叉淡入。
// mode: 'outer' 1024×1448（5.4 英寸外屏）| 'inner' 2048×1448（7.6 英寸内屏横版）
//      | 'phone' 1206×2622（19.5:9 直板单屏竖版）；boolean 旧签名仍兼容
export function createLockScreen(mode = 'outer') {
  if (mode === true) mode = 'inner';
  else if (mode === false || mode == null) mode = 'outer';
  const landscape = mode === 'inner';
  const phone = mode === 'phone';
  const W = phone ? 1206 : (landscape ? 2048 : 1024), H = phone ? 2622 : 1448;
  const [c, g] = cv(W, H);
  const texture = toTex(c);

  // 默认壁纸预渲染成位图缓存（含 blur 的 radial 光斑每秒重绘太贵，只算一次）
  const wallC = cv(W, H)[0];
  wallpaper(wallC.getContext('2d'), W, H, ['#020615', '#0b1d3a', '#2f6bff', '#8a3cff', '#00e0c6', '#ff6a3d'], 23);

  let images = [];           // 用户图片（canvas，已预缩放）
  let idx = 0, prev = -1;
  let fadeT = -1;            // >=0 表示正在交叉淡入
  let interval = 8, carousel = 0;
  let lastMin = -1, lastDraw = 0, dirty = true;
  const FADE = 1.6;
  const layers = { clock: true, status: true, island: true, lock: true, cards: true, dock: true, dim: true };
  let zoom = 1;
  // 彩蛋 / 照片 App 状态机：lock = 锁屏 · grid = 照片墙 · view = 单张浏览
  let ui = 'lock';
  let torch = -1, rainbow = -1;   // >=0 毫秒计的临时特效

  // cover 铺满：等比缩放裁切（zoom 供用户调整构图），任意比例图片自适应屏幕画布
  function drawCover(img, alpha) {
    const s = Math.max(W / img.width, H / img.height) * zoom;
    const dw = img.width * s, dh = img.height * s;
    g.save(); g.globalAlpha = alpha;
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    g.restore();
  }

  // 组件层：实时时间日期等（画在图片之上，层次的关键）；各图层可独立开关
  // 工程套路：横屏（内屏）参考 iPad 锁屏构图——时钟居中、信息卡分居左右、
  // 灵动岛移到左上避开中央铰链折痕；竖屏（外屏）沿用 iPhone 锁屏构图；
  // phone（19.5:9 直板单屏）用 iOS 原生锁屏纵向节奏——大时钟下移、卡片区收紧、
  // 手电筒/相机贴近底部两角。
  function drawWidgets(now) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const wk = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    if (layers.status) statusBar(g, W, 72, phone ? 46 : (landscape ? 34 : 30), true, `${hh}:${mm}`);
    // 灵动岛：横屏偏左避开折痕；phone 用原生比例药丸
    if (layers.island) {
      g.fillStyle = '#000';
      if (phone) rr(g, W / 2 - 170, 38, 340, 96, 48);
      else rr(g, landscape ? 170 : W / 2 - 150, 36, 300, 86, 43);
      g.fill();
    }
    // 锁图标
    if (layers.lock) {
      const lx = phone ? W / 2 : (landscape ? 220 : W / 2);
      const ly = phone ? H * 0.132 : 176;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = phone ? 8 : 7; g.lineCap = 'round';
      g.beginPath(); g.arc(lx, ly, 16, Math.PI, 0); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      rr(g, lx - 24, ly, 48, 38, 9); g.fill();
      g.restore();
    }
    // 日期 + 大时钟（带投影，浮在图片上更有层次）
    if (layers.clock) {
      g.textAlign = 'center';
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      const dateY = phone ? H * 0.195 : (landscape ? 330 : 268);
      const clockY = phone ? H * 0.36 : (landscape ? 710 : 560);
      g.font = `600 ${phone ? 54 : 44}px ${FONT}`;
      g.fillText(`${now.getMonth() + 1}月${now.getDate()}日 星期${wk}`, W / 2, dateY);
      const clockS = phone ? Math.round(W * 0.28) : (landscape ? 280 : 300);
      g.font = `600 ${clockS}px ${FONT}`;
      g.fillText(`${hh}:${mm}`, W / 2, clockY);
      g.restore();
    }
    // 信息卡：横屏分居左右两侧，竖屏并排居中，phone 加宽加大居中并排
    if (layers.cards) {
      const cy = phone ? H * 0.45 : 620;
      const cw = phone ? 400 : 380, ch = phone ? 170 : 160, cr = phone ? 44 : 40;
      const c1 = phone ? W / 2 - 424 : (landscape ? 150 : 110);
      const c2 = phone ? W / 2 + 24 : (landscape ? W - 530 : 534);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      rr(g, c1, cy, cw, ch, cr); g.fill(); rr(g, c2, cy, cw, ch, cr); g.fill();
      const t1 = phone ? H * 0.45 + 74 : 690, t2 = phone ? H * 0.45 + 124 : 740;
      g.fillStyle = '#fff'; g.font = `500 ${phone ? 38 : 34}px ${FONT}`; g.textAlign = 'left';
      g.fillText(phone ? '电池  100%' : '电池  100%', c1 + 44, t1);
      g.fillText('A20 Pro · 2nm', c2 + 44, t1);
      g.font = `400 ${phone ? 30 : 26}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(phone ? '钢壳电池 · 4208 mAh' : '双电芯 · 4883 mAh', c1 + 44, t2);
      g.fillText(phone ? '均热板散热' : '均热板散热', c2 + 44, t2);
    }
    // 底部手电筒 / 相机 + home 指示条
    if (layers.dock) {
      const dx = phone ? W * 0.14 : (landscape ? W / 2 - 560 : 160);
      const dy = phone ? H - 190 : H - 180;
      const dr = phone ? 72 : 70;
      [[dx, dy], [W - dx, dy]].forEach(([x, y]) => {
        g.fillStyle = 'rgba(30,30,40,0.55)'; g.beginPath(); g.arc(x, y, dr, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill();
      });
      const hw = phone ? 320 : 300, hy = phone ? H - 56 : H - 50;
      g.fillStyle = 'rgba(255,255,255,0.9)'; rr(g, W / 2 - hw / 2, hy, hw, 12, 6); g.fill();
    }
  }

  function render() {
    const now = new Date();
    lastMin = now.getMinutes();
    if (ui !== 'lock') { renderApp(now); return; }
    // ---- 底层 ----
    if (!images.length) {
      g.drawImage(wallC, 0, 0);
    } else {
      drawCover(images[prev >= 0 ? prev : idx], 1);
      if (prev >= 0 && fadeT >= 0) drawCover(images[idx], ease01(fadeT / FADE));
      // 图片上的暗化渐晕 + 轻暗角：保证白色组件可读，也让画面更“壁纸”（可开关）
      if (layers.dim) {
        g.save();
        const top = g.createLinearGradient(0, 0, 0, H * 0.3);
        top.addColorStop(0, 'rgba(0,0,0,0.42)'); top.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = top; g.fillRect(0, 0, W, H * 0.3);
        const bot = g.createLinearGradient(0, H, 0, H * 0.82);
        bot.addColorStop(0, 'rgba(0,0,0,0.35)'); bot.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bot; g.fillRect(0, H * 0.82, W, H * 0.18);
        const R = Math.hypot(W, H) / 2;
        const vg = g.createRadialGradient(W / 2, H / 2, R * 0.42, W / 2, H / 2, R * 1.15);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.22)');
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
        g.restore();
      }
    }
    // ---- 组件层（永远在最上） ----
    drawWidgets(now);
    overlayFx();
    texture.needsUpdate = true;
    dirty = false;
    lastDraw = performance.now();
  }

  // ---- 彩蛋 / 照片 App：屏幕内的“假手机”交互 ----
  // 网格布局常量（hit 与 renderApp 共用，保证点哪是哪）
  const grid = (() => {
    const cols = 3, mx = Math.round(W * 0.045), top = Math.round(H * 0.155);
    const cell = Math.floor((W - mx * (cols + 1)) / cols), gap = mx;
    return { cols, mx, cell, gap, top };
  })();
  const dockBtn = () => ({ x: phone ? W * 0.14 : (landscape ? W / 2 - 560 : 160), y: phone ? H - 190 : H - 180, r: (phone ? 72 : 70) * 1.5 });

  function renderApp(now) {
    g.fillStyle = '#08090c';
    g.fillRect(0, 0, W, H);
    if (layers.status) statusBar(g, W, 72, phone ? 46 : (landscape ? 34 : 30), true, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    const hh = Math.round(H * 0.055);
    if (ui === 'grid') {
      // 顶部：返回 + 标题
      g.fillStyle = '#fff'; g.textAlign = 'left';
      g.font = `600 ${hh}px ${FONT}`;
      g.fillText('‹ 锁屏', grid.mx, H * 0.105);
      g.textAlign = 'center';
      g.font = `700 ${Math.round(hh * 1.1)}px ${FONT}`;
      g.fillText('照片', W / 2, H * 0.075);
      g.font = `400 ${Math.round(hh * 0.55)}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillText(`${images.length} 张 · 点击浏览`, W / 2, H * 0.125);
      // 缩略图网格（正方形 cover 裁切）
      images.forEach((img, i) => {
        const r = Math.floor(i / grid.cols), c = i % grid.cols;
        const x = grid.mx + c * (grid.cell + grid.gap), y = grid.top + r * (grid.cell + grid.gap);
        if (y > H - grid.cell * 0.4) return;
        const s = Math.max(grid.cell / img.width, grid.cell / img.height);
        g.save();
        rr(g, x, y, grid.cell, grid.cell, 10); g.clip();
        g.drawImage(img, x + (grid.cell - img.width * s) / 2, y + (grid.cell - img.height * s) / 2, img.width * s, img.height * s);
        if (i === idx) { g.strokeStyle = '#4da3ff'; g.lineWidth = 6; rr(g, x + 3, y + 3, grid.cell - 6, grid.cell - 6, 8); g.stroke(); }
        g.restore();
      });
      if (!images.length) {
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.textAlign = 'center';
        g.font = `500 ${Math.round(hh * 0.8)}px ${FONT}`;
        g.fillText('相册还是空的', W / 2, H * 0.45);
        g.font = `400 ${Math.round(hh * 0.6)}px ${FONT}`;
        g.fillText('在「个性化定制」里上传照片', W / 2, H * 0.45 + hh);
      }
    } else if (ui === 'view') {
      const img = images[idx];
      if (img) drawCover(img, 1);
      // 顶栏渐隐 + 返回
      const topG = g.createLinearGradient(0, 0, 0, H * 0.14);
      topG.addColorStop(0, 'rgba(0,0,0,0.55)'); topG.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = topG; g.fillRect(0, 0, W, H * 0.14);
      g.fillStyle = '#fff'; g.textAlign = 'left';
      g.font = `600 ${hh}px ${FONT}`;
      g.fillText('‹ 照片', grid.mx, H * 0.09);
      // 页码点
      if (images.length > 1) {
        const n = images.length, r = Math.min(W / (n * 3.4), 14);
        images.forEach((_, i) => {
          g.fillStyle = i === idx ? '#fff' : 'rgba(255,255,255,0.35)';
          g.beginPath(); g.arc(W / 2 + (i - (n - 1) / 2) * r * 2.6, H * 0.16, r * (i === idx ? 0.62 : 0.45), 0, 7); g.fill();
        });
      }
      // 左右翻页热区提示箭头（view 模式轮播同时由 interval 驱动）
      g.fillStyle = 'rgba(255,255,255,0.32)';
      g.font = `600 ${Math.round(hh * 1.6)}px ${FONT}`; g.textAlign = 'center';
      if (images.length > 1) { g.fillText('‹', W * 0.07, H / 2 + hh); g.fillText('›', W * 0.93, H / 2 + hh); }
    }
    // home 指示条
    const hw = phone ? 320 : 300, hy = phone ? H - 56 : H - 50;
    g.fillStyle = 'rgba(255,255,255,0.9)'; rr(g, W / 2 - hw / 2, hy, hw, 12, 6); g.fill();
    overlayFx();
    texture.needsUpdate = true;
    dirty = false;
    lastDraw = performance.now();
  }

  // 临时特效层：手电筒（暗屏）/ 彩虹流光（连点背板彩蛋）
  function overlayFx() {
    if (torch >= 0) {
      g.fillStyle = `rgba(255,244,214,${0.92 * (1 - torch / 600)})`;
      g.fillRect(0, 0, W, H);
    }
    if (rainbow >= 0) {
      const k = 1 - rainbow / 1800;
      const gr = g.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsla(${(i * 60 + rainbow * 0.22) % 360}, 100%, 62%, ${0.5 * k})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
  }

  // UV 点击：main.js 把 raycast 命中屏幕的 uv 换算成画布坐标后调这里。
  // 返回 true = 命中屏幕 UI（点击被“假手机”吃掉，不再触发部件选择）
  function hit(x, y) {
    const inC = (cx, cy, r) => Math.hypot(x - cx, y - cy) < r;
    if (ui === 'lock') {
      const { x: bx, y: by, r } = dockBtn();
      if (images.length && inC(W - bx, by, r)) { ui = 'grid'; dirty = true; render(); return true; }   // 右下 → 照片 App
      if (inC(bx, by, r)) { torch = 0; render(); return true; }                                        // 左下 → 手电筒闪
      return false;
    }
    if (ui === 'grid') {
      if (y < H * 0.14) { ui = 'lock'; dirty = true; render(); return true; }
      const r = Math.floor((y - grid.top) / (grid.cell + grid.gap)), c = Math.floor((x - grid.mx) / (grid.cell + grid.gap));
      if (r >= 0 && c >= 0 && c < grid.cols) {
        const i = r * grid.cols + c;
        const cx = grid.mx + c * (grid.cell + grid.gap), cy = grid.top + r * (grid.cell + grid.gap);
        if (x > cx && x < cx + grid.cell && y > cy && y < cy + grid.cell && images[i]) { ui = 'view'; show(i); return true; }
      }
      return true;   // 网格空白区域也吞掉点击
    }
    if (ui === 'view') {
      if (y < H * 0.14 || (y > H * 0.86 && Math.abs(x - W / 2) < W * 0.3)) { ui = 'grid'; dirty = true; render(); return true; }
      if (images.length > 1 && x > W * 0.72) { next(); return true; }
      if (images.length > 1 && x < W * 0.28) { show((idx - 1 + images.length) % images.length); return true; }
      ui = 'grid'; dirty = true; render(); return true;
    }
    return false;
  }

  const ease01 = (t) => t * t * (3 - 2 * t);

  function tick(dt) {
    const dms = dt * 1000;
    if (torch >= 0) { torch += dms; if (torch >= 600) torch = -1; dirty = true; }
    if (rainbow >= 0) { rainbow += dms; if (rainbow >= 1800) rainbow = -1; dirty = true; }
    if (torch >= 0 || rainbow >= 0) { if (performance.now() - lastDraw > 33) render(); return; }
    // 交叉淡入期间以 ~30fps 重绘，其余仅在分钟跳变 / 脏标记时重绘
    if (fadeT >= 0) {
      fadeT += dt;
      if (performance.now() - lastDraw > 33) render();
      if (fadeT >= FADE) { fadeT = -1; prev = -1; dirty = true; }
      return;
    }
    // 照片墙轮播：view 模式下按 interval 自动翻页（lock 模式为壁纸轮播，行为一致）
    if (images.length > 1 && (ui === 'lock' || ui === 'view')) {
      carousel += dt;
      if (carousel >= interval) { carousel = 0; next(); }
    }
    if (dirty || new Date().getMinutes() !== lastMin) render();
  }

  function next() {
    if (images.length < 2) return;
    prev = idx;
    idx = (idx + 1) % images.length;
    fadeT = 0;
  }

  function setImages(list) {
    images = list;
    idx = 0; prev = -1; fadeT = -1; carousel = 0;
    if (ui !== 'lock' && !images.length) ui = 'lock';
    dirty = true;
    render();
  }

  // 跳转到指定图片（缩略图点击）
  function show(i) {
    if (!images[i] || i === idx) return;
    if (images.length > 1 && fadeT < 0) { prev = idx; idx = i; fadeT = 0; }
    else { idx = i; dirty = true; render(); }
  }

  return {
    texture, tick, next, show, setImages, hit,
    flashRainbow: () => { rainbow = 0; render(); },
    setIntervalSec: (s) => { interval = Math.max(3, s); },
    setZoom: (z) => { zoom = Math.min(2.2, Math.max(1, z)); dirty = true; render(); },
    setLayers: (l) => { Object.assign(layers, l); dirty = true; render(); },
    get count() { return images.length; },
    get idx() { return idx; },
    get ui() { return ui; },
  };
}
