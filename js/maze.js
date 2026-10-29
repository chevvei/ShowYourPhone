// ---------------- MagSafe 磁力迷阵 ----------------
// 进入方式：双击 MagSafe 磁环部件 / 信息卡按钮（main.js 通用 enterGameWorld 调 openMaze）。
// 世界观：白磁环阵列迷宫——整块迷宫随按键倾斜（磁力吸偏），镀铬滚珠沿斜坡滚动；
//         躲开消磁黑洞、3 关递进（引入黑洞 + 更窄道），滚进绿色感应环=过关。
// 工程套路：独立 Scene/相机；数据驱动关卡（11×11 字符画）；物理=倾斜角投影重力 +
//         圆 vs AABB 反弹；迷宫 group 旋转做视觉倾斜，重力方向同步。
// 跨模块边界：自备 z$ 查询器；徽章走 CustomEvent('game-award')。
import * as THREE from 'three';
import { sfx, buzz } from './sfx.js';
const z$ = (s) => document.querySelector(s);
export const maze = {
  on: false, run: false, over: false,
  lv: 1, score: 0, time: 45, best: +(localStorage.getItem('iphoneDuo.mazeBest') || 0),
};

// —— 关卡：# 墙 · . 通路 · S 起点 · G 终点 · O 黑洞 ——
const LVS = [
  [ // 第 1 关：纯迷宫（教学）
    '###########',
    '#S...#....#',
    '#.##.#.##.#',
    '#.#..#..#.#',
    '#.#.###.#.#',
    '#...#...#.#',
    '###.#.#.#.#',
    '#...#.#...#',
    '#.###.###.#',
    '#.....#..G#',
    '###########',
  ],
  [ // 第 2 关：加入黑洞
    '###########',
    '#S..#....O#',
    '#.#.#.###.#',
    '#.#...#...#',
    '#.#####.#.#',
    '#.#...#.#.#',
    '#.#.#O..#.#',
    '#.#.#####.#',
    '#...#...#.#',
    '###.#.#..G#',
    '###########',
  ],
  [ // 第 3 关：窄道 + 双黑洞
    '###########',
    '#S#...#...#',
    '#.#.#.#.#.#',
    '#.#...#.#.#',
    '#.#####.#O#',
    '#.....#...#',
    '#####.###.#',
    '#O....#...#',
    '#.###.#.#.#',
    '#...#...#G#',
    '###########',
  ],
];
const CELL = 2, BALL_R = 0.82;

export let zScene = null, zCam = null, zMaze = null, zBall = null, zGoal = null;
let zWalls = [], zHoles = [], zLv = 0, zGoalPos = { x: 0, z: 0 }, zStartPos = { x: 0, z: 0 };
let zbx = 0, zbz = 0, zvx = 0, zvz = 0;
let zTiltX = 0, zTiltZ = 0, zAnimT = 0;                // 倾斜角（弧度，视觉+物理共用）

function buildMaze() {
  if (zScene) return;
  zScene = new THREE.Scene();
  zScene.background = new THREE.Color(0x0a0d14);
  zCam = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 300);
  zCam.position.set(0, 40, 30); zCam.lookAt(0, 0, 0);

  zScene.add(new THREE.AmbientLight(0x8899aa, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(25, 60, 25); zScene.add(sun);

  zMaze = new THREE.Group();
  zScene.add(zMaze);

  // 镀铬球（MagSafe 磁吸小珠）
  zBall = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1.0, roughness: 0.12 }));
  zBall.add(new THREE.PointLight(0xbfd8ff, 18, 14, 2));
  zScene.add(zBall);

  // 终点感应环（放在 zMaze 里随迷宫倾斜）
  zGoal = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0x64ff9a, emissive: 0x1fdf5f, emissiveIntensity: 2.4 }));
  zGoal.rotation.x = Math.PI / 2; zGoal.position.y = 0.2;
  zMaze.add(zGoal);
}

function loadLv(i) {
  zLv = i;
  // 清旧墙
  for (const w of zWalls) zMaze.remove(w);
  for (const h of zHoles) zMaze.remove(h);
  zWalls = []; zHoles = [];
  const map = LVS[i];
  const N = map.length;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: 0.3, roughness: 0.4, emissive: 0x1a2430, emissiveIntensity: 0.4 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x141a26, metalness: 0.6, roughness: 0.5 });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x120024, emissiveIntensity: 1 });
  // 底板
  const floor = new THREE.Mesh(new THREE.BoxGeometry(N * CELL, 0.6, N * CELL), floorMat);
  floor.position.y = -0.4; zMaze.add(floor); zWalls.push(floor);
  // 遍历格子
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = map[r][c];
    const x = (c - (N - 1) / 2) * CELL, z = (r - (N - 1) / 2) * CELL;
    if (ch === '#') {
      const w = new THREE.Mesh(new THREE.BoxGeometry(CELL, 1.8, CELL), wallMat);
      w.position.set(x, 0.6, z);
      zMaze.add(w); zWalls.push(w);
    } else if (ch === 'O') {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.72, 24), holeMat);
      h.position.set(x, -0.02, z);
      zMaze.add(h); zHoles.push(h);
    } else if (ch === 'S') zStartPos = { x, z };
    else if (ch === 'G') { zGoalPos = { x, z }; zGoal.position.set(x, 0.2, z); }
  }
  resetBall();
}
function resetBall() {
  zbx = zStartPos.x; zbz = zStartPos.z; zvx = 0; zvz = 0;
}

