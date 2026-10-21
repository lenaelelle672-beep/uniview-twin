import { Vector3 } from 'three'
import { useTwinStore } from '../store/store'
import { slideLookAt } from './project'

/** 过渡大约一秒量级。泵帧只是 demand 下的保险，到点或 promise 结束就停。 */
const FLY_PUMP_MS = 2400

const eye = new Vector3()
const target = new Vector3()

/**
 * 复用 CameraRig.setLookAt。不读、不写镜头阻尼。
 * 全屏蓝图和导览巡游期间不抢镜头。
 */
export function flyToPlanPoint(x: number, z: number): boolean {
  if (useTwinStore.getState().view !== 'floor') return false
  if (typeof window === 'undefined' || window.__vpT) return false
  const rig = window.__twinRig
  if (!rig) return false
  rig.getPosition(eye, false)
  rig.getTarget(target, false)
  const next = slideLookAt(eye, target, { x, z })
  if (!next) return false
  let raf = 0
  let stopped = false
  const started = performance.now()
  const stop = () => {
    if (stopped) return
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }
  const tick = () => {
    if (stopped) return
    if (useTwinStore.getState().view !== 'floor' || performance.now() - started > FLY_PUMP_MS) {
      stop()
      return
    }
    window.__vpP?.()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  void rig
    .setLookAt(next.eye.x, next.eye.y, next.eye.z, next.target.x, next.target.y, next.target.z, true)
    .then(stop, stop)
  return true
}
