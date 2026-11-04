import { DEBUG_VISION } from './config';
import { getVideoGeometry, mapVideoLength, mapVideoPoint } from './videoGeometry';
import type { FrameOverlay, VisionConfig } from './types';

interface RenderOptions {
  sourceWidth: number;
  sourceHeight: number;
  stageWidth: number;
  stageHeight: number;
  transitionAlpha: number;
}

function inStage(x: number, y: number, width: number, height: number) {
  return x > -30 && y > -30 && x < width + 30 && y < height + 30;
}

export function renderOverlay(
  canvas: HTMLCanvasElement,
  overlay: FrameOverlay | null,
  config: VisionConfig,
  options: RenderOptions,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(options.stageWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(options.stageHeight * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, options.stageWidth, options.stageHeight);
  if (!overlay) return;

  const geometry = getVideoGeometry(
    options.sourceWidth, options.sourceHeight, options.stageWidth, options.stageHeight, config.framing,
  );
  const masterAlpha = (config.overlayOpacity / 100) * options.transitionAlpha;
  context.lineCap = 'square';
  context.lineJoin = 'miter';

  const drawGeometry = (color: string, lineWidth: number, alphaMultiplier: number) => {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = masterAlpha * alphaMultiplier;

    for (const line of overlay.lines) {
      const a = mapVideoPoint(line.ax, line.ay, geometry);
      const b = mapVideoPoint(line.bx, line.by, geometry);
      if (!inStage(a.x, a.y, options.stageWidth, options.stageHeight) && !inStage(b.x, b.y, options.stageWidth, options.stageHeight)) continue;
      context.globalAlpha = masterAlpha * alphaMultiplier * line.alpha;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    context.globalAlpha = masterAlpha * alphaMultiplier;
    for (const anchor of overlay.anchors) {
      const point = mapVideoPoint(anchor.x, anchor.y, geometry);
      if (!inStage(point.x, point.y, options.stageWidth, options.stageHeight)) continue;
      const size = Math.max(1, anchor.size);
      context.save();
      context.translate(point.x, point.y);
      if (anchor.kind === 'point') {
        context.beginPath();
        context.arc(0, 0, size * 0.72, 0, Math.PI * 2);
        context.fill();
      } else if (anchor.kind === 'cross') {
        context.beginPath();
        context.moveTo(-size * 1.8, 0); context.lineTo(size * 1.8, 0);
        context.moveTo(0, -size * 1.8); context.lineTo(0, size * 1.8);
        context.stroke();
      } else {
        context.strokeRect(-size, -size, size * 2, size * 2);
      }
      context.restore();
    }

    for (const bracket of overlay.brackets) {
      const point = mapVideoPoint(bracket.x, bracket.y, geometry);
      if (!inStage(point.x, point.y, options.stageWidth, options.stageHeight)) continue;
      const size = mapVideoLength(bracket.size, geometry);
      context.save();
      context.translate(point.x, point.y);
      context.beginPath();
      context.moveTo(-size, -size * 0.3); context.lineTo(-size, -size); context.lineTo(-size * 0.3, -size);
      context.moveTo(size * 0.3, size); context.lineTo(size, size); context.lineTo(size, size * 0.3);
      context.stroke();
      context.restore();
    }

    const boxAlpha = config.boxStrength / 100;
    for (const box of overlay.boxes) {
      const topLeft = mapVideoPoint(box.x, box.y, geometry);
      const bottomRight = mapVideoPoint(box.x + box.width, box.y + box.height, geometry);
      const width = bottomRight.x - topLeft.x;
      const height = bottomRight.y - topLeft.y;
      if (width <= 0 || height <= 0) continue;
      const corner = Math.min(18, width * 0.24, height * 0.24);
      context.globalAlpha = masterAlpha * alphaMultiplier * boxAlpha;
      context.beginPath();
      context.moveTo(topLeft.x, topLeft.y + corner); context.lineTo(topLeft.x, topLeft.y); context.lineTo(topLeft.x + corner, topLeft.y);
      context.moveTo(topLeft.x + width - corner, topLeft.y); context.lineTo(topLeft.x + width, topLeft.y); context.lineTo(topLeft.x + width, topLeft.y + corner);
      context.moveTo(topLeft.x + width, topLeft.y + height - corner); context.lineTo(topLeft.x + width, topLeft.y + height); context.lineTo(topLeft.x + width - corner, topLeft.y + height);
      context.moveTo(topLeft.x + corner, topLeft.y + height); context.lineTo(topLeft.x, topLeft.y + height); context.lineTo(topLeft.x, topLeft.y + height - corner);
      context.stroke();
      context.beginPath();
      context.moveTo(topLeft.x + width, topLeft.y + 8);
      context.lineTo(topLeft.x + width + 13, topLeft.y + 8);
      context.stroke();
    }
  };

  const red = Number.parseInt(config.overlayColor.slice(1, 3), 16);
  const green = Number.parseInt(config.overlayColor.slice(3, 5), 16);
  const blue = Number.parseInt(config.overlayColor.slice(5, 7), 16);
  const colorLuma = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
  const assistColor = colorLuma > 0.55 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.82)';

  if (config.contrastAssist) drawGeometry(assistColor, config.lineWeight + 1.15, 0.2);
  drawGeometry(config.overlayColor, config.lineWeight, 1);

  context.font = `500 ${config.labelSize}px Manrope, Arial, sans-serif`;
  context.textBaseline = 'middle';
  for (const label of overlay.labels) {
    const point = mapVideoPoint(label.x, label.y, geometry);
    if (!inStage(point.x, point.y, options.stageWidth, options.stageHeight)) continue;
    context.textAlign = label.align;
    context.globalAlpha = masterAlpha * 0.92;
    if (config.contrastAssist) {
      context.lineWidth = 2.4;
      context.strokeStyle = assistColor;
      context.globalAlpha = masterAlpha * 0.24;
      context.strokeText(label.text, point.x, point.y);
    }
    context.globalAlpha = masterAlpha * 0.92;
    context.fillStyle = config.overlayColor;
    context.fillText(label.text, point.x, point.y);
  }

  for (const box of overlay.boxes) {
    const point = mapVideoPoint(box.x + box.width, box.y, geometry);
    context.textAlign = 'left';
    context.font = `500 ${Math.max(8, config.labelSize - 1)}px Manrope, Arial, sans-serif`;
    context.globalAlpha = masterAlpha * config.boxStrength / 100;
    context.fillStyle = config.overlayColor;
    context.fillText(`B${String(box.id).padStart(2, '0')}  ${box.confidence.toFixed(2)}`, point.x + 5, point.y - 5);
  }

  if (DEBUG_VISION) {
    context.globalAlpha = 0.9;
    context.fillStyle = '#00ff88';
    context.font = '11px monospace';
    context.textAlign = 'left';
    context.fillText(`${config.analysisFPS} SPS  /  ${overlay.featureCount} FEATURES  /  F ${overlay.frameBucket}`, 12, 18);
  }
  context.globalAlpha = 1;
}
