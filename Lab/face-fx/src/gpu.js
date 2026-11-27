// WebGPU：鏡頭濾鏡（卡通描邊、大眼、調色、星空去背）＋ compute shader 粒子
export const MAX_PARTICLES = 160_000;

const BG_WGSL = /* wgsl */`
struct BgU {
  res: vec2f, time: f32, toon: f32,
  eyeL: vec2f, eyeR: vec2f,
  eyeRad: f32, bg: f32, maskInv: f32, cat: f32,
  dog: f32, masq: f32, hasMask: f32, pad: f32,
};
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var camTex: texture_2d<f32>;
@group(0) @binding(2) var maskTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> U: BgU;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
  return o;
}

// 畫面左右鏡像（自拍視角）
fn cam(uv: vec2f) -> vec3f { return textureSampleLevel(camTex, samp, vec2f(1.0 - uv.x, uv.y), 0.0).rgb; }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

fn bulge(uv: vec2f, e: vec2f, R: f32, amt: f32) -> vec2f {
  let asp = U.res.x / U.res.y;
  let d = (uv - e) * vec2f(asp, 1.0);
  let r = length(d);
  if (r >= R) { return uv; }
  let k = 1.0 - amt * pow(1.0 - r / R, 2.0);
  return e + (uv - e) * k;
}

fn sky(uv: vec2f, t: f32) -> vec3f {
  var col = mix(vec3f(0.02, 0.01, 0.08), vec3f(0.16, 0.04, 0.30), uv.y);
  for (var k = 0; k < 3; k++) {
    let fk = f32(k);
    let y = 0.22 + fk * 0.13 + 0.06 * sin(uv.x * 3.0 + t * 0.35 + fk * 2.0) + 0.03 * sin(uv.x * 7.0 - t * 0.6 + fk);
    let g = exp(-abs(uv.y - y) * (12.0 + fk * 6.0));
    let c = mix(vec3f(0.1, 0.95, 0.7), vec3f(0.85, 0.3, 1.0), fk * 0.5);
    col += c * g * (0.55 + 0.25 * sin(t * 0.8 + fk + uv.x * 4.0));
  }
  let asp = U.res.x / U.res.y;
  for (var layer = 0; layer < 2; layer++) {
    let sc = 70.0 + f32(layer) * 60.0;
    let grid = uv * vec2f(asp * sc, sc) + vec2f(t * (0.3 + f32(layer) * 0.5), 0.0);
    let cell = floor(grid);
    let f = fract(grid) - 0.5;
    let h = hash2(cell + f32(layer) * 17.0);
    if (h > 0.972) {
      let tw = 0.45 + 0.55 * sin(t * 3.0 + h * 60.0);
      col += vec3f(1.0, 0.95, 0.9) * smoothstep(0.14, 0.0, length(f)) * tw * 1.6;
    }
  }
  return col;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let uv = in.uv;
  let t = U.time;
  var suv = uv;
  suv = bulge(suv, U.eyeL, U.eyeRad, 0.5 * U.toon);
  suv = bulge(suv, U.eyeR, U.eyeRad, 0.5 * U.toon);
  var col = cam(suv);

  if (U.toon > 0.001) {
    let px = 1.5 / U.res;
    let l00 = luma(cam(suv + vec2f(-px.x, -px.y)));
    let l10 = luma(cam(suv + vec2f(0.0, -px.y)));
    let l20 = luma(cam(suv + vec2f(px.x, -px.y)));
    let l01 = luma(cam(suv + vec2f(-px.x, 0.0)));
    let l21 = luma(cam(suv + vec2f(px.x, 0.0)));
    let l02 = luma(cam(suv + vec2f(-px.x, px.y)));
    let l12 = luma(cam(suv + vec2f(0.0, px.y)));
    let l22 = luma(cam(suv + vec2f(px.x, px.y)));
    let gx = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02);
    let gy = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
    let edge = smoothstep(0.16, 0.42, length(vec2f(gx, gy)));
    // 只量化亮度、保留色相，避免漸層出現彩色色帶
    let L0 = max(luma(col), 0.001);
    let Lq = mix(L0, (floor(L0 * 4.0) + 0.5) / 4.0, 0.7);
    var tc = col * (Lq / L0);
    let L = luma(tc);
    tc = mix(vec3f(L), tc, 1.35) * 1.05;
    tc = tc * (1.0 - edge * 0.9);
    col = mix(col, tc, U.toon);
  }

  // 各模式調色
  col = mix(col, col * vec3f(1.07, 1.0, 0.93) + vec3f(0.02, 0.01, 0.0), U.cat);
  col = mix(col, col * vec3f(1.05, 1.03, 0.95), U.dog);
  let vd = length((uv - 0.5) * vec2f(1.3, 1.0));
  let vig = smoothstep(0.32, 0.85, vd);
  col = mix(col, mix(col * vec3f(1.05, 0.95, 1.1), vec3f(0.10, 0.02, 0.18), vig * 0.8), U.masq);

  // 星空去背
  if (U.hasMask > 0.5) {
    var m = textureSampleLevel(maskTex, samp, vec2f(1.0 - uv.x, uv.y), 0.0).r;
    if (U.maskInv > 0.5) { m = 1.0 - m; }
    let a = smoothstep(0.35, 0.7, m);
    let rim = a * (1.0 - a) * 4.0;
    var outc = mix(sky(uv, t), col, a);
    outc += rim * mix(vec3f(0.3, 1.0, 0.9), vec3f(1.0, 0.4, 0.9), 0.5 + 0.5 * sin(t * 2.0 + uv.y * 6.0)) * 0.9;
    col = mix(col, outc, U.bg);
  }
  return vec4f(col, 1.0);
}
`;

