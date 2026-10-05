type TwinWindow = Window & typeof globalThis

function tw(): TwinWindow {
  return globalThis as TwinWindow
}

/** D126：总览闸门。HDR 未启用（白模）时不必等贴图。性能档也用这张天空 HDR，同样要等。 */
export function markHdrNotRequired(): void {
  const w = tw()
  w.__twinHdrRequired = false
  if (w.__twinHdrReadyAt == null) {
    w.__twinHdrReadyAt = performance.now()
    w.__twinHdrReadyUnixMs = Date.now()
  }
  tryMarkOverviewReady()
}

export function markHdrLoaded(): void {
  const w = tw()
  if (w.__twinHdrLoadedAt != null) return
  w.__twinHdrLoadedAt = performance.now()
  w.__twinHdrLoadedUnixMs = Date.now()
}

/** PMREM 已生成且赋给 scene.environment。 */
export function markHdrPmremReady(): void {
  const w = tw()
  if (w.__twinHdrReadyAt == null) {
    w.__twinHdrReadyAt = performance.now()
    w.__twinHdrReadyUnixMs = Date.now()
  }
  w.__twinHdrRequired = true
  tryMarkOverviewReady()
}

export function markSuspenseReady(): void {
  tw().__twinSuspenseReady = true
  tryMarkOverviewReady()
}

/** D137：树 lo 与 HDR/格栅同一套闸。白模（HDR 不要求）也不等树。 */
export function markTreeLoReady(): void {
  const w = tw()
  if (w.__twinTreeLoReadyAt == null) w.__twinTreeLoReadyAt = performance.now()
  tryMarkOverviewReady()
}

export function tryMarkOverviewReady(): void {
  const w = tw()
  if (w.__twinReady) return
  if (!w.__twinSuspenseReady) return
  if (w.__twinHdrRequired !== false && w.__twinHdrReadyAt == null) return
  if (w.__twinHdrRequired !== false && w.__twinTreeLoReadyAt == null) return
  w.__twinReady = true
  w.__twinReadyAt = performance.now()
}

export function resetOverviewReadyMarks(): void {
  const w = tw()
  w.__twinReady = false
  w.__twinSuspenseReady = false
  delete w.__twinReadyAt
  delete w.__twinFirstFrameAt
  delete w.__twinFirstFrameUnixMs
  delete w.__twinTreeLoReadyAt
}

export function resetHdrReadyMarks(): void {
  const w = tw()
  delete w.__twinHdrLoadedAt
  delete w.__twinHdrLoadedUnixMs
  delete w.__twinHdrReadyAt
  delete w.__twinHdrReadyUnixMs
  delete w.__twinHdrRequired
}
