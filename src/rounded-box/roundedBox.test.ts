import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { ROUNDED_BOX_SOURCE_BLOCK, stripRoundedBoxSource, threeImportNames } from '../../scripts/roundedBoxPlugin'
import { composeOverlay } from '../grid/mount'
import {
  DESK_BODY,
  ROUNDED_ANCHOR_INDEX,
  ROUNDED_BOX_LAYERS,
  ROUNDED_CARRIER_CAP,
  ROUNDED_CARRIERS,
  aabbContainsXZ,
  aabbInteriorsOverlap,
  carrierAabb,
  carrierKindCounts,
  extrusionDepth,
  radiusFits,
  roundedBoxOptOut,
  roundedBoxOptOutAtBoot,
  roundedBoxSearchOfUrl,
  roundedBoxState,
  roundedBoxVisible,
} from './plan'
import { anchorPose, readAnchorWorld, type AnchorHost } from './pose'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const openGate = {
  view: 'floor',
  floorId: 'F3',
  optOut: false,
  exploded: false,
  explodeProgress: 0,
  stationActive: false,
  stationAnimating: false,
  stationProgress: 0,
}

describe('圆角门闩', () => {
  it('只在单层休息姿态打开，总览、爆炸和工位拆解都关', () => {
    expect(roundedBoxState(openGate)).toBe('on')
    expect(roundedBoxVisible(openGate)).toBe(true)
    expect(roundedBoxState({ ...openGate, view: 'building' })).toBe('off-view')
    expect(roundedBoxState({ ...openGate, view: 'blueprint' })).toBe('off-view')
    expect(roundedBoxState({ ...openGate, floorId: null })).toBe('off-view')
    expect(roundedBoxState({ ...openGate, exploded: true })).toBe('off-explode')
    expect(roundedBoxState({ ...openGate, explodeProgress: 0.2 })).toBe('off-explode')
    expect(roundedBoxState({ ...openGate, stationActive: true })).toBe('off-station')
    expect(roundedBoxState({ ...openGate, stationAnimating: true })).toBe('off-station')
    expect(roundedBoxState({ ...openGate, stationProgress: 0.4 })).toBe('off-station')
    expect(roundedBoxState({ ...openGate, optOut: true, exploded: true })).toBe('off-switch')
    expect(roundedBoxVisible({ ...openGate, view: 'building' })).toBe(false)
  })

  it('?roundedBox=0 关掉，启动地址里的也算', () => {
    expect(roundedBoxOptOut('')).toBe(false)
    expect(roundedBoxOptOut('?roundedBox=0')).toBe(true)
    expect(roundedBoxOptOut('roundedBox=0&q=perf')).toBe(true)
    expect(roundedBoxOptOut('?roundedBox=1')).toBe(false)
    expect(roundedBoxSearchOfUrl('http://127.0.0.1:5190/?roundedBox=0#floor')).toBe('?roundedBox=0')
    expect(roundedBoxOptOutAtBoot('', 'http://127.0.0.1:5190/?q=balanced&roundedBox=0')).toBe(true)
    expect(roundedBoxOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('演示载体', () => {
  it('只有展台、设备基座和两件道具，不随工位数变长', () => {
    expect(ROUNDED_ANCHOR_INDEX).toBe(0)
    expect(ROUNDED_CARRIERS).toHaveLength(ROUNDED_CARRIER_CAP)
    expect(ROUNDED_CARRIER_CAP).toBe(4)
    expect(carrierKindCounts()).toEqual({ plinth: 1, 'device-base': 1, prop: 2 })
    expect(new Set(ROUNDED_CARRIERS.map((carrier) => carrier.id)).size).toBe(ROUNDED_CARRIERS.length)
    expect(ROUNDED_BOX_LAYERS).toEqual({
      furniture: 'separate',
      explode: 'hidden',
      anchor: 'workstation-0',
    })
    const names = ROUNDED_CARRIERS.map((carrier) => carrier.name)
    expect(names).toEqual(['RoundedPlinth', 'RoundedDeviceBase', 'RoundedPropBlock', 'RoundedPropPost'])
    for (const name of names) {
      expect(name.startsWith('Desk') || name.startsWith('Device') || name.startsWith('Workstation')).toBe(false)
    }
  })

  it('半径留得下倒角，叠在展台上，并且不进桌子', () => {
    const byId = Object.fromEntries(ROUNDED_CARRIERS.map((carrier) => [carrier.id, carrier]))
    const plinth = byId.plinth
    const base = byId['device-base']
    const block = byId['prop-block']
    const post = byId['prop-post']
    if (!plinth || !base || !block || !post) throw new Error('载体缺了')
    for (const carrier of ROUNDED_CARRIERS) {
      expect(radiusFits(carrier), carrier.id).toBe(true)
      expect(extrusionDepth(carrier), carrier.id).toBeGreaterThan(0)
      expect(carrier.smoothness).toBeGreaterThan(0)
      expect(carrier.smoothness).toBeLessThanOrEqual(4)
      expect(carrier.metalness).toBeLessThan(1)
    }
    const plinthBox = carrierAabb(plinth)
    const baseBox = carrierAabb(base)
    const blockBox = carrierAabb(block)
    const postBox = carrierAabb(post)
    expect(baseBox.minY).toBeCloseTo(plinthBox.maxY, 5)
    expect(blockBox.minY).toBeCloseTo(baseBox.maxY, 5)
    expect(postBox.minY).toBeCloseTo(plinthBox.maxY, 5)
    expect(aabbContainsXZ(plinthBox, baseBox)).toBe(true)
    expect(aabbContainsXZ(baseBox, blockBox)).toBe(true)
    expect(aabbContainsXZ(plinthBox, postBox)).toBe(true)
    expect(aabbInteriorsOverlap(baseBox, postBox)).toBe(false)
    expect(aabbInteriorsOverlap(blockBox, postBox)).toBe(false)
    expect(plinthBox.maxZ).toBeLessThan(DESK_BODY.minZ)
    for (const box of [plinthBox, baseBox, blockBox, postBox]) {
      expect(aabbInteriorsOverlap(box, DESK_BODY)).toBe(false)
      expect(box.minX).toBeGreaterThan(-DESK_BODY.maxX)
      expect(box.maxX).toBeLessThan(DESK_BODY.maxX + 0.2)
    }
  })

  it('只读第 0 个实例，单位矩阵当成还没写上', () => {
    const target = new Matrix4()
    let asked = -1
    const host: AnchorHost = {
      count: 8,
      isInstancedMesh: true,
      matrixWorld: new Matrix4().makeTranslation(10, 1, 0),
      updateWorldMatrix() {},
      getMatrixAt(index, matrix) {
        asked = index
        matrix.copy(new Matrix4().makeTranslation(2, 3, 4))
      },
    }
    expect(readAnchorWorld(host, target)).toBe(true)
    expect(asked).toBe(0)
    const point = new Vector3()
    target.decompose(point, new Quaternion(), new Vector3())
    expect(point.toArray()).toEqual([12, 4, 4])
    const pose = anchorPose(host)
    expect(pose?.position).toEqual([12, 4, 4])

    const empty: AnchorHost = { ...host, count: 0 }
    expect(readAnchorWorld(empty, target)).toBe(false)
    const unread: AnchorHost = {
      ...host,
      getMatrixAt(_index, matrix) {
        matrix.identity()
      },
    }
    expect(readAnchorWorld(unread, target)).toBe(false)
    expect(anchorPose(unread)).toBeNull()
  })
})

describe('圆角接线', () => {
  it('RoundedBox 懒挂在 dock 哈希之后，不进首屏，不替换实例家具', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./RoundedCarriers.tsx')
    const plan = read('./plan.ts')
    const pose = read('./pose.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/roundedBoxPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const drei = read('../../node_modules/@react-three/drei/core/RoundedBox.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const lock = read('../../package-lock.json')

    expect(dock).toContain(ROUNDED_BOX_SOURCE_BLOCK)
    expect(dock).toMatch(/mod\.mountShellShader\(\)\n\}\)\n\n\/\/ T122：/)
    expect(stripRoundedBoxSource(dock)).not.toMatch(/rounded-box|mountRoundedBox/)
    expect(stripRoundedBoxSource(dock)).toMatch(/observe\(document\.body, \{ childList: true, subtree: true \}\)\n\n\/\/ T117：/)
    expect(stripRoundedBoxSource(dock).endsWith('mod.mountShellShader()\n})\n')).toBe(true)
    expect(() => stripRoundedBoxSource('const dock = 1')).toThrow()
    expect(plugin).toContain(ROUNDED_BOX_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'rounded-box-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/RoundedBoxMount\.js/)
    expect(plugin).toMatch(/assets\/RoundedCarriers\.js/)
    expect(plugin).toMatch(/assets\/RoundedBox\.js/)
    expect(threeImportNames()).toEqual(
      expect.arrayContaining(['BufferAttribute', 'Float32BufferAttribute', 'Matrix4', 'Quaternion', 'Shape', 'Vector3']),
    )

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('sensorPointsAfterHash()')).toBeGreaterThan(plugins.indexOf('floorPlanAfterHash()'))
    expect(plugins.indexOf('radialShadowAfterHash()')).toBeGreaterThan(plugins.indexOf('sensorPointsAfterHash()'))
    expect(plugins.indexOf('shellShaderAfterHash()')).toBeGreaterThan(plugins.indexOf('radialShadowAfterHash()'))
    expect(plugins.indexOf('roundedBoxAfterHash()')).toBeGreaterThan(plugins.indexOf('shellShaderAfterHash()'))
    expect(plugins.indexOf('roundedBoxAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinRoundedBoxNode/)
    expect(grid).toMatch(/__twinRadialShadowNode/)
    expect(composeOverlay.length).toBe(3)
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'rounded'),
    ).toBe('rounded')
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'shadow'),
    ).toBe('shadow')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, 'points')).toBe(
      'points',
    )

    expect(mount).toMatch(/import\('\.\/RoundedCarriers'\)/)
    expect(mount).not.toMatch(/import \{ RoundedCarriers \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|from '\.\/pose'|https?:|setFrameloop|invalidate\(/)
    expect(mount).toMatch(/__twinRoundedBoxNode/)
    expect(mount).toMatch(/roundedBoxOptOutAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|InstancedMesh|setMatrixAt/)
    expect(pose).toMatch(/getMatrixAt\(ROUNDED_ANCHOR_INDEX/)
    expect(pose).not.toMatch(/setMatrixAt|instanceMatrix/)
    expect(probe).toMatch(/replacesInstanced: false/)
    expect(probe).toMatch(/writesInstanceMatrix: false/)
    expect(probe).toMatch(/creasedNormals: 'three-stdlib'/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)

    expect(drei).toMatch(/import \{ toCreasedNormals \} from 'three-stdlib'/)
    expect(drei).toMatch(/extrudeGeometry/)
    expect(drei).not.toMatch(/geometries\/RoundedBoxGeometry|RoundedBoxGeometry \} from/)
    expect(live).toMatch(/from '@react-three\/drei\/core\/RoundedBox'/)
    expect(live).toMatch(/<RoundedBox/)
    expect(live).toMatch(/meshStandardMaterial/)
    expect(live).toMatch(/raycast=\{ignoreCarrierPick\}/)
    expect(live).toMatch(/getObjectByName\('WorkstationDesks'\)/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/from 'three'|setMatrixAt|<instancedMesh|new InstancedMesh|useFrame|transmission|MeshPhysicalMaterial/)
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
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/RoundedBox|rounded-box|mountRoundedBox|toCreasedNormals/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies['three-stdlib']).toBeUndefined()
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
    expect(lock).toMatch(/"node_modules\/three-stdlib"/)
    expect(lock).toMatch(/"version": "2\.36\.1"/)
  })
})
