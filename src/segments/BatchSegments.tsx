import { Segment, Segments } from '@react-three/drei/core/Segments'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { SEGMENT_LIMIT, batchLineSignature, presentSegments, type BatchLine } from './plan'

interface BatchLineObject {
  name: string
  renderOrder: number
  frustumCulled: boolean
  raycast: () => null
  geometry?: { dispose: () => void }
  material?: { dispose?: () => void; type?: string; fog?: boolean; userData?: Record<string, unknown> } | unknown[]
}

/**
 * drei `<Line>` 在 points 换引用时会 dispose 同一份 LineMaterial，且不新建（D272）。
 * 测距和人流继续用那条 Line。这里只用一份 Segments 父级，材质留在组件活着的时候，
 * start/end 变化不拆材质，只在 demand 下 invalidate，让库里的 useFrame 把端点写进同一几何。
 * 关掉开关才卸载，这时线已经离开场景，再 dispose。
 */
function claim(line: BatchLineObject | null) {
  if (!line) return
  line.name = 'BatchSegmentLines'
  line.renderOrder = 6
  line.frustumCulled = false
  line.raycast = () => null
  const material = line.material
  if (material && !Array.isArray(material)) {
    material.fog = false
    if (material.userData) material.userData.batchSegments = true
  }
}

function release(line: BatchLineObject | null) {
  if (!line) return
  line.geometry?.dispose()
  const material = line.material
  if (!material || Array.isArray(material)) return
  if (material.userData?.batchSegments === true || material.type === 'LineMaterial') material.dispose?.()
}

export function BatchSegments({ lines, dropped }: { lines: readonly BatchLine[]; dropped: number }) {
  const invalidate = useThree((state) => state.invalidate)
  const invalidateRef = useRef(invalidate)
  invalidateRef.current = invalidate
  const lineRef = useRef<BatchLineObject | null>(null)
  const held = useRef<BatchLineObject | null>(null)
  const fitted = useMemo(() => presentSegments(lines, SEGMENT_LIMIT), [lines])
  const signature = `${batchLineSignature(fitted.slots)}#${dropped + fitted.dropped}`

  useLayoutEffect(() => {
    held.current = lineRef.current
    claim(lineRef.current)
    const probe = window.__twinSegments
    if (probe) {
      probe.mounted = true
      probe.shown = fitted.shown
      probe.dropped = dropped + fitted.dropped
      probe.limit = SEGMENT_LIMIT
    }
    invalidate()
    const frame = requestAnimationFrame(() => invalidate())
    return () => {
      cancelAnimationFrame(frame)
      invalidate()
    }
  }, [dropped, fitted.dropped, fitted.shown, invalidate, signature])

  useLayoutEffect(() => {
    return () => {
      const line = held.current
      held.current = null
      release(line)
      const probe = window.__twinSegments
      if (probe) probe.mounted = false
      invalidateRef.current()
    }
  }, [])

  const draw = fitted.slots
  return (
    <group name="BatchSegments">
      <Segments
        ref={(node) => {
          lineRef.current = node as BatchLineObject | null
          claim(lineRef.current)
        }}
        limit={SEGMENT_LIMIT}
        lineWidth={2}
        toneMapped={false}
        transparent
        opacity={0.95}
        depthTest={false}
        depthWrite={false}
      >
        {draw.map((line, index) => (
          <Segment key={index} start={line.start} end={line.end} color={line.color} />
        ))}
      </Segments>
    </group>
  )
}
