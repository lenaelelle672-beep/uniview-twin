import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { CLONE_SOURCE_BLOCK } from '../../scripts/clonePlugin'
import { lookupThreeExports } from '../../scripts/segmentsPlugin'
import {
  CLONE_CAP,
  CLONE_CAST_SHADOW,
  CLONE_DEEP,
  CLONE_RECEIVE_SHADOW,
  CLONE_SPOTS,
  cloneEnabled,
  cloneSlotReady,
  findLampParts,
  fragmentKey,
  presentCloneSpots,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function sceneOf(objects: unknown[]) {
  return {
    traverse(visitor: (obj: unknown) => void) {
      for (const obj of objects) visitor(obj)
    },
  }
}

describe('路灯片段浅拷', () => {
  it('只取已经实例化的两份材质，普通网格和树叶都不算', () => {
    const body = { uuid: 'body-geo' }
    const light = { uuid: 'light-geo' }
    const bodyMat = { name: 'lamp_body' }
    const lightMat = { name: 'lamp_light' }
    const parts = findLampParts(
      sceneOf([
        { isMesh: true, geometry: body, material: bodyMat },
        { isInstancedMesh: true, geometry: { uuid: 'leaf' }, material: { name: 'tree_leaves' } },
        { isInstancedMesh: true, geometry: light, material: lightMat },
        { isInstancedMesh: true, geometry: { uuid: 'desk' }, material: { name: 'desk' } },
        { isInstancedMesh: true, geometry: body, material: bodyMat },
        { isInstancedMesh: true, geometry: light, material: [{ name: 'lamp_light' }] },
      ]),
    )
    expect(parts.map((part) => part.material.name)).toEqual(['lamp_body', 'lamp_light'])
    expect(parts[0]?.geometry).toBe(body)
    expect(parts[1]?.geometry).toBe(light)
    expect(parts[0]?.material).toBe(bodyMat)
    expect(fragmentKey(parts)).toBe('lamp_body:body-geo|lamp_light:light-geo')
    expect(findLampParts(sceneOf([{ isInstancedMesh: true, geometry: body, material: bodyMat }]))).toEqual([])
    expect(findLampParts(sceneOf([]))).toEqual([])
  })

  it('最多三盏，deep 默认关，阴影标志显式为真', () => {
    expect(CLONE_CAP).toBe(3)
    expect(CLONE_DEEP).toBe(false)
    expect(CLONE_CAST_SHADOW).toBe(true)
    expect(CLONE_RECEIVE_SHADOW).toBe(true)
    expect(CLONE_SPOTS).toHaveLength(3)
    expect(new Set(CLONE_SPOTS.map((spot) => spot.id)).size).toBe(3)
    for (const spot of CLONE_SPOTS) {
      expect(spot.position[0]).toBeGreaterThan(-40)
      expect(spot.position[0]).toBeLessThan(40)
      expect(spot.position[1]).toBe(0.12)
      expect(spot.position[2]).toBeGreaterThan(14)
    }
    const fitted = presentCloneSpots(['a', 'b', 'c', 'd'])
    expect(fitted.shown).toEqual(['a', 'b', 'c'])
    expect(fitted.dropped).toBe(1)
    expect(fitted.cap).toBe(3)
    expect(presentCloneSpots(CLONE_SPOTS).dropped).toBe(0)
    expect(() => presentCloneSpots(CLONE_SPOTS, 4)).toThrow(/最多 3/)
  })

  it('默认关，只有 demoEdit=1 或本页开关打开', () => {
    expect(cloneEnabled(null, '')).toBe(false)
    expect(cloneEnabled(null, '?q=balanced')).toBe(false)
    expect(cloneEnabled(null, '?demoEdit=0')).toBe(false)
    expect(cloneEnabled(null, '?demoEdit=10')).toBe(false)
    expect(cloneEnabled(null, '?q=balanced&demoEdit=1')).toBe(true)
    expect(cloneEnabled(null, '', '?demoEdit=1')).toBe(true)
    expect(cloneEnabled(false, '?demoEdit=1')).toBe(false)
    expect(cloneEnabled(true, '')).toBe(true)
    expect(cloneSlotReady(null)).toBe(false)
    expect(cloneSlotReady({ __gridBridge: true, __decalBridge: true })).toBe(false)
    expect(cloneSlotReady({ __gridBridge: true, __decalBridge: true, __tourBridge: true })).toBe(true)
    expect(cloneSlotReady({ __gridBridge: true, __decalBridge: true, __tourBridge: true, __cloneBridge: true })).toBe(false)
  })
})

describe('浅拷分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不替换实例化主路径', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./FragmentClones.tsx')
    const plan = read('./plan.ts')
    const plugin = read('../../scripts/clonePlugin.ts')
    const vite = read('../../vite.config.ts')
    const instanced = read('../components/scene/InstancedProp.tsx')
    const stations = read('../scene/stage/Workstations.tsx')
    const interior = read('../floors/floorInteriorMesh.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(CLONE_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/fragment-clone\/mount'\)/)
    expect(dock).toMatch(/mountFragmentClones\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/fragment-clone\/mount'/)
    expect(plugin).toContain(CLONE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'clone-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/CloneMount\.js/)
    expect(plugin).toMatch(/assets\/FragmentClones\.js/)
    expect(vite).toMatch(/cloneAfterHash/)

    expect(mount).toMatch(/import\('\.\/FragmentClones'\)/)
    expect(mount).not.toMatch(/import \{ FragmentClones \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'/)
    expect(mount).toMatch(/navigationSearch/)
    expect(mount).toMatch(/dataset\.layer = 'fragmentClone'/)
    expect(mount).toMatch(/__cloneBridge/)
    expect(mount).toMatch(/__tourBridge/)
    expect(plan).toMatch(/不换成 Clone/)
    expect(plan).toMatch(/改克隆体的材质/)
    expect(live).toMatch(/@react-three\/drei\/core\/Clone/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/inject=/)
    expect(live).not.toMatch(/deep=\{true\}/)
    expect(live).toMatch(/deep=\{CLONE_DEEP\}/)
    expect(live).toMatch(/castShadow=\{CLONE_CAST_SHADOW\}/)
    expect(live).toMatch(/receiveShadow=\{CLONE_RECEIVE_SHADOW\}/)
    expect(live).toMatch(/name="FragmentClones"/)
    expect(live).toMatch(/共享/)
    expect(live).not.toMatch(/InstancedMesh|BatchedMesh|hls|useVideoTexture|FogExp2|smoothTime/)
    expect(live.match(/<Clone/g)).toHaveLength(1)

    expect(instanced).toMatch(/<instancedMesh/)
    expect(instanced).not.toMatch(/Clone|fragment-clone/)
    expect(stations).toMatch(/InstancedSlots/)
    expect(stations).not.toMatch(/Clone|fragment-clone/)
    expect(interior).toMatch(/addInstances/)
    expect(interior).not.toMatch(/Clone|fragment-clone/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/InstancedProp.tsx',
      '../scene/stage/Workstations.tsx',
      '../floors/floorInteriorMesh.ts',
      '../floors/JsonFloorInterior.tsx',
      '../scene/props/TreeLod.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../grid/mount.ts',
      '../store/viewSlice.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/FragmentClones|fragment-clone|mountFragmentClones|core\/Clone/)
    }

    const blob = [mount, live, plan].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|DemandLoop|InstancedProp|Workstations)/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
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
      ].sort(),
    )
  })

  it('从入口包命名空间认出 Mesh 和 Group', () => {
    const index = `
      __proto__:null,Mesh:ps,Group:gq,Color:ot},Symbol.toStringTag
      export{ps as a1,gq as g1,ot as ar}
    `
    const looked = lookupThreeExports(index, ['Mesh', 'Group', 'SkeletonHelper'])
    expect(looked.found).toEqual({ Mesh: 'a1', Group: 'g1' })
    expect(looked.missing).toEqual(['SkeletonHelper'])
  })
})