// —— 输入：方向键/ADWS 控制倾斜（带阻尼）——
const zKeys = { l: false, r: false, u: false, d: false };
let zTouch = { x: 0, y: 0 };
addEventListener('keydown', (e) => {
  if (!maze.on) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') zKeys.l = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') zKeys.r = true;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') zKeys.u = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') zKeys.d = true;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') zKeys.l = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') zKeys.r = false;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') zKeys.u = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') zKeys.d = false;
});
addEventListener('pointerdown', (e) => {
  if (!maze.on || e.pointerType !== 'touch' || e.target.closest('#zOver,#zQuit')) return;
  zTouch.x = (e.clientX / innerWidth - 0.5) * 2;
  zTouch.y = (e.clientY / innerHeight - 0.5) * 2;
});
addEventListener('pointermove', (e) => {
  if (!maze.on || !e.buttons || e.target.closest('#zOver,#zQuit')) return;
  zTouch.x = (e.clientX / innerWidth - 0.5) * 2;
  zTouch.y = (e.clientY / innerHeight - 0.5) * 2;
});
addEventListener('pointerup', () => { zTouch.x = 0; zTouch.y = 0; });

// —— 一局生命周期 ——
const zSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openMaze() {
  buildMaze();
  maze.on = true;
  startMazeRun();
  dispatchEvent(new CustomEvent('game-award', { detail: 'magnet' }));
}
export function startMazeRun() {
  Object.assign(maze, { run: false, over: false, lv: 1, score: 0, time: 45 });
  loadLv(0);
  z$('#zgame').classList.add('on');
  z$('#zOver').classList.remove('on');
  zMsg('磁力迷阵<small>方向键倾斜迷宫 · 引导磁珠入绿环</small>', 3);
  (async () => { await zSleep(2200); if (maze.on && !maze.over) maze.run = true; })();
}
function nextLv() {
  maze.score += Math.round(maze.time) * 10;
  if (zLv >= LVS.length - 1) { endMazeRun(true); return; }
  zLv++; maze.lv = zLv + 1; maze.time = 45;
  loadLv(zLv);
  zMsg(`第 ${maze.lv} 关 · 小心黑洞`, 1.6);
  sfx('pop');
}
function dropHole() {
  sfx('thud'); buzz(24);
  maze.time = Math.max(maze.time - 5, 5);              // 掉洞罚 5 秒
  zAnimT = 0.4;
  resetBall();
  zMsg('磁珠消磁坠落 · 罚 5s', 1.2);
}
function endMazeRun(win) {
  maze.run = false; maze.over = true;
  const best = maze.score > maze.best;
  if (best) { maze.best = maze.score; localStorage.setItem('iphoneDuo.mazeBest', String(maze.best)); }
  z$('#zOverTitle').textContent = win ? '✦ 三关全通' : '磁力迷阵';
  z$('#zStats').innerHTML =
    `本局分数 <b>${maze.score}</b>${best ? ' · 新纪录 ✦' : ''}<br>` +
    `到达 <b>第 ${maze.lv} 关</b> · 历史最佳 <b>${maze.best}</b>`;
  z$('#zgame').classList.add('over');
  z$('#zOver').classList.add('on');
  sfx(win ? 'win' : 'thud');
  if (win) dispatchEvent(new CustomEvent('game-award', { detail: 'roll' }));
}
// 测试探针：把磁珠传送到终点旁（触发真实过关判定）；直接结算
window.__mazeGoal = () => { zbx = zGoalPos.x; zbz = zGoalPos.z; };
window.__mazeEnd = (win) => endMazeRun(!!win);
export function closeMazeUI() {
  maze.on = false; maze.run = false; maze.over = false;
  z$('#zgame').classList.remove('on', 'over');
  z$('#zOver').classList.remove('on');
  z$('#zMsg').classList.remove('on');
}

