export type MovementAction = 'forward' | 'backward' | 'left' | 'right' | 'run'
export type MovementSlice = { forward: number; right: number; run: boolean; seconds: number }
export type MovementInput = ReturnType<typeof createMovementInput>

/** Preserve input intervals even when a complete press occurs between frames.
 * Sources identify individual keys/pointers so releasing an alias cannot release
 * another held control. The caller applies slices with collision-safe substeps.
 */
export function createMovementInput(initialTimeMs = 0, maxBufferedSeconds = 1) {
  if (!Number.isFinite(initialTimeMs)) throw new RangeError('Movement timestamps must be finite')
  if (!Number.isFinite(maxBufferedSeconds)) throw new RangeError('Movement buffer must be finite')
  if (maxBufferedSeconds <= 0) throw new RangeError('Movement buffer must be positive')

  let lastTimeMs = initialTimeMs
  let pending: MovementSlice[] = []
  let bufferedSeconds = 0
  const held = new Map<string, MovementAction>()
  const clock = (atMs: number) => {
    if (!Number.isFinite(atMs)) throw new RangeError('Movement timestamps must be finite')
    return Math.max(lastTimeMs, atMs)
  }
  const advance = (atMs: number) => {
    const nextTimeMs = clock(atMs)
    const elapsedSeconds = (nextTimeMs - lastTimeMs) / 1000
    lastTimeMs = nextTimeMs
    if (!elapsedSeconds || !held.size) return

    const actions = new Set(held.values())
    const forward = Number(actions.has('forward')) - Number(actions.has('backward'))
    const right = Number(actions.has('right')) - Number(actions.has('left'))
    const length = Math.hypot(forward, right)
    if (!length) return
    // Bound delayed travel rather than replaying seconds of movement after a
    // stalled frame. Normal sub-second taps keep their actual held duration.
    const seconds = Math.min(elapsedSeconds, Math.max(0, maxBufferedSeconds - bufferedSeconds))
    if (!seconds) return
    const slice = { forward: forward / length, right: right / length, run: actions.has('run'), seconds }
    const previous = pending[pending.length - 1]
    if (previous && previous.forward === slice.forward && previous.right === slice.right && previous.run === slice.run) {
      previous.seconds += seconds
    } else {
      pending.push(slice)
    }
    bufferedSeconds += seconds
  }

  return {
    set(source: string, action: MovementAction, pressed: boolean, atMs: number) {
      advance(atMs)
      if (pressed) held.set(source, action)
      else held.delete(source)
    },
    consume(atMs: number): MovementSlice[] {
      advance(atMs)
      const slices = pending
      pending = []
      bufferedSeconds = 0
      return slices
    },
    reset(atMs: number) {
      lastTimeMs = clock(atMs)
      held.clear()
      pending = []
      bufferedSeconds = 0
    },
  }
}
