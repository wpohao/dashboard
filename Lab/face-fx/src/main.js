import { Vision } from './vision.js';
import { Gpu } from './gpu.js';
import { Overlay } from './overlays.js';
import { GestureFSM } from './gestures.js';
import { Demo } from './demo.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const gpuCanvas = $('#gpuCanvas'), ovCanvas = $('#overlay'), stage = $('#stage');

const overlay = new Overlay(ovCanvas);
const fsm = new GestureFSM();
const gpu = new Gpu();
let useGpu = false, ctx2d = null;
let vision = null, video = null, demo = null;
let W = 1280, H = 720;

const state = { mode: 'none', bg: false, magic: false, skeleton: false };
const blend = { cat: 0, dog: 0, toon: 0, mask: 0, bg: 0 };
const MODES = {
  cat: { name: '🐱 貓咪模式', hue: 0.07 },
  dog: { name: '🐶 小狗模式', hue: 0.1 },
  toon: { name: '🎨 卡通大眼', hue: 0.88 },
  mask: { name: '🎭 假面舞會', hue: 0.13 },
  none: { name: '✨ 恢復原狀', hue: 0.58 },
};

let burst = null;
let lastDet = { face: null, blend: {}, hands: [] };
let lastVideoTime = -1, lastMaskVersion = -1;
let faceCenter = null;
let mouse = null, prevTip = null;
let snapRequested = false;

// ---------- UI ----------
function setStatus(s) { $('#status').textContent = s; }
let toastTimer;
function toast(s) {
  const el = $('#toast');
  el.textContent = s;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}
function syncLegend() {
  document.querySelectorAll('#legend [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode && state.mode !== 'none'));
  document.querySelectorAll('#legend [data-toggle]').forEach((b) => b.classList.toggle('on', !!state[b.dataset.toggle]));
  $('#btnSkeleton').classList.toggle('on', state.skeleton);
}
function fireBurst(hue) {
  burst = { pos: faceCenter ?? [W / H / 2, 0.45], hue };
}
function setMode(m) {
  state.mode = m;
  if (m === 'none') { state.bg = false; state.magic = false; }
  toast(MODES[m].name);
  fireBurst(MODES[m].hue);
  syncLegend();
}
function toggle(name) {
  state[name] = !state[name];
  if (name === 'bg') { toast(state.bg ? '🌌 星空去背 開' : '🌌 星空去背 關'); fireBurst(0.5); }
  if (name === 'magic') toast(state.magic ? '🪄 指尖魔法 開（移動滑鼠或比 ☝️）' : '🪄 指尖魔法 關');
  syncLegend();
}

document.querySelectorAll('#legend button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.mode) setMode(b.dataset.mode); else toggle(b.dataset.toggle);
}));
$('#btnSkeleton').addEventListener('click', () => { state.skeleton = !state.skeleton; syncLegend(); });
$('#btnSnap').addEventListener('click', () => { snapRequested = true; });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const map = { 1: 'cat', 2: 'dog', 3: 'toon', 4: 'mask', 0: 'none' };
  if (map[k]) setMode(map[k]);
  else if (k === 'b') toggle('bg');
  else if (k === 'p') toggle('magic');
  else if (k === 'h') { state.skeleton = !state.skeleton; syncLegend(); }
  else if (k === 's') snapRequested = true;
});
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  mouse = [(e.clientX - r.left) / r.width * (W / H), (e.clientY - r.top) / r.height];
});
stage.addEventListener('pointerleave', () => { mouse = null; });

$('#btnStart').addEventListener('click', () => boot('camera'));
$('#btnDemo').addEventListener('click', () => boot('demo'));

// ---------- 啟動 ----------
async function boot(kind) {
  $('#startCard').classList.add('hidden');
  try {
    if (kind === 'camera') {
      setStatus('開啟相機…');
      video = document.createElement('video');
      video.playsInline = true; video.muted = true;
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
      });
      await video.play();
      W = video.videoWidth; H = video.videoHeight;
    } else {
      demo = new Demo(W, H);
    }
    await setupRender();
    applyUrlParams();
    requestAnimationFrame(loop);
    if (kind === 'camera') {
      vision = new Vision();
      await vision.init(setStatus);
      setStatus(useGpu ? '運作中 · WebGPU' : '運作中 · 2D 模式（這台瀏覽器不支援 WebGPU）');
      toast('比個 ✌️ 試試看');
    } else {
      setStatus(useGpu ? '示範模式 · WebGPU' : '示範模式 · 2D 模式');
    }
  } catch (e) {
    console.error(e);
    setStatus('啟動失敗：' + (e.message || e));
    const card = $('#startCard');
    card.classList.remove('hidden');
    card.querySelector('.hint').textContent = '啟動失敗：' + (e.message || e) + '（相機需要允許權限，且要用 http://localhost 開啟）';
  }
}

async function setupRender() {
  stage.style.aspectRatio = `${W} / ${H}`;
  overlay.resize(W, H);
  useGpu = await gpu.init(gpuCanvas).catch((e) => { console.warn('WebGPU 初始化失敗', e); return false; });
  if (useGpu) gpu.resize(W, H);
  else { gpuCanvas.width = W; gpuCanvas.height = H; ctx2d = gpuCanvas.getContext('2d'); }
}

