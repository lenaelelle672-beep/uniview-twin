import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useTwinStore } from '../store/store'
import type { LayerFlags, LayerKey } from '../store/viewSlice'
import type { QualityTier } from '../types'

/**
 * 画质允许而且图层开着才画。
 * 人流在性能档本来就不画；标签、热力、描边、圆标各档都可画，只受开关控制。
 */
export function layerShown(quality: QualityTier, layers: LayerFlags, key: LayerKey): boolean {
  const allowed = key === 'people' ? quality !== 'perf' : true
  return allowed && layers[key]
}

export function useLayerShown(key: LayerKey): boolean {
  return useTwinStore((state) => layerShown(state.quality, state.layers, key))
}

/** demand 停帧时，卸下或重新挂上图层都要补一帧，否则网格留在上一帧。 */
export function HiddenLayer() {
  const invalidate = useThree((state) => state.invalidate)
  useLayoutEffect(() => {
    invalidate()
    return () => {
      invalidate()
    }
  }, [invalidate])
  return null
}
