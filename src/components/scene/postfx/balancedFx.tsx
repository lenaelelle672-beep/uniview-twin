import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { Pass, ToneMappingMode } from 'postprocessing'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  Group,
  Mesh,
  MeshDepthMaterial,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib'
import { MONITOR_LAYER } from '../../../scene/overlayOrder'
import {
  CONTACT_SHADOW_FAR,
  CONTACT_SHADOW_POSITION,
  CONTACT_SHADOW_RESOLUTION,
  CONTACT_SHADOW_SCALE,
} from '../../../scene/shellVersion'

class MonitorDrawPass extends Pass {
  constructor(scene: Scene, camera: Camera) {
    super('MonitorDrawPass', scene, camera)
    this.needsSwap = false
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget) {
    if (!this.scene.getObjectByName('WorkstationMonitors')) return
    const prevTone = renderer.toneMapping
    const prevExposure = renderer.toneMappingExposure
    const prevAutoClear = renderer.autoClear
    const prevMask = this.camera.layers.mask
    const prevBackground = this.scene.background
    const prevTarget = renderer.getRenderTarget()
    renderer.autoClear = false
    renderer.toneMapping = NoToneMapping
    renderer.toneMappingExposure = 1
    this.camera.layers.set(MONITOR_LAYER)
    this.scene.background = null
    renderer.setRenderTarget(inputBuffer)
    renderer.render(this.scene, this.camera)
    this.scene.background = prevBackground
    this.camera.layers.mask = prevMask
    renderer.toneMapping = prevTone
    renderer.toneMappingExposure = prevExposure
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prevTarget)
  }
}

function MonitorInComposer() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const pass = useMemo(() => new MonitorDrawPass(scene, camera), [camera, scene])
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

function MarkComposerLive({ onLive }: { onLive?: () => void }) {
  const once = useRef(false)
  useFrame(() => {
    if (once.current) return
    once.current = true
    window.__twinComposerLive = true
    onLive?.()
  }, 2)
  return null
}

/**
 * drei ContactShadows 卸载时不 dispose 渲染目标和几何。
 * 这里自己管生命周期，切回性能档时把 2 张贴图和 1 个几何体释放掉。
 */
function DisposableContactShadows() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const group = useRef<Group>(null)
  const camera = useRef<OrthographicCamera>(null)
  const baked = useRef(false)
  const scale = CONTACT_SHADOW_SCALE
  const resources = useMemo(() => {
    const renderTarget = new WebGLRenderTarget(CONTACT_SHADOW_RESOLUTION, CONTACT_SHADOW_RESOLUTION)
    const renderTargetBlur = new WebGLRenderTarget(CONTACT_SHADOW_RESOLUTION, CONTACT_SHADOW_RESOLUTION)
    renderTarget.texture.generateMipmaps = false
    renderTargetBlur.texture.generateMipmaps = false
    const planeGeometry = new PlaneGeometry(scale, scale).rotateX(Math.PI / 2)
    const blurPlane = new Mesh(planeGeometry)
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
    return {
      renderTarget,
      renderTargetBlur,
      planeGeometry,
      blurPlane,
      depthMaterial,
      horizontalBlurMaterial,
      verticalBlurMaterial,
    }
  }, [scale])

  useLayoutEffect(
    () => () => {
      resources.renderTarget.dispose()
      resources.renderTargetBlur.dispose()
      resources.planeGeometry.dispose()
      resources.depthMaterial.dispose()
      resources.horizontalBlurMaterial.dispose()
      resources.verticalBlurMaterial.dispose()
    },
    [resources],
  )

  useFrame(() => {
    if (baked.current || !camera.current || !group.current) return
    baked.current = true
    const { renderTarget, renderTargetBlur, blurPlane, depthMaterial, horizontalBlurMaterial, verticalBlurMaterial } =
      resources
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

  return (
    <group ref={group} position={CONTACT_SHADOW_POSITION} rotation-x={Math.PI / 2}>
      <mesh geometry={resources.planeGeometry} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial transparent map={resources.renderTarget.texture} opacity={0.5} depthWrite={false} />
      </mesh>
      <orthographicCamera
        ref={camera}
        args={[-scale / 2, scale / 2, scale / 2, -scale / 2, 0, CONTACT_SHADOW_FAR]}
      />
    </group>
  )
}

export function ContactGround() {
  return <DisposableContactShadows />
}

/**
 * 只在非性能档挂载。合成器会把 gl.toneMapping 强制成 NoToneMapping，
 * 所以 AgX 必须写在合成器末尾，不能只靠 Canvas 上的设置。
 * 告警屏插在 RenderPass 之后、色调映射之前，直接写进合成器带深度的缓冲。
 */
export function PostFX({ onLive }: { onLive?: () => void }) {
  return (
    <>
      <EffectComposer multisampling={2} enableNormalPass={false} stencilBuffer={false} renderPriority={1}>
        <MonitorInComposer />
        <BalancedAO />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
      <MarkComposerLive onLive={onLive} />
    </>
  )
}
