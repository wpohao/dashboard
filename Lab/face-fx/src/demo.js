// 示範模式：畫一個假人、產生假的臉部 landmark／手勢／去背遮罩，不用相機也能看所有效果

// 臉部局部座標（單位 = 臉寬，y 向下，x 向畫面右）
const FACE = {
  10: [0, -0.62], 152: [0, 0.66], 234: [0.5, 0], 454: [-0.5, 0], 1: [0, 0.12], 0: [0, 0.29],
  13: [0, 0.33], 14: [0, 0.34], 17: [0, 0.42], 61: [0.17, 0.34], 291: [-0.17, 0.34],
  33: [0.36, -0.1], 133: [0.12, -0.1], 263: [-0.36, -0.1], 362: [-0.12, -0.1],
  468: [0.24, -0.1], 473: [-0.24, -0.1], 205: [0.25, 0.2], 425: [-0.25, 0.2],
};

// 腳本：[開始秒數, 比的手勢]；手勢比 0.6 秒，讓真正的 GestureFSM 去觸發
const SCRIPT = [
  [1.5, 'Victory'], [6.5, 'Thumb_Up'], [11.5, 'Open_Palm'], [16.5, 'Closed_Fist'],
  [21.0, 'ILoveYou'], [25.0, 'Victory'], [28.5, 'Pointing_Up'], [33.5, 'Thumb_Down'],
];
const LOOP = 36;

