// 手勢 → 動作；手勢要維持 HOLD_MS 才觸發，避免誤判
export const HOLD_MS = 450;
const GRACE_MS = 180; // 辨識偶爾閃一兩幀 None，不要因此重來

export const ACTIONS = {
  Victory: { mode: 'cat', emoji: '✌️' },
  Thumb_Up: { mode: 'dog', emoji: '👍' },
  Open_Palm: { mode: 'toon', emoji: '🖐' },
  Closed_Fist: { mode: 'mask', emoji: '✊' },
  ILoveYou: { toggle: 'bg', emoji: '🤟' },
  Thumb_Down: { mode: 'none', emoji: '👎' },
};

export class GestureFSM {
  constructor() { this.cand = null; this.since = 0; this.lastSeen = 0; this.fired = false; this.hand = null; }

  // 回傳 { action, ring:{hand,progress,emoji}|null, pointer: hand|null }
  update(hands, now) {
    let best = null;
    for (const h of hands) if (h.gesture !== 'None' && h.score > 0.55 && (!best || h.score > best.score)) best = h;
    const pointer = hands.find((h) => h.gesture === 'Pointing_Up' && h.score > 0.5) ?? null;

    const g = best && ACTIONS[best.gesture] ? best.gesture : null;
    if (g) {
      if (g !== this.cand) { this.cand = g; this.since = now; this.fired = false; }
      this.lastSeen = now;
      this.hand = best;
    } else if (this.cand && now - this.lastSeen > GRACE_MS) {
      this.cand = null; this.fired = false;
    }

    let action = null, ring = null;
    if (this.cand) {
      const progress = (now - this.since) / HOLD_MS;
      if (progress >= 1 && !this.fired) { this.fired = true; action = ACTIONS[this.cand]; }
      if (!this.fired) ring = { hand: this.hand, progress, emoji: ACTIONS[this.cand].emoji };
    }
    return { action, ring, pointer };
  }
}
