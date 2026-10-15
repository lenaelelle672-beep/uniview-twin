import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, EffectComposerContext, N8AO, ToneMapping } from '@react-three/postprocessing'
import { Pass, ToneMappingMode } from 'postprocessing'
import { use, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AgXToneMapping,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  NoToneMapping,
  SkinnedMesh,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib'
import { BLIT_SITES, balancedTargetInventory } from '../../../scene/monitorBudget'
import { ensureMonitorTarget, overlayDepthBudget, releaseMonitorTarget } from '../../../scene/monitorDepth'
import { DEPTH_PROXY_LAYER, MONITOR_LAYER } from '../../../scene/overlayOrder'
import {
  CONTACT_SHADOW_FAR,
  CONTACT_SHADOW_POSITION,
  CONTACT_SHADOW_RESOLUTION,
  CONTACT_SHADOW_SCALE,
} from '../../../scene/shellVersion'

const drawingSize = new Vector2()
const copyCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
/** 告警屏深度只要能挡住屏幕的实体。人物/标签/圆标/吊顶再画一遍会白白多几十次。 */
const MONITOR_DEPTH_SKIP = /^(RoomLabels|DeviceBadges|CorridorPeople|FloorCeiling|FloorGlass|OfficeDesks|WorkstationChairs|DeskFlash|FanSeats|CanteenTables|CanteenChairs)$/

function keepMonitorDepth(object: { name?: string; parent?: unknown; isSkinnedMesh?: boolean }): boolean {
  if (object instanceof SkinnedMesh || object.isSkinnedMesh) return false
  let cursor: { name?: string; parent?: unknown } | null = object
  while (cursor) {
    if (cursor.name && MONITOR_DEPTH_SKIP.test(cursor.name)) return false
    cursor = (cursor.parent as { name?: string; parent?: unknown } | null) ?? null
  }
  return true
}
const copyMesh = new Mesh(
  new PlaneGeometry(2, 2),
  new MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false }),
)

class MonitorAfterTonePass extends Pass {
  constructor(scene: Scene, camera: Camera) {
    super('MonitorAfterTonePass', scene, camera)
    this.needsSwap = false
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget) {
    if (!this.scene.getObjectByName('WorkstationMonitors')) return
    const dest = ensureMonitorTarget(inputBuffer.width, inputBuffer.height)
    const prevTone = renderer.toneMapping
    const prevExposure = renderer.toneMappingExposure
    const prevAutoClear = renderer.autoClear
    const prevMask = this.camera.layers.mask
    const prevBackground = this.scene.background
    const prevTarget = renderer.getRenderTarget()

    const material = copyMesh.material as MeshBasicMaterial
    material.map = inputBuffer.texture
    renderer.autoClear = false
    renderer.setRenderTarget(dest)
    renderer.clear(true, false, false)
    renderer.render(copyMesh, copyCamera)

    const gl = renderer.getContext()
    const hidden: Array<{ object: { visible: boolean }; visible: boolean }> = []
    const keep = new Set<object>()
    for (const name of ['FloorInterior', 'FloorPlate', 'MonitorDepthProxies']) {
      const root = this.scene.getObjectByName(name)
      if (!root) continue
      root.traverse((child) => {
        if (name === 'MonitorDepthProxies' || keepMonitorDepth(child)) keep.add(child)
      })
      let parent = root.parent
      while (parent) {
        keep.add(parent)
        parent = parent.parent
      }
    }
    this.scene.traverse((object) => {
      if (object.layers.isEnabled(DEPTH_PROXY_LAYER)) {
        keep.add(object)
        let parent = object.parent
        while (parent) {
          keep.add(parent)
          parent = parent.parent
        }
      }
    })
    this.scene.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return
      if (object.layers.isEnabled(DEPTH_PROXY_LAYER)) return
      if (keep.has(object) || !object.visible) return
      hidden.push({ object, visible: true })
      object.visible = false
    })
    this.camera.layers.set(0)
    this.camera.layers.enable(DEPTH_PROXY_LAYER)
    this.camera.layers.disable(MONITOR_LAYER)
    gl.colorMask(false, false, false, false)
    renderer.clear(false, true, false)
    renderer.render(this.scene, this.camera)
    gl.colorMask(true, true, true, true)
    for (const item of hidden) item.object.visible = item.visible

    renderer.toneMapping = NoToneMapping
    renderer.toneMappingExposure = 1
    this.camera.layers.set(MONITOR_LAYER)
    this.scene.background = null
    renderer.render(this.scene, this.camera)
    this.scene.background = prevBackground
    this.camera.layers.mask = prevMask
    renderer.toneMapping = prevTone
    renderer.toneMappingExposure = prevExposure

    material.map = dest.texture
    renderer.setRenderTarget(inputBuffer)
    renderer.clear(true, false, false)
    renderer.render(copyMesh, copyCamera)
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prevTarget)
  }
}

