import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { resetTwinStore, useTwinStore } from '../../store/store'
import { edgesOverlayOn, wireframeOverlayOn } from './latch'
import { collectWireMeshes, prepareWireGeometry, wireTargetMode } from './targets'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function mesh(name: string, parent: Group): Mesh {
  const node = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  node.name = name
  parent.add(node)
  return node
}

function sceneFixture() {
  const scene = new Group()
  scene.name = 'Scene'
  const tower = new Group()
  tower.name = 'Tower'
  const shell = new Group()
  shell.name = 'FloorShell-F12'
  mesh('FloorCurtain-F12', shell)
  mesh('FloorBand-F12', shell)
  const hiddenShell = new Group()
  hiddenShell.name = 'FloorShell-F13'
  hiddenShell.visible = false
  mesh('FloorCurtain-F13', hiddenShell)
  const roof = new Group()
  roof.name = 'RoofAssembly'
  mesh('', roof)
  mesh('RoofParapet', roof)
  const sign = new Group()
  sign.name = 'RoofSign'
  mesh('SignGlyph', sign)
  roof.add(sign)
  mesh('roof_sign', roof)
  tower.add(shell, hiddenShell, roof)
  const east = new Group()
  east.name = 'EastBlock'
  mesh('', east)
  const grille = new Group()
  grille.name = 'EastGrille'
  mesh('GrilleDense', grille)
  east.add(grille)
  const fins = new InstancedMesh(new BoxGeometry(0.1, 1, 0.1), new MeshStandardMaterial(), 4)
  fins.name = 'Fins'
  east.add(fins)
  const podium = new Group()
  podium.name = 'Podium'
  mesh('CourtyardWall', podium)
  const basement = new Group()
  basement.name = 'B1'
  mesh('B1Slab', basement)
  mesh('B1Zones', basement)
  const interior = new Group()
  interior.name = 'FloorInterior'
  mesh('FloorSlab', interior)
  mesh('FloorCores', interior)
  mesh('PantryPad', interior)
  const desks = new InstancedMesh(new BoxGeometry(0.4, 0.4, 0.4), new MeshStandardMaterial(), 2)
  desks.name = 'WorkstationDesks'
  interior.add(desks)
  const cap = mesh('StencilCap', scene)
  scene.add(tower, east, podium, basement, interior)
  return { scene, cap }
}

describe('线框和棱边的门闩', () => {
  it('两边都开时 Edges 胜出，线框不画', () => {
    expect(wireframeOverlayOn(null)).toBe(false)
    expect(edgesOverlayOn(undefined)).toBe(false)
    expect(wireframeOverlayOn({})).toBe(false)
    expect(wireframeOverlayOn({ wireframe: false })).toBe(false)
    expect(wireframeOverlayOn({ wireframe: true })).toBe(true)
    expect(edgesOverlayOn({ edges: true, wireframe: true })).toBe(true)
    expect(wireframeOverlayOn({ edges: true, wireframe: true })).toBe(false)
    expect(wireframeOverlayOn({ edges: true, wireframe: false })).toBe(false)
    expect(edgesOverlayOn({ edges: false, wireframe: true })).toBe(false)
  })
})

