import type { FramingMode } from './types';

export interface VideoGeometry {
  scale: number; offsetX: number; offsetY: number; sourceWidth: number;
  sourceHeight: number; stageWidth: number; stageHeight: number;
}

export type ResolvedFraming = 'fit' | 'fill';

export function resolveFraming(sourceWidth: number, sourceHeight: number, stageWidth: number, stageHeight: number, framing: FramingMode): ResolvedFraming {
  if (framing !== 'auto') return framing;
  const sourceIsLandscape = sourceWidth / Math.max(1, sourceHeight) >= 1;
  const stageIsLandscape = stageWidth / Math.max(1, stageHeight) >= 1;
  return sourceIsLandscape === stageIsLandscape ? 'fill' : 'fit';
}

export function getVideoGeometry(sourceWidth: number, sourceHeight: number, stageWidth: number, stageHeight: number, framing: FramingMode): VideoGeometry {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const resolved = resolveFraming(safeSourceWidth, safeSourceHeight, stageWidth, stageHeight, framing);
  const scale = resolved === 'fill'
    ? Math.max(stageWidth / safeSourceWidth, stageHeight / safeSourceHeight)
    : Math.min(stageWidth / safeSourceWidth, stageHeight / safeSourceHeight);
  return { scale, offsetX: (stageWidth - safeSourceWidth * scale) / 2, offsetY: (stageHeight - safeSourceHeight * scale) / 2, sourceWidth: safeSourceWidth, sourceHeight: safeSourceHeight, stageWidth, stageHeight };
}

export function mapVideoPoint(x: number, y: number, geometry: VideoGeometry) {
  return { x: geometry.offsetX + x * geometry.sourceWidth * geometry.scale, y: geometry.offsetY + y * geometry.sourceHeight * geometry.scale };
}

export function mapVideoLength(normalized: number, geometry: VideoGeometry) {
  return normalized * Math.min(geometry.sourceWidth, geometry.sourceHeight) * geometry.scale;
}
