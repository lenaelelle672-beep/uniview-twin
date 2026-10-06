export interface LabelPackMs {
  sdf: number
  layout: number
  sync: number
  total: number
}

export const EMPTY_LABEL_PACK: LabelPackMs = { sdf: 0, layout: 0, sync: 0, total: 0 }

let packFloorId = ''
let accumulated: LabelPackMs = { ...EMPTY_LABEL_PACK }

function publish(sample: LabelPackMs) {
  if (typeof window === 'undefined') return
  window.__twinLabelPackMs = { ...sample }
}

/** 每次进层重置，三段按该次进层累加。 */
export function beginLabelPack(floorId: string): void {
  packFloorId = floorId
  accumulated = { ...EMPTY_LABEL_PACK }
  publish(accumulated)
}

export function currentLabelPackFloor(): string {
  return packFloorId
}

export function currentLabelPackMs(): LabelPackMs {
  return { ...accumulated }
}

export function addLabelPackSample(sample: LabelPackMs): LabelPackMs {
  accumulated = {
    sdf: accumulated.sdf + sample.sdf,
    layout: accumulated.layout + sample.layout,
    sync: accumulated.sync + sample.sync,
    total: accumulated.total + sample.total,
  }
  publish(accumulated)
  return currentLabelPackMs()
}

interface TroikaTimings {
  sdfTotal?: number
  typesetting?: number
  quads?: number
}

function readTroikaTimings(text: { textRenderInfo?: { timings?: TroikaTimings } | null }): {
  sdf: number
  layout: number
} {
  const timings = text.textRenderInfo?.timings
  if (!timings) return { sdf: 0, layout: 0 }
  return {
    sdf: Number(timings.sdfTotal) || 0,
    layout: (Number(timings.typesetting) || 0) + (Number(timings.quads) || 0),
  }
}

/**
 * SDF / 排版尽量读 troika 自带 timings；缺省时退回墙钟。
 * sync 是 BatchedText 合并并上传几何/纹理的墙钟。
 */
export function measureLabelPackSample(input: {
  sdfWallMs: number
  layoutWallMs: number
  syncWallMs: number
  members: readonly object[]
}): LabelPackMs {
  let sdf = 0
  let layout = 0
  for (const member of input.members) {
    const part = readTroikaTimings(member as { textRenderInfo?: { timings?: TroikaTimings } | null })
    sdf += part.sdf
    layout += part.layout
  }
  if (sdf <= 0) sdf = input.sdfWallMs
  if (layout <= 0) layout = input.layoutWallMs
  const sync = Math.max(0, input.syncWallMs)
  return {
    sdf,
    layout,
    sync,
    total: sdf + layout + sync,
  }
}
