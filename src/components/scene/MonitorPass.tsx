import { useFrame, useThree } from '@react-three/fiber'
import { NoToneMapping } from 'three'
import { MONITOR_LAYER } from '../../scene/overlayOrder'

/**
 * 告警屏在合成器 / 主相机默认层之外。这里用 NoToneMapping 再画同一批实例，
 * 三层不再被 N8AO 和 AgX 按朝向、遮挡压成不一样的亮度。
 */
export function MonitorPass({ renderPriority }: { renderPriority: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const prevTone = gl.toneMapping
    const prevExposure = gl.toneMappingExposure
    const prevAutoClear = gl.autoClear
    const prevMask = camera.layers.mask
    gl.autoClear = false
    gl.toneMapping = NoToneMapping
    gl.toneMappingExposure = 1
    camera.layers.set(MONITOR_LAYER)
    gl.render(scene, camera)
    camera.layers.mask = prevMask
    gl.toneMapping = prevTone
    gl.toneMappingExposure = prevExposure
    gl.autoClear = prevAutoClear
  }, renderPriority)

  return null
}
