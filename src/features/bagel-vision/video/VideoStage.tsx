'use client';

import { useEffect, useRef, useState } from 'react';
import { BoxTracker } from '../vision/boxTracker';
import { analyzeFrame } from '../vision/featureAnalyzer';
import { generateFrameOverlay } from '../vision/overlayGenerator';
import { renderOverlay } from '../vision/overlayRenderer';
import { hashSeed } from '../vision/seededRandom';
import type { FrameOverlay, VisionConfig } from '../vision/types';
import { getVideoGeometry, resolveFraming, type ResolvedFraming } from '../vision/videoGeometry';

interface VideoStageProps {
  config: VisionConfig;
  layerActive: boolean;
  source: string;
  exportName: string;
  exportRequest: number;
  onExportStatus: (state: ExportStatus) => void;
  onReadyChange: (ready: boolean) => void;
}

export interface ExportStatus {
  status: 'idle' | 'recording' | 'done' | 'error';
  progress: number;
  message?: string;
}

const EXPORT_DURATION_MS = 5000;
const EXPORT_FPS = 30;
const EXPORT_LONG_EDGE = 1920;

function imageFilter(mode: VisionConfig['imageMode']) {
  if (mode === 'mono') return 'grayscale(1) contrast(1.08)';
  if (mode === 'invert') return 'grayscale(1) invert(1) contrast(1.12) brightness(1.04)';
  if (mode === 'contrast') return 'saturate(.25) contrast(1.55) brightness(.92)';
  return 'none';
}

function exportFormat() {
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  return candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
}

function safeExportName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return base || 'source';
}