function MonitorAfterTone() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const pass = useMemo(() => new MonitorAfterTonePass(scene, camera), [camera, scene])
  return <primitive object={pass} />
}

function BalancedAO() {
  return (
    <N8AO
      ref={(pass) => {
        if (!pass) return
        pass.autoDetectTransparency = false
        pass.configuration.transparencyAware = false
      }}
      quality="performance"
      halfRes
      screenSpaceRadius
      aoRadius={2.2}
      intensity={1.05}
      distanceFalloff={1.1}
      denoiseSamples={4}
      denoiseRadius={2}
    />
  )
}

function MarkComposerLive({ onLive, active }: { onLive?: () => void; active: boolean }) {
  const gl = useThree((state) => state.gl)
  const armed = useRef(false)
  useFrame(() => {
    if (!active) {
      armed.current = false
      return
    }
    gl.getDrawingBufferSize(drawingSize)
    window.__twinOverlayBudget = {
      ...overlayDepthBudget(drawingSize.x, drawingSize.y),
      drawingBuffer: { width: drawingSize.x, height: drawingSize.y },
    }
    window.__twinTargetInventory = balancedTargetInventory(drawingSize.x, drawingSize.y)
    window.__twinBlitSites = BLIT_SITES
    if (armed.current) return
    armed.current = true
    window.__twinComposerLive = true
    onLive?.()
  }, 2)
  return null
}

function ToneMappingBridge({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    gl.toneMapping = active ? NoToneMapping : AgXToneMapping
  }, [active, gl])
  useFrame(() => {
    gl.toneMapping = active ? NoToneMapping : AgXToneMapping
  }, -2)
  return null
}

function ComposerBudget({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl)
  const { composer } = use(EffectComposerContext)
  useLayoutEffect(() => {
    gl.getDrawingBufferSize(drawingSize)
    if (drawingSize.x > 1 && drawingSize.y > 1) {
      composer.setSize(drawingSize.x, drawingSize.y)
    }
    window.__twinComposerInput = active ? composer.inputBuffer : null
    if (!active) releaseMonitorTarget()
    return () => {
      if (window.__twinComposerInput === composer.inputBuffer) window.__twinComposerInput = null
    }
  }, [active, composer, gl])
  return null
}

type ContactMaterials = {
  depthMaterial: MeshDepthMaterial
  horizontalBlurMaterial: ShaderMaterial
  verticalBlurMaterial: ShaderMaterial
}

let contactMaterials: ContactMaterials | null = null

function getContactMaterials(): ContactMaterials {
  if (contactMaterials) return contactMaterials
  const depthMaterial = new MeshDepthMaterial()
  depthMaterial.depthTest = false
  depthMaterial.depthWrite = false
  const shadowColor = new Color('#2c261c')
  depthMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.ucolor = { value: shadowColor }
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'uniform vec3 ucolor;\nvoid main() {',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );',
    )
  }
  const horizontalBlurMaterial = new ShaderMaterial(HorizontalBlurShader)
  const verticalBlurMaterial = new ShaderMaterial(VerticalBlurShader)
  verticalBlurMaterial.depthTest = false
  horizontalBlurMaterial.depthTest = false
  contactMaterials = { depthMaterial, horizontalBlurMaterial, verticalBlurMaterial }
  return contactMaterials
}

/**
 * 接触阴影的材质跨切档复用，避免 programs 持续上涨。
 * 渲染目标和几何在均衡档卸载时 dispose。
 */
