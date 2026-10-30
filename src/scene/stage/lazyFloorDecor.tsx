import { useEffect, useState } from 'react'
import type { Device } from '../../types'
import type { Point } from './corridor'
import type { RoomLabel } from './roomLabels'

type DecorModule = Awaited<typeof import('./floorDecor')>

let decorModule: DecorModule | null = null
let decorLoad: Promise<DecorModule> | null = null

function loadDecor(): Promise<DecorModule> {
  decorLoad ??= import('./floorDecor').then((mod) => {
    decorModule = mod
    return mod
  })
  return decorLoad
}

/**
 * 标签先把 floorDecor 拉进来。出齐窗再挂圆标时模块通常已经在缓存里。
 * 各用一份 React.lazy 的话，第二次仍会挂起一帧再提交，和吊顶拆成两次 invalidate。
 */
function useDecorModule(): DecorModule | null {
  const ready = decorModule
  const [, setGen] = useState(0)
  useEffect(() => {
    if (decorModule) return undefined
    let cancel = false
    void loadDecor().then(() => {
      if (!cancel) setGen((n) => n + 1)
    })
    return () => {
      cancel = true
    }
  }, [ready])
  return decorModule
}

/** 单层才挂载。楼板/墙/房间在主包，这里只补人物、标签和圆标。 */
export function FloorDecor({
  floorId,
  devices,
  labels,
  showPeople = false,
  paths,
}: {
  floorId: string
  devices: Device[]
  labels: RoomLabel[]
  showPeople?: boolean
  paths?: Point[][]
}) {
  const mod = useDecorModule()
  if (!mod) return null
  const Impl = mod.FloorDecor
  return <Impl floorId={floorId} devices={devices} labels={labels} showPeople={showPeople} paths={paths} />
}

/** 室内第一绘之后再挂标签。仍走 floorDecor 按需包，不把 troika 打进室内包。 */
export function FloorLabels({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  const mod = useDecorModule()
  if (!mod) return null
  const Impl = mod.FloorLabelsOnly
  return <Impl floorId={floorId} labels={labels} />
}

/** 出齐 + 1s 之后再挂圆标和人物。模块已在缓存里时和吊顶同一次提交。 */
export function FloorHeavy({
  floorId,
  devices,
  showPeople = false,
  paths,
}: {
  floorId: string
  devices: Device[]
  showPeople?: boolean
  paths?: Point[][]
}) {
  const mod = useDecorModule()
  if (!mod) return null
  const Impl = mod.FloorHeavyDecor
  return <Impl floorId={floorId} devices={devices} showPeople={showPeople} paths={paths} />
}
