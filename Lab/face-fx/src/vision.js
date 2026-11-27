// MediaPipe 包裝：臉部 478 點 + 表情、手勢辨識、人像去背
const VER = '0.10.14';
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`;
const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  gesture: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
};

export class Vision {
  constructor() {
    this.face = null; this.gesture = null; this.seg = null;
    this.lastTs = -1;
    this.mask = null;          // { data: Uint8Array, w, h }
    this.maskInvert = null;    // 自動判斷模型輸出是人像還是背景
  }

  async init(onStatus) {
    onStatus('載入 MediaPipe…');
    const mp = await import(BUNDLE);
    const fileset = await mp.FilesetResolver.forVisionTasks(WASM);
    const make = async (Cls, path, extra) => {
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...extra });
      try { return await Cls.createFromOptions(fileset, opts('GPU')); }
      catch (e) { console.warn('GPU delegate 失敗，改用 CPU', e); return await Cls.createFromOptions(fileset, opts('CPU')); }
    };
    onStatus('下載臉部模型…');
    this.face = await make(mp.FaceLandmarker, MODELS.face, { numFaces: 1, outputFaceBlendshapes: true });
    onStatus('下載手勢模型…');
    this.gesture = await make(mp.GestureRecognizer, MODELS.gesture, { numHands: 2 });
    onStatus('下載去背模型…');
    this.seg = await make(mp.ImageSegmenter, MODELS.seg, { outputCategoryMask: false, outputConfidenceMasks: true });
  }

  // 每幀呼叫；回傳 { face, blend, hands }
  detect(video, wantMask) {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    const out = { face: null, blend: {}, hands: [] };
    const fr = this.face.detectForVideo(video, ts);
    if (fr.faceLandmarks?.length) {
      out.face = fr.faceLandmarks[0];
      for (const c of fr.faceBlendshapes?.[0]?.categories ?? []) out.blend[c.categoryName] = c.score;
    }
    const gr = this.gesture.recognizeForVideo(video, ts);
    (gr.landmarks ?? []).forEach((lm, i) => {
      const g = gr.gestures?.[i]?.[0];
      out.hands.push({ landmarks: lm, gesture: g?.categoryName ?? 'None', score: g?.score ?? 0 });
    });
    if (wantMask) {
      this.seg.segmentForVideo(video, ts, (res) => {
        const m = res.confidenceMasks?.[0];
        if (!m) return;
        const f = m.getAsFloat32Array();
        const w = m.width, h = m.height;
        if (!this.mask || this.mask.w !== w || this.mask.h !== h) this.mask = { data: new Uint8Array(w * h), w, h };
        const d = this.mask.data;
        for (let i = 0; i < f.length; i++) d[i] = Math.max(0, Math.min(255, f[i] * 255));
        this.mask.version = (this.mask.version ?? 0) + 1;
        // 前幾十幀投票決定是否反相（避免第一幀剛好沒人入鏡就判錯）
        if (this.mask.version <= 40) {
          this.invertVotes = (this.invertVotes ?? 0) + (guessInvert(d, w, h) ? 1 : -1);
          this.maskInvert = this.invertVotes > 0;
        }
      });
    }
    return out;
  }
}

// 人通常在畫面中央下方；中央比角落低，代表輸出的是背景機率，要反相
function guessInvert(d, w, h) {
  const at = (x, y) => d[Math.floor(y * (h - 1)) * w + Math.floor(x * (w - 1))];
  const center = (at(.5, .6) + at(.45, .75) + at(.55, .75)) / 3;
  const corners = (at(.03, .03) + at(.97, .03)) / 2;
  return center < corners;
}