export function VideoStage({ config, layerActive, source, exportName, exportRequest, onExportStatus, onReadyChange }: VideoStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousLumaRef = useRef<Float32Array | undefined>(undefined);
  const overlayDataRef = useRef<FrameOverlay | null>(null);
  const trackerRef = useRef(new BoxTracker());
  const snapshotStartedRef = useRef(0);
  const lastBucketRef = useRef(-1);
  const configRef = useRef(config);
  const layerRef = useRef(layerActive);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resolvedFraming, setResolvedFraming] = useState<ResolvedFraming>('fill');

  useEffect(() => {
    configRef.current = config;
    // Re-analyze the current frame immediately, including while the video is paused.
    lastBucketRef.current = -1;
  }, [config]);
  useEffect(() => { layerRef.current = layerActive; }, [layerActive]);
  useEffect(() => { onReadyChange(ready); }, [ready, onReadyChange]);
  useEffect(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    const updateFraming = () => {
      const rect = stage.getBoundingClientRect();
      const next = resolveFraming(video.videoWidth || 16, video.videoHeight || 9, rect.width, rect.height, config.framing);
      setResolvedFraming((current) => current === next ? current : next);
    };
    const observer = new ResizeObserver(updateFraming);
    observer.observe(stage);
    video.addEventListener('loadedmetadata', updateFraming);
    updateFraming();
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', updateFraming);
    };
  }, [config.framing, source]);
  useEffect(() => {
    previousLumaRef.current = undefined;
    overlayDataRef.current = null;
    trackerRef.current = new BoxTracker();
    lastBucketRef.current = -1;
    setReady(false);
    setLoadError('');
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    const canvas = overlayRef.current;
    if (!video || !stage || !canvas) return;
    let animationFrame = 0;
    let disposed = false;

    const tick = (now: number) => {
      if (disposed) return;
      const currentConfig = configRef.current;
      const bucket = Math.floor(video.currentTime * currentConfig.analysisFPS);

      if (video.readyState >= 2 && bucket !== lastBucketRef.current) {
        const analysisCanvas = analysisCanvasRef.current ?? document.createElement('canvas');
        analysisCanvasRef.current = analysisCanvas;
        const width = Math.round(144 + currentConfig.detail * 0.96);
        const height = Math.max(72, Math.round(width * (video.videoHeight / Math.max(1, video.videoWidth))));
        if (analysisCanvas.width !== width || analysisCanvas.height !== height) {
          analysisCanvas.width = width;
          analysisCanvas.height = height;
          previousLumaRef.current = undefined;
        }
        const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
        if (analysisContext) {
          analysisContext.drawImage(video, 0, 0, width, height);
          const image = analysisContext.getImageData(0, 0, width, height);
          const result = analyzeFrame(image, currentConfig, previousLumaRef.current);
          previousLumaRef.current = result.luma;
          const boxes = trackerRef.current.update(result.featureMap, currentConfig, now);
          const seed = hashSeed(currentConfig.seed, bucket, result.featureMap.features.length);
          overlayDataRef.current = generateFrameOverlay(result.featureMap, currentConfig, seed, bucket, boxes);
          snapshotStartedRef.current = now;
          lastBucketRef.current = bucket;
        }
      }

      const rect = stage.getBoundingClientRect();
      const transitionAlpha = Math.min(1, 0.48 + (now - snapshotStartedRef.current) / 90);
      renderOverlay(canvas, layerRef.current ? overlayDataRef.current : null, currentConfig, {
        sourceWidth: video.videoWidth || 16,
        sourceHeight: video.videoHeight || 9,
        stageWidth: rect.width,
        stageHeight: rect.height,
        transitionAlpha,
      });
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(animationFrame); };
  }, []);

  useEffect(() => {
    if (exportRequest === 0) return;
    const video = videoRef.current;
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!video || !stage || !overlay || video.readyState < 2) {
      onExportStatus({ status: 'error', progress: 0, message: 'Video is not ready to export.' });
      return;
    }

    let cancelled = false;
    let exportFrame = 0;
    const streamTracks: MediaStreamTrack[] = [];

    const runExport = async () => {
      const format = exportFormat();
      if (!format || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
        throw new Error('Clip export is not supported in this browser. Try current Chrome, Edge or Safari.');
      }

      const rect = stage.getBoundingClientRect();
      const aspect = Math.max(0.2, rect.width / Math.max(1, rect.height));
      let width = aspect >= 1 ? EXPORT_LONG_EDGE : Math.round(EXPORT_LONG_EDGE * aspect);
      let height = aspect >= 1 ? Math.round(EXPORT_LONG_EDGE / aspect) : EXPORT_LONG_EDGE;
      width -= width % 2;
      height -= height % 2;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(2, width);
      exportCanvas.height = Math.max(2, height);
      const exportContext = exportCanvas.getContext('2d', { alpha: false });
      if (!exportContext) throw new Error('Could not create the export canvas.');

      const stream = exportCanvas.captureStream(EXPORT_FPS);
      streamTracks.push(...stream.getTracks());
      const recorder = new MediaRecorder(stream, {
        mimeType: format.mimeType,
        videoBitsPerSecond: 16_000_000,
      });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });

      const previousTime = video.currentTime;
      const wasPaused = video.paused;
      video.pause();
      if (video.currentTime > 0.04) {
        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true });
          video.currentTime = 0;
        });
      }
      if (cancelled) return;

      const geometry = getVideoGeometry(
        video.videoWidth || 16,
        video.videoHeight || 9,
        exportCanvas.width,
        exportCanvas.height,
        configRef.current.framing,
      );
      const drawFrame = () => {
        const current = configRef.current;
        exportContext.save();
        exportContext.fillStyle = '#111';
        exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportContext.filter = imageFilter(current.imageMode);
        exportContext.drawImage(
          video,
          geometry.offsetX,
          geometry.offsetY,
          geometry.sourceWidth * geometry.scale,
          geometry.sourceHeight * geometry.scale,
        );
        exportContext.restore();
        exportContext.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, exportCanvas.width, exportCanvas.height);
      };

      drawFrame();
      recorder.start(250);
      await video.play();
      onExportStatus({ status: 'recording', progress: 0 });
      const startedAt = performance.now();
      let lastProgress = -1;
      await new Promise<void>((resolve) => {
        const capture = (now: number) => {
          if (cancelled || now - startedAt >= EXPORT_DURATION_MS) {
            resolve();
            return;
          }
          drawFrame();
          const progress = Math.min(99, Math.floor(((now - startedAt) / EXPORT_DURATION_MS) * 20) * 5);
          if (progress !== lastProgress) {
            lastProgress = progress;
            onExportStatus({ status: 'recording', progress });
          }
          exportFrame = requestAnimationFrame(capture);
        };
        exportFrame = requestAnimationFrame(capture);
      });

      drawFrame();
      const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
      recorder.stop();
      await stopped;
      streamTracks.forEach((track) => track.stop());
      if (cancelled) return;

      video.pause();
      video.currentTime = Math.min(previousTime, Math.max(0, video.duration || previousTime));
      if (!wasPaused) void video.play();
      if (!chunks.length) throw new Error('The browser returned an empty recording.');

      const blob = new Blob(chunks, { type: format.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `machine-vision-${safeExportName(exportName)}.${format.extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      onExportStatus({ status: 'done', progress: 100 });
    };

    void runExport().catch((error: unknown) => {
      streamTracks.forEach((track) => track.stop());
      if (!cancelled) {
        const message = error instanceof Error ? error.message : 'Clip export failed.';
        onExportStatus({ status: 'error', progress: 0, message });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(exportFrame);
      streamTracks.forEach((track) => track.stop());
    };
  }, [exportName, exportRequest, onExportStatus]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !source || !ready) return;
    if (video.paused) void video.play(); else video.pause();
  };

  return (
    <div ref={stageRef} className={`video-stage${ready ? ' is-ready' : ''}`}>
      <video
        ref={videoRef}
        className="hero-video"
        data-image-mode={config.imageMode}
        style={{ objectFit: resolvedFraming === 'fill' ? 'cover' : 'contain' }}
        src={source || undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onLoadStart={() => { setReady(false); setLoadError(''); }}
        onCanPlay={() => { setReady(true); setLoadError(''); }}
        onError={() => {
          setReady(false);
          if (source) setLoadError('Unsupported video codec. Try MP4 / H.264 or WebM.');
        }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      />
      <canvas ref={overlayRef} className="overlay-canvas" aria-hidden="true" />
      <button className="playback-toggle" type="button" onClick={togglePlayback} aria-label={paused ? 'Play video' : 'Pause video'}>
        {paused ? 'Play' : 'Pause'}
      </button>
      {!ready && <div className={`video-loading${loadError ? ' is-error' : ''}`}>{source ? loadError || 'Loading source' : 'Upload a video to begin'}</div>}
      <div className="stage-index" aria-hidden="true">MV / 001</div>
    </div>
  );
}
