import { writeSensorLift } from './fill'

export interface SensorLiftHold {
  progress: number
}

export interface SensorPositionAttr {
  needsUpdate: boolean
}

/**
 * 爆炸已经在要帧。这里只跟着改 Y，并标一下缓冲。
 * 不向渲染器再要帧，避免 demand 停住之后被点云重新拉起来。
 */
export function followSensorExplode(
  positions: Float32Array,
  count: number,
  held: SensorLiftHold,
  position: SensorPositionAttr | null | undefined,
  progress: number,
): void {
  if (!Number.isFinite(progress) || progress === held.progress) return
  held.progress = progress
  writeSensorLift(positions, count, progress)
  if (position) position.needsUpdate = true
}
