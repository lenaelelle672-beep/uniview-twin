import { lazy, Suspense } from 'react'

const CameraFovCones = lazy(() => import('./CameraFovCones').then((mod) => ({ default: mod.CameraFovCones })))

/**
 * 锥和 DEMO 锚点表在独立分包里。
 * 只有进了当前层、室内真正挂上时才 import。
 * 不进 prefetch 名单，也不进 hardGate / balancedFx。
 */
export function CameraFov({ floorId }: { floorId: string }) {
  return (
    <Suspense fallback={null}>
      <CameraFovCones floorId={floorId} />
    </Suspense>
  )
}
