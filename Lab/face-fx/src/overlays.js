// Canvas2D 臉部造型：貓、狗、卡通、假面舞會；以臉部座標系繪製（單位 = 臉寬）

// 把 MediaPipe 的正規化座標轉成「鏡像後的畫面像素」，並建立跟著頭轉的局部座標系
export function faceFrame(lm, W, H) {
  const P = (i) => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H });
  const F = P(10), C = P(152);
  const c = { x: (F.x + C.x) / 2, y: (F.y + C.y) / 2 };
  let ux = F.x - C.x, uy = F.y - C.y;
  const fhPx = Math.hypot(ux, uy) || 1;
  ux /= fhPx; uy /= fhPx;
  const a = P(234), b = P(454);
  const s = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const th = Math.atan2(ux, -uy);
  const ex = { x: Math.cos(th), y: Math.sin(th) };
  const ey = { x: -Math.sin(th), y: Math.cos(th) };
  const L = (i) => {
    const p = P(i), dx = p.x - c.x, dy = p.y - c.y;
    return { x: (dx * ex.x + dy * ex.y) / s, y: (dx * ey.x + dy * ey.y) / s };
  };
  const yaw = L(1).x - (L(234).x + L(454).x) / 2;
  return { P, L, c, th, s, yaw };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dogEar = [{ a: 0, v: 0 }, { a: 0, v: 0 }];
    this.twitch = [0, 0];
    this.nextTwitch = [1, 2];
  }

  resize(w, h) { this.canvas.width = w; this.canvas.height = h; }

  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  // blends: { cat, dog, toon, mask } 0..1
  drawFace(lm, blend, b, t, dt) {
    const ctx = this.ctx;
    const f = faceFrame(lm, this.canvas.width, this.canvas.height);
    this.animate(f, t, dt);
    ctx.save();
    ctx.translate(f.c.x, f.c.y);
    ctx.rotate(f.th);
    ctx.scale(f.s, f.s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (b.dog > 0.01) { ctx.globalAlpha = b.dog; this.dog(f, blend, t); }
    if (b.cat > 0.01) { ctx.globalAlpha = b.cat; this.cat(f, blend, t); }
    if (b.toon > 0.01) { ctx.globalAlpha = b.toon; this.toon(f, blend, t); }
    if (b.mask > 0.01) { ctx.globalAlpha = b.mask; this.mask(f, blend, t); }
    ctx.restore();
    ctx.globalAlpha = 1;
    return f;
  }

  animate(f, t, dt) {
    // 貓耳偶爾抖一下
    for (let i = 0; i < 2; i++) {
      if (t > this.nextTwitch[i]) { this.twitch[i] = (i ? 1 : -1) * 0.35; this.nextTwitch[i] = t + 1.5 + Math.random() * 3; }
      this.twitch[i] *= Math.exp(-dt * 9);
    }
    // 狗耳受重力擺動（彈簧）
    for (let i = 0; i < 2; i++) {
      const e = this.dogEar[i];
      const side = i ? 1 : -1;
      const target = -f.th * 0.85 + side * 0.08 + f.yaw * 0.6;
      e.v += (target - e.a) * 60 * dt;
      e.v *= Math.exp(-dt * 5);
      e.a += e.v * dt;
    }
  }

  // ---------- 🐱 貓 ----------
  cat(f, bl, t) {
    const ctx = this.ctx;
    const top = f.L(10), nose = f.L(1), lip = f.L(0), upperIn = f.L(13);
    const jaw = bl.jawOpen ?? 0;
    const smile = ((bl.mouthSmileLeft ?? 0) + (bl.mouthSmileRight ?? 0)) / 2;

    for (const side of [-1, 1]) {
      const i = side > 0 ? 1 : 0;
      const sc = 1 + side * f.yaw * 0.8;
      ctx.save();
      ctx.translate(side * 0.31 + f.yaw * 0.12, top.y + 0.05);
      ctx.rotate(side * 0.3 + this.twitch[i]);
      ctx.scale(sc, sc);
      const g = ctx.createLinearGradient(0, -0.45, 0, 0.05);
      g.addColorStop(0, '#ffcf8a'); g.addColorStop(0.5, '#f29a45'); g.addColorStop(1, '#c4681f');
      ctx.beginPath();
      ctx.moveTo(-0.18, 0.05);
      ctx.quadraticCurveTo(-0.13, -0.22, 0.01, -0.44);
      ctx.quadraticCurveTo(0.13, -0.21, 0.18, 0.05);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 0.014; ctx.strokeStyle = '#6b3510'; ctx.stroke();
      // 虎斑紋
      ctx.strokeStyle = 'rgba(120,55,15,.55)'; ctx.lineWidth = 0.016;
      for (const y of [-0.16, -0.08]) {
        ctx.beginPath(); ctx.moveTo(side * -0.14, y + 0.02); ctx.quadraticCurveTo(side * -0.1, y, side * -0.07, y + 0.03); ctx.stroke();
      }
      // 內耳
      const gi = ctx.createLinearGradient(0, -0.3, 0, 0.03);
      gi.addColorStop(0, '#ffd6e3'); gi.addColorStop(1, '#ff8fb3');
      ctx.beginPath();
      ctx.moveTo(-0.1, 0.03);
      ctx.quadraticCurveTo(-0.07, -0.14, 0.01, -0.3);
      ctx.quadraticCurveTo(0.08, -0.14, 0.1, 0.03);
      ctx.closePath();
      ctx.fillStyle = gi; ctx.fill();
      // 耳毛
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.008;
      for (const [x0, x1, y1] of [[-0.045, -0.07, -0.13], [0.0, 0.005, -0.16], [0.045, 0.07, -0.12]]) {
        ctx.beginPath(); ctx.moveTo(x0, 0.02); ctx.quadraticCurveTo(x0, -0.06, x1, y1); ctx.stroke();
      }
      ctx.restore();
    }

    // 額頭虎斑
    ctx.fillStyle = 'rgba(150,70,20,.42)';
    for (const [x, w, h] of [[-0.07, 0.025, 0.11], [0, 0.03, 0.14], [0.07, 0.025, 0.11]]) {
      ctx.beginPath();
      ctx.ellipse(x, top.y + 0.13, w, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 腮紅
    for (const side of [-1, 1]) {
      const cx = side * 0.27, cy = nose.y + 0.04;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.1);
      g.addColorStop(0, `rgba(255,110,150,${0.35 + smile * 0.45})`);
      g.addColorStop(1, 'rgba(255,110,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, 0.1, 0.065, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 鬍鬚
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const wig = Math.sin(t * 2.2 + k + side) * 0.01;
        const sx = side * (0.12 + f.yaw * 0.1), sy = nose.y + 0.03 + k * 0.032;
        const ex = side * 0.56, ey = nose.y - 0.06 + k * 0.075 + wig * 2;
        const cx = side * 0.34, cy = nose.y + k * 0.04 - 0.02 + wig;
        for (const [col, w] of [['rgba(40,20,10,.45)', 0.014], ['rgba(255,255,255,.95)', 0.007]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
        }
      }
    }

    // 鼻子
    const nx = nose.x, ny = nose.y - 0.005;
    const gn = ctx.createLinearGradient(nx, ny - 0.04, nx, ny + 0.04);
    gn.addColorStop(0, '#ffa8c4'); gn.addColorStop(1, '#e85b8a');
    ctx.beginPath();
    ctx.moveTo(nx - 0.058, ny - 0.025);
    ctx.quadraticCurveTo(nx, ny - 0.05, nx + 0.058, ny - 0.025);
    ctx.quadraticCurveTo(nx + 0.03, ny + 0.03, nx, ny + 0.042);
    ctx.quadraticCurveTo(nx - 0.03, ny + 0.03, nx - 0.058, ny - 0.025);
    ctx.fillStyle = gn; ctx.fill();
    ctx.lineWidth = 0.008; ctx.strokeStyle = '#8a2a4a'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.ellipse(nx - 0.018, ny - 0.022, 0.016, 0.008, -0.3, 0, Math.PI * 2); ctx.fill();

    // ω 嘴
    ctx.strokeStyle = '#5a2a1a'; ctx.lineWidth = 0.011;
    ctx.beginPath();
    ctx.moveTo(nx, ny + 0.042); ctx.lineTo(nx, lip.y - 0.005);
    ctx.moveTo(nx - 0.075, lip.y - 0.015); ctx.quadraticCurveTo(nx - 0.035, lip.y + 0.03, nx, lip.y - 0.005);
    ctx.quadraticCurveTo(nx + 0.035, lip.y + 0.03, nx + 0.075, lip.y - 0.015);
    ctx.stroke();

    // 張嘴：小虎牙＋喵
    if (jaw > 0.3) {
      const k = Math.min(1, (jaw - 0.3) / 0.3);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 0.004;
      for (const side of [-1, 1]) {
        const x = upperIn.x + side * 0.04;
        ctx.beginPath(); ctx.moveTo(x - 0.016, upperIn.y); ctx.lineTo(x + 0.016, upperIn.y); ctx.lineTo(x, upperIn.y + 0.035 * k); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      this.bubble(0.62, top.y + 0.18, '喵～', k, '#ff5f9e');
    }
  }

  // ---------- 🐶 狗 ----------
  dog(f, bl, t) {
    const ctx = this.ctx;
    const top = f.L(10), nose = f.L(1), lip = f.L(0), lowerIn = f.L(14), iris = mid(f.L(33), f.L(133));
    const jaw = bl.jawOpen ?? 0;

    // 眼周斑點（multiply 讓膚色透出來）
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const gp = ctx.createRadialGradient(iris.x, iris.y, 0.02, iris.x, iris.y, 0.17);
    gp.addColorStop(0, 'rgba(150,95,50,.75)'); gp.addColorStop(0.7, 'rgba(150,95,50,.55)'); gp.addColorStop(1, 'rgba(150,95,50,0)');
    ctx.fillStyle = gp;
    ctx.beginPath(); ctx.ellipse(iris.x, iris.y - 0.01, 0.17, 0.14, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 垂耳
    for (const side of [-1, 1]) {
      const e = this.dogEar[side > 0 ? 1 : 0];
      ctx.save();
      ctx.translate(side * (0.43 - f.yaw * side * 0.08), top.y + 0.13);
      ctx.rotate(e.a);
      const g = ctx.createLinearGradient(0, 0, 0, 0.62);
      g.addColorStop(0, '#9a6332'); g.addColorStop(0.6, '#7a4a22'); g.addColorStop(1, '#4e2e14');
      ctx.beginPath();
      ctx.moveTo(-side * 0.04, -0.02);
      ctx.bezierCurveTo(side * 0.16, -0.02, side * 0.24, 0.3, side * 0.16, 0.54);
      ctx.bezierCurveTo(side * 0.1, 0.66, -side * 0.08, 0.63, -side * 0.09, 0.48);
      ctx.bezierCurveTo(-side * 0.11, 0.3, -side * 0.1, 0.08, -side * 0.04, -0.02);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 0.012; ctx.strokeStyle = '#3a200c'; ctx.stroke();
      // 內側陰影＋毛流
      ctx.strokeStyle = 'rgba(40,20,5,.45)'; ctx.lineWidth = 0.01;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(side * (0.02 + k * 0.04), 0.08 + k * 0.03);
        ctx.quadraticCurveTo(side * (0.1 + k * 0.03), 0.3, side * (0.06 + k * 0.03), 0.5 - k * 0.04); ctx.stroke();
      }
      ctx.restore();
    }

    // 口鼻部
    const my = (nose.y + lip.y) / 2 + 0.02;
    const gm = ctx.createRadialGradient(0, my, 0.02, 0, my, 0.22);
    gm.addColorStop(0, 'rgba(255,240,220,.6)'); gm.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = gm;
    ctx.beginPath(); ctx.ellipse(nose.x, my, 0.22, 0.15, 0, 0, Math.PI * 2); ctx.fill();

    // 舌頭（張嘴時伸出來，會甩）
    if (jaw > 0.18) {
      const k = Math.min(1, (jaw - 0.18) / 0.4);
      const len = 0.06 + k * 0.28;
      const wag = Math.sin(t * 9) * 0.012 * k;
      ctx.save();
      ctx.translate(lowerIn.x, lowerIn.y - 0.01);
      ctx.rotate(wag * 3);
      const gt = ctx.createLinearGradient(0, 0, 0, len);
      gt.addColorStop(0, '#d9405f'); gt.addColorStop(0.3, '#ff7096'); gt.addColorStop(1, '#ff8fab');
      ctx.beginPath();
      ctx.moveTo(-0.065, 0);
      ctx.lineTo(-0.065, len - 0.06);
      ctx.quadraticCurveTo(-0.065, len, 0, len);
      ctx.quadraticCurveTo(0.065, len, 0.065, len - 0.06);
      ctx.lineTo(0.065, 0);
      ctx.closePath();
      ctx.fillStyle = gt; ctx.fill();
      ctx.lineWidth = 0.008; ctx.strokeStyle = '#a02040'; ctx.stroke();
      ctx.strokeStyle = 'rgba(160,30,60,.6)'; ctx.lineWidth = 0.007;
      ctx.beginPath(); ctx.moveTo(0, 0.01); ctx.lineTo(0, len - 0.04); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.ellipse(-0.03, len * 0.5, 0.012, len * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 鼻頭
    const nx = nose.x, ny = nose.y;
    const gn = ctx.createRadialGradient(nx - 0.02, ny - 0.02, 0.005, nx, ny, 0.1);
    gn.addColorStop(0, '#555'); gn.addColorStop(0.5, '#1a1a1a'); gn.addColorStop(1, '#000');
    ctx.beginPath();
    ctx.moveTo(nx - 0.09, ny - 0.02);
    ctx.bezierCurveTo(nx - 0.09, ny - 0.07, nx + 0.09, ny - 0.07, nx + 0.09, ny - 0.02);
    ctx.bezierCurveTo(nx + 0.09, ny + 0.03, nx + 0.03, ny + 0.06, nx, ny + 0.06);
    ctx.bezierCurveTo(nx - 0.03, ny + 0.06, nx - 0.09, ny + 0.03, nx - 0.09, ny - 0.02);
    ctx.fillStyle = gn; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(nx - 0.03, ny - 0.035, 0.028, 0.012, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(nx + side * 0.032, ny + 0.015, 0.016, 0.01, side * 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(nx, ny + 0.06); ctx.lineTo(nx, lip.y); ctx.stroke();
  }

  // ---------- 🖐 卡通 ----------
  toon(f, bl, t) {
    const ctx = this.ctx;
    const nose = f.L(1), top = f.L(10);
    const jaw = bl.jawOpen ?? 0;
    const smile = ((bl.mouthSmileLeft ?? 0) + (bl.mouthSmileRight ?? 0)) / 2;
    // 動漫眼睛高光（眼睛已被 shader 放大）
    for (const [ii, a, b] of [[0, 33, 133], [1, 263, 362]]) {
      const ic = mid(f.L(a), f.L(b));
      const r = dist(f.L(a), f.L(b)) * 0.38;
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.ellipse(ic.x - r * 0.35, ic.y - r * 0.35, r * 0.3, r * 0.24, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ic.x + r * 0.3, ic.y + r * 0.28, r * 0.12, 0, Math.PI * 2); ctx.fill();
      // 眼裡的星星閃光
      const tw = 0.5 + 0.5 * Math.sin(t * 4 + ii);
      this.star(ic.x + r * 0.05, ic.y - r * 0.05, r * 0.16 * tw, 'rgba(255,255,255,.9)');
    }
    // 漫畫腮紅（斜線）
    for (const side of [-1, 1]) {
      const cx = side * 0.27, cy = nose.y + 0.03;
      ctx.fillStyle = `rgba(255,120,160,${0.35 + smile * 0.35})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, 0.085, 0.045, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,130,.85)'; ctx.lineWidth = 0.008;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 0.035 - 0.012, cy + 0.025); ctx.lineTo(cx + k * 0.035 + 0.012, cy - 0.025); ctx.stroke(); }
    }
    // 頭頂繞圈的星星
    for (let k = 0; k < 7; k++) {
      const a = t * 0.9 + k * (Math.PI * 2 / 7);
      const x = Math.cos(a) * 0.42, y = top.y - 0.08 + Math.sin(a) * 0.1;
      const hue = (k * 50 + t * 40) % 360;
      this.star(x, y, 0.03 + 0.012 * Math.sin(t * 3 + k), `hsl(${hue} 100% 70%)`);
    }
    // 張嘴驚訝！
    if (jaw > 0.4) {
      const k = Math.min(1, (jaw - 0.4) / 0.25);
      ctx.save();
      ctx.translate(0.55, top.y + 0.05);
      ctx.rotate(0.2);
      ctx.scale(k, k);
      this.text('!!', 0, 0, 0.2, '#ffe14d', '#222', 'bold', '"Arial Black", sans-serif');
      ctx.restore();
    }
    // 笑的時候飄音符
    if (smile > 0.45) {
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.6 + k / 3) % 1;
        this.text(k % 2 ? '♫' : '♪', -0.6 + k * 0.06, nose.y - ph * 0.5, 0.11, '#ff7ad9');
      }
    }
  }

  // ---------- ✊ 假面舞會 ----------
  mask(f, bl, t) {
    const ctx = this.ctx;
    const eR = mid(f.L(33), f.L(133)), eL = mid(f.L(263), f.L(362));
    const w = (dist(f.L(33), f.L(133)) + dist(f.L(263), f.L(362))) / 2;
    const ey = (eR.y + eL.y) / 2;

    // 羽毛（畫在面具後面）
    // 角度 0 = 往右、-π/2 = 往上；羽毛往左上方展開
    for (let k = 0; k < 4; k++) {
      const ang = -2.55 + k * 0.24 + Math.sin(t * 1.4 + k) * 0.05;
      this.feather(-0.5, ey - 0.15, ang, 0.5 + k * 0.06, k);
    }

    // 面具主體（evenodd 挖出眼洞）
    const p = new Path2D();
    p.moveTo(-0.62, ey - 0.22);
    p.bezierCurveTo(-0.46, ey - 0.12, -0.30, ey - 0.21, -0.13, ey - 0.16);
    p.quadraticCurveTo(-0.04, ey - 0.13, 0, ey - 0.08);
    p.quadraticCurveTo(0.04, ey - 0.13, 0.13, ey - 0.16);
    p.bezierCurveTo(0.30, ey - 0.21, 0.46, ey - 0.12, 0.62, ey - 0.22);
    p.bezierCurveTo(0.60, ey - 0.02, 0.52, ey + 0.11, 0.33, ey + 0.16);
    p.bezierCurveTo(0.19, ey + 0.19, 0.08, ey + 0.11, 0, ey + 0.07);
    p.bezierCurveTo(-0.08, ey + 0.11, -0.19, ey + 0.19, -0.33, ey + 0.16);
    p.bezierCurveTo(-0.52, ey + 0.11, -0.60, ey - 0.02, -0.62, ey - 0.22);
    p.closePath();
    const holes = new Path2D();
    for (const e of [eR, eL]) {
      const rx = w * 0.78, ry = w * 0.36;
      holes.moveTo(e.x - rx, e.y);
      holes.quadraticCurveTo(e.x, e.y - ry * 1.7, e.x + rx, e.y);
      holes.quadraticCurveTo(e.x, e.y + ry * 1.5, e.x - rx, e.y);
      holes.closePath();
    }
    const full = new Path2D(p); full.addPath(holes);
    const g = ctx.createLinearGradient(-0.6, ey - 0.2, 0.6, ey + 0.15);
    const sh = (Math.sin(t * 0.8) + 1) / 2;
    g.addColorStop(0, '#7a5a14');
    g.addColorStop(Math.max(0.05, 0.25 + sh * 0.2 - 0.1), '#f9e7a0');
    g.addColorStop(0.5, '#c8952e');
    g.addColorStop(Math.min(0.95, 0.65 + sh * 0.2), '#fff4c2');
    g.addColorStop(1, '#7a5a14');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14;
    ctx.fillStyle = g; ctx.fill(full, 'evenodd');
    ctx.restore();
    ctx.lineWidth = 0.012; ctx.strokeStyle = '#5a3d0a'; ctx.stroke(p);
    ctx.lineWidth = 0.014; ctx.strokeStyle = '#3d2806'; ctx.stroke(holes);
    ctx.lineWidth = 0.005; ctx.strokeStyle = 'rgba(255,250,210,.8)'; ctx.stroke(holes);

    // 花紋
    ctx.strokeStyle = 'rgba(90,55,5,.75)'; ctx.lineWidth = 0.007;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = k / 40 * Math.PI * 3.2, r = 0.012 + k * 0.0016;
        const x = side * 0.42 + Math.cos(a) * r * side, y = ey + 0.04 + Math.sin(a) * r;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 0.2, ey + 0.13);
      ctx.quadraticCurveTo(side * 0.3, ey + 0.06, side * 0.38, ey + 0.1);
      ctx.stroke();
    }
    // 水鑽
    const gems = [[-0.5, -0.14], [-0.38, -0.16], [-0.26, -0.165], [0.26, -0.165], [0.38, -0.16], [0.5, -0.14], [-0.2, 0.13], [0.2, 0.13], [-0.52, -0.02], [0.52, -0.02]];
    gems.forEach(([x, y], k) => {
      const gy = ey + y;
      const gg = ctx.createRadialGradient(x - 0.005, gy - 0.005, 0, x, gy, 0.017);
      gg.addColorStop(0, '#fff'); gg.addColorStop(0.5, k % 2 ? '#9ff' : '#f9f'); gg.addColorStop(1, '#468');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, gy, 0.015, 0, Math.PI * 2); ctx.fill();
      const tw = Math.sin(t * 3 + k * 1.7);
      if (tw > 0.6) this.star(x, gy, 0.04 * (tw - 0.6) / 0.4, 'rgba(255,255,255,.95)');
    });
    // 中央紅寶石
    const cy = ey - 0.12;
    const gr = ctx.createLinearGradient(0, cy - 0.04, 0, cy + 0.04);
    gr.addColorStop(0, '#ff8a9a'); gr.addColorStop(0.5, '#d0102a'); gr.addColorStop(1, '#5a0010');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(0, cy - 0.045); ctx.lineTo(0.032, cy); ctx.lineTo(0, cy + 0.045); ctx.lineTo(-0.032, cy); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.006; ctx.strokeStyle = '#f5d27a'; ctx.stroke();
  }

  feather(x, y, ang, len, k) {
    const ctx = this.ctx;
    const cols = [['#5b2a86', '#c86bff'], ['#0d6e6e', '#5ff5d8'], ['#3b1f6b', '#9d7bff'], ['#6e0d4a', '#ff6bbd']][k % 4];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -0.09, len * 0.8, -0.07, len, 0);
    ctx.bezierCurveTo(len * 0.8, 0.06, len * 0.3, 0.08, 0, 0);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 0.004;
    for (let i = 1; i < 12; i++) {
      const sx = len * i / 12;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 0.03, -0.05 * Math.sin(Math.PI * i / 12)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 0.03, 0.045 * Math.sin(Math.PI * i / 12)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(-0.02, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.restore();
  }

  star(x, y, r, color) {
    if (r <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r;
      ctx.lineTo(x + Math.cos(a - Math.PI / 2) * rr, y + Math.sin(a - Math.PI / 2) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  bubble(x, y, text, k, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.strokeStyle = color; ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.roundRect(-0.15, -0.08, 0.3, 0.14, 0.06);
    ctx.moveTo(-0.08, 0.06); ctx.lineTo(-0.16, 0.12); ctx.lineTo(-0.03, 0.06);
    ctx.fill(); ctx.stroke();
    this.text(text, 0, -0.01, 0.085, color, null, 'bold');
    ctx.restore();
  }

  // 臉部座標系的單位是「臉寬」，直接設 0.1px 字型有些瀏覽器畫不出來，先放大 100 倍再畫
  text(str, x, y, size, fill, stroke, weight = '', family = '"Microsoft JhengHei", "Segoe UI Emoji", sans-serif') {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(0.01, 0.01);
    ctx.font = `${weight} ${size * 100}px ${family}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = size * 12; ctx.strokeStyle = stroke; ctx.strokeText(str, x * 100, y * 100); }
    ctx.fillStyle = fill; ctx.fillText(str, x * 100, y * 100);
    ctx.restore();
  }

  // ---------- 手 ----------
  drawHands(hands, showSkeleton, ring) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const P = (p) => [(1 - p.x) * W, p.y * H];
    const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    for (const h of hands) {
      const lm = h.landmarks;
      if (showSkeleton) {
        ctx.strokeStyle = 'rgba(122,215,255,.7)'; ctx.lineWidth = 3;
        for (const [a, b] of LINKS) { const [x1, y1] = P(lm[a]); const [x2, y2] = P(lm[b]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
        for (const p of lm) { const [x, y] = P(p); ctx.fillStyle = '#ff7ad9'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const i of [4, 8, 12, 16, 20]) {
        const [x, y] = P(lm[i]);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
        g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,122,217,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (ring && ring.hand) {
      const [x, y] = P(ring.hand.landmarks[9]);
      const r = 46;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createLinearGradient(x - r, y, x + r, y);
      g.addColorStop(0, '#ff7ad9'); g.addColorStop(1, '#7ad7ff');
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ring.progress)); ctx.stroke();
      ctx.font = '40px "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ring.emoji, x, y);
    }
  }
}