describe('壳或当前层', () => {
  it('总览是外壳，进层才是当前层', () => {
    expect(wireTargetMode('building', null)).toBe('shell')
    expect(wireTargetMode('building', 'F12')).toBe('shell')
    expect(wireTargetMode('floor', null)).toBe('shell')
    expect(wireTargetMode('floor', 'F12')).toBe('floor')
    expect(wireTargetMode('blueprint', 'F12')).toBe('shell')
  })

  it('总览只收外壳，不收格栅、字、翅片、室内和封盖', () => {
    const { scene } = sceneFixture()
    const names = collectWireMeshes(scene, 'shell', null).map((item) => item.name)
    expect(names).toEqual(['FloorCurtain-F12', 'FloorBand-F12', '', 'RoofParapet', '', 'CourtyardWall', 'B1Slab', 'B1Zones'])
    expect(names).not.toContain('GrilleDense')
    expect(names).not.toContain('SignGlyph')
    expect(names).not.toContain('roof_sign')
    expect(names).not.toContain('Fins')
    expect(names).not.toContain('FloorSlab')
    expect(names).not.toContain('FloorCurtain-F13')
    expect(names).not.toContain('StencilCap')
  })

  it('当前层只收这一层的楼板、核心筒和这一层外壳', () => {
    const { scene } = sceneFixture()
    const names = collectWireMeshes(scene, 'floor', 'F12').map((item) => item.name)
    expect(names).toEqual(['FloorCurtain-F12', 'FloorBand-F12', 'FloorSlab', 'FloorCores', 'PantryPad'])
    expect(names).not.toContain('B1Slab')
    expect(names).not.toContain('CourtyardWall')
    expect(names).not.toContain('WorkstationDesks')

    const basement = collectWireMeshes(scene, 'floor', 'B1').map((item) => item.name)
    expect(basement).toEqual(['B1Slab', 'B1Zones', 'FloorSlab', 'FloorCores', 'PantryPad'])
  })

  it('隐藏的幕墙不收，线框网格和房间标签也不收', () => {
    const { scene } = sceneFixture()
    const curtain = scene.getObjectByName('FloorCurtain-F12') as Mesh
    curtain.visible = false
    const overlay = new Group()
    overlay.name = 'WireOverlay'
    mesh('FloorCurtain-again', overlay)
    curtain.add(overlay)
    const shell = scene.getObjectByName('FloorShell-F12') as Group
    mesh('RoomLabelBatchedText', shell)
    const names = collectWireMeshes(scene, 'floor', 'F12').map((item) => item.name)
    expect(names).not.toContain('FloorCurtain-F12')
    expect(names).not.toContain('FloorCurtain-again')
    expect(names).not.toContain('RoomLabelBatchedText')
    expect(names).toContain('FloorBand-F12')
  })
})

