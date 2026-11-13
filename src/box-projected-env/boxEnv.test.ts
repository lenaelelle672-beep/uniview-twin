import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { useBoxProjectedEnv } from '@react-three/drei/core/useBoxProjectedEnv'
import { describe, expect, it } from 'vitest'
import { BOX_ENV_SOURCE_BLOCK, stripBoxEnvSource, threeImportNames } from '../../scripts/boxProjectedEnvPlugin'
import { NIGHT_HDR_URL, OUTDOOR_HDR_URL } from '../components/scene/LocalEnvironment'
import { composeOverlay } from '../grid/mount'
import {
  curtainMaterial,
  eaveMaterial,
  finMaterial,
  grilleMaterial,
  jointMaterial,
} from '../scene/materials'
import { meetingGlassMaterial } from '../scene/stage/materials'
import { finishBoxProjection } from './bridge'
import {
  attachIndoorProjection,
  collectIndoorMaterials,
  detachIndoorProjection,
  isCurtainBoundary,
  type BoxShader,
} from './collect'
import { measureFloorRoom } from './measure'
import {
  BOX_ENV_HDR_URLS,
  BOX_ENV_LAYERS,
  CURTAIN_BOUNDARY_NAMES,
  boxEnvActive,
  boxEnvOptOut,
  boxEnvOptOutAtBoot,
  boxEnvSearchOfUrl,
  boxEnvState,
  isLocalBoxHdr,
  roomBoxFromSlab,
  sameRoomBox,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function gzipCli(file: string): number {
  const result = spawnSync('gzip', ['-c', '-9', file])
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout.length
}

const openGate = {
  view: 'floor',
  floorId: 'F12',
  presentation: 'lit',
  optOut: false,
  exploded: false,
  explodeProgress: 0,
}

describe('室内盒投影门闩', () => {
  it('只在进入的单层房间打开，离开、白模和爆炸都卸掉', () => {
    expect(boxEnvState(openGate)).toBe('on')
    expect(boxEnvActive(openGate)).toBe(true)
    expect(boxEnvState({ ...openGate, view: 'building' })).toBe('off-view')
    expect(boxEnvState({ ...openGate, view: 'blueprint' })).toBe('off-view')
    expect(boxEnvState({ ...openGate, floorId: null })).toBe('off-view')
    expect(boxEnvState({ ...openGate, presentation: 'model' })).toBe('off-model')
    expect(boxEnvState({ ...openGate, exploded: true })).toBe('off-explode')
    expect(boxEnvState({ ...openGate, explodeProgress: 0.2 })).toBe('off-explode')
    expect(boxEnvState({ ...openGate, optOut: true, exploded: true })).toBe('off-switch')
    expect(boxEnvActive({ ...openGate, view: 'building' })).toBe(false)
  })

  it('只认 LocalEnvironment 的两张本地 HDR', () => {
    expect(BOX_ENV_HDR_URLS).toEqual([OUTDOOR_HDR_URL, NIGHT_HDR_URL])
    expect(isLocalBoxHdr(OUTDOOR_HDR_URL)).toBe(true)
    expect(isLocalBoxHdr(NIGHT_HDR_URL)).toBe(true)
    expect(isLocalBoxHdr('/hdr/other.hdr')).toBe(false)
    expect(isLocalBoxHdr('https://cdn.example.com/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr')).toBe(false)
    expect(isLocalBoxHdr(null)).toBe(false)
    expect(BOX_ENV_LAYERS.curtain).toBe('envMapIntensity-unchanged')
    expect(BOX_ENV_LAYERS.hdr).toBe('LocalEnvironment')
    expect(BOX_ENV_LAYERS.useFrame).toBe('none')
  })

  it('?boxProjectedEnv=0 关掉，启动地址里的也算', () => {
    expect(boxEnvOptOut('')).toBe(false)
    expect(boxEnvOptOut('?boxProjectedEnv=0')).toBe(true)
    expect(boxEnvOptOut('boxProjectedEnv=0&q=perf')).toBe(true)
    expect(boxEnvOptOut('?boxProjectedEnv=1')).toBe(false)
    expect(boxEnvSearchOfUrl('http://127.0.0.1:5190/?boxProjectedEnv=0#floor')).toBe('?boxProjectedEnv=0')
    expect(boxEnvOptOutAtBoot('', 'http://127.0.0.1:5190/?q=balanced&boxProjectedEnv=0')).toBe(true)
    expect(boxEnvOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })

  it('房间盒子用楼板足迹和层高，不跟楼板厚度走', () => {
    const box = roomBoxFromSlab({ minX: -2, maxX: 2, minZ: -3, maxZ: 3 }, 10, 4)
    expect(box).toEqual({ position: [0, 12, 0], size: [4, 4, 6] })
    expect(roomBoxFromSlab({ minX: 0, maxX: 0.2, minZ: 0, maxZ: 4 }, 0, 4)).toBeNull()
    expect(roomBoxFromSlab({ minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, 0, 0.5)).toBeNull()
    expect(sameRoomBox(box, roomBoxFromSlab({ minX: -2, maxX: 2.0004, minZ: -3, maxZ: 3 }, 10, 4))).toBe(true)
    expect(sameRoomBox(box, null)).toBe(false)
  })
})

describe('幕墙强度边界', () => {
  it('幕墙一侧不进室内名单，envMapIntensity 保持原值', () => {
    const before = {
      curtain: curtainMaterial.envMapIntensity,
      fin: finMaterial.envMapIntensity,
      grille: grilleMaterial.envMapIntensity,
      joint: jointMaterial.envMapIntensity,
      eave: eaveMaterial.envMapIntensity,
      glass: meetingGlassMaterial.envMapIntensity,
      curtainCompile: curtainMaterial.onBeforeCompile,
      curtainKey: curtainMaterial.customProgramCacheKey,
      curtainMap: curtainMaterial.envMap,
    }
    expect(CURTAIN_BOUNDARY_NAMES).toEqual(['幕墙', '格栅', '接缝', '铝翅', '檐口'])
    expect(isCurtainBoundary(curtainMaterial)).toBe(true)
    expect(isCurtainBoundary(finMaterial)).toBe(true)
    expect(isCurtainBoundary(grilleMaterial)).toBe(true)
    expect(isCurtainBoundary(jointMaterial)).toBe(true)
    expect(isCurtainBoundary(eaveMaterial)).toBe(true)
    expect(isCurtainBoundary(meetingGlassMaterial)).toBe(false)
    expect(meetingGlassMaterial.envMapIntensity).toBe(0.7)

    const indoor = new MeshStandardMaterial({ name: '室内板', envMapIntensity: 0.33 })
    const group = new Group()
    group.name = 'FloorInterior'
    const desk = new Mesh(new BoxGeometry(1, 1, 1), indoor)
    const wall = new Mesh(new BoxGeometry(1, 1, 1), curtainMaterial)
    group.add(desk, wall)
    expect(collectIndoorMaterials(group)).toEqual([indoor])
    expect(attachIndoorProjection([curtainMaterial], () => {}, () => 'x')).toBe(0)
    expect(curtainMaterial.onBeforeCompile).toBe(before.curtainCompile)
    expect(curtainMaterial.customProgramCacheKey).toBe(before.curtainKey)
    expect(curtainMaterial.envMap).toBe(before.curtainMap)
    expect(curtainMaterial.envMapIntensity).toBe(before.curtain)
    expect(finMaterial.envMapIntensity).toBe(before.fin)
    expect(grilleMaterial.envMapIntensity).toBe(before.grille)
    expect(jointMaterial.envMapIntensity).toBe(before.joint)
    expect(eaveMaterial.envMapIntensity).toBe(before.eave)
    expect(meetingGlassMaterial.envMapIntensity).toBe(before.glass)

    const shader: BoxShader = {
      defines: {},
      uniforms: {},
      vertexShader: 'void main(){ vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 ); }',
      fragmentShader: 'void main(){}',
    }
    let saw = 0
    const count = attachIndoorProjection(
      [indoor],
      (next) => {
        saw += 1
        next.defines = { ...(next.defines ?? {}), BOX_PROJECTED_ENV_MAP: true }
      },
      () => '1,2,3',
    )
    expect(count).toBe(1)
    const compile = indoor.onBeforeCompile as (next: BoxShader, renderer?: unknown) => void
    compile(shader)
    expect(saw).toBe(1)
    expect(shader.vertexShader).toContain('instanceMatrix')
    expect(indoor.envMapIntensity).toBe(0.33)
    expect(indoor.userData.boxProjectedEnv).toBe(true)
    detachIndoorProjection([indoor])
    expect(indoor.userData.boxProjectedEnv).toBeUndefined()
    expect(indoor.envMapIntensity).toBe(0.33)
    indoor.dispose()
  })
})

describe('useBoxProjectedEnv 在 three 0.186 上的补丁', () => {
  it('钩子没有 useFrame，gzip -9 是 1337，补丁落到现在的函数名和实例矩阵上', () => {
    const file = join(here, '../../node_modules/@react-three/drei/core/useBoxProjectedEnv.js')
    const source = readFileSync(file, 'utf8')
    expect(source).not.toMatch(/useFrame/)
    expect(source).toMatch(/onBeforeCompile/)
    expect(source).toMatch(/function useBoxProjectedEnv/)
    expect(gzipCli(file)).toBe(1337)
    expect(gzipSync(readFileSync(file)).length).toBeGreaterThan(39)

    const slot: { current: ReturnType<typeof useBoxProjectedEnv> | null } = { current: null }
    function Grab() {
      slot.current = useBoxProjectedEnv([1, 2, 3], [4, 5, 6])
      return null
    }
    expect(renderToStaticMarkup(createElement(Grab))).toBe('')
    const projection = slot.current
    if (!projection) throw new Error('钩子没有返回')
    const shader: BoxShader = {
      defines: {},
      uniforms: {},
      vertexShader: 'void main(){\n#include <worldpos_vertex>\n}\n',
      fragmentShader: 'void main(){\n#include <envmap_physical_pars_fragment>\n}\n',
    }
    projection.onBeforeCompile(shader)
    expect(shader.defines?.BOX_PROJECTED_ENV_MAP).toBe(true)
    expect(shader.fragmentShader).not.toContain('parallaxCorrectNormal( worldNormal')
    expect(shader.vertexShader).not.toContain('instanceMatrix')
    finishBoxProjection(shader)
    expect(shader.fragmentShader).toContain('parallaxCorrectNormal( worldNormal')
    expect(shader.fragmentShader).toContain('parallaxCorrectNormal( reflectVec')
    expect(shader.fragmentShader.match(/vec3 parallaxCorrectNormal/g)).toHaveLength(1)
    expect(shader.vertexShader).toContain('instanceMatrix')
    expect(shader.vertexShader).toContain('USE_BATCHING')
    expect(shader.vertexShader).toContain('vWorldPosition')
    const frozen = shader.fragmentShader
    finishBoxProjection(shader)
    expect(shader.fragmentShader).toBe(frozen)
    const uniform = shader.uniforms.envMapPosition?.value as { toArray?: () => number[] } | undefined
    expect(uniform?.toArray?.()).toEqual([1, 2, 3])
    expect(projection.customProgramCacheKey()).toBe('[1,2,3][4,5,6]')
  })
})

describe('楼板量房间', () => {
  it('用 FloorSlab 的世界足迹，Y 用这一层的标高和层高', () => {
    const scene = new Group()
    const interior = new Group()
    interior.name = 'FloorInterior'
    interior.position.set(0, 10.16, 0)
    const slab = new Mesh(new BoxGeometry(8, 0.16, 6))
    slab.name = 'FloorSlab'
    slab.position.set(1, -0.08, -2)
    interior.add(slab)
    scene.add(interior)
    scene.updateMatrixWorld(true)
    expect(measureFloorRoom(scene, 10, 4)).toEqual({ position: [1, 12, -2], size: [8, 4, 6] })
    slab.name = 'Other'
    expect(measureFloorRoom(scene, 10, 4)).toBeNull()
  })
})

describe('盒投影接线', () => {
  it('useBoxProjectedEnv 懒挂在 dock 哈希之后，不进首屏，也不进 balancedFx', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./IndoorBoxEnv.tsx')
    const plan = read('./plan.ts')
    const bridge = read('./bridge.ts')
    const collect = read('./collect.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/boxProjectedEnvPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const hook = read('../../node_modules/@react-three/drei/core/useBoxProjectedEnv.js')

    expect(dock).toContain(BOX_ENV_SOURCE_BLOCK)
    expect(dock).toMatch(/mod\.mountRelationArcs\(\)\n\}\)\n\n\/\/ T127：/)
    expect(stripBoxEnvSource(dock)).not.toMatch(/box-projected-env|mountBoxProjectedEnv|useBoxProjectedEnv/)
    expect(stripBoxEnvSource(dock)).toMatch(/mod\.mountRelationArcs\(\)\n\}\)\n$/)
    expect(() => stripBoxEnvSource('const dock = 1')).toThrow()
    expect(plugin).toContain(BOX_ENV_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'box-projected-env-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/BoxEnvMount\.js/)
    expect(plugin).toMatch(/assets\/IndoorBoxEnv\.js/)
    expect(plugin).toMatch(/assets\/useBoxProjectedEnv\.js/)
    expect(threeImportNames()).toEqual(['Box3', 'Vector3'])

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('roundedBoxAfterHash()')).toBeGreaterThan(plugins.indexOf('shellShaderAfterHash()'))
    expect(plugins.indexOf('relationArcAfterHash()')).toBeGreaterThan(plugins.indexOf('roundedBoxAfterHash()'))
    expect(plugins.indexOf('boxProjectedEnvAfterHash()')).toBeGreaterThan(plugins.indexOf('relationArcAfterHash()'))
    expect(plugins.indexOf('boxProjectedEnvAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinBoxProjectedEnvNode/)
    expect(composeOverlay.length).toBe(3)
    expect(
      composeOverlay(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'box',
      ),
    ).toBe('box')

    expect(mount).toMatch(/import\('\.\/IndoorBoxEnv'\)/)
    expect(mount).not.toMatch(/from '@react-three\/drei|from 'three'|useFrame\(|HDRLoader|Reflector/)
    expect(mount).toMatch(/__twinBoxProjectedEnvNode/)
    expect(mount).toMatch(/boxEnvOptOutAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|useFrame\(|HDRLoader/)
    expect(probe).toMatch(/useFrame: false/)
    expect(probe).toMatch(/curtainTouched: false/)
    expect(probe).toMatch(/envMapIntensityWrites: 0/)
    expect(probe).toMatch(/hdrOwner: 'LocalEnvironment'/)
    expect(probe).not.toMatch(/from 'three'|@react-three|useFrame\(/)
    expect(live).toMatch(/from '@react-three\/drei\/core\/useBoxProjectedEnv'/)
    expect(live).toMatch(/useBoxProjectedEnv\(/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/useFrame\(|HDRLoader|Reflector|MeshTransmission|core\/Environment/)
    expect(bridge).toMatch(/instanceMatrix/)
    expect(bridge).toMatch(/transformNormalByInverseViewMatrix/)
    expect(collect).toMatch(/finishBoxProjection/)
    expect(collect).not.toMatch(/envMapIntensity\s*=\s*[0-9]/)
    expect(hook).not.toMatch(/useFrame/)

    const untouched = [
      '../components/Scene.tsx',
      '../components/scene/LocalEnvironment.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../scene/explode.ts',
      '../scene/softShadows.ts',
      '../scene/materials.ts',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/useBoxProjectedEnv|box-projected-env|mountBoxProjectedEnv/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies.three).toBe('0.186.1')
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
