import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Scene,
  Vector3,
} from 'three'
import { resetTwinStore, useTwinStore } from '../../store/store'
import type { LayerFlags } from '../../store/viewSlice'
import {
  STRUCTURE_EDGE_NAME,
  STRUCTURE_HIDE_STASH,
  STRUCTURE_OVERLAY_KEY,
  STRUCTURE_WIRE_STASH,
  STRUCTURE_WIREFRAME_NAME,
  structureOverlay,
} from './structureLatch'
import {
  STRUCTURE_EDGE_POLYGON_OFFSET,
  STRUCTURE_EDGE_THRESHOLD,
  structureEdgeColor,
  structureEdgeKind,
  type StructureEdgeCandidate,
} from './structureTargets'
import { resetStructureEdgesForTests, syncStructureEdges } from './structureEdges'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function candidate(patch: Partial<StructureEdgeCandidate> & Pick<StructureEdgeCandidate, 'name'>): StructureEdgeCandidate {
  return {
    parentName: '',
    view: 'building',
    floorId: null,
    visible: true,
    instanced: false,
    ...patch,
  }
}

function crease(tilt: number): BufferGeometry {
  const geometry = new BufferGeometry()
  // 两片三角共用一条边，绕向相反，折角随 tilt 变。0.05 大约几度，15° 阈值会丢掉这条折痕。
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, tilt]), 3),
  )
  return geometry
}

function edgeCount(root: Scene): number {
  let count = 0
  root.traverse((object) => {
    if (object.name === STRUCTURE_EDGE_NAME) count += 1
  })
  return count
}

describe('结构边和 Wireframe 门闩', () => {
  it('两个都开时 Edges 胜出，缺省的 wireframe 当关', () => {
    expect(structureOverlay(null)).toBe('off')
    expect(structureOverlay({})).toBe('off')
    expect(structureOverlay({ edges: false, wireframe: false })).toBe('off')
    expect(structureOverlay({ edges: true })).toBe('edges')
    expect(structureOverlay({ wireframe: true })).toBe('wireframe')
    expect(structureOverlay({ edges: true, wireframe: true })).toBe('edges')
    expect(structureOverlay({ edges: false, wireframe: true })).toBe('wireframe')
  })
})

