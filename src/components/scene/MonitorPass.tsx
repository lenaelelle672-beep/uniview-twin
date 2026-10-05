import { useFrame, useThree } from '@react-three/fiber'
import { NoToneMapping, Vector2, type Camera, type Scene, type WebGLRenderer } from 'three'
import {
  BLIT_SITES,
  balancedTargetInventory,
  defaultFramebufferSamples,
  drainGlErrors,
  overlayDepthBudget,
} from '../../scene/monitorDepth'
import { MONITOR_LAYER } from '../../scene/overlayOrder'

const drawingSize = new Vector2()

function renderMonitors(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  const prevTone = gl.toneMapping
  const prevExposure = gl.toneMappingExposure
  const prevAutoClear = gl.autoClear
  const prevMask = camera.layers.mask
  const prevBackground = scene.background
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
}

/**
 * 性能档：主场景深度已在默认帧缓冲（直接画进去，不是 blit）。
 * 均衡档：告警屏改在合成器自带深度的缓冲里画，这里只报 SAMPLES / getError，不再往默认 FBO 画。
 */
export function MonitorPass({
  renderPriority,
  drawOverlay,
}: {
  renderPriority: number
  drawOverlay: boolean
}) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    gl.getDrawingBufferSize(drawingSize)
    window.__twinOverlayBudget = {
      ...overlayDepthBudget(),
      drawingBuffer: { width: drawingSize.x, height: drawingSize.y },
    }
    window.__twinTargetInventory = balancedTargetInventory(drawingSize.x, drawingSize.y)
    window.__twinBlitSites = BLIT_SITES
    window.__twinGlProbe = {
      samples: defaultFramebufferSamples(gl),
      errors: drainGlErrors(gl),
      samplesReliableOnSwiftShader: false,
    }
    if (!drawOverlay || !scene.getObjectByName('WorkstationMonitors')) return
    renderMonitors(gl, scene, camera)
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
