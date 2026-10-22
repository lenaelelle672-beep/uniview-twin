/**
 * 点方位只调用 CameraRig 已经挂上的 setLookAt(enableTransition)。
 * 阻尼沿用镜头上现有的 T032，这个文件不读、不写它。
 * demand 下用 rAF 续帧。不引用镜头停稳、帧调度或需求循环。
 */

const AXIS_FLY_MS = 2400

type AxisRig = {
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

export function cancelAxisFlight(): void {
  cancelPump?.()
  cancelPump = null
}

export function flyToAxis(
  rig: AxisRig,
  eye: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  invalidate: () => void,
  stillOverview: () => boolean = () => true,
): void {
  cancelAxisFlight()
  let alive = true
  let raf = 0
  const stop = () => {
    if (!alive) return
    alive = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    if (cancelPump === stop) cancelPump = null
    invalidate()
  }
  cancelPump = stop
  const started = performance.now()
  const pump = () => {
    if (!alive) return
    if (!stillOverview() || performance.now() - started > AXIS_FLY_MS) {
      stop()
      return
    }
    invalidate()
    raf = requestAnimationFrame(pump)
  }
  raf = requestAnimationFrame(pump)
  try {
    void Promise.resolve(
      rig.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true),
    ).then(stop, stop)
  } catch {
    stop()
  }
}