const PARTICLE_COMMON = /* wgsl */`
struct Particle { pos: vec2f, vel: vec2f, life: f32, maxLife: f32, hue: f32, size: f32 };
struct SimU {
  dt: f32, time: f32, aspect: f32, countA: u32,
  posA: vec2f, velA: vec2f,
  posB: vec2f, countB: u32, hueA: f32,
  hueB: f32, spreadA: f32, speedB: f32, ringB: f32,
};
`;

const SIM_WGSL = PARTICLE_COMMON + /* wgsl */`
@group(0) @binding(0) var<storage, read_write> ps: array<Particle>;
@group(0) @binding(1) var<uniform> S: SimU;
@group(0) @binding(2) var<storage, read_write> counter: atomic<u32>;

fn hashu(n: u32) -> u32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x * 9u;
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return x;
}
fn rnd(n: u32) -> f32 { return f32(hashu(n)) / 4294967295.0; }

fn flow(p: vec2f, t: f32) -> vec2f {
  let a = sin(p.y * 4.1 + t * 0.7) + sin(p.x * 2.3 - t * 0.5 + p.y * 1.7);
  let b = cos(p.x * 3.7 - t * 0.6) + cos(p.y * 2.9 + t * 0.4 + p.x * 1.3);
  return vec2f(a, b);
}

@compute @workgroup_size(256) fn sim(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&ps)) { return; }
  var p = ps[i];
  if (p.life <= 0.0) {
    let total = S.countA + S.countB;
    if (total == 0u) { return; }
    let slot = atomicAdd(&counter, 1u);
    if (slot >= total) { return; }
    let seed = hashu(i * 7919u + u32(S.time * 977.0) * 131u + slot);
    let r1 = rnd(seed); let r2 = rnd(seed + 1u); let r3 = rnd(seed + 2u); let r4 = rnd(seed + 3u);
    let ang = r1 * 6.2831853;
    let dir = vec2f(cos(ang), sin(ang));
    if (slot < S.countA) {
      p.pos = S.posA + dir * r2 * 0.012;
      p.vel = S.velA * 0.35 + dir * S.spreadA * (0.25 + r3);
      p.hue = fract(S.hueA + r4 * 0.2);
    } else {
      p.pos = S.posB + dir * (S.ringB + r2 * 0.05);
      p.vel = dir * S.speedB * (0.3 + r3);
      p.hue = fract(S.hueB + (r4 - 0.5) * 0.16);
    }
    p.maxLife = 1.0 + rnd(seed + 4u) * 1.7;
    p.life = p.maxLife;
    p.size = 0.0025 + pow(rnd(seed + 5u), 3.0) * 0.012;
    ps[i] = p;
    return;
  }
  let dt = S.dt;
  p.vel += flow(p.pos * 3.0, S.time) * 0.22 * dt;
  p.vel.y -= 0.07 * dt;
  p.vel *= exp(-1.5 * dt);
  p.pos += p.vel * dt;
  p.life -= dt;
  ps[i] = p;
}
`;

const DRAW_WGSL = PARTICLE_COMMON + /* wgsl */`
@group(0) @binding(0) var<storage, read> ps: array<Particle>;
@group(0) @binding(1) var<uniform> S: SimU;

fn hsv(h: f32, s: f32, v: f32) -> vec3f {
  let k = vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0);
  let p = abs(fract(vec3f(h) + k) * 6.0 - 3.0);
  return v * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), s);
}

struct PV { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) col: vec4f };
@vertex fn pvs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PV {
  let p = ps[ii];
  var o: PV;
  if (p.life <= 0.0) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0); o.q = vec2f(0.0); o.col = vec4f(0.0);
    return o;
  }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                                vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let k = p.life / p.maxLife;
  let sz = p.size * (0.35 + 0.65 * k);
  let sp = p.pos + c * sz;
  o.pos = vec4f(sp.x / S.aspect * 2.0 - 1.0, 1.0 - sp.y * 2.0, 0.0, 1.0);
  o.q = c;
  let a = smoothstep(0.0, 0.3, k) * (0.55 + 0.45 * k);
  o.col = vec4f(hsv(p.hue, 0.7, 1.0) * a, a);
  return o;
}
@fragment fn pfs(in: PV) -> @location(0) vec4f {
  let d = dot(in.q, in.q);
  let g = exp(-d * 4.0) * 0.7 + exp(-d * 20.0);
  return in.col * g;
}
`;

