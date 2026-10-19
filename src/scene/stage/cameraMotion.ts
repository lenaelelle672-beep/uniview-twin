import type { CameraControls } from '@react-three/drei/core/CameraControls'
import { retainFrameChannel } from '../frameSchedule'
import { beginCameraMove, markCameraRested, watchCameraRest } from './cameraRest'

export interface UserFlight {
  cancel: () => void
  settled: () => void
}

/**
 * 过渡的续帧和停稳。cameraRest / frameSchedule 只跟这个异步包走，
 * 不进 CameraRig 所在的首屏图。drei SoftShadows 也不从这里引用。
 */
export function beginUserCameraFlight(input: {
  rig: CameraControls
  invalidate: () => void
  reason: string
}): UserFlight {
  const releaseMotion = retainFrameChannel('motion')
  beginCameraMove(input.reason)
  const stopWatch = watchCameraRest(input.rig, input.invalidate)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    stopWatch()
    releaseMotion()
  }
  return {
    cancel: close,
    settled: () => {
      close()
      markCameraRested('setLookAt')
    },
  }
}
