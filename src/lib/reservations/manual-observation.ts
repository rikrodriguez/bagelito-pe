// Observability must not change or delay a manual reservation's domain result.
// This boundary is only for telemetry, never reservation or security work.
export function observeManual(effect: () => unknown): void {
  try {
    void Promise.resolve(effect()).catch(() => {});
  } catch {
    // Logging an observer's failure would recreate the same dependency.
  }
}
