// 彩蛋系统：注册表 + 定制文字持久化
// 隐藏细节 = 拆机放大后可发现（selectPart 时自动判定）；文字可在「彩蛋工坊」定制
import { edgeSketch } from './textures.js';

export const EGG_KEY = 'iphoneDuo.eggs';

// devices: 'all' | 'p18'（18 系列）；每台设备寻宝清单动态过滤
export const EGG_DEFS = [
  { id: 'chip', name: '芯片微雕', icon: '◈', hint: '拆出主板，凑近看主芯片裸片的角落——那里刻着一行小字', field: 'chipText', label: '芯片刻字', ph: 'Designed with ♥ by you', max: 26, devices: 'all' },
  { id: 'morse', name: '电池电码', icon: '≋', hint: '翻到电池正面，那行 Morse 电码解码后是什么？', field: 'morseText', label: '电码短语', ph: 'THINK DIFFERENT', max: 18, devices: 'all' },
  { id: 'vc', name: '均热板签名', icon: '✎', hint: '拆开散热层，铜板 / 石墨膜上有一行激光签名', field: 'vcText', label: '激光签名', ph: 'Calibrated by Cupertino', max: 24, devices: 'all' },
  { id: 'edge', name: '底边刻字', icon: '⌄', hint: '把机身翻到正下方，读读那圈「法规刻字」', field: 'edgeText', label: '底边微雕', ph: 'Designed in California', max: 30, devices: 'p18' },
  { id: 'usb', name: '接口批号', icon: '··', hint: '连 USB-C 口的最深处，都刻着批号', field: null, devices: 'all' },
];

export function eggsForDev(dev) { return EGG_DEFS.filter((e) => e.devices === 'all' || (e.devices === 'p18' && dev !== 'duo')); }

export function loadEggs() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(EGG_KEY)); } catch { s = null; }
  return s && typeof s === 'object' ? s : { text: {}, found: {}, lab: false, fx: false };
}

export function saveEggs(eggs) {
  try { localStorage.setItem(EGG_KEY, JSON.stringify(eggs)); } catch { /* 私隐模式：放弃持久化 */ }
}

// chipImg dataURL → 轮廓蚀刻画布（build 前解码一次）
export async function decodeEggImage(eggs) {
  if (!eggs.chipImgData || eggs.chipImg) return eggs;
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = eggs.chipImgData;
    });
    eggs.chipImg = edgeSketch(img, 256);
  } catch { eggs.chipImg = null; }
  return eggs;
}

// 传给 build* 的彩蛋配置（只带有效字段，model.js 按需取用）
export function eggOpts(eggs) {
  return {
    chipText: (eggs.text && eggs.text.chipText) || 'Designed with ♥ by you',
    morseText: (eggs.text && eggs.text.morseText) || 'THINK DIFFERENT',
    vcText: (eggs.text && eggs.text.vcText) || 'VAPOR CHAMBER · CALIBRATED',
    edgeText: (eggs.text && eggs.text.edgeText) || 'Designed by Apple in California',
    chipImg: eggs.chipImg || null,
  };
}
