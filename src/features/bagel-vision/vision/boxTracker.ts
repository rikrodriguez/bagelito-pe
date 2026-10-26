import type { FeatureMap, PersistentBoxRenderData, VisionConfig } from './types';

interface Cluster {
  x: number; y: number; width: number; height: number; confidence: number;
}

function createClusters(featureMap: FeatureMap, count: number): Cluster[] {
  const pool = featureMap.features.slice(0, Math.max(12, count * 10));
  const clusters: Cluster[] = [];
  for (const feature of pool) {
    const existing = clusters.find((cluster) => Math.hypot(cluster.x - feature.x, cluster.y - feature.y) < 0.17);
    if (existing) {
      const weight = 0.25;
      existing.x += (feature.x - existing.x) * weight;
      existing.y += (feature.y - existing.y) * weight;
      existing.width = Math.min(0.28, Math.max(existing.width, Math.abs(feature.x - existing.x) * 2 + 0.09));
      existing.height = Math.min(0.34, Math.max(existing.height, Math.abs(feature.y - existing.y) * 2 + 0.1));
      existing.confidence = Math.min(1, existing.confidence + feature.score * 0.12);
    } else if (clusters.length < Math.max(4, count * 2)) {
      clusters.push({ x: feature.x, y: feature.y, width: 0.12, height: 0.14, confidence: feature.score });
    }
  }
  return clusters
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
    .map((cluster) => ({ ...cluster, x: cluster.x - cluster.width / 2, y: cluster.y - cluster.height / 2 }));
}

export class BoxTracker {
  private tracks: PersistentBoxRenderData[] = [];
  private nextId = 1;

  update(featureMap: FeatureMap, config: VisionConfig, now: number): PersistentBoxRenderData[] {
    if (!config.boxesEnabled || config.boxCount === 0) {
      this.tracks = [];
      return [];
    }
    const clusters = createClusters(featureMap, config.boxCount);
    const used = new Set<number>();
    const alpha = 0.08 + (1 - config.boxSmoothness / 100) * 0.48;

    for (const cluster of clusters) {
      let bestIndex = -1;
      let bestDistance = 0.22;
      this.tracks.forEach((track, index) => {
        if (used.has(index)) return;
        const distance = Math.hypot(
          track.x + track.width / 2 - (cluster.x + cluster.width / 2),
          track.y + track.height / 2 - (cluster.y + cluster.height / 2),
        );
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });

      if (bestIndex >= 0) {
        const track = this.tracks[bestIndex];
        track.x += (cluster.x - track.x) * alpha;
        track.y += (cluster.y - track.y) * alpha;
        track.width += (cluster.width - track.width) * alpha;
        track.height += (cluster.height - track.height) * alpha;
        track.confidence += (cluster.confidence - track.confidence) * 0.2;
        track.age += 1;
        track.lastSeen = now;
        used.add(bestIndex);
      } else if (this.tracks.length < config.boxCount) {
        this.tracks.push({ id: this.nextId++, ...cluster, age: 1, lastSeen: now });
        used.add(this.tracks.length - 1);
      }
    }

    this.tracks = this.tracks
      .filter((track) => now - track.lastSeen <= config.boxHold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, config.boxCount);
    return this.tracks.map((track) => ({ ...track }));
  }
}
