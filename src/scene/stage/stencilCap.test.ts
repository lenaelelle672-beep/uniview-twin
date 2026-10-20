import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AlwaysStencilFunc,
  BackSide,
  BoxGeometry,
  DecrementWrapStencilOp,
  DepthFormat,
  DepthTexture,
  FloatType,
  FrontSide,
  Group,
  IncrementWrapStencilOp,
  Mesh,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  Plane,
  ReplaceStencilOp,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { solidMaterial } from '../materials'
import {
  assignRestoredSettings,
  assignStencilSettings,
  captureDepthSnap,
  isComposerStencilTarget,
} from './composerStencil'
import {
  CAP_PLANE_SIZE,
  STENCIL_BACK_ORDER,
  STENCIL_CAP_LAYER,
  STENCIL_CAP_ORDER,
  STENCIL_FRONT_ORDER,
  capFacesUp,
  collectStencilSources,
  createCapMesh,
  createStencilHost,
  createStencilMaterials,
  createStencilPrimer,
  geometryLive,
  isStencilCapSource,
  orientClipCap,
  releaseStencilMaterials,
  syncCapSurface,
  syncFloorStencilCaps,
} from './stencilCap'

function clippedBox(y: number, height: number, plane: Plane) {
  const mesh = new Mesh(new BoxGeometry(2, height, 2), new MeshStandardMaterial())
  mesh.position.y = y
  mesh.material.clippingPlanes = [plane]
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('FloorCut stencil 封盖', () => {
  it('back/front 模板材质对齐官方 webgl_clipping_stencil', () => {
    const plane = new Plane(new Vector3(0, -1, 0), 12)
    const { back, front } = createStencilMaterials(plane)
    expect(back.side).toBe(BackSide)
    expect(front.side).toBe(FrontSide)
    expect(back.colorWrite).toBe(false)
    expect(front.colorWrite).toBe(false)
    expect(back.depthWrite).toBe(false)
    expect(back.depthTest).toBe(false)
    expect(front.depthTest).toBe(false)
    expect(back.stencilWrite).toBe(true)
    expect(front.stencilWrite).toBe(true)
    expect(back.stencilFunc).toBe(AlwaysStencilFunc)
    expect(front.stencilFunc).toBe(AlwaysStencilFunc)
    expect(back.stencilFail).toBe(IncrementWrapStencilOp)
    expect(back.stencilZFail).toBe(IncrementWrapStencilOp)
    expect(back.stencilZPass).toBe(IncrementWrapStencilOp)
    expect(front.stencilFail).toBe(DecrementWrapStencilOp)
    expect(front.stencilZFail).toBe(DecrementWrapStencilOp)
    expect(front.stencilZPass).toBe(DecrementWrapStencilOp)
    expect(back.clippingPlanes).toEqual([plane])
    expect(front.clippingPlanes).toEqual([plane])
    releaseStencilMaterials({ back, front })
  })

  it('封盖取壳材质的颜色，不改壳色值和切面朝上', () => {
    const before = solidMaterial.color.getHexString()
    const roughness = solidMaterial.roughness
    const metalness = solidMaterial.metalness
    const cap = createCapMesh(solidMaterial)
    const material = cap.material as MeshStandardMaterial
    try {
      expect(material.color.getHexString()).toBe(before)
      expect(material.roughness).toBe(roughness)
      expect(material.metalness).toBe(metalness)
      expect(material.stencilFunc).toBe(NotEqualStencilFunc)
      expect(material.stencilRef).toBe(0)
      expect(material.stencilFail).toBe(ReplaceStencilOp)
      expect(material.stencilZPass).toBe(ReplaceStencilOp)
      expect(material.clippingPlanes).toBeNull()
      expect(cap.renderOrder).toBe(STENCIL_CAP_ORDER)
      expect(cap.castShadow).toBe(false)
      expect(cap.layers.isEnabled(STENCIL_CAP_LAYER)).toBe(true)
      expect(cap.layers.isEnabled(0)).toBe(false)
      expect((cap.geometry as { parameters?: { width?: number } }).parameters?.width).toBe(CAP_PLANE_SIZE)
      solidMaterial.color.set('#112233')
      expect(syncCapSurface(material, solidMaterial)).toBe(true)
      expect(material.color.getHexString()).toBe('112233')
      expect(syncCapSurface(material, solidMaterial)).toBe(false)
      expect(solidMaterial.roughness).toBe(roughness)
      expect(solidMaterial.metalness).toBe(metalness)
      const plane = new Plane(new Vector3(0, -1, 0), 19.16)
      orientClipCap(cap, plane)
      expect(Math.abs(plane.distanceToPoint(cap.position))).toBeLessThan(1e-4)
      const facing = capFacesUp(cap)
      expect(facing.y).toBeGreaterThan(0.99)
      expect(Math.abs(facing.x)).toBeLessThan(1e-4)
      expect(Math.abs(facing.z)).toBeLessThan(1e-4)
    } finally {
      solidMaterial.color.set(`#${before}`)
      cap.geometry.dispose()
      material.dispose()
    }
  })

  it('只给穿过切面的外壳挂 back/front，室内和未相交的不参与', () => {
    const plane = new Plane(new Vector3(0, -1, 0), 10)
    const root = new Group()
    const crossing = clippedBox(10, 4, plane)
    crossing.name = 'EastSolid'
    const below = clippedBox(2, 2, plane)
    below.name = 'Podium'
    const hidden = clippedBox(10, 4, plane)
    hidden.name = 'UpperShell'
    hidden.visible = false
    const interiorRoot = new Group()
    interiorRoot.name = 'FloorInterior'
    const interior = clippedBox(10, 4, plane)
    interior.name = 'FloorSlab'
    interiorRoot.add(interior)
    const plain = new Mesh(new BoxGeometry(1, 4, 1), new MeshStandardMaterial())
    plain.position.y = 10
    plain.updateMatrixWorld(true)
    root.add(crossing, below, hidden, interiorRoot, plain)

    expect(isStencilCapSource(crossing, plane)).toBe(true)
    expect(isStencilCapSource(below, plane)).toBe(false)
    expect(isStencilCapSource(hidden, plane)).toBe(false)
    expect(isStencilCapSource(interior, plane)).toBe(false)
    expect(isStencilCapSource(plain, plane)).toBe(false)
    expect(collectStencilSources(root, plane)).toEqual([crossing])

    const host = createStencilHost()
    host.add(createStencilPrimer(), createCapMesh(solidMaterial))
    root.add(host)
    expect(syncFloorStencilCaps(root, plane, host, createStencilMaterials(plane))).toBe(true)
    const shells = host.children.filter((child) => child.userData.floorStencilProp !== true)
    expect(shells).toHaveLength(2)
    expect(shells.map((child) => child.renderOrder)).toEqual([STENCIL_BACK_ORDER, STENCIL_FRONT_ORDER])
    expect(shells.every((child) => child.layers.isEnabled(STENCIL_CAP_LAYER) && !child.castShadow)).toBe(true)
    expect(geometryLive(crossing.geometry)).toBe(true)
    expect(syncFloorStencilCaps(root, plane, host, createStencilMaterials(plane))).toBe(false)
    expect(host.getObjectByName('FloorStencilCap')?.visible).toBe(true)

    crossing.material.clippingPlanes = null
    expect(syncFloorStencilCaps(root, plane, host, createStencilMaterials(plane))).toBe(true)
    expect(host.children.filter((child) => child.userData.floorStencilProp !== true)).toHaveLength(0)
    expect(host.getObjectByName('FloorStencilCap')?.visible).toBe(false)
    expect(geometryLive(crossing.geometry)).toBe(true)
  })

  it('合成器只升级输入和稳定深度，还原后深度格式回去', () => {
    const input = new WebGLRenderTarget(4, 4)
    input.depthTexture = new DepthTexture(4, 4, FloatType)
    input.depthTexture.name = 'EffectComposer.InputDepth'
    input.depthTexture.format = DepthFormat
    const stable = new WebGLRenderTarget(4, 4)
    stable.depthTexture = new DepthTexture(4, 4, FloatType)
    stable.depthTexture.name = 'EffectComposer.StableDepth'
    const output = new WebGLRenderTarget(4, 4)
    output.depthTexture = new DepthTexture(4, 4, FloatType)
    output.depthTexture.name = 'EffectComposer.OutputDepth'
    const monitor = new WebGLRenderTarget(2, 2)

    expect(isComposerStencilTarget(input, input)).toBe(true)
    expect(isComposerStencilTarget(stable, input)).toBe(true)
    expect(isComposerStencilTarget(output, input)).toBe(false)
    expect(isComposerStencilTarget(monitor, input)).toBe(false)

    const snap = captureDepthSnap(input)
    expect(assignStencilSettings(input)).toBe(true)
    expect(input.stencilBuffer).toBe(true)
    expect(assignStencilSettings(input)).toBe(false)
    expect(assignRestoredSettings(input, snap)).toBe(true)
    expect(input.stencilBuffer).toBe(false)
    expect(input.depthTexture.format).toBe(DepthFormat)
    expect(input.depthTexture.type).toBe(FloatType)
    expect(assignRestoredSettings(input, snap)).toBe(false)
  })

  it('Canvas 只多 stencil，封盖懒挂载且不进硬门禁文件', () => {
    const scene = readFileSync(new URL('../../components/Scene.tsx', import.meta.url), 'utf8')
    const block = scene.slice(scene.indexOf('const CANVAS_GL'), scene.indexOf('function readGpuRenderer'))
    expect(block).toMatch(/stencil:\s*true/)
    expect(block).toMatch(/antialias:\s*true/)
    expect(block).toMatch(/alpha:\s*false/)
    expect(block).toMatch(/toneMapping:\s*AgXToneMapping/)
    expect(block).not.toMatch(/powerPreference|logarithmicDepthBuffer|premultipliedAlpha|failIfMajorPerformanceCaveat/)

    const cut = readFileSync(new URL('./FloorCut.tsx', import.meta.url), 'utf8')
    expect(cut).toMatch(/import\('\.\/FloorStencilCap'\)/)
    expect(cut).not.toMatch(/from '\.\/FloorStencilCap'/)
    expect(cut).toMatch(/cutNow == null\) return null/)
    expect(cut).toMatch(/applyEastGrilleCut/)
    const cap = readFileSync(new URL('./FloorStencilCap.tsx', import.meta.url), 'utf8')
    expect(cap).toMatch(/invalidate\(\)/)
    expect(cap).toMatch(/armComposerStencil/)
    expect(cap).toMatch(/camera\.layers\.disable\(STENCIL_CAP_LAYER\)/)

    const forbidden = [
      '../../components/scene/DemandLoop.tsx',
      '../../components/scene/postfx/balancedFx.tsx',
      '../softShadows.ts',
      '../fog.ts',
      '../materials.ts',
      './cameraRest.ts',
      '../frameSchedule.ts',
      './shellClipCompile.ts',
      './deskOutline.ts',
      './DeskOutline.tsx',
    ]
    for (const file of forbidden) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(source).not.toMatch(/FloorStencilCap|stencilCap|composerStencil/)
    }
  })
})