function applyUrlParams() {
  const m = params.get('mode');
  if (demo && (m || params.has('bg') || params.has('magic'))) demo.scripted = false;
  if (m && MODES[m]) { state.mode = m; for (const k of ['cat', 'dog', 'toon', 'mask']) blend[k] = k === m ? 1 : 0; }
  if (params.get('bg') === '1') { state.bg = true; blend.bg = 1; }
  if (params.get('magic') === '1') { state.magic = true; if (demo) demo.forceMagic = true; }
  if (params.get('skeleton') === '1') state.skeleton = true;
  syncLegend();
}

// ---------- 主迴圈 ----------
let lastT = performance.now(), fpsN = 0, fpsT = 0;
function loop(nowMs) {
  const t = nowMs / 1000;
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastT) / 1000));
  lastT = nowMs;

  let det = lastDet, source = null, mask = null, maskInv = false;
  if (demo) {
    det = demo.update(t);
    source = demo.canvas; mask = det.mask;
  } else {
    if (video.readyState >= 2) source = video;
    if (vision?.seg && source && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      det = lastDet = vision.detect(video, state.bg || blend.bg > 0.01);
    }
    mask = vision?.mask; maskInv = vision?.maskInvert ?? false;
  }

  // 手勢 → 動作
  const g = fsm.update(det.hands, nowMs);
  if (g.action) { if (g.action.mode) setMode(g.action.mode); else if (g.action.toggle) toggle(g.action.toggle); }

  // 模式淡入淡出
  const k = 1 - Math.exp(-dt * 7);
  for (const m of ['cat', 'dog', 'toon', 'mask']) blend[m] += ((state.mode === m ? 1 : 0) - blend[m]) * k;
  blend.bg += ((state.bg ? 1 : 0) - blend.bg) * k;

  // 2D 造型
  overlay.clear();
  let ff = null;
  if (det.face) {
    ff = overlay.drawFace(det.face, det.blend, blend, t, dt);
    faceCenter = [ff.c.x / H, ff.c.y / H];
  }
  overlay.drawHands(det.hands, state.skeleton, g.ring);
  if (state.magic && mouse && !det.hands.length) {
    const ctx = overlay.ctx, x = mouse[0] * H, y = mouse[1] * H;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, 26);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(122,215,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
  }

  // 大眼 shader 參數（畫面 uv）
  const bg = { time: t, toon: blend.toon, cat: blend.cat, dog: blend.dog, masq: blend.mask, bg: blend.bg, maskInv, eyeL: [0, 0], eyeR: [0, 0], eyeRad: 0 };
  if (det.face) {
    const lm = det.face;
    const eye = (a, b) => [1 - (lm[a].x + lm[b].x) / 2, (lm[a].y + lm[b].y) / 2];
    bg.eyeR = eye(33, 133); bg.eyeL = eye(263, 362);
    const ew = Math.hypot((lm[33].x - lm[133].x) * W, (lm[33].y - lm[133].y) * H);
    bg.eyeRad = (ew / H) * 1.4;
  }

  // 粒子發射器
  const aspect = W / H;
  const sim = { dt, time: t, countA: 0, posA: [0, 0], velA: [0, 0], hueA: (t * 0.12) % 1, spreadA: 0.12, countB: 0, posB: [0, 0], hueB: 0, speedB: 0, ringB: 0 };
  const ph = g.pointer ?? (state.magic ? det.hands[0] : null);
  let tip = null;
  if (ph) tip = [(1 - ph.landmarks[8].x) * aspect, ph.landmarks[8].y];
  else if (state.magic && mouse) tip = mouse;
  if (tip) {
    const v = prevTip ? [(tip[0] - prevTip[0]) / dt, (tip[1] - prevTip[1]) / dt] : [0, 0];
    sim.countA = Math.min(450, 40 + Math.hypot(v[0], v[1]) * 500);
    sim.posA = tip; sim.velA = v;
  }
  prevTip = tip;
  if (burst) {
    Object.assign(sim, { countB: 7000, posB: burst.pos, hueB: burst.hue, speedB: 0.75, ringB: 0.03 });
    burst = null;
  } else if (ff && blend.toon > 0.5) {
    Object.assign(sim, { countB: 4, posB: faceCenter, hueB: 0.85, speedB: 0.12, ringB: ff.s / H * 0.75 });
  } else if (ff && blend.mask > 0.5) {
    Object.assign(sim, { countB: 3, posB: faceCenter, hueB: 0.12, speedB: 0.08, ringB: ff.s / H * 0.6 });
  }

  // 繪製
  if (useGpu) {
    if (source) gpu.updateCam(source);
    if (mask && mask.version !== lastMaskVersion) { gpu.updateMask(mask); lastMaskVersion = mask.version; }
    gpu.frame(bg, sim);
  } else if (source) {
    ctx2d.save(); ctx2d.setTransform(-1, 0, 0, 1, W, 0); ctx2d.drawImage(source, 0, 0, W, H); ctx2d.restore();
  }
  if (snapRequested) { snapRequested = false; snapshot(); }

  fpsN++;
  if (t - fpsT > 0.5) { $('#fps').textContent = `${Math.round(fpsN / (t - fpsT))} fps`; fpsN = 0; fpsT = t; }
  requestAnimationFrame(loop);
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(gpuCanvas, 0, 0);
  x.drawImage(ovCanvas, 0, 0);
  x.font = 'bold 28px "Segoe UI", sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.textAlign = 'right';
  x.fillText('FaceFX ✨', W - 20, H - 20);
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `facefx-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  stage.animate([{ filter: 'brightness(2.5)' }, { filter: 'brightness(1)' }], { duration: 350 });
  toast('📸 已存檔');
}

if (params.has('demo')) boot('demo');
