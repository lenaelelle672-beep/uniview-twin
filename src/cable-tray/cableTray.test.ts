import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TubeGeometry, Vector3 } from 'three'
import { CABLE_TRAY_SOURCE_BLOCK, stripCableTraySource, threeImportNames } from '../../scripts/cableTrayPlugin'
import { composeOverlay } from '../grid/mount'
import { cableTubeArgs } from './curve'
import {
  CABLE_RUNS,
  CABLE_RUN_CAP,
  CABLE_TRAY_LAYERS,
  INTERIOR_WALL_TOP_M,
  TUBE_CURVE_TENSION,
  TUBE_CURVE_TYPE,
  TUBE_POINT_CAP,
  TUBE_RADIAL_CAP,
  TUBE_SEGMENT_CAP,
  cableRunVertexCount,
  cableTrayOptOut,
  cableTrayOptOutAtBoot,
  cableTraySearchOfUrl,
  cableTrayState,
  cableTrayVisible,
} from './plan'
import { interiorPose, type InteriorHost } from './pose'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const openGate = {
  view: 'floor',
  floorId: 'F12',
  optOut: false,
  exploded: false,
  explodeProgress: 0,
  stationActive: false,
  stationAnimating: false,
  stationProgress: 0,
}

describe('桥架门闩', () => {
  it('只在地上单层休息姿态打开', () => {
    expect(cableTrayState(openGate)).toBe('on')
    expect(cableTrayVisible(openGate)).toBe(true)
    expect(cableTrayState({ ...openGate, view: 'building' })).toBe('off-view')
    expect(cableTrayState({ ...openGate, view: 'blueprint' })).toBe('off-view')
    expect(cableTrayState({ ...openGate, floorId: null })).toBe('off-view')
    expect(cableTrayState({ ...openGate, floorId: 'B1' })).toBe('off-basement')
    expect(cableTrayState({ ...openGate, exploded: true })).toBe('off-explode')
    expect(cableTrayState({ ...openGate, explodeProgress: 0.2 })).toBe('off-explode')
    expect(cableTrayState({ ...openGate, stationActive: true })).toBe('off-station')
    expect(cableTrayState({ ...openGate, stationAnimating: true })).toBe('off-station')
    expect(cableTrayState({ ...openGate, stationProgress: 0.4 })).toBe('off-station')
    expect(cableTrayState({ ...openGate, optOut: true, exploded: true })).toBe('off-switch')
    expect(cableTrayVisible({ ...openGate, floorId: 'B1' })).toBe(false)
  })

  it('?cableTray=0 关掉，启动地址里的也算', () => {
    expect(cableTrayOptOut('')).toBe(false)
    expect(cableTrayOptOut('?cableTray=0')).toBe(true)
    expect(cableTrayOptOut('cableTray=0&q=perf')).toBe(true)
    expect(cableTrayOptOut('?cableTray=1')).toBe(false)
    expect(cableTraySearchOfUrl('http://127.0.0.1:5190/?cableTray=0#floor')).toBe('?cableTray=0')
    expect(cableTrayOptOutAtBoot('', 'http://127.0.0.1:5190/?q=balanced&cableTray=0')).toBe(true)
    expect(cableTrayOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('静态扫掠', () => {
  it('只有三根管，分段和半径都留得很小', () => {
    expect(CABLE_RUNS).toHaveLength(CABLE_RUN_CAP)
    expect(CABLE_RUN_CAP).toBe(3)
    expect(TUBE_CURVE_TYPE).toBe('catmullrom')
    expect(TUBE_CURVE_TENSION).toBeGreaterThan(0)
    expect(TUBE_CURVE_TENSION).toBeLessThanOrEqual(0.5)
    expect(CABLE_TRAY_LAYERS).toEqual({
      furniture: 'separate',
      explode: 'hidden',
      anchor: 'floor-interior',
    })
    const names = CABLE_RUNS.map((run) => run.name)
    expect(names).toEqual(['CableTraySpine', 'NorthServicePipe', 'ServiceRiser'])
    let vertices = 0
    for (const run of CABLE_RUNS) {
      expect(run.points.length).toBeGreaterThanOrEqual(3)
      expect(run.points.length).toBeLessThanOrEqual(TUBE_POINT_CAP)
      expect(run.tubularSegments).toBeGreaterThan(0)
      expect(run.tubularSegments).toBeLessThanOrEqual(TUBE_SEGMENT_CAP)
      expect(run.radialSegments).toBeGreaterThanOrEqual(3)
      expect(run.radialSegments).toBeLessThanOrEqual(TUBE_RADIAL_CAP)
      expect(run.radius).toBeGreaterThan(0.015)
      expect(run.radius).toBeLessThan(0.08)
      expect(run.closed).toBe(false)
      expect(run.metalness).toBeLessThan(1)
      vertices += cableRunVertexCount(run)
      for (const point of run.points) {
        expect(point[1]).toBeGreaterThan(0.8)
        expect(point[1]).toBeLessThan(3.2)
      }
      if (run.kind !== 'riser') {
        for (const point of run.points) expect(point[1]).toBeGreaterThan(INTERIOR_WALL_TOP_M)
      }
    }
    expect(vertices).toBeLessThan(300)
    const byId = Object.fromEntries(CABLE_RUNS.map((run) => [run.id, run]))
    const spine = byId.spine
    const branch = byId.branch
    const riser = byId.riser
    if (!spine || !branch || !riser) throw new Error('管子缺了')
    expect(branch.points[0]).toEqual(spine.points[2])
    expect(riser.points[0]).toEqual(spine.points[3])
  })

  it('args 只建一次，扫出来的是弯管而不是直线', () => {
    const first = cableTubeArgs()
    const second = cableTubeArgs()
    expect(second).toBe(first)
    expect(first).toHaveLength(3)
    for (const built of first) {
      expect(second.find((item) => item.run.id === built.run.id)?.args).toBe(built.args)
      const [curve, tubular, radius, radial, closed] = built.args
      expect(curve.type).toBe('CatmullRomCurve3')
      expect(tubular).toBe(built.run.tubularSegments)
      expect(radius).toBe(built.run.radius)
      expect(radial).toBe(built.run.radialSegments)
      expect(closed).toBe(false)
      const geometry = new TubeGeometry(curve, tubular, radius, radial, closed)
      expect(geometry.getAttribute('position').count).toBe(cableRunVertexCount(built.run))
      geometry.dispose()
      const start = curve.getPoint(0)
      const mid = curve.getPoint(0.5)
      const end = curve.getPoint(1)
      const chord = new Vector3().copy(end).sub(start)
      const along = new Vector3().copy(mid).sub(start)
      const cross = new Vector3().crossVectors(chord, along)
      expect(cross.length() / chord.length()).toBeGreaterThan(0.15)
    }
  })

  it('室内组有平移才给出姿态，单位矩阵继续等', () => {
    const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 48, 0, 1])
    let updated = false
    const host: InteriorHost = {
      matrixWorld: { elements: matrix },
      updateWorldMatrix() {
        updated = true
      },
    }
    const pose = interiorPose(host)
    expect(updated).toBe(true)
    expect(pose?.position).toEqual([0, 48, 0])
    expect(pose?.quaternion).toEqual([0, 0, 0, 1])
    const identity = new Float32Array(16)
    identity[0] = identity[5] = identity[10] = identity[15] = 1
    expect(interiorPose({ ...host, matrixWorld: { elements: identity } })).toBeNull()
  })
})

describe('桥架接线', () => {
  it('shapes 里的 Tube 懒挂在 dock 哈希之后，不进首屏，不替换实例家具', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./CableTrays.tsx')
    const plan = read('./plan.ts')
    const curve = read('./curve.ts')
    const pose = read('./pose.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/cableTrayPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const shapes = read('../../node_modules/@react-three/drei/core/shapes.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const shapesGzip = gzipSync(readFileSync(join(here, '../../node_modules/@react-three/drei/core/shapes.js')), {
      level: 9,
    }).length

    expect(dock).toContain(CABLE_TRAY_SOURCE_BLOCK)
    expect(dock).toMatch(/mod\.mountRelationArcs\(\)\n\}\)\n\n\/\/ T126：/)
    expect(stripCableTraySource(dock)).not.toMatch(/cable-tray|mountCableTray/)
    expect(stripCableTraySource(dock)).toMatch(/mod\.mountRelationArcs\(\)\n\}\)\n$/)
    expect(() => stripCableTraySource('const dock = 1')).toThrow()
    expect(plugin).toContain(CABLE_TRAY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'cable-tray-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/CableTrayMount\.js/)
    expect(plugin).toMatch(/assets\/CableTrays\.js/)
    expect(plugin).toMatch(/assets\/shapes\.js/)
    expect(threeImportNames()).toEqual(
      expect.arrayContaining(['Box3', 'CatmullRomCurve3', 'Float32BufferAttribute', 'Matrix4', 'Quaternion', 'Vector3']),
    )

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('roundedBoxAfterHash()')).toBeGreaterThan(plugins.indexOf('shellShaderAfterHash()'))
    expect(plugins.indexOf('relationArcAfterHash()')).toBeGreaterThan(plugins.indexOf('roundedBoxAfterHash()'))
    expect(plugins.indexOf('cableTrayAfterHash()')).toBeGreaterThan(plugins.indexOf('relationArcAfterHash()'))
    expect(plugins.indexOf('cableTrayAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinCableTrayNode/)
    expect(grid).toMatch(/__twinRoundedBoxNode/)
    expect(composeOverlay.length).toBe(3)
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'tubes'),
    ).toBe('tubes')
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'rounded'),
    ).toBe('rounded')

    expect(mount).toMatch(/import\('\.\/CableTrays'\)/)
    expect(mount).not.toMatch(/import \{ CableTrays \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|from '\.\/curve'|from '\.\/pose'|https?:|useFrame/)
    expect(mount).toMatch(/__twinCableTrayNode/)
    expect(mount).toMatch(/cableTrayOptOutAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|InstancedMesh|setMatrixAt|useFrame/)
    expect(curve).toMatch(/new CatmullRomCurve3/)
    expect(curve).toMatch(/if \(cache\) return cache/)
    expect(curve).not.toMatch(/useFrame|setMatrixAt/)
    expect(pose).not.toMatch(/setMatrixAt|instanceMatrix|useFrame/)
    expect(probe).toMatch(/impl: 'drei-Tube'/)
    expect(probe).toMatch(/module: 'drei-shapes'/)
    expect(probe).toMatch(/useFrame: false/)
    expect(probe).toMatch(/argsOnce: true/)
    expect(probe).toMatch(/replacesInstanced: false/)
    expect(probe).toMatch(/writesInstanceMatrix: false/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)

    expect(shapes).toMatch(/const Tube = \/\* @__PURE__ \*\/create\('tube'\)/)
    expect(shapes).toMatch(/import \* as THREE from 'three'/)
    expect(shapes).not.toMatch(/useFrame/)
    expect(shapesGzip).toBeGreaterThan(39)
    expect(shapesGzip).toBeLessThan(1200)

    expect(live).toMatch(/from '@react-three\/drei\/core\/shapes'/)
    expect(live).toMatch(/const TUBE_RUNS = cableTubeArgs\(\)/)
    expect(live).toMatch(/<Tube/)
    expect(live).toMatch(/args=\{item\.args\}/)
    expect(live).toMatch(/meshStandardMaterial/)
    expect(live).toMatch(/raycast=\{ignoreTubePick\}/)
    expect(live).toMatch(/getObjectByName\('FloorInterior'\)/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/new CatmullRomCurve3|new TubeGeometry|useFrame|setMatrixAt|<instancedMesh|transmission|MeshPhysicalMaterial/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg|setFrameloop/)

    const untouched = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../components/scene/InstancedProp.tsx',
      '../components/scene/Site.tsx',
      '../scene/stage/geometry.ts',
      '../scene/stage/workstationMeshes.tsx',
      '../floors/floorInteriorMesh.ts',
      '../kenney-furniture/KenneyStations.tsx',
      '../scene/explode.ts',
      '../scene/softShadows.ts',
      '../rounded-box/RoundedCarriers.tsx',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/CableTrays|mountCableTray|cable-tray|drei\/core\/shapes/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
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
  })
})
