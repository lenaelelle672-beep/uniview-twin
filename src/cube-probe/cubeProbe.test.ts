import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { CUBE_PROBE_SOURCE_BLOCK, stripCubeProbeSource } from '../../scripts/cubeProbePlugin'
import { composeOverlay } from '../grid/mount'
import { armCubeUpdate, type EnvMesh } from './bake'
import { placementOf } from './place'
import {
  CUBE_PROBE_FRAMES,
  CUBE_PROBE_NEAR,
  CUBE_PROBE_RESOLUTION,
  cubeProbeDueLatched,
  cubeProbeOptIn,
  cubeProbeOptInAtBoot,
  cubeProbeState,
  isNearFieldGlass,
  isNearFieldMetal,
  pickRoomGlass,
  probeFar,
  type ProbeNode,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const glass = {
  transparent: true,
  roughness: 0.06,
  depthWrite: false,
  metalness: 0.02,
  envMap: null,
}

const open = {
  optIn: true,
  due: true,
  view: 'floor',
  floorId: 'F3',
  touring: false,
  exploded: false,
  explodeProgress: 0,
  explodeAnimating: false,
  stationActive: false,
  stationAnimating: false,
  stationProgress: 0,
}

describe('探针门闩', () => {
  it('只在单层休息态打开，总览、爆炸、拆解和巡游都让开', () => {
    expect(cubeProbeState(open)).toBe('on')
    expect(cubeProbeState({ ...open, optIn: false })).toBe('off-switch')
    expect(cubeProbeState({ ...open, due: false })).toBe('pending')
    expect(cubeProbeState({ ...open, view: 'building' })).toBe('off-view')
    expect(cubeProbeState({ ...open, view: 'blueprint' })).toBe('off-view')
    expect(cubeProbeState({ ...open, floorId: null })).toBe('off-view')
    expect(cubeProbeState({ ...open, exploded: true })).toBe('yield-explode')
    expect(cubeProbeState({ ...open, explodeProgress: 0.2 })).toBe('yield-explode')
    expect(cubeProbeState({ ...open, stationActive: true })).toBe('yield-station')
    expect(cubeProbeState({ ...open, touring: true })).toBe('yield-tour')
    expect(cubeProbeState({ ...open, optIn: false, exploded: true })).toBe('off-switch')
  })

  it('?cubeProbe=1 才打开，首帧窗口过了就锁住', () => {
    expect(cubeProbeOptIn('')).toBe(false)
    expect(cubeProbeOptIn('?cubeProbe=1')).toBe(true)
    expect(cubeProbeOptIn('cubeProbe=1&q=perf')).toBe(true)
    expect(cubeProbeOptIn('?cubeProbe=0')).toBe(false)
    expect(cubeProbeOptInAtBoot('', 'http://127.0.0.1:5190/?cubeProbe=1')).toBe(true)
    expect(cubeProbeOptInAtBoot('?q=balanced', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
    expect(cubeProbeDueLatched(false, null, 10)).toBe(false)
    expect(cubeProbeDueLatched(false, 0, 2599)).toBe(false)
    expect(cubeProbeDueLatched(false, 0, 2600)).toBe(true)
    expect(cubeProbeDueLatched(true, null, 0)).toBe(true)
  })
})

describe('房间玻璃', () => {
  it('只认近场玻璃，不认高亮 Basic 和普通墙', () => {
    expect(isNearFieldGlass(glass)).toBe(true)
    expect(isNearFieldGlass({ ...glass, transparent: false })).toBe(false)
    expect(isNearFieldGlass({ ...glass, depthWrite: true })).toBe(false)
    expect(isNearFieldGlass({ ...glass, roughness: 0.4 })).toBe(false)
    expect(isNearFieldGlass({ transparent: true, roughness: 0.06, depthWrite: false })).toBe(false)
    expect(isNearFieldMetal({ metalness: 0.98, roughness: 0.036, envMap: null })).toBe(true)
    expect(isNearFieldMetal({ metalness: 0.02, roughness: 0.8, envMap: null })).toBe(false)
    expect(CUBE_PROBE_FRAMES).toBe(1)
    expect(CUBE_PROBE_RESOLUTION).toBe(128)
    expect(CUBE_PROBE_NEAR).toBe(0.1)
    expect(probeFar(6)).toBe(16)
    expect(probeFar(40)).toBe(60)
    expect(probeFar(80)).toBe(96)
  })

  it('这一间优先 FloorGlass，空实例和探针自身都不算', () => {
    const meeting: ProbeNode = { name: 'MeetingGlass', isMesh: true, material: glass }
    const named: ProbeNode = { name: 'FloorGlass', isMesh: true, material: glass }
    const empty: ProbeNode = { name: 'FloorGlass', isMesh: true, count: 0, material: glass }
    const root: ProbeNode = {
      name: 'FloorInterior',
      children: [empty, { name: 'CubeProbe', children: [meeting] }, meeting, named],
    }
    expect(pickRoomGlass(root)).toBe(named)
    expect(pickRoomGlass({ name: 'FloorInterior', children: [meeting] })).toBe(meeting)
    expect(pickRoomGlass({ name: 'FloorInterior', children: [{ name: 'FloorWalls', isMesh: true, material: { metalness: 0.05, roughness: 0.7, envMap: null } }] })).toBeNull()
  })

  it('探针落在玻璃盒子中心，far 按盒子跨度收一档', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshStandardMaterial())
    mesh.name = 'FloorGlass'
    mesh.position.set(10, 3, -4)
    const place = placementOf(mesh, 'F3')
    expect(place?.meshName).toBe('FloorGlass')
    expect(place?.position[0]).toBeCloseTo(10)
    expect(place?.position[1]).toBeCloseTo(3)
    expect(place?.position[2]).toBeCloseTo(-4)
    expect(place?.far).toBe(16)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })
})

describe('只烘一次', () => {
  it('update 第二次直接返回，卸下时把材质还回去', () => {
    const calls: boolean[] = []
    const source = {
      envMap: null as unknown,
      name: 'meeting',
      needsUpdate: false,
      dispose() {},
      clone() {
        return { envMap: this.envMap, name: this.name, needsUpdate: false, dispose() {}, clone() { return this } }
      },
    }
    const mesh = { visible: true, material: source } as EnvMesh
    const cube = {
      type: 'CubeCamera',
      update() {
        calls.push(mesh.visible)
      },
      children: [] as never[],
      userData: {} as { twinCubeArmed?: boolean },
    }
    const scene = {
      getObjectByName(name: string) {
        return name === 'CubeProbe' ? { children: [cube] } : undefined
      },
    }
    const restore = armCubeUpdate(scene, mesh, { id: 'cube-tex' }, () => {})
    expect(restore).toBeTypeOf('function')
    cube.update()
    cube.update()
    expect(calls).toEqual([false])
    expect(mesh.visible).toBe(true)
    expect(mesh.material).not.toBe(source)
    const painted = mesh.material
    if (!painted || Array.isArray(painted)) throw new Error('expected one clone')
    expect(painted.envMap).toEqual({ id: 'cube-tex' })
    expect(painted.name).toBe('twin-cube-probe')
    restore?.()
    expect(mesh.material).toBe(source)
    expect(cube.update).not.toBe(restore)
  })
})

describe('探针接线', () => {
  it('CubeCamera 懒在 dock 哈希之后，frames 固定为 1，不进首屏', () => {
    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/cubeProbePlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const mount = read('./mount.ts')
    const live = read('./CubeProbe.tsx')
    const plan = read('./plan.ts')
    const bake = read('./bake.ts')
    const target = read('./cubeTarget.ts')
    const scene = read('../components/Scene.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const drei = read('../../node_modules/@react-three/drei/core/CubeCamera.js')
    const constants = read('../../node_modules/three/src/constants.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(CUBE_PROBE_SOURCE_BLOCK)
    expect(dock).toMatch(/mountAlarmNotify\(\)\n\}\)\n\/\/ T129：/)
    expect(stripCubeProbeSource(dock)).toMatch(/mountAlarmNotify\(\)\n\}\)\n\/\/ T062：/)
    expect(stripCubeProbeSource(dock)).not.toMatch(/cube-probe|mountCubeProbe/)
    expect(() => stripCubeProbeSource('const dock = 1')).toThrow(/T129/)

    expect(plugin).toContain(CUBE_PROBE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'cube-probe-after-hash'/)
    expect(plugin).toMatch(/frames = Infinity/)
    expect(plugin).toMatch(/frames = 1/)
    expect(plugin).toMatch(/assets\/CubeCamera\.js/)
    expect(plugin).toMatch(/assets\/CubeProbeMount\.js/)
    expect(plugin).toMatch(/assets\/ThreeCubeCamera\.js/)
    expect(plugin).toMatch(/assets\/CubeTarget\.js/)
    expect(constants).toMatch(/export const CubeReflectionMapping = 301;/)
    expect(constants).toMatch(/export const WebGLCoordinateSystem = 2000;/)
    expect(constants).toMatch(/export const WebGPUCoordinateSystem = 2001;/)
    expect(drei).toMatch(/frames = Infinity/)
    expect(drei).toMatch(/export \{ CubeCamera, useCubeCamera \}/)

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('cubeProbeAfterHash()')).toBeGreaterThan(plugins.indexOf('roundedBoxAfterHash()'))
    expect(plugins.indexOf('cubeProbeAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinCubeProbeNode/)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'probe')).toBe('probe')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'rounded')).toBe('rounded')

    expect(mount).toMatch(/import\('\.\/CubeProbe'\)/)
    expect(mount).not.toMatch(/@react-three|from 'three'|CubeCamera|frames=|WebGLCubeRenderTarget/)
    expect(mount).toMatch(/__twinSetCubeProbe/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(bake).not.toMatch(/from 'three'|@react-three|frames=\{Infinity\}|Reflector|transmission/)
    expect(live).toMatch(/from '@react-three\/drei\/core\/CubeCamera'/)
    expect(live).toMatch(/frames=\{1\}/)
    expect(live).not.toMatch(/frames=\{Infinity\}|frames=\{CUBE_PROBE_FRAMES\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/Reflector|transmission|https?:|setFrameloop|\.hdr/)
    expect(live).not.toMatch(/envMap=\{|fog=\{/)
    expect(target).toMatch(/isWebGLCubeRenderTarget/)
    expect(target).not.toMatch(/fromEquirectangular|Reflector|transmission|https?:/)

    expect(scene).not.toMatch(/cube-probe|mountCubeProbe|CubeProbe/)
    expect(fx).not.toMatch(/cube-probe|mountCubeProbe|CubeProbe/)
    expect(loop).not.toMatch(/cube-probe|mountCubeProbe|CubeProbe/)

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
