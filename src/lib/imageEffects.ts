// Kokoro Creative Phase 2 — Image Effects Engine
// Canvas ベースのクライアントサイド画像処理

export type EffectType =
  | 'grayscale' | 'sepia' | 'invert' | 'posterize'
  | 'halftone' | 'edgeDetect' | 'pixelate' | 'glitch'
  | 'duotone' | 'noise' | 'threshold' | 'scanlines'
  | 'brightness' | 'contrast' | 'saturation' | 'rgbShift';

export type EffectParam = {
  id: string;
  type: EffectType;
  label: string;
  intensity: number;     // 0-100
  enabled: boolean;
  // エフェクト固有パラメータ
  extra?: Record<string, number | string>;
};

export type EffectChain = EffectParam[];

// プリセットスタイル
export const STYLE_PRESETS: Record<string, { label: string; desc: string; chain: EffectChain }> = {
  manga: {
    label: '漫画風',
    desc: '高コントラスト + エッジ検出 + ハーフトーン',
    chain: [
      { id: 'e1', type: 'contrast', label: 'コントラスト', intensity: 60, enabled: true },
      { id: 'e2', type: 'edgeDetect', label: 'エッジ検出', intensity: 40, enabled: true },
      { id: 'e3', type: 'threshold', label: '閾値', intensity: 50, enabled: true },
      { id: 'e4', type: 'halftone', label: 'ハーフトーン', intensity: 30, enabled: true },
    ],
  },
  cyberpunk: {
    label: 'サイバーパンク',
    desc: 'RGBシフト + グリッチ + スキャンライン + 彩度強調',
    chain: [
      { id: 'e1', type: 'saturation', label: '彩度', intensity: 70, enabled: true },
      { id: 'e2', type: 'contrast', label: 'コントラスト', intensity: 40, enabled: true },
      { id: 'e3', type: 'rgbShift', label: 'RGBシフト', intensity: 50, enabled: true },
      { id: 'e4', type: 'glitch', label: 'グリッチ', intensity: 35, enabled: true },
      { id: 'e5', type: 'scanlines', label: 'スキャンライン', intensity: 25, enabled: true },
    ],
  },
  retro: {
    label: 'レトロ',
    desc: 'セピア + ノイズ + 低彩度',
    chain: [
      { id: 'e1', type: 'sepia', label: 'セピア', intensity: 60, enabled: true },
      { id: 'e2', type: 'brightness', label: '明るさ', intensity: 55, enabled: true },
      { id: 'e3', type: 'noise', label: 'ノイズ', intensity: 40, enabled: true },
      { id: 'e4', type: 'contrast', label: 'コントラスト', intensity: 35, enabled: true },
    ],
  },
  poster: {
    label: 'ポスター',
    desc: 'ポスタリゼーション + 高彩度 + コントラスト',
    chain: [
      { id: 'e1', type: 'saturation', label: '彩度', intensity: 80, enabled: true },
      { id: 'e2', type: 'contrast', label: 'コントラスト', intensity: 50, enabled: true },
      { id: 'e3', type: 'posterize', label: 'ポスタリゼーション', intensity: 60, enabled: true },
    ],
  },
  noir: {
    label: 'ノワール',
    desc: 'モノクロ + 高コントラスト + ノイズ',
    chain: [
      { id: 'e1', type: 'grayscale', label: 'グレースケール', intensity: 100, enabled: true },
      { id: 'e2', type: 'contrast', label: 'コントラスト', intensity: 70, enabled: true },
      { id: 'e3', type: 'brightness', label: '明るさ', intensity: 40, enabled: true },
      { id: 'e4', type: 'noise', label: 'ノイズ', intensity: 20, enabled: true },
    ],
  },
  pixel: {
    label: 'ピクセル',
    desc: 'ピクセル化 + ポスタリゼーション',
    chain: [
      { id: 'e1', type: 'pixelate', label: 'ピクセル化', intensity: 50, enabled: true },
      { id: 'e2', type: 'posterize', label: 'ポスタリゼーション', intensity: 40, enabled: true },
      { id: 'e3', type: 'saturation', label: '彩度', intensity: 65, enabled: true },
    ],
  },
  duotone_blue: {
    label: 'デュオトーン（青）',
    desc: '2色マッピング（暗部→紺、明部→水色）',
    chain: [
      { id: 'e1', type: 'grayscale', label: 'グレースケール', intensity: 100, enabled: true },
      { id: 'e2', type: 'duotone', label: 'デュオトーン', intensity: 80, enabled: true, extra: { dark: '#1a1a4e', light: '#64b5f6' } },
      { id: 'e3', type: 'contrast', label: 'コントラスト', intensity: 30, enabled: true },
    ],
  },
};