export class Demo {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.scripted = true;
    this.forceMagic = false;
    this.mask = { data: new Uint8Array(256 * 144), w: 256, h: 144, version: 0 };
  }

  update(t) {
    const { W, H } = this;
    const pose = {
      cx: W * (0.47 + 0.04 * Math.sin(t * 0.6)),
      cy: H * (0.46 + 0.02 * Math.sin(t * 0.9)),
      fw: H * 0.3,
      roll: 0.16 * Math.sin(t * 0.7),
    };
    const jaw = Math.pow(Math.max(0, Math.sin(t * 1.1)), 4) * 0.85;
    const smile = 0.5 + 0.5 * Math.sin(t * 0.45);
    const toScreen = (lx, ly) => {
      const c = Math.cos(pose.roll), s = Math.sin(pose.roll);
      return [pose.cx + (lx * c - ly * s) * pose.fw, pose.cy + (lx * s + ly * c) * pose.fw];
    };

    // landmarks（鏡像回相機座標）
    const face = Array.from({ length: 478 }, () => ({ x: 1 - pose.cx / W, y: pose.cy / H, z: 0 }));
    for (const [i, [lx, ly0]] of Object.entries(FACE)) {
      let ly = ly0;
      if (i === '14' || i === '17') ly += jaw * 0.14;
      const [sx, sy] = toScreen(lx, ly);
      face[i] = { x: 1 - sx / W, y: sy / H, z: 0 };
    }

    this.paint(t, pose, jaw, toScreen);
    this.makeMask(pose);

    // 手勢
    let hands = [];
    const phase = t % LOOP;
    if (this.scripted) {
      for (const [start, g] of SCRIPT) {
        const dur = g === 'Pointing_Up' ? 4.5 : 0.6;
        if (phase >= start && phase < start + dur) hands = [this.hand(g, t)];
      }
    } else if (this.forceMagic) {
      hands = [this.hand('Pointing_Up', t)];
    }
    return { image: this.canvas, face, blend: { jawOpen: jaw, mouthSmileLeft: smile, mouthSmileRight: smile }, hands, mask: this.mask };
  }

  paint(t, pose, jaw, toScreen) {
    const { ctx, W, H } = this;
    ctx.save();
    // 畫在畫面座標，再左右翻成相機影像（shader 會再翻回來）
    ctx.setTransform(-1, 0, 0, 1, W, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#5a6f96'); bg.addColorStop(1, '#273352');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 窗戶
    ctx.fillStyle = '#cfe6ff'; ctx.fillRect(W * 0.06, H * 0.1, W * 0.2, H * 0.42);
    ctx.fillStyle = '#9cc4ef'; ctx.fillRect(W * 0.06, H * 0.31, W * 0.2, H * 0.01); ctx.fillRect(W * 0.16, H * 0.1, W * 0.008, H * 0.42);
    // 書架與植物
    ctx.fillStyle = '#3d2f2a'; ctx.fillRect(W * 0.76, H * 0.18, W * 0.2, H * 0.02); ctx.fillRect(W * 0.76, H * 0.38, W * 0.2, H * 0.02);
    ['#e76f51', '#f4a261', '#2a9d8f', '#e9c46a', '#8ab17d'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(W * (0.77 + i * 0.035), H * (0.08 + (i % 2) * 0.02), W * 0.028, H * (0.1 - (i % 2) * 0.02)); });
    ctx.fillStyle = '#4caf50';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(W * 0.86 + Math.cos(i) * 30, H * 0.3 + Math.sin(i * 2) * 12, 26, 12, i, 0, Math.PI * 2); ctx.fill(); }

    const { cx, cy, fw } = pose;
    // 身體
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath();
    ctx.moveTo(cx - 1.5 * fw, H);
    ctx.bezierCurveTo(cx - 1.45 * fw, cy + 1.05 * fw, cx - 0.6 * fw, cy + 0.95 * fw, cx, cy + 0.95 * fw);
    ctx.bezierCurveTo(cx + 0.6 * fw, cy + 0.95 * fw, cx + 1.45 * fw, cy + 1.05 * fw, cx + 1.5 * fw, H);
    ctx.fill();
    ctx.fillStyle = '#e0b090';
    ctx.fillRect(cx - 0.17 * fw, cy + 0.5 * fw, 0.34 * fw, 0.5 * fw);

    // 頭
    ctx.translate(cx, cy);
    ctx.rotate(pose.roll);
    ctx.scale(fw, fw);
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath(); ctx.ellipse(0, -0.12, 0.6, 0.66, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#efc3a0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.5, 0.02, 0.07, 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    const sk = ctx.createRadialGradient(-0.1, -0.1, 0.1, 0, 0, 0.8);
    sk.addColorStop(0, '#f8d6b8'); sk.addColorStop(1, '#d9a27c');
    ctx.fillStyle = sk;
    ctx.beginPath(); ctx.ellipse(0, 0.02, 0.5, 0.66, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath(); ctx.ellipse(0, -0.48, 0.52, 0.24, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.18, -0.44, 0.34, 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
    // 眼睛
    const blink = (t % 4) < 0.12 ? 0.15 : 1;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(s * 0.24, -0.1, 0.11, 0.05 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b2314';
      ctx.beginPath(); ctx.arc(s * 0.24, -0.1, 0.045 * Math.max(blink, 0.3), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(s * 0.13, -0.22); ctx.quadraticCurveTo(s * 0.24, -0.27, s * 0.36, -0.21); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,90,60,.7)'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(0.02, -0.02); ctx.quadraticCurveTo(0.06, 0.1, 0, 0.13); ctx.stroke();
    // 嘴
    ctx.fillStyle = '#8c2f39';
    ctx.beginPath(); ctx.ellipse(0, 0.34 + jaw * 0.07, 0.15, 0.022 + jaw * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  makeMask(pose) {
    const { W, H } = this;
    const m = this.mask, d = m.data;
    const c = Math.cos(-pose.roll), s = Math.sin(-pose.roll);
    for (let my = 0; my < m.h; my++) {
      for (let mx = 0; mx < m.w; mx++) {
        const sx = (1 - (mx + 0.5) / m.w) * W, sy = (my + 0.5) / m.h * H;
        const dx = (sx - pose.cx) / pose.fw, dy = (sy - pose.cy) / pose.fw;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        const head = (lx / 0.62) ** 2 + ((ly + 0.06) / 0.74) ** 2 < 1;
        const neck = Math.abs(dx) < 0.18 && dy > 0.4;
        const body = dy > 0.95 && Math.abs(dx) < 0.6 + (dy - 0.95) * 1.6;
        d[my * m.w + mx] = head || neck || body ? 255 : 0;
      }
    }
    m.version++;
  }

  // 粗略的 21 點手（相機座標）
  hand(gesture, t) {
    const { W, H } = this;
    let hx = W * 0.8, hy = H * 0.6;
    if (gesture === 'Pointing_Up') { hx = W * (0.74 + 0.13 * Math.sin(t * 1.4)); hy = H * (0.5 + 0.13 * Math.sin(t * 2.8)); }
    const u = H * 0.09;
    const flip = gesture === 'Thumb_Down' ? -1 : 1;
    const ext = {
      Victory: [0, 1, 1, 0, 0], Open_Palm: [1, 1, 1, 1, 1], Closed_Fist: [0, 0, 0, 0, 0], ILoveYou: [1, 1, 0, 0, 1],
      Pointing_Up: [0, 1, 0, 0, 0], Thumb_Up: [1, 0, 0, 0, 0], Thumb_Down: [1, 0, 0, 0, 0],
    }[gesture];
    const pts = [[0, 0.9]];
    // 拇指
    const thumbUp = gesture === 'Thumb_Up' || gesture === 'Thumb_Down';
    for (let k = 1; k <= 4; k++) {
      if (thumbUp) pts.push([-0.45 - k * 0.03, 0.4 - k * 0.32]);
      else if (ext[0]) pts.push([-0.4 - k * 0.15, 0.55 - k * 0.2]);
      else pts.push([-0.4 + k * 0.08, 0.5 - k * 0.12]);
    }
    const bases = [-0.33, -0.1, 0.13, 0.35];
    bases.forEach((bx, f) => {
      const spread = (f - 1.5) * 0.12;
      for (let k = 0; k < 4; k++) {
        if (ext[f + 1]) pts.push([bx + Math.sin(spread) * k * 0.33, -0.25 - Math.cos(spread) * k * 0.33]);
        else pts.push([bx, [-0.25, -0.45, -0.3, -0.12][k]]);
      }
    });
    const landmarks = pts.map(([x, y]) => {
      const sx = hx + x * u, sy = hy + y * u * flip;
      return { x: 1 - sx / W, y: sy / H, z: 0 };
    });
    return { landmarks, gesture, score: 0.95 };
  }
}
