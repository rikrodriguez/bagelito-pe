import { createRandom, hashSeed } from './seededRandom';
import type {
  FeatureMap, FrameOverlay, OverlayConnection, OverlayLabel,
  PersistentBoxRenderData, VisionConfig,
} from './types';

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makeLabel(random: () => number, x: number, y: number, score: number, index: number) {
  const options = [
    `X ${x.toFixed(3).replace('0.', '.')}`,
    `Y ${y.toFixed(3).replace('0.', '.')}`,
    `IDX ${String(index).padStart(3, '0')}`,
    `S ${score.toFixed(2).replace('0.', '.')}`,
    `F ${String(Math.floor(random() * 999)).padStart(3, '0')}`,
    `A${String(Math.floor(random() * 28)).padStart(2, '0')}`,
    `C ${Math.min(0.99, score + random() * 0.12).toFixed(2)}`,
  ];
  return options[Math.floor(random() * options.length)];
}

export function generateFrameOverlay(
  featureMap: FeatureMap,
  settings: VisionConfig,
  frameSeed: number,
  frameBucket: number,
  boxes: PersistentBoxRenderData[] = [],
): FrameOverlay {
  const random = createRandom(hashSeed(
    settings.seed, frameSeed, Math.round(settings.chaos), Math.round(settings.density),
    Math.round(settings.connectionAmount), Math.round(settings.labelAmount),
  ));
  const densityChance = 0.18 + settings.density * 0.0075;
  const jitter = (settings.chaos / 100) * 0.009;
  const selected = featureMap.features
    .filter((feature, index) => index < 5 || random() < densityChance)
    .map((feature) => ({
      ...feature,
      x: Math.max(0, Math.min(1, feature.x + (random() - 0.5) * jitter)),
      y: Math.max(0, Math.min(1, feature.y + (random() - 0.5) * jitter)),
    }));

  const anchors = selected.map((feature) => {
    const kindRoll = random();
    const kind = kindRoll < 0.5 ? 'point' : kindRoll < 0.78 ? 'cross' : 'square';
    return {
      ...feature,
      kind: kind as 'point' | 'cross' | 'square',
      size: settings.pointSize * (0.7 + random() * 0.75),
    };
  });

  const lines: OverlayConnection[] = [];
  if (settings.connectionsEnabled) {
    const maximum = settings.connectionDistance / 1000;
    for (let i = 0; i < selected.length; i += 1) {
      let localConnections = 0;
      for (let j = i + 1; j < selected.length; j += 1) {
        const a = selected[i];
        const b = selected[j];
        const distance = Math.hypot(a.x - b.x, (a.y - b.y) * 0.7);
        if (distance < maximum && random() < settings.connectionAmount / 155) {
          lines.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, alpha: 0.35 + random() * 0.45 });
          localConnections += 1;
        }
        if (localConnections >= 2) break;
      }
    }
  }

  const brackets = selected
    .filter(() => random() < settings.bracketAmount / 170)
    .map((feature) => ({ x: feature.x, y: feature.y, size: 0.014 + random() * 0.018 }));

  const labels: OverlayLabel[] = [];
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  const candidates = [...selected].sort((a, b) => b.score - a.score);
  for (let index = 0; index < candidates.length; index += 1) {
    const feature = candidates[index];
    if (random() > settings.labelAmount / 145) continue;
    const align = feature.x > 0.72 ? 'right' : 'left';
    const text = makeLabel(random, feature.x, feature.y, feature.score, index);
    const offsetX = (0.012 + random() * 0.016) * (align === 'left' ? 1 : -1);
    const offsetY = (random() - 0.5) * 0.035;
    const width = text.length * settings.labelSize * 0.00065;
    const rect = { x: feature.x + offsetX - (align === 'right' ? width : 0), y: feature.y + offsetY - 0.012, w: width, h: 0.025 };
    const boxCollision = boxes.some((box) => overlaps(rect, { x: box.x, y: box.y, w: box.width, h: box.height }));
    if (!boxCollision && occupied.every((other) => !overlaps(rect, other))) {
      labels.push({ x: feature.x + offsetX, y: feature.y + offsetY, text, align, priority: feature.score });
      occupied.push(rect);
    }
    if (labels.length >= Math.max(2, Math.round(settings.labelAmount / 8))) break;
  }

  return { anchors, lines, labels, brackets, boxes, featureCount: featureMap.features.length, frameBucket };
}