// 全エフェクトのリスト（AIが選択するため）
export const ALL_EFFECTS: { type: EffectType; label: string; desc: string }[] = [
  { type: 'grayscale', label: 'グレースケール', desc: 'モノクロ変換' },
  { type: 'sepia', label: 'セピア', desc: '暖色系のヴィンテージ調' },
  { type: 'invert', label: '反転', desc: '色の反転（ネガ）' },
  { type: 'posterize', label: 'ポスタリゼーション', desc: '色数を減らしてポスター風に' },
  { type: 'halftone', label: 'ハーフトーン', desc: '印刷風のドットパターン' },
  { type: 'edgeDetect', label: 'エッジ検出', desc: '輪郭線を抽出' },
  { type: 'pixelate', label: 'ピクセル化', desc: 'モザイク風に荒くする' },
  { type: 'glitch', label: 'グリッチ', desc: 'デジタルノイズ・行ズレ' },
  { type: 'duotone', label: 'デュオトーン', desc: '2色でマッピング' },
  { type: 'noise', label: 'ノイズ', desc: 'フィルムグレイン風のノイズ' },
  { type: 'threshold', label: '閾値', desc: '白黒2値化' },
  { type: 'scanlines', label: 'スキャンライン', desc: 'CRTモニター風の走査線' },
  { type: 'brightness', label: '明るさ', desc: '明るさ調整' },
  { type: 'contrast', label: 'コントラスト', desc: 'コントラスト調整' },
  { type: 'saturation', label: '彩度', desc: '色の鮮やかさ調整' },
  { type: 'rgbShift', label: 'RGBシフト', desc: '色チャンネルをずらす' },
];

// === エフェクト適用エンジン ===

export function applyEffectChain(
  sourceCanvas: HTMLCanvasElement,
  chain: EffectChain,
): HTMLCanvasElement {
  // 作業用Canvasを作成
  const workCanvas = document.createElement('canvas');
  workCanvas.width = sourceCanvas.width;
  workCanvas.height = sourceCanvas.height;
  const workCtx = workCanvas.getContext('2d')!;
  workCtx.drawImage(sourceCanvas, 0, 0);

  for (const effect of chain) {
    if (!effect.enabled || effect.intensity === 0) continue;
    applyEffect(workCanvas, workCtx, effect);
  }

  return workCanvas;
}

function applyEffect(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  effect: EffectParam,
) {
  const w = canvas.width;
  const h = canvas.height;
  const t = effect.intensity / 100; // 0-1 normalized

  switch (effect.type) {
    case 'grayscale': applyGrayscale(ctx, w, h, t); break;
    case 'sepia': applySepia(ctx, w, h, t); break;
    case 'invert': applyInvert(ctx, w, h, t); break;
    case 'posterize': applyPosterize(ctx, w, h, t); break;
    case 'halftone': applyHalftone(canvas, ctx, w, h, t); break;
    case 'edgeDetect': applyEdgeDetect(ctx, w, h, t); break;
    case 'pixelate': applyPixelate(ctx, w, h, t); break;
    case 'glitch': applyGlitch(ctx, w, h, t); break;
    case 'duotone': applyDuotone(ctx, w, h, t, effect.extra); break;
    case 'noise': applyNoise(ctx, w, h, t); break;
    case 'threshold': applyThreshold(ctx, w, h, t); break;
    case 'scanlines': applyScanlines(ctx, w, h, t); break;
    case 'brightness': applyBrightness(ctx, w, h, t); break;
    case 'contrast': applyContrast(ctx, w, h, t); break;
    case 'saturation': applySaturation(ctx, w, h, t); break;
    case 'rgbShift': applyRgbShift(canvas, ctx, w, h, t); break;
  }
}

