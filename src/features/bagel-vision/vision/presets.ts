import { EDITORIAL_CONFIG } from './config';
import type { VisionConfig } from './types';

export type PresetName = 'Editorial' | 'Dense' | 'Sparse' | 'Signal';

export const PRESETS: Record<PresetName, VisionConfig> = {
  Editorial: { ...EDITORIAL_CONFIG },
  Dense: { ...EDITORIAL_CONFIG, threshold: 38, maxPoints: 74, minDistance: 28, density: 72, connectionAmount: 42, labelAmount: 34, bracketAmount: 35 },
  Sparse: { ...EDITORIAL_CONFIG, threshold: 57, maxPoints: 28, minDistance: 58, density: 34, connectionAmount: 14, labelAmount: 12, bracketAmount: 12 },
  Signal: { ...EDITORIAL_CONFIG, mode: 'edges', threshold: 42, density: 58, chaos: 48, connectionAmount: 19, labelAmount: 38, bracketAmount: 30, pointSize: 1.6 },
};

function differentInteger(min: number, max: number, current: number) {
  if (max <= min) return min;
  let next = current;
  while (next === current) next = Math.floor(min + Math.random() * (max - min + 1));
  return next;
}

function differentStep(min: number, max: number, step: number, current: number) {
  const steps = Math.round((max - min) / step);
  let next = current;
  while (next === current) next = Number((min + differentInteger(0, steps, Math.round((current - min) / step)) * step).toFixed(2));
  return next;
}

function differentChoice<T>(choices: readonly T[], current: T) {
  const alternatives = choices.filter((choice) => choice !== current);
  return alternatives[Math.floor(Math.random() * alternatives.length)] ?? current;
}

export function randomizeLook(config: VisionConfig): VisionConfig {
  const analysisModes: VisionConfig['mode'][] = ['combined', 'contrast', 'edges', 'bright', 'dark', 'motion'];
  return {
    ...config,
    mode: differentChoice(analysisModes, config.mode),
    threshold: differentInteger(10, 85, config.threshold),
    detail: differentInteger(10, 100, config.detail),
    maxPoints: differentInteger(8, 100, config.maxPoints),
    minDistance: differentInteger(12, 90, config.minDistance),
    motionBias: differentInteger(0, 100, config.motionBias),
    density: differentInteger(10, 100, config.density),
    chaos: differentInteger(0, 100, config.chaos),
    connectionsEnabled: !config.connectionsEnabled,
    connectionDistance: differentInteger(40, 240, config.connectionDistance),
    connectionAmount: differentInteger(0, 100, config.connectionAmount),
    labelAmount: differentInteger(0, 100, config.labelAmount),
    bracketAmount: differentInteger(0, 100, config.bracketAmount),
    overlayOpacity: differentInteger(20, 100, config.overlayOpacity),
    lineWeight: differentStep(0.5, 2, 0.1, config.lineWeight),
    pointSize: differentStep(1, 5, 0.1, config.pointSize),
    labelSize: differentInteger(7, 14, config.labelSize),
    contrastAssist: !config.contrastAssist,
    analysisFPS: differentInteger(2, 15, config.analysisFPS),
    seed: differentInteger(1, 999999, config.seed),
    boxesEnabled: !config.boxesEnabled,
    boxCount: differentInteger(0, 4, config.boxCount),
    boxHold: differentStep(200, 2200, 50, config.boxHold),
    boxSmoothness: differentInteger(0, 100, config.boxSmoothness),
    boxStrength: differentInteger(10, 100, config.boxStrength),
  };
}
