// 音效引擎：全部 WebAudio 实时合成，零音频资源、零网络请求
// 设计原则：短促、克制、像 Apple 硬件该有的声音——不做持续 BGM
let ctx = null, master = null, noiseBuf = null;
let muted = localStorage.getItem('iphoneDuo.sfx') !== '0';

export const sfxMuted = () => muted;
export function toggleSfx() {
  muted = !muted;
  localStorage.setItem('iphoneDuo.sfx', muted ? '0' : '1');
  if (!muted) sfx('ui');
  return muted;
}

// AudioContext 必须在用户手势内创建/resume 才能出声；静音时直接跳过省电
function ac() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5 | 0, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// 起音-衰减包络（打击乐感的关键：快起慢衰）
function env(c, t0, a, d, peak = 1) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  return g;
}

// 单音：可滑频（f0 → f1）
function tone(c, t0, f0, f1, dur, type = 'sine', vol = 0.5) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(f0, 1), t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  const g = env(c, t0, 0.005, dur, vol);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

// 带通噪声：快门 / 摩擦 / 风声
function hiss(c, t0, dur, freq, q, vol) {
  const s = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = env(c, t0, 0.004, dur, vol);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + dur + 0.05);
}

export function sfx(name) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case 'tick':    tone(c, t, 1700, 2300, 0.05, 'sine', 0.16); break;             // 部件选中
    case 'ui':      tone(c, t, 900, 1300, 0.05, 'triangle', 0.18); break;          // 界面按钮
    case 'snap':    hiss(c, t, 0.05, 2600, 2, 0.5); tone(c, t + 0.015, 300, 140, 0.06, 'square', 0.12); break;  // 装配归位
    case 'hinge':   hiss(c, t, 0.3, 700, 1.2, 0.12); tone(c, t + 0.24, 150, 70, 0.1, 'sine', 0.5); break;        // 铰链到位闷响
    case 'thud':    tone(c, t, 130, 55, 0.12, 'sine', 0.6); hiss(c, t, 0.05, 300, 1, 0.25); break;               // 落地
    case 'shutter': hiss(c, t, 0.03, 3800, 3, 0.6); hiss(c, t + 0.07, 0.04, 2800, 3, 0.5); break;                // 快门
    case 'pop':     tone(c, t, 900, 300, 0.12, 'sine', 0.5); tone(c, t + 0.02, 1400, 500, 0.1, 'sine', 0.3); break; // 彩蛋/弹飞
    case 'boot':    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + i * 0.09, f, f, 0.5, 'sine', 0.22)); break;  // 开机琶音
    case 'whoosh':  hiss(c, t, 0.28, 900, 0.8, 0.25); break;                       // 切换/抛掷
    case 'right':   tone(c, t, 880, 880, 0.09, 'sine', 0.3); tone(c, t + 0.09, 1318.5, 1318.5, 0.16, 'sine', 0.3); break;      // 答对
    case 'wrong':   tone(c, t, 220, 175, 0.18, 'sawtooth', 0.16); break;           // 答错
    case 'win':     [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.07, f, f, 0.35, 'triangle', 0.24)); break; // 胜利
  }
}

// 移动端振动：与音效同静音开关（Web Audio 出不了声的场合也能有反馈）
export function buzz(pattern) {
  if (muted) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* 无振动马达 */ }
}
