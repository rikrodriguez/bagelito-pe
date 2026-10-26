import type { FeatureMap, FeaturePoint, VisionConfig } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface AnalysisResult {
  featureMap: FeatureMap;
  luma: Float32Array;
}

export function analyzeFrame(
  image: ImageData,
  config: VisionConfig,
  previousLuma?: Float32Array,
): AnalysisResult {
  const { width, height, data } = image;
  const luma = new Float32Array(width * height);
  let totalLuma = 0;

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const value = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    luma[pixel] = value;
    totalLuma += value;
  }

  const cellSize = Math.max(4, Math.round(12 - config.detail * 0.075));
  const candidates: FeaturePoint[] = [];
  const threshold = 0.08 + (config.threshold / 100) * 0.46;

  for (let cy = cellSize; cy < height - cellSize; cy += cellSize) {
    for (let cx = cellSize; cx < width - cellSize; cx += cellSize) {
      let sum = 0;
      let sumSquares = 0;
      let edgeSum = 0;
      let motionSum = 0;
      let count = 0;
      const half = Math.max(2, Math.floor(cellSize / 2));

      for (let y = cy - half; y <= cy + half; y += 2) {
        for (let x = cx - half; x <= cx + half; x += 2) {
          const index = y * width + x;
          const value = luma[index];
          sum += value;
          sumSquares += value * value;
          const gx = Math.abs(luma[index + 1] - luma[index - 1]);
          const gy = Math.abs(luma[index + width] - luma[index - width]);
          edgeSum += gx + gy;
          if (previousLuma?.length === luma.length) motionSum += Math.abs(value - previousLuma[index]);
          count += 1;
        }
      }

      const mean = sum / count;
      const variance = Math.max(0, sumSquares / count - mean * mean);
      const contrast = clamp01(Math.sqrt(variance) / 62);
      const edge = clamp01(edgeSum / count / 72);
      const bright = clamp01((mean - 118) / 117);
      const dark = clamp01((142 - mean) / 122);
      const motion = clamp01(motionSum / count / 45);
      const signals = { contrast, edge, bright, dark, motion };
      let score = 0;

      switch (config.mode) {
        case 'contrast': score = contrast; break;
        case 'edges': score = edge; break;
        case 'bright': score = bright * 0.72 + edge * 0.28; break;
        case 'dark': score = dark * 0.72 + edge * 0.28; break;
        case 'motion': score = motion * 0.78 + edge * 0.22; break;
        default: {
          const motionWeight = 0.04 + (config.motionBias / 100) * 0.22;
          score = contrast * 0.48 + edge * (0.48 - motionWeight) + motion * motionWeight;
        }
      }

      if (score >= threshold) {
        candidates.push({ x: cx / width, y: cy / height, score: clamp01(score), ...signals });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const features: FeaturePoint[] = [];
  const minDistance = Math.max(0.012, config.minDistance / 920);
  for (const candidate of candidates) {
    const spaced = features.every((point) => {
      const dx = candidate.x - point.x;
      const dy = (candidate.y - point.y) * (height / width);
      return Math.hypot(dx, dy) >= minDistance;
    });
    if (spaced) features.push(candidate);
    if (features.length >= config.maxPoints) break;
  }

  return {
    featureMap: { width, height, features, averageLuma: totalLuma / luma.length / 255 },
    luma,
  };
}
