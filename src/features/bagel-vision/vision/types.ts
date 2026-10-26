export type AnalysisMode = 'combined' | 'contrast' | 'edges' | 'bright' | 'dark' | 'motion';
export type FramingMode = 'auto' | 'fit' | 'fill';
export type ImageMode = 'original' | 'mono' | 'invert' | 'contrast';

export interface VisionConfig {
  framing: FramingMode;
  overlayColor: string;
  imageMode: ImageMode;
  mode: AnalysisMode;
  threshold: number;
  detail: number;
  maxPoints: number;
  minDistance: number;
  motionBias: number;
  density: number;
  chaos: number;
  connectionsEnabled: boolean;
  connectionDistance: number;
  connectionAmount: number;
  labelAmount: number;
  bracketAmount: number;
  overlayOpacity: number;
  lineWeight: number;
  pointSize: number;
  labelSize: number;
  contrastAssist: boolean;
  analysisFPS: number;
  seed: number;
  boxesEnabled: boolean;
  boxCount: number;
  boxHold: number;
  boxSmoothness: number;
  boxStrength: number;
}

export interface FeaturePoint {
  x: number;
  y: number;
  score: number;
  contrast: number;
  edge: number;
  bright: number;
  dark: number;
  motion: number;
}

export interface FeatureMap {
  width: number;
  height: number;
  features: FeaturePoint[];
  averageLuma: number;
}

export type AnchorKind = 'point' | 'cross' | 'square';

export interface OverlayAnchor extends FeaturePoint {
  kind: AnchorKind;
  size: number;
}

export interface OverlayConnection {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  alpha: number;
}

export interface OverlayLabel {
  x: number;
  y: number;
  text: string;
  align: 'left' | 'right';
  priority: number;
}

export interface OverlayBracket {
  x: number;
  y: number;
  size: number;
}

export interface PersistentBoxRenderData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  age: number;
  lastSeen: number;
}

export interface FrameOverlay {
  anchors: OverlayAnchor[];
  lines: OverlayConnection[];
  labels: OverlayLabel[];
  brackets: OverlayBracket[];
  boxes: PersistentBoxRenderData[];
  featureCount: number;
  frameBucket: number;
}