// --- 各エフェクト実装 ---

function applyGrayscale(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i] + (gray - d[i]) * t;
    d[i + 1] = d[i + 1] + (gray - d[i + 1]) * t;
    d[i + 2] = d[i + 2] + (gray - d[i + 2]) * t;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applySepia(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    d[i] = r + (sr - r) * t;
    d[i + 1] = g + (sg - g) * t;
    d[i + 2] = b + (sb - b) * t;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyInvert(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (255 - 2 * d[i]) * t;
    d[i + 1] = d[i + 1] + (255 - 2 * d[i + 1]) * t;
    d[i + 2] = d[i + 2] + (255 - 2 * d[i + 2]) * t;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyPosterize(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const levels = Math.max(2, Math.round(16 - t * 14)); // 16→2 levels
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(Math.round(d[i] / step) * step);
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyHalftone(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const dotSize = Math.max(2, Math.round(t * 12 + 2)); // 2-14px
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // 元データを保存
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w; tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += dotSize) {
    for (let x = 0; x < w; x += dotSize) {
      const idx = (y * w + x) * 4;
      const gray = (d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114) / 255;
      const radius = (1 - gray) * dotSize * 0.5;
      if (radius > 0.5) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(x + dotSize / 2, y + dotSize / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function applyEdgeDetect(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;

  // Sobel operator
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      // Grayscale neighbors
      const tl = src[((y - 1) * w + (x - 1)) * 4] * 0.299 + src[((y - 1) * w + (x - 1)) * 4 + 1] * 0.587 + src[((y - 1) * w + (x - 1)) * 4 + 2] * 0.114;
      const tc = src[((y - 1) * w + x) * 4] * 0.299 + src[((y - 1) * w + x) * 4 + 1] * 0.587 + src[((y - 1) * w + x) * 4 + 2] * 0.114;
      const tr = src[((y - 1) * w + (x + 1)) * 4] * 0.299 + src[((y - 1) * w + (x + 1)) * 4 + 1] * 0.587 + src[((y - 1) * w + (x + 1)) * 4 + 2] * 0.114;
      const ml = src[(y * w + (x - 1)) * 4] * 0.299 + src[(y * w + (x - 1)) * 4 + 1] * 0.587 + src[(y * w + (x - 1)) * 4 + 2] * 0.114;
      const mr = src[(y * w + (x + 1)) * 4] * 0.299 + src[(y * w + (x + 1)) * 4 + 1] * 0.587 + src[(y * w + (x + 1)) * 4 + 2] * 0.114;
      const bl = src[((y + 1) * w + (x - 1)) * 4] * 0.299 + src[((y + 1) * w + (x - 1)) * 4 + 1] * 0.587 + src[((y + 1) * w + (x - 1)) * 4 + 2] * 0.114;
      const bc = src[((y + 1) * w + x) * 4] * 0.299 + src[((y + 1) * w + x) * 4 + 1] * 0.587 + src[((y + 1) * w + x) * 4 + 2] * 0.114;
      const br = src[((y + 1) * w + (x + 1)) * 4] * 0.299 + src[((y + 1) * w + (x + 1)) * 4 + 1] * 0.587 + src[((y + 1) * w + (x + 1)) * 4 + 2] * 0.114;

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const edge = Math.min(255, Math.sqrt(gx * gx + gy * gy));

      const orig = src[idx] * 0.299 + src[idx + 1] * 0.587 + src[idx + 2] * 0.114;
      const val = orig + (edge - orig) * t;
      d[idx] = val;
      d[idx + 1] = val;
      d[idx + 2] = val;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyPixelate(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const blockSize = Math.max(2, Math.round(t * 30 + 2)); // 2-32px
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  for (let y = 0; y < h; y += blockSize) {
    for (let x = 0; x < w; x += blockSize) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          r += d[idx]; g += d[idx + 1]; b += d[idx + 2];
          count++;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          d[idx] = r; d[idx + 1] = g; d[idx + 2] = b;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyGlitch(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const sliceCount = Math.round(t * 20 + 3); // 3-23 slices

  for (let s = 0; s < sliceCount; s++) {
    const y = Math.floor(Math.random() * h);
    const sliceH = Math.floor(Math.random() * 20 + 2);
    const shift = Math.floor((Math.random() - 0.5) * t * 60);

    for (let dy = 0; dy < sliceH && y + dy < h; dy++) {
      for (let x = 0; x < w; x++) {
        const srcX = Math.max(0, Math.min(w - 1, x - shift));
        const dstIdx = ((y + dy) * w + x) * 4;
        const srcIdx = ((y + dy) * w + srcX) * 4;
        d[dstIdx] = d[srcIdx];
        d[dstIdx + 1] = d[srcIdx + 1];
        d[dstIdx + 2] = d[srcIdx + 2];
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyDuotone(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, extra?: Record<string, number | string>) {
  const darkHex = (extra?.dark as string) || '#1a1a4e';
  const lightHex = (extra?.light as string) || '#64b5f6';
  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const dr = dark.r + (light.r - dark.r) * gray;
    const dg = dark.g + (light.g - dark.g) * gray;
    const db = dark.b + (light.b - dark.b) * gray;
    d[i] = d[i] + (dr - d[i]) * t;
    d[i + 1] = d[i + 1] + (dg - d[i + 1]) * t;
    d[i + 2] = d[i + 2] + (db - d[i + 2]) * t;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyNoise(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const amount = t * 80; // max 80 noise range
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + noise));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyThreshold(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const thresh = t * 255; // 0-255
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const val = gray >= thresh ? 255 : 0;
    d[i] = val; d[i + 1] = val; d[i + 2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const gap = Math.max(2, Math.round(6 - t * 4)); // 6→2 line gap
  const alpha = t * 0.6;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += gap) {
    ctx.fillRect(0, y, w, 1);
  }
}

function applyBrightness(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const amount = (t - 0.5) * 200; // -100 to +100
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, d[i] + amount));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + amount));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + amount));
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyContrast(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const factor = (t * 4 + 1); // 1x - 5x contrast
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, factor * (d[i] - 128) + 128));
    d[i + 1] = Math.max(0, Math.min(255, factor * (d[i + 1] - 128) + 128));
    d[i + 2] = Math.max(0, Math.min(255, factor * (d[i + 2] - 128) + 128));
  }
  ctx.putImageData(imageData, 0, 0);
}

function applySaturation(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const amount = t * 3; // 0x - 3x saturation
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = Math.max(0, Math.min(255, gray + (d[i] - gray) * amount));
    d[i + 1] = Math.max(0, Math.min(255, gray + (d[i + 1] - gray) * amount));
    d[i + 2] = Math.max(0, Math.min(255, gray + (d[i + 2] - gray) * amount));
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyRgbShift(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const shift = Math.round(t * 15 + 1); // 1-16px
  const imageData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Red channel shifted left
      const rxSrc = Math.max(0, Math.min(w - 1, x - shift));
      d[idx] = src[(y * w + rxSrc) * 4];
      // Green stays
      d[idx + 1] = src[idx + 1];
      // Blue channel shifted right
      const bxSrc = Math.max(0, Math.min(w - 1, x + shift));
      d[idx + 2] = src[(y * w + bxSrc) * 4 + 2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// --- ユーティリティ ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// 画像をCanvasに読み込む（最大サイズ制限付き）
export function loadImageToCanvas(
  file: File,
  maxSize = 1200,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}
