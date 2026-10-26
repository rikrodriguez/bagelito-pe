"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { VideoStage, type ExportStatus } from "@/features/bagel-vision/video/VideoStage";
import { EDITORIAL_CONFIG } from "@/features/bagel-vision/vision/config";
import { PRESETS, type PresetName } from "@/features/bagel-vision/vision/presets";
import type { VisionConfig } from "@/features/bagel-vision/vision/types";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const PRESET_OPTIONS: { value: PresetName; label: string; subtitle: string }[] = [
  { value: "Editorial", label: "Editorial", subtitle: "Limpio" },
  { value: "Sparse", label: "Minimal", subtitle: "Sutil" },
  { value: "Signal", label: "Signal", subtitle: "Textura" },
  { value: "Dense", label: "Dense", subtitle: "Intenso" },
];
const COLORS = ["#FF5B9F", "#FCEDDD", "#BAF356", "#FFFFFF", "#2BD5D0"];

export function BagelVisionLab() {
  const fileInput = useRef<HTMLInputElement>(null);
  const currentUrl = useRef<string | null>(null);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<VisionConfig>({
    ...EDITORIAL_CONFIG,
    overlayColor: "#FF5B9F",
    labelAmount: 14,
    maxPoints: 36,
    boxCount: 1,
    boxStrength: 60,
    analysisFPS: 6,
  });
  const [preset, setPresetName] = useState<PresetName | "Custom">("Editorial");
  const [layerActive, setLayerActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [exportRequest, setExportRequest] = useState(0);
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ status: "idle", progress: 0 });

  useEffect(() => () => {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);

  const chooseVideo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/") || file.size <= 0) {
      setError("Selecciona un video MP4, WebM o MOV compatible.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Para esta prueba, utiliza un video de 100 MB o menos.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = nextUrl;
    setReady(false);
    setError("");
    setSource(nextUrl);
    setSourceName(file.name);
    setExportStatus({ status: "idle", progress: 0 });
    if (fileInput.current) fileInput.current.value = "";
  };

  const change = <K extends keyof VisionConfig>(field: K, value: VisionConfig[K]) => {
    setConfig(current => ({ ...current, [field]: value }));
    setPresetName("Custom");
  };

  const setPreset = (name: PresetName) => {
    setConfig(current => ({
      ...PRESETS[name],
      overlayColor: current.overlayColor,
      imageMode: current.imageMode,
      framing: current.framing,
      analysisFPS: 6,
      labelAmount: name === "Dense" ? 28 : name === "Signal" ? 18 : 12,
      boxesEnabled: true,
      boxCount: 1,
    }));
    setPresetName(name);
  };

  const exporting = exportStatus.status === "recording";

  return (
    <main className="bagel-vision-lab">
      <header className="bagel-vision-header">
        <Link href="/" className="bagel-vision-home" aria-label="Volver a Bagelito">
          <Image src="/images/bagelito-logo.svg" alt="Bagelito" width={134} height={45} priority />
        </Link>
        <span className="bagel-vision-experiment">CREATIVE LAB <span aria-hidden="true">/</span> 001</span>
        <Link className="bagel-vision-back" href="/">Volver a la tienda <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="bagel-vision-grid">
        <div className="bagel-vision-intro">
          <div className="bagel-vision-eyebrow"><span className="bagel-vision-dot" /> Experimento creativo · No es el checkout</div>
          <h1>FOOD, BUT <em>DIFFERENT.</em></h1>
          <p className="bagel-vision-lead">
            Tus videos de bagels, reinterpretados con líneas, puntos y señales en movimiento.
            Crea clips para la próxima campaña de Bagelito.
          </p>
          <input ref={fileInput} className="bagel-vision-file" type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            aria-label="Seleccionar video local"
            onChange={e => chooseVideo(e.currentTarget.files?.[0])} />
          <div className="bagel-vision-actions">
            <button type="button" className="bagel-vision-button primary"
              onClick={() => fileInput.current?.click()}>
              {source ? "Cambiar video" : "Subir mi video"} <span aria-hidden="true">＋</span>
            </button>
            <button type="button" className="bagel-vision-button secondary"
              disabled={!ready || exporting}
              onClick={() => setExportRequest(value => value + 1)}>
              {exporting ? "Exportando " + exportStatus.progress + "%" : "Exportar clip de 5 s"}
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          {sourceName && <p className="bagel-vision-filename">ARCHIVO LOCAL: {sourceName}</p>}
          {(error || exportStatus.status === "error") && (
            <p role="alert" className="bagel-vision-error">{error || exportStatus.message}</p>
          )}
          {exportStatus.status === "done" && (
            <p role="status" className="bagel-vision-success">Clip creado. Revisa tus descargas.</p>
          )}

          <div className="bagel-vision-controls">
            <div className="bagel-vision-controls-heading">
              <h2>Tu dirección de arte</h2>
              <label className="bagel-vision-switch">
                <input type="checkbox" checked={layerActive}
                  onChange={e => setLayerActive(e.target.checked)} />
                Capa activa
              </label>
            </div>
            <span className="bagel-vision-field-name">ESTILO</span>
            <div className="bagel-vision-presets" role="group" aria-label="Estilo de procesamiento">
              {PRESET_OPTIONS.map(p => (
                <button type="button" key={p.value}
                  className={"bagel-vision-preset" + (preset === p.value ? " selected" : "")}
                  onClick={() => setPreset(p.value)} aria-pressed={preset === p.value}>
                  <strong>{p.label}</strong><small>{p.subtitle}</small>
                </button>
              ))}
            </div>
            <div className="bagel-vision-sliders">
              <label htmlFor="bagel-vision-density">Intensidad <output>{config.density}%</output></label>
              <input id="bagel-vision-density" type="range" min={10} max={100} step={5}
                value={config.density} onChange={e => change("density", Number(e.target.value))} />
              <label htmlFor="bagel-vision-threshold">Sensibilidad <output>{100 - config.threshold}%</output></label>
              <input id="bagel-vision-threshold" type="range" min={15} max={90} step={5}
                value={100 - config.threshold}
                onChange={e => change("threshold", 100 - Number(e.target.value))} />
            </div>
            <div className="bagel-vision-settings-row">
              <div>
                <span className="bagel-vision-field-name">COLOR DE SEÑALES</span>
                <div className="bagel-vision-colors" role="group" aria-label="Color del efecto">
                  {COLORS.map(color => (
                    <button key={color} type="button"
                      className={config.overlayColor === color ? "active" : ""}
                      style={{ backgroundColor: color }}
                      aria-label={"Cambiar color a " + color}
                      aria-pressed={config.overlayColor === color}
                      onClick={() => change("overlayColor", color)} />
                  ))}
                </div>
              </div>
              <label className="bagel-vision-select-label">
                <span className="bagel-vision-field-name">ENCUADRE</span>
                <select value={config.framing}
                  onChange={e => change("framing", e.target.value as VisionConfig["framing"])}>
                  <option value="auto">Automático</option>
                  <option value="fit">Completo</option>
                  <option value="fill">Rellenar</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <section className="bagel-vision-visual" aria-label="Vista previa del efecto visual">
          <div className="bagel-vision-visual-label">
            <span className="bagel-vision-live" /> LIVE CANVAS <span>002 / VISION</span>
          </div>
          <div className="bagel-vision-canvas-frame">
            {source ? (
              <VideoStage config={config} layerActive={layerActive} source={source}
                exportName={sourceName || "bagelito"} exportRequest={exportRequest}
                onExportStatus={setExportStatus} onReadyChange={setReady} />
            ) : (
              <div className="bagel-vision-empty">
                <Image src="/images/bagel-rainbow.webp" alt="Bagel rainbow de Bagelito"
                  fill sizes="(max-width: 850px) 90vw, 55vw" priority />
                <div className="bagel-vision-empty-overlay" aria-hidden="true" />
                <span className="bagel-vision-empty-kicker">A FRESH PERSPECTIVE.</span>
                <strong>UPLOAD A BAGEL.<br />MAKE IT ICONIC.</strong>
                <span className="bagel-vision-empty-footer">TU VIDEO VA AQUÍ <span>↗</span></span>
              </div>
            )}
          </div>
          <div className="bagel-vision-visual-bottom">
            <span>100% en tu navegador · El video no se sube a servidores.</span>
            <span>MP4 · WEBM · MOV</span>
          </div>
        </section>
      </div>
      <footer className="bagel-vision-footer">
        <p>Las señales son recursos gráficos: no identifican ingredientes ni certifican calidad.
          Los clips se exportan sin audio y el formato depende del navegador.</p>
        <p>Motor visual adaptado de <a href="https://github.com/amirmushichge/machine-vision"
          target="_blank" rel="noreferrer">Machine Vision®</a>, Amir Mushich · Licencia MIT.</p>
      </footer>
    </main>
  );
}
