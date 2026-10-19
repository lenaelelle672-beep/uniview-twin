import { useProgress } from '@react-three/drei/core/Progress'
import { useLayoutEffect } from 'react'
import { publishAssetProgress } from '../scene/assetLoad'

/** 首帧窗口之后才挂。useProgress 留在这个异步包里。 */
export function AssetLoadProgress() {
  const { active, progress } = useProgress()
  useLayoutEffect(() => {
    publishAssetProgress(active, progress)
  }, [active, progress])
  return null
}