export class Gpu {
  async init(canvas) {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    this.device = device;
    this.canvas = canvas;
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });

    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.bgUniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.simUniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.counter = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.particles = device.createBuffer({ size: MAX_PARTICLES * 32, usage: GPUBufferUsage.STORAGE });

    const bgModule = device.createShaderModule({ code: BG_WGSL });
    this.bgPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: bgModule, entryPoint: 'vs' },
      fragment: { module: bgModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.simPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: SIM_WGSL }), entryPoint: 'sim' },
    });
    const drawModule = device.createShaderModule({ code: DRAW_WGSL });
    const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    this.drawPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: drawModule, entryPoint: 'pvs' },
      fragment: { module: drawModule, entryPoint: 'pfs', targets: [{ format: this.format, blend: { color: add, alpha: add } }] },
      primitive: { topology: 'triangle-list' },
    });
    this.simBind = device.createBindGroup({
      layout: this.simPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particles } },
        { binding: 1, resource: { buffer: this.simUniform } },
        { binding: 2, resource: { buffer: this.counter } },
      ],
    });
    this.drawBind = device.createBindGroup({
      layout: this.drawPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particles } },
        { binding: 1, resource: { buffer: this.simUniform } },
      ],
    });
    this.maskTex = this.makeMaskTex(1, 1);
    device.queue.writeTexture({ texture: this.maskTex }, new Uint8Array([255]), { bytesPerRow: 1 }, [1, 1]);
    this.hasMask = false;
    this.bgData = new Float32Array(16);
    this.simBuf = new ArrayBuffer(64);
    this.simF = new Float32Array(this.simBuf);
    this.simU = new Uint32Array(this.simBuf);
    this.zero = new Uint32Array([0]);
    device.lost.then((info) => console.error('WebGPU device lost', info));
    return true;
  }

  makeMaskTex(w, h) {
    return this.device.createTexture({ size: [w, h], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.camTex?.destroy();
    this.camTex = this.device.createTexture({
      size: [w, h], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.rebind();
  }

  rebind() {
    this.bgBind = this.device.createBindGroup({
      layout: this.bgPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.camTex.createView() },
        { binding: 2, resource: this.maskTex.createView() },
        { binding: 3, resource: { buffer: this.bgUniform } },
      ],
    });
  }

  updateCam(source) {
    this.device.queue.copyExternalImageToTexture({ source }, { texture: this.camTex }, [this.w, this.h]);
  }

  updateMask(mask) {
    if (!mask) return;
    if (!this.maskSize || this.maskSize[0] !== mask.w || this.maskSize[1] !== mask.h) {
      this.maskTex.destroy();
      this.maskTex = this.makeMaskTex(mask.w, mask.h);
      this.maskSize = [mask.w, mask.h];
      this.rebind();
    }
    this.device.queue.writeTexture({ texture: this.maskTex }, mask.data, { bytesPerRow: mask.w }, [mask.w, mask.h]);
    this.hasMask = true;
  }

  // bg: { time, toon, cat, dog, masq, bg, eyeL:[u,v], eyeR:[u,v], eyeRad, maskInv }
  // sim: { dt, time, countA, posA, velA, hueA, spreadA, countB, posB, hueB, speedB, ringB }
  frame(bg, sim) {
    const d = this.bgData;
    d.set([this.w, this.h, bg.time, bg.toon, bg.eyeL[0], bg.eyeL[1], bg.eyeR[0], bg.eyeR[1],
      bg.eyeRad, bg.bg, bg.maskInv ? 1 : 0, bg.cat, bg.dog, bg.masq, this.hasMask ? 1 : 0, 0]);
    this.device.queue.writeBuffer(this.bgUniform, 0, d);

    const f = this.simF, u = this.simU;
    f[0] = sim.dt; f[1] = sim.time; f[2] = this.w / this.h; u[3] = sim.countA | 0;
    f[4] = sim.posA[0]; f[5] = sim.posA[1]; f[6] = sim.velA[0]; f[7] = sim.velA[1];
    f[8] = sim.posB[0]; f[9] = sim.posB[1]; u[10] = sim.countB | 0; f[11] = sim.hueA;
    f[12] = sim.hueB; f[13] = sim.spreadA; f[14] = sim.speedB; f[15] = sim.ringB;
    this.device.queue.writeBuffer(this.simUniform, 0, this.simBuf);
    this.device.queue.writeBuffer(this.counter, 0, this.zero);

    const enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.simPipeline);
    cp.setBindGroup(0, this.simBind);
    cp.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / 256));
    cp.end();
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(this.bgPipeline);
    rp.setBindGroup(0, this.bgBind);
    rp.draw(3);
    rp.setPipeline(this.drawPipeline);
    rp.setBindGroup(0, this.drawBind);
    rp.draw(6, MAX_PARTICLES);
    rp.end();
    this.device.queue.submit([enc.finish()]);
  }
}
