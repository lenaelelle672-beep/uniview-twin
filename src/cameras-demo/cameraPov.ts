/**
 * 点锥飞到机位。只调用 CameraRig 已经挂上的 setLookAt(enableTransition)。
 * 阻尼沿用镜头上现有的值，这个文件不改它。
 * 续帧用 rAF + invalidate。这个包不引用镜头停稳、帧调度或需求循环。
 */

type PovRig = {
  setLookAt: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    enableTransition?: boolean,
  ) => Promise<void> | void
}

let cancelPump: (() => void) | null = null

export function cancelCameraPovFlight(): void {
  cancelPump?.()
  cancelPump = null
}

export function flyCameraPov(
  rig: PovRig,
  eye: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  invalidate: () => void,
): void {
  cancelCameraPovFlight()
  let alive = true
  let raf = 0
  let timer = 0
  const stop = () => {
    if (!alive) return
    alive = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    if (timer) window.clearTimeout(timer)
    timer = 0
    if (cancelPump === stop) cancelPump = null
    invalidate()
  }
  cancelPump = stop
  const pump = () => {
    if (!alive) return
    invalidate()
    raf = requestAnimationFrame(pump)
  }
  timer = window.setTimeout(stop, 4000)
  raf = requestAnimationFrame(pump)
  try {
    void Promise.resolve(rig.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true)).then(stop, stop)
  } catch {
    stop()
  }
}