describe('不改外壳几何', () => {
  it('索引几何克隆成非索引，源几何和分组还在，也不打警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = new BoxGeometry(1, 2, 3)
    source.addGroup(0, 6, 0)
    const before = source.getAttribute('position').count
    const indexCount = source.index?.count ?? 0
    const groups = source.groups.length
    const next = prepareWireGeometry(source)
    expect(next).not.toBeNull()
    expect(next).not.toBe(source)
    expect(source.index?.count).toBe(indexCount)
    expect(source.groups).toHaveLength(groups)
    expect(groups).toBeGreaterThan(0)
    expect(source.getAttribute('position').count).toBe(before)
    expect(next?.index).toBeNull()
    expect(next?.groups).toEqual([])
    expect((next?.getAttribute('position').count ?? 0) % 3).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('本来就没有索引时只克隆，不调用会警告的 toNonIndexed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = new BufferGeometry()
    source.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    const next = prepareWireGeometry(source)
    expect(next).not.toBe(source)
    expect(source.getAttribute('position').count).toBe(3)
    expect(next?.getAttribute('position').count).toBe(3)
    expect(next?.index).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('线框分包', () => {
  const eager = [
    '../../components/Scene.tsx',
    '../../components/Stage.tsx',
    '../../App.tsx',
    '../../main.tsx',
    '../../index.css',
    '../stage/prefetchLazyChunks.ts',
    '../fog.ts',
    '../stage/cameraTransition.ts',
    '../../components/scene/postfx/balancedFx.tsx',
    '../softShadows.ts',
    '../groundTextures.ts',
    '../stage/DeskOutline.tsx',
    '../materials.ts',
  ]

  it('默认关，开关在图层面板，drei Wireframe 只在过了门的懒包里', () => {
    const view = read('../../store/viewSlice.ts')
    const panel = read('../../viewmarks/LayerPanel.tsx')
    const loop = read('../../components/scene/DemandLoop.tsx')
    const live = read('./ShellWireframe.tsx')
    const latch = read('./latch.ts')
    const targets = read('./targets.ts')
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals'/)
    expect(view).not.toMatch(/wireframe:\s*(true|false)/)
    expect(panel).toMatch(/\['wireframe', '线框'\]/)
    expect(panel).toMatch(/data-layer=\{key\}/)
    expect(panel).not.toMatch(/three|@react-three|Line2|Edges|FogExp2/)
    expect(loop).toMatch(/WIRE_AFTER_FIRST_MS = 2600/)
    expect(loop).toMatch(/import\('\.\.\/\.\.\/scene\/wire\/ShellWireframe'\)/)
    expect(loop).not.toMatch(/from ['"][^'"]*ShellWireframe/)
    expect(loop).not.toMatch(/@react-three\/drei\/core\/Wireframe/)
    expect(loop).not.toMatch(/Line2|WireframeGeometry|EdgesGeometry/)
    const host = loop.slice(loop.indexOf('function WireframeHost'))
    expect(host.indexOf('if (!on) return')).toBeGreaterThan(-1)
    expect(host.indexOf('if (!on) return')).toBeLessThan(host.indexOf("import('../../scene/wire/ShellWireframe')"))
    expect(host.indexOf('WIRE_AFTER_FIRST_MS')).toBeLessThan(host.indexOf("import('../../scene/wire/ShellWireframe')"))

    expect(live).toMatch(/@react-three\/drei\/core\/Wireframe/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).toMatch(/<Wireframe/)
    expect(live).toMatch(/geometry=\{geometry\}/)
    expect(live).toMatch(/fillOpacity=\{0\}/)
    expect(live).toMatch(/clippingPlanes/)
    expect(live).toMatch(/wireframeOverlayOn/)
    expect(live).not.toMatch(/Line2|LineSegments2|EdgesGeometry|WireframeGeometry|from '@react-three\/drei\/core\/Edges'/)
    expect(latch).toMatch(/prefer Edges|Edges 胜出/)
    expect(latch).toMatch(/EDGES_LAYER = 'edges'/)
    expect(targets).not.toMatch(/@react-three|Line2|FogExp2|balancedFx|softShadows/)
    expect(live).not.toMatch(/FogExp2|balancedFx|softShadows|groundTextures|cameraTransition|DeskOutline|FloorStencilCap/)

    for (const file of eager) {
      expect(read(file)).not.toMatch(/ShellWireframe|core\/Wireframe|WireframeMaterial/)
    }
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['three']).toBe('0.186.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/postprocessing',
      'postprocessing',
      'react',
      'react-dom',
      'three',
      'troika-three-text',
      'troika-three-utils',
      'troika-worker-utils',
      'zustand',
    ])
    expect(pkg.devDependencies['three-mesh-bvh']).toBeUndefined()
  })
})

describe('图层默认没有线框', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('缺省不画，打开之后才画，重复写入不换对象', () => {
    const initial = useTwinStore.getState().layers as { wireframe?: boolean; people: boolean; outlines: boolean }
    expect(initial.wireframe).toBeUndefined()
    expect(wireframeOverlayOn(initial)).toBe(false)
    useTwinStore.getState().setLayer('wireframe', false)
    const writtenOff = useTwinStore.getState().layers as { wireframe?: boolean; people: boolean; outlines: boolean }
    expect(writtenOff.wireframe).toBe(false)
    expect(writtenOff.people).toBe(true)
    useTwinStore.getState().setLayer('wireframe', false)
    expect(useTwinStore.getState().layers).toBe(writtenOff)
    useTwinStore.getState().setLayer('wireframe', true)
    expect((useTwinStore.getState().layers as { wireframe?: boolean }).wireframe).toBe(true)
    expect(useTwinStore.getState().layers.outlines).toBe(true)
    expect(wireframeOverlayOn(useTwinStore.getState().layers)).toBe(true)
    expect(edgesOverlayOn(useTwinStore.getState().layers)).toBe(false)
  })
})
