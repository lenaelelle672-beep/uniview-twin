import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import type { LOD } from 'three'

/**
 * demand 只在 invalidate 时画。Detailed 在 useFrame 里改可见性，
 * 档位变了要再要一帧，避免停在切换前的画面。
 * 优先级 1，排在 Detailed 默认的 0 之后，读到的是本帧已经更新的档。
 */
export function useDetailedLevelInvalidate(lodRef: RefObject<LOD | null>) {
  const invalidate = useThree((state) => state.invalidate)
  const level = useRef(-1)
  useFrame(() => {
    const lod = lodRef.current
    if (!lod) return
    const next = lod.getCurrentLevel()
    if (next === level.current) return
    level.current = next
    invalidate()
  }, 1)
}