describe('只认楼壳或当前层', () => {
  it('总览要幕墙、层带、女儿墙、裙楼和 B1 底板', () => {
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F12' }))).toBe('shell')
    expect(structureEdgeKind(candidate({ name: 'FloorBand-F3' }))).toBe('shell')
    expect(structureEdgeKind(candidate({ name: 'RoofParapet' }))).toBe('shell')
    expect(structureEdgeKind(candidate({ name: 'B1Slab' }))).toBe('shell')
    expect(structureEdgeKind(candidate({ name: '', parentName: 'Podium' }))).toBe('shell')
    expect(structureEdgeKind(candidate({ name: 'CourtyardWall', parentName: 'Podium' }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorSlab' }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F1', visible: false }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F1', instanced: true }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F1', view: 'blueprint' }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F1', view: 'floor', floorId: 'F1' }))).toBeNull()
  })

  it('单层只要当前层的楼板、核心筒和本层层带', () => {
    const floor = { view: 'floor', floorId: 'F12' }
    expect(structureEdgeKind(candidate({ name: 'FloorSlab', ...floor }))).toBe('floor')
    expect(structureEdgeKind(candidate({ name: 'FloorCores', ...floor }))).toBe('floor')
    expect(structureEdgeKind(candidate({ name: 'FloorBand-F12', ...floor }))).toBe('floor')
    expect(structureEdgeKind(candidate({ name: 'FloorBand-F11', ...floor }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorCurtain-F12', ...floor }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'B1Slab', ...floor }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'RoofParapet', ...floor }))).toBeNull()
    expect(structureEdgeKind(candidate({ name: 'FloorSlab', view: 'floor', floorId: null }))).toBeNull()
    const furniture = [
      'WorkstationDesks',
      'WorkstationMonitors',
      'OfficeDesks',
      'FloorColumns',
      'FloorWalls',
      'FloorGlass',
      'CanteenChairs',
      'CanteenTables',
      'PantryPad',
      'EastGrille',
    ]
    for (const name of furniture) {
      expect(structureEdgeKind(candidate({ name, ...floor }))).toBeNull()
      expect(structureEdgeKind(candidate({ name }))).toBeNull()
    }
  })
})

describe('挂上和卸下', () => {
  beforeEach(() => {
    resetTwinStore()
    resetStructureEdgesForTests()
  })

  it('默认没有边；打开后只挂壳，关掉就清掉', () => {
    const scene = new Scene()
    const curtain = new Mesh(new BoxGeometry(4, 3, 4), new MeshBasicMaterial())
    curtain.name = 'FloorCurtain-F12'
    const desk = new Mesh(new BoxGeometry(1, 0.7, 0.6), new MeshBasicMaterial())
    desk.name = 'WorkstationDesks'
    const hidden = new Group()
    hidden.visible = false
    const upper = new Mesh(new BoxGeometry(4, 3, 4), new MeshBasicMaterial())
    upper.name = 'FloorCurtain-F22'
    hidden.add(upper)
    const podium = new Group()
    podium.name = 'Podium'
    const shell = new Mesh(new BoxGeometry(8, 4, 8), new MeshBasicMaterial())
    const court = new Mesh(new BoxGeometry(2, 1, 2), new MeshBasicMaterial())
    court.name = 'CourtyardWall'
    podium.add(shell, court)
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2)
    instanced.name = 'FloorBand-F1'
    scene.add(curtain, desk, hidden, podium, instanced)

    expect(syncStructureEdges({ root: scene, schedule: false })).toBe(0)
    expect(edgeCount(scene)).toBe(0)

    useTwinStore.getState().setLayer('edges', true)
    expect(syncStructureEdges({ root: scene, schedule: false })).toBe(2)
    expect(edgeCount(scene)).toBe(2)
    expect(curtain.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
    expect(shell.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
    expect(desk.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(court.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(upper.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(instanced.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)

    const line = curtain.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as Mesh
    const material = line.material as LineBasicMaterial
    expect(material.linewidth).toBe(1)
    expect(material.polygonOffset).toBe(true)
    expect(material.polygonOffsetFactor).toBe(STRUCTURE_EDGE_POLYGON_OFFSET)
    expect(material.polygonOffsetUnits).toBe(STRUCTURE_EDGE_POLYGON_OFFSET)
    expect(material.fog).toBe(true)
    expect(material.color.getHexString()).toBe('1b2836')
    const built = new EdgesGeometry(curtain.geometry, STRUCTURE_EDGE_THRESHOLD)
    expect(line.geometry.getAttribute('position').count).toBe(built.getAttribute('position').count)
    built.dispose()

    syncStructureEdges({ root: scene, schedule: false })
    expect(edgeCount(scene)).toBe(2)

    useTwinStore.getState().setLayer('edges', false)
    expect(syncStructureEdges({ root: scene, schedule: false })).toBe(0)
    expect(edgeCount(scene)).toBe(0)
  })

  it('threshold 15 会丢掉浅折痕，线的顶点数跟这个阈值一致', () => {
    const geometry = crease(0.05)
    const loose = new EdgesGeometry(geometry, 1)
    const tight = new EdgesGeometry(geometry, STRUCTURE_EDGE_THRESHOLD)
    expect(STRUCTURE_EDGE_THRESHOLD).toBe(15)
    expect(tight.getAttribute('position').count).toBeLessThan(loose.getAttribute('position').count)

    const scene = new Scene()
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    mesh.name = 'FloorCurtain-F1'
    scene.add(mesh)
    useTwinStore.getState().setLayer('edges', true)
    syncStructureEdges({ root: scene, schedule: false })
    const line = mesh.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as Mesh
    expect(line.geometry.getAttribute('position').count).toBe(tight.getAttribute('position').count)
    loose.dispose()
    tight.dispose()
  })

  it('进当前层后卸掉整栋壳，只留这一层的楼板和层带', () => {
    const scene = new Scene()
    const curtain = new Mesh(new BoxGeometry(4, 3, 4), new MeshBasicMaterial())
    curtain.name = 'FloorCurtain-F12'
    const band = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshBasicMaterial())
    band.name = 'FloorBand-F12'
    const otherBand = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshBasicMaterial())
    otherBand.name = 'FloorBand-F11'
    const slab = new Mesh(new BoxGeometry(10, 0.16, 8), new MeshBasicMaterial())
    slab.name = 'FloorSlab'
    const columns = new Mesh(new BoxGeometry(0.4, 3, 0.4), new MeshBasicMaterial())
    columns.name = 'FloorColumns'
    scene.add(curtain, band, otherBand, slab, columns)

    useTwinStore.getState().setLayer('edges', true)
    useTwinStore.getState().enterFloor('F12')
    expect(syncStructureEdges({ root: scene, schedule: false })).toBe(2)
    expect(curtain.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(otherBand.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(columns.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(false)
    expect(slab.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
    expect(band.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
  })

  it('楼板比层带晚进场景时，下一轮还会补上', () => {
    const queued: Array<() => void> = []
    const win = {
      setTimeout: (fn: () => void) => {
        queued.push(fn)
        return queued.length
      },
      clearTimeout: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      __twinScene: null as Scene | null,
    }
    vi.stubGlobal('window', win)
    try {
      const scene = new Scene()
      win.__twinScene = scene
      const band = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshBasicMaterial())
      band.name = 'FloorBand-F12'
      scene.add(band)
      useTwinStore.getState().setLayer('edges', true)
      useTwinStore.getState().enterFloor('F12')

      expect(syncStructureEdges()).toBe(1)
      expect(band.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
      expect(queued).toHaveLength(1)

      const slab = new Mesh(new BoxGeometry(10, 0.16, 8), new MeshBasicMaterial())
      slab.name = 'FloorSlab'
      const cores = new Mesh(new BoxGeometry(2, 3, 2), new MeshBasicMaterial())
      cores.name = 'FloorCores'
      scene.add(slab, cores)
      queued.shift()?.()

      expect(slab.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
      expect(cores.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
      expect(band.children.some((child) => child.name === STRUCTURE_EDGE_NAME)).toBe(true)
      expect(queued.length).toBeGreaterThan(0)
    } finally {
      resetStructureEdgesForTests()
      vi.unstubAllGlobals()
    }
  })

  it('单层的层带把剖切平面抄到线上，楼板不裁', () => {
    const scene = new Scene()
    const plane = new Plane(new Vector3(0, -1, 0), 12)
    const band = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshBasicMaterial({ clippingPlanes: [plane] }))
    band.name = 'FloorBand-F8'
    const slab = new Mesh(new BoxGeometry(10, 0.16, 8), new MeshBasicMaterial())
    slab.name = 'FloorSlab'
    scene.add(band, slab)
    useTwinStore.getState().setLayer('edges', true)
    useTwinStore.getState().enterFloor('F8')
    syncStructureEdges({ root: scene, schedule: false })
    const bandLine = band.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as Mesh
    const slabLine = slab.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as Mesh
    expect((bandLine.material as LineBasicMaterial).clippingPlanes).toEqual([plane])
    expect((slabLine.material as LineBasicMaterial).clippingPlanes).toBeNull()
    expect(bandLine.material).not.toBe(slabLine.material)
  })

  it('夜景和白模换线色，不改雾', () => {
    expect(structureEdgeColor({ dayNight: 'day', presentation: 'lit' })).toBe('#1b2836')
    expect(structureEdgeColor({ dayNight: 'night', presentation: 'lit' })).toBe('#d7e6f4')
    expect(structureEdgeColor({ dayNight: 'day', presentation: 'model' })).toBe('#2a3138')
    const scene = new Scene()
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    mesh.name = 'B1Slab'
    scene.add(mesh)
    useTwinStore.setState({ layers: { ...useTwinStore.getState().layers, edges: true }, dayNight: 'night' })
    syncStructureEdges({ root: scene, schedule: false })
    const line = mesh.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as Mesh
    expect((line.material as LineBasicMaterial).color.getHexString()).toBe('d7e6f4')
  })

  it('两个开关都开时只留结构边，并暂时关掉 Wireframe', () => {
    const scene = new Scene()
    const material = new MeshStandardMaterial({ wireframe: true })
    const mesh = new Mesh(new BoxGeometry(4, 3, 4), material)
    mesh.name = 'FloorCurtain-F4'
    const overlay = new Group()
    overlay.name = STRUCTURE_WIREFRAME_NAME
    scene.add(mesh, overlay)
    const layers = { ...useTwinStore.getState().layers, edges: true, wireframe: true } as LayerFlags
    useTwinStore.setState({ layers })
    syncStructureEdges({ root: scene, schedule: false })

    expect(edgeCount(scene)).toBe(1)
    expect(mesh.children.filter((child) => child.name === STRUCTURE_EDGE_NAME)).toHaveLength(1)
    expect(material.wireframe).toBe(false)
    expect(material.userData[STRUCTURE_WIRE_STASH]).toBe(true)
    expect(overlay.visible).toBe(false)
    expect(overlay.userData[STRUCTURE_HIDE_STASH]).toBe(true)
    expect(mesh.children[0]?.userData[STRUCTURE_OVERLAY_KEY]).toBe('edges')

    useTwinStore.setState({
      layers: { ...useTwinStore.getState().layers, edges: false, wireframe: true } as LayerFlags,
    })
    syncStructureEdges({ root: scene, schedule: false })
    expect(edgeCount(scene)).toBe(0)
    expect(material.wireframe).toBe(true)
    expect(material.userData[STRUCTURE_WIRE_STASH]).toBeUndefined()
    expect(overlay.visible).toBe(true)
    expect(overlay.userData[STRUCTURE_HIDE_STASH]).toBeUndefined()
  })

  it('只开 Wireframe 时不画结构边，也不改它的材质', () => {
    const scene = new Scene()
    const material = new MeshStandardMaterial({ wireframe: true })
    const mesh = new Mesh(new BoxGeometry(), material)
    mesh.name = 'FloorCurtain-F4'
    scene.add(mesh)
    useTwinStore.setState({
      layers: { ...useTwinStore.getState().layers, edges: false, wireframe: true } as LayerFlags,
    })
    expect(syncStructureEdges({ root: scene, schedule: false })).toBe(0)
    expect(edgeCount(scene)).toBe(0)
    expect(material.wireframe).toBe(true)
    expect(material.userData[STRUCTURE_WIRE_STASH]).toBeUndefined()
  })
})

describe('结构边不进首屏，也不碰雾和选中描边', () => {
  it('图层默认关，点开才动态 import，eager 文件不引用', () => {
    const panel = read('../../viewmarks/LayerPanel.tsx')
    const arm = read('./structureEdgesArm.ts')
    const edges = read('./structureEdges.ts')
    const latch = read('./structureLatch.ts')
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
    }
    expect(panel).toMatch(/结构边/)
    expect(panel).toMatch(/import\('\.\.\/scene\/stage\/structureArm'\)/)
    expect(panel).not.toMatch(/Edges/)
    expect(panel).not.toMatch(/from '\.\.\/scene\/stage\/structureEdges/)
    expect(panel).not.toMatch(/three|@react-three|balancedFx|FogExp2|DeskOutline/)
    expect(arm).toMatch(/import\('\.\/structureEdges'\)/)
    expect(arm).not.toMatch(/from '\.\/structureEdges'|from ['"]three['"]|from ['"]three\/src|EdgesGeometry/)
    expect(edges).toMatch(/three\/src\/geometries\/EdgesGeometry\.js/)
    expect(edges).toMatch(/linewidth: 1/)
    expect(edges).toMatch(/polygonOffset: true/)
    expect(edges).toMatch(/STRUCTURE_EDGE_THRESHOLD/)
    expect(edges).not.toMatch(/linewidth:\s*[2-9]/)
    expect(edges).not.toMatch(/import \{[^}]+\} from ['"]three['"]/)
    expect(edges).not.toMatch(/@react-three\/drei|three-stdlib|DeskOutline|FogExp2/)
    expect(edges).toMatch(/import type \{[^}]+\} from ['"]three['"]/)
    expect(latch).toMatch(/edges === true/)
    expect(latch).toMatch(/只画 Edges/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
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

    const eager = [
      '../../components/Scene.tsx',
      '../../components/Stage.tsx',
      '../../components/scene/Tower.tsx',
      '../../components/scene/postfx/balancedFx.tsx',
      '../../components/scene/DemandLoop.tsx',
      '../fog.ts',
      './FloorStage.tsx',
      './prefetchLazyChunks.ts',
      './DeskOutline.tsx',
      '../../viewmarks/dock.tsx',
    ]
    for (const file of eager) {
      const source = read(file)
      expect(source).not.toMatch(/structureEdges|EdgesGeometry|StructureEdges/)
    }
    expect(read('../fog.ts')).toMatch(/day: 0\.00112/)
    expect(read('../fog.ts')).toMatch(/night: 0\.00096/)
  })
})