function DisposableContactShadows({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const group = useRef<Group>(null)
  const camera = useRef<OrthographicCamera>(null)
  const baked = useRef(false)
  const scale = CONTACT_SHADOW_SCALE
  const materials = useMemo(() => getContactMaterials(), [])
  const [targets, setTargets] = useState<{
    renderTarget: WebGLRenderTarget
    renderTargetBlur: WebGLRenderTarget
    planeGeometry: PlaneGeometry
    blurPlane: Mesh
  } | null>(null)

  useLayoutEffect(() => {
    if (!active) {
      baked.current = false
      setTargets(null)
      return
    }
    const renderTarget = new WebGLRenderTarget(CONTACT_SHADOW_RESOLUTION, CONTACT_SHADOW_RESOLUTION)
    const renderTargetBlur = new WebGLRenderTarget(CONTACT_SHADOW_RESOLUTION, CONTACT_SHADOW_RESOLUTION)
    renderTarget.texture.generateMipmaps = false
    renderTargetBlur.texture.generateMipmaps = false
    const planeGeometry = new PlaneGeometry(scale, scale).rotateX(Math.PI / 2)
    const blurPlane = new Mesh(planeGeometry)
    setTargets({ renderTarget, renderTargetBlur, planeGeometry, blurPlane })
    baked.current = false
    return () => {
      renderTarget.dispose()
      renderTargetBlur.dispose()
      planeGeometry.dispose()
      baked.current = false
    }
  }, [active, scale])

  useFrame(() => {
    if (!active || baked.current || !camera.current || !group.current || !targets) return
    baked.current = true
    const { renderTarget, renderTargetBlur, blurPlane } = targets
    const { depthMaterial, horizontalBlurMaterial, verticalBlurMaterial } = materials
    const blurOnce = (amount: number) => {
      blurPlane.visible = true
      blurPlane.material = horizontalBlurMaterial
      horizontalBlurMaterial.uniforms.tDiffuse.value = renderTarget.texture
      horizontalBlurMaterial.uniforms.h.value = amount * (1 / 256)
      gl.setRenderTarget(renderTargetBlur)
      gl.render(blurPlane, camera.current!)
      blurPlane.material = verticalBlurMaterial
      verticalBlurMaterial.uniforms.tDiffuse.value = renderTargetBlur.texture
      verticalBlurMaterial.uniforms.v.value = amount * (1 / 256)
      gl.setRenderTarget(renderTarget)
      gl.render(blurPlane, camera.current!)
      blurPlane.visible = false
    }
    const prevBackground = scene.background
    const prevOverride = scene.overrideMaterial
    group.current.visible = false
    scene.background = null
    scene.overrideMaterial = depthMaterial
    gl.setRenderTarget(renderTarget)
    gl.render(scene, camera.current)
    blurOnce(2.1)
    blurOnce(2.1 * 0.4)
    gl.setRenderTarget(null)
    group.current.visible = true
    scene.overrideMaterial = prevOverride
    scene.background = prevBackground
  })

  if (!active || !targets) return null

  return (
    <group ref={group} position={CONTACT_SHADOW_POSITION} rotation-x={Math.PI / 2}>
      <mesh geometry={targets.planeGeometry} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial transparent map={targets.renderTarget.texture} opacity={0.5} depthWrite={false} />
      </mesh>
      <orthographicCamera
        ref={camera}
        args={[-scale / 2, scale / 2, scale / 2, -scale / 2, 0, CONTACT_SHADOW_FAR]}
      />
    </group>
  )
}

export function ContactGround({ active = true }: { active?: boolean }) {
  return <DisposableContactShadows active={active} />
}

/**
 * 只在第一次切到均衡档之后保持挂载。切回性能档时 enabled=false 并收缩渲染目标，
 * shader 程序复用，不再每切一次重新编译。
 * D119：告警屏在 AgX 之后画进单采样、带场景深度的离屏 FBO，再用全屏四边形写回合成器。
 * 深度由 MonitorAfterTone 在离屏 FBO 里只重画挡住告警屏的实体，不再 blit 合成器深度。
 */
export function PostFX({ onLive, active = true }: { onLive?: () => void; active?: boolean }) {
  return (
    <>
      <ToneMappingBridge active={active} />
      <EffectComposer enabled={active} multisampling={0} enableNormalPass={false} stencilBuffer={false} renderPriority={1}>
        <ComposerBudget active={active} />
        <BalancedAO />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <MonitorAfterTone />
      </EffectComposer>
      <MarkComposerLive onLive={onLive} active={active} />
    </>
  )
}