// —— HUD ——
let zHudT = 0;
function zMsg(html, dur = 1.6) {
  z$('#zMsg').innerHTML = html;
  z$('#zMsg').classList.add('on');
  clearTimeout(maze.msgT);
  maze.msgT = setTimeout(() => z$('#zMsg').classList.remove('on'), dur * 1000);
}
function zUpdHUD() {
  z$('#zLv').textContent = maze.lv + '/' + LVS.length;
  z$('#zTime').textContent = Math.ceil(maze.time);
  z$('#zScore').textContent = maze.score;
}

// —— 物理：圆 vs AABB（最近点法）——
function collideWalls() {
  const map = LVS[zLv], N = map.length;
  const rC = (zbz / CELL + (N - 1) / 2), cC = (zbx / CELL + (N - 1) / 2);
  for (let r = Math.floor(rC) - 1; r <= Math.floor(rC) + 1; r++)
    for (let c = Math.floor(cC) - 1; c <= Math.floor(cC) + 1; c++) {
      if (r < 0 || c < 0 || r >= N || c >= N || map[r][c] !== '#') continue;
      const wx = (c - (N - 1) / 2) * CELL, wz = (r - (N - 1) / 2) * CELL;
      const nx = THREE.MathUtils.clamp(zbx, wx - CELL / 2, wx + CELL / 2);
      const nz = THREE.MathUtils.clamp(zbz, wz - CELL / 2, wz + CELL / 2);
      const dx = zbx - nx, dz = zbz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < BALL_R * BALL_R && d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (BALL_R - d) / d;
        zbx += dx * push; zbz += dz * push;
        const vn = (zvx * dx + zvz * dz) / d;
        if (vn < 0) {                                   // 反弹（法向速度衰减）
          zvx -= 1.45 * vn * dx / d; zvz -= 1.45 * vn * dz / d;
          if (Math.abs(vn) > 6) { sfx('tick'); buzz(5); }
        }
      }
    }
}

// —— 每帧 ——
const GRAV = 26, MAX_TILT = 0.4;
export function tickMaze(dt) {
  if (!maze.on) return;
  zCam.aspect = innerWidth / innerHeight; zCam.updateProjectionMatrix();

  if (maze.run) {
    maze.time -= dt;
    if (maze.time <= 0) { maze.time = 45; dropHole(); zMsg('超时 · 回到起点', 1.2); }
    // 倾斜：按键/触屏 → 目标角，阻尼趋近
    const tx = ((zKeys.u ? -1 : 0) + (zKeys.d ? 1 : 0) + zTouch.y) * MAX_TILT;
    const tz = ((zKeys.l ? -1 : 0) + (zKeys.r ? 1 : 0) + zTouch.x) * MAX_TILT;
    zTiltX += (tx - zTiltX) * Math.min(dt * 7, 1);
    zTiltZ += (tz - zTiltZ) * Math.min(dt * 7, 1);
    // 重力投影（屏幕 ↑ = 迷宫向远处倒 = 球向 -z 滚）
    zvx += GRAV * Math.sin(zTiltZ) * dt;
    zvz += GRAV * Math.sin(zTiltX) * dt;
    zvx *= Math.pow(0.14, dt); zvz *= Math.pow(0.14, dt);   // 滚动摩擦
    zbx += zvx * dt; zbz += zvz * dt;
    collideWalls();
    // 黑洞：球心进入即坠
    for (const h of zHoles) {
      const dx = zbx - h.position.x, dz = zbz - h.position.z;
      if (dx * dx + dz * dz < 1.05 * 1.05) { dropHole(); break; }
    }
    // 终点
    if (!maze.over) {
      const dx = zbx - zGoalPos.x, dz = zbz - zGoalPos.z;
      if (dx * dx + dz * dz < 1.1 * 1.1) nextLv();
    }
  }

  // —— 摆放：迷宫 group 倾斜（视觉），球贴板面 ——
  zMaze.rotation.x = zTiltX * 0.9;
  zMaze.rotation.z = -zTiltZ * 0.9;
  if (zAnimT > 0) { zAnimT -= dt; zBall.position.set(zbx, -4, zbz); }   // 坠洞下坠动画
  else zBall.position.set(zbx, BALL_R, zbz);
  zBall.rotation.x += zvz * dt / BALL_R;
  zBall.rotation.z -= zvx * dt / BALL_R;
  zGoal.rotation.z += dt * 1.6;
  // 终点光呼吸
  zGoal.material.emissiveIntensity = 2.0 + Math.sin(performance.now() / 240) * 0.8;
  // 相机微环绕（静态为主，保证俯视可控）
  zCam.position.set(Math.sin(performance.now() / 9000) * 2, 40, 30);
  zCam.lookAt(0, 0, 0);

  zHudT += dt;
  if (zHudT > 0.12) { zHudT = 0; zUpdHUD(); }
}
