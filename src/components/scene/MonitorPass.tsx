import { useFrame, useThree } from '@react-three/fiber'
import { NoToneMapping, Vector2 } from 'three'
import { blitDepth, overlayDepthBudget, sceneDepthTarget } from '../../scene/monitorDepth'
import { MONITOR_LAYER } from '../../scene/overlayOrder'

const drawingSize = new Vector2()

/**
 * 告警屏在合成器 / 主相机默认层之外。这里用 NoToneMapping 再画同一批实例，
 * 三层不再被 N8AO 和 AgX 按朝向、遮挡压成不一样的亮度。
 * 深度复用主场景：性能档吃 MainScenePass 写下的深度；均衡档先把合成器拷出的深度 blit 回来。
 */
export function MonitorPass({ renderPriority }: { renderPriority: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const monitors = scene.getObjectByName('WorkstationMonitors')
    const depth = sceneDepthTarget.current
    gl.getDrawingBufferSize(drawingSize)
    window.__twinOverlayBudget = {
      ...overlayDepthBudget(depth?.width ?? drawingSize.x, depth?.height ?? drawingSize.y, Boolean(depth)),
      drawingBuffer: { width: drawingSize.x, height: drawingSize.y },
    }
    if (!monitors) return

    const prevTone = gl.toneMapping
    const prevExposure = gl.toneMappingExposure
    const prevAutoClear = gl.autoClear
    const prevMask = camera.layers.mask
    const prevBackground = scene.background
    if (depth) blitDepth(gl, depth, null)
    gl.autoClear = false
    gl.toneMapping = NoToneMapping
    gl.toneMappingExposure = 1
    camera.layers.set(MONITOR_LAYER)
    scene.background = null
    gl.render(scene, camera)
    scene.background = prevBackground
    camera.layers.mask = prevMask
    gl.toneMapping = prevTone
    gl.toneMappingExposure = prevExposure
    gl.autoClear = prevAutoClear
  }, renderPriority)

  return null
}

/** 性能档没有合成器。Hud 改到 3 之后，由这里代画主场景并留下深度。 */
export function MainScenePass({ renderPriority }: { renderPriority: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    const prevAutoClear = gl.autoClear
    gl.autoClear = true
    gl.render(scene, camera)
    gl.autoClear = prevAutoClear
  }, renderPriority)

  return null
}
