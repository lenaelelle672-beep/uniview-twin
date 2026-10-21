import { PerspectiveCamera } from 'three'
import { useTwinStore } from '../../store/store'

type SnapRig = {
  camera: PerspectiveCamera
  setLookAt: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    enableTransition?: boolean,
  ) => Promise<void> | void
  setFocalOffset?: (x: number, y: number, z: number, enableTransition?: boolean) => Promise<void> | void
  setBoundary?: (box: null | undefined) => void
  update: (delta: number) => void
  addEventListener?: (type: string, fn: () => void) => void
}

let dragBound = false

/** 首屏不带这个包。只有地址栏真有 ?vp= 时才拉。 */
export function snapViewpoint(rig: SnapRig, token: string, floor: boolean) {
  if (!dragBound && rig.addEventListener) {
    dragBound = true
    rig.addEventListener('controlstart', () => {
      window.__vpH = false
    })
  }
  window.__twinRig = rig as unknown as Window['__twinRig']
  if (floor) rig.setBoundary?.(undefined)
  const parts = token.split('~')
  if (parts.length !== 7 && parts.length !== 10) return
  const n = parts.map(Number)
  if (n.some((value) => !Number.isFinite(value))) return
  const fov = n[6] ?? 0
  if (fov < 5 || fov > 120 || n.some((value) => Math.abs(value) > 5000)) return
  const camera = rig.camera
  if (camera.isPerspectiveCamera && Math.abs(camera.fov - fov) > 0.001) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  void rig.setLookAt(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 0, n[4] ?? 0, n[5] ?? 0, false)
  void rig.setFocalOffset?.(n[7] ?? 0, n[8] ?? 0, n[9] ?? 0, false)
  rig.update(0)
  window.__vpP?.()
}

if (typeof window !== 'undefined') {
  window.__vpS = (rig, token, floor) => {
    snapViewpoint(rig as unknown as SnapRig, token, floor)
  }
  const pendingToken = useTwinStore.getState().vp
  const pendingRig = window.__twinRig
  if (window.__vpH && pendingToken && pendingRig) {
    snapViewpoint(pendingRig as unknown as SnapRig, pendingToken, useTwinStore.getState().view === 'floor')
  }
}
