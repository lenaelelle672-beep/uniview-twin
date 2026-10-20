import { lazy, Suspense } from 'react'

const ZoneHeatMesh = lazy(() => import('./ZoneHeatMesh').then((mod) => ({ default: mod.ZoneHeatMesh })))

/** 热力实现在独立分包里。只有进了这一层、组件真正挂上时才 import。 */
export function ZoneHeat({ floorId }: { floorId: string }) {
  return (
    <Suspense fallback={null}>
      <ZoneHeatMesh floorId={floorId} />
    </Suspense>
  )
}
