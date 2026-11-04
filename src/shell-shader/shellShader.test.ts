import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  InstancedMesh,
  Mesh,
  Plane,
  Scene,
  Vector3,
} from 'three'
import { SHELL_SHADER_SOURCE_BLOCK, stripShellShaderSource, threeImportNames } from '../../scripts/shellShaderPlugin'
import { composeOverlay } from '../grid/mount'
import {
  curtainMaterial,
  eaveMaterial,
  finMaterial,
  grilleMaterial,
  highlightJointMaterial,
  solidMaterial,
} from '../scene/materials'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { createCapMaterial } from '../scene/stage/stencilCap'
import { ALARM_COLOR } from '../sensor-points/plan'
import {
  isSolidShellMaterial,
  isSolidShellMesh,
  releaseShellTints,
  resetShellTintsForTests,
  SHELL_TINT_NAME,
  syncShellTints,
} from './apply'
import { createShellShaderMaterial, shellShaderClassKey } from './material'
import {
  ALARM_TINT,
  NIGHT_EMISSIVE,
  SHELL_ALARM_MIX,
  SHELL_NIGHT_MIX,
  SHELL_SHADER_AFTER_FIRST_MS,
  SHELL_SHADER_BLENDING,
  SOLID_SHELL_METALNESS,
  SOLID_SHELL_ROUGHNESS,
  shellAlarmMix,
  shellAlarmTotal,
  shellNightMix,
  shellShaderChunkDue,
  shellShaderDueLatched,
  shellShaderMix,
  shellShaderOptOut,
  shellShaderOptOutAtBoot,
  shellShaderState,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('楼壳着色门闩', () => {
  it('只在总览、并且有告警或夜间时打开，白模单层蓝图和开关关掉', () => {
    const open = { view: 'building', dayNight: 'day', presentation: 'lit', optOut: false, alarmCount: 2 }
    expect(shellShaderState(open, true)).toBe('on')
    expect(shellShaderState(open, false)).toBe('pending')
    expect(shellShaderState({ ...open, dayNight: 'night', alarmCount: 0 }, true)).toBe('on')
    expect(shellShaderState({ ...open, alarmCount: 0 }, true)).toBe('off-quiet')
    expect(shellShaderState({ ...open, presentation: 'model' }, true)).toBe('off-model')
    expect(shellShaderState({ ...open, view: 'floor' }, true)).toBe('off-view')
    expect(shellShaderState({ ...open, view: 'blueprint' }, true)).toBe('off-view')
    expect(shellShaderState({ ...open, optOut: true }, true)).toBe('off-switch')
    expect(shellShaderMix(open)).toEqual({ alarm: SHELL_ALARM_MIX, night: 0 })
    expect(shellShaderMix({ ...open, dayNight: 'night', alarmCount: 3 })).toEqual({
      alarm: SHELL_ALARM_MIX,
      night: SHELL_NIGHT_MIX,
    })
    expect(shellAlarmMix(40, 'lit')).toBe(SHELL_ALARM_MIX)
    expect(shellAlarmMix(0, 'lit')).toBe(0)
    expect(shellNightMix('night', 'model')).toBe(0)
    expect(shellAlarmTotal([{ alarmCount: 2 }, { alarmCount: 0 }, { alarmCount: -1 }])).toBe(2)
  })

  it('分包晚于首帧 2600ms，窗口过了一次就锁住', () => {
    expect(SHELL_SHADER_AFTER_FIRST_MS).toBe(2600)
    expect(SHELL_SHADER_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 4_000
    expect(shellShaderChunkDue(null, first)).toBe(false)
    expect(shellShaderChunkDue(first, first + 2599)).toBe(false)
    expect(shellShaderChunkDue(first, first + 2600)).toBe(true)
    const due = shellShaderDueLatched(false, first, first + 2600)
    expect(shellShaderDueLatched(due, null, first)).toBe(true)
    expect(shellShaderDueLatched(due, undefined, Number.NaN)).toBe(true)
  })

  it('?shellShader=0 关掉，启动地址里的也算', () => {
    expect(shellShaderOptOut('')).toBe(false)
    expect(shellShaderOptOut('?shellShader=0')).toBe(true)
    expect(shellShaderOptOut('shellShader=0&q=perf')).toBe(true)
    expect(shellShaderOptOut('?shellShader=1')).toBe(false)
    expect(shellShaderOptOut('http://127.0.0.1:5190/?q=balanced&shellShader=0#floor')).toBe(true)
    expect(shellShaderOptOutAtBoot('', 'http://127.0.0.1:5190/?shellShader=0')).toBe(true)
    expect(shellShaderOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('实体壳门闩', () => {
  it('只认 solidMaterial 的粗糙度、金属度和空名字，昼夜改色也不换门闩', () => {
    expect(solidMaterial.roughness).toBe(SOLID_SHELL_ROUGHNESS)
    expect(solidMaterial.metalness).toBe(SOLID_SHELL_METALNESS)
    expect(solidMaterial.name).toBe('')
    expect(isSolidShellMaterial(solidMaterial)).toBe(true)
    const night = solidMaterial.clone()
    night.name = ''
    night.color.set('#c8ced6')
    expect(isSolidShellMaterial(night)).toBe(true)
    night.roughness = 0.5
    expect(isSolidShellMaterial(night)).toBe(false)
    const named = solidMaterial.clone()
    named.name = 'FloorStencilCap'
    expect(isSolidShellMaterial(named)).toBe(false)
    const cap = createCapMaterial(solidMaterial)
    expect(isSolidShellMaterial(cap)).toBe(false)
    cap.dispose()
    expect(isSolidShellMaterial(curtainMaterial)).toBe(false)
    expect(isSolidShellMaterial(grilleMaterial)).toBe(false)
    expect(isSolidShellMaterial(finMaterial)).toBe(false)
    expect(isSolidShellMaterial(eaveMaterial)).toBe(false)
    expect(isSolidShellMaterial(highlightJointMaterial)).toBe(false)
    expect(isSolidShellMaterial([solidMaterial, curtainMaterial])).toBe(false)

    const materials = read('../scene/materials.ts')
    expect(materials).toMatch(/solidMaterial\.color\.set\('#f4f5f7'\)/)
    expect(materials).toMatch(/solidMaterial\.color\.set\('#c8ced6'\)/)
    expect(materials).toMatch(/solidMaterial\.color\.set\('#f3f3f3'\)/)
    expect(materials).not.toMatch(/solidMaterial\.roughness/)
    expect(materials).not.toMatch(/solidMaterial\.metalness/)
    expect(materials).not.toMatch(/solidMaterial\.emissive/)
    expect(ALARM_TINT).toBe(ALARM_COLOR)
    expect(NIGHT_EMISSIVE).not.toBe('#c8ced6')
  })
})

describe('叠色不换壳材质', () => {
  it('只给实体壳加子网格，父级材质、射线和几何都留着', () => {
    const scene = new Scene()
    const geometry = new BoxGeometry(1, 1, 1)
    let disposed = 0
    const dispose = geometry.dispose.bind(geometry)
    geometry.dispose = () => {
      disposed += 1
      dispose()
    }
    const shell = new Mesh(geometry, solidMaterial)
    shell.layers.enable(2)
    const glass = new Mesh(geometry, curtainMaterial)
    const podium = new Mesh(geometry, [solidMaterial, curtainMaterial])
    const proxy = new Mesh(geometry, solidMaterial)
    proxy.userData.boxPickProxy = true
    const clippedMaterial = solidMaterial.clone()
    clippedMaterial.name = ''
    clippedMaterial.clippingPlanes = [new Plane(new Vector3(0, -1, 0), 1)]
    const clipped = new Mesh(geometry, clippedMaterial)
    const instanced = new InstancedMesh(geometry, solidMaterial, 1)
    scene.add(shell, glass, podium, proxy, clipped, instanced)
    const parentRaycast = shell.raycast
    const before = solidMaterial.color.getHexString()
    const shader = createShellShaderMaterial()

    expect(syncShellTints(scene, shader, { alarm: SHELL_ALARM_MIX, night: 0 })).toBe(1)
    const tint = shell.children.find((child) => child.name === SHELL_TINT_NAME) as Mesh
    expect(tint).toBeTruthy()
    expect(tint.material).toBe(shader)
    expect(shell.material).toBe(solidMaterial)
    expect(shell.raycast).toBe(parentRaycast)
    expect(solidMaterial.color.getHexString()).toBe(before)
    expect(glass.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(podium.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(proxy.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(clipped.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(instanced.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(isSolidShellMesh(proxy)).toBe(false)
    expect(isSolidShellMesh(instanced)).toBe(false)
    expect(tint.castShadow).toBe(false)
    expect(tint.receiveShadow).toBe(false)
    expect(tint.layers.mask).toBe(shell.layers.mask)
    expect(tint.raycast).not.toBe(Mesh.prototype.raycast)
    expect(shader.transparent).toBe(true)
    expect(shader.depthWrite).toBe(false)
    expect(shader.blending).toBe(SHELL_SHADER_BLENDING)
    expect(shader.uAlarmMix).toBe(SHELL_ALARM_MIX)
    expect(shader.uNightMix).toBe(0)

    shell.position.set(0, 4, 0)
    shell.updateMatrixWorld(true)
    const world = new Vector3()
    tint.getWorldPosition(world)
    expect(world.y).toBeCloseTo(4)

    expect(syncShellTints(scene, shader, { alarm: SHELL_ALARM_MIX, night: SHELL_NIGHT_MIX })).toBe(1)
    expect(shell.children.filter((child) => child.name === SHELL_TINT_NAME)).toHaveLength(1)
    expect(shader.uNightMix).toBe(SHELL_NIGHT_MIX)

    expect(syncShellTints(scene, shader, { alarm: 0, night: 0 })).toBe(0)
    expect(shell.children.some((child) => child.name === SHELL_TINT_NAME)).toBe(false)
    expect(disposed).toBe(0)
    releaseShellTints(scene)
    resetShellTintsForTests()
    shader.dispose()
    clippedMaterial.dispose()
    geometry.dispose()
  })

  it('drei shaderMaterial 造出独立的类，两份实例不共用强度', () => {
    const first = createShellShaderMaterial()
    const second = createShellShaderMaterial()
    first.uAlarmMix = 0.4
    expect(second.uAlarmMix).toBe(0)
    expect(first.isShaderMaterial).toBe(true)
    expect(first.fragmentShader).toMatch(/uAlarm/)
    expect(first.fragmentShader).toMatch(/uNight/)
    expect(first.fragmentShader).not.toMatch(/\bdiscard\b/)
    expect(first.vertexShader).not.toMatch(/\bdiscard\b/)
    expect(shellShaderClassKey().length).toBeGreaterThan(8)
    first.dispose()
    second.dispose()
    resetShellTintsForTests()
  })
})

describe('着色接线', () => {
  it('shaderMaterial 懒挂在 dock 哈希之后，不进首屏，也不进 T115 拾取代理', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const runtime = read('./runtime.ts')
    const material = read('./material.ts')
    const apply = read('./apply.ts')
    const plan = read('./plan.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/shellShaderPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const pinned = read('../../node_modules/@react-three/drei/core/shaderMaterial.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(SHELL_SHADER_SOURCE_BLOCK)
    expect(dock).toMatch(/mountRadialShadow\(\)\n\}\)\n\n\/\/ T121：/)
    expect(stripShellShaderSource(dock)).not.toMatch(/shell-shader|mountShellShader/)
    expect(stripShellShaderSource(dock)).toMatch(/mountRadialShadow\(\)\n\}\)\n\n\/\/ T122：/)
    expect(() => stripShellShaderSource('const dock = 1')).toThrow()
    expect(plugin).toContain(SHELL_SHADER_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'shell-shader-after-hash'/)
    expect(plugin).toMatch(/assets\/ShellShader\.js/)
    expect(plugin).toMatch(/assets\/ShellShaderMaterial\.js/)
    expect(plugin).toMatch(/assets\/ShellShaderMount\.js/)
    expect(threeImportNames()).toEqual(['Color', 'MathUtils', 'Mesh', 'ShaderMaterial', 'Uniform', 'UniformsUtils'])
    expect(pinned).toMatch(/class extends THREE\.ShaderMaterial/)
    expect(pinned).toMatch(/THREE\.MathUtils\.generateUUID/)
    expect(pinned).not.toMatch(/\bdiscard\b/)

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('sensorPointsAfterHash()')).toBeGreaterThan(plugins.indexOf('floorPlanAfterHash()'))
    expect(plugins.indexOf('shellShaderAfterHash()')).toBeGreaterThan(plugins.indexOf('sensorPointsAfterHash()'))
    expect(plugins.indexOf('shellShaderAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).not.toMatch(/shell-shader|ShellShader|mountShellShader/)
    expect(composeOverlay.length).toBe(3)

    expect(mount).toMatch(/import\('\.\/runtime'\)/)
    expect(mount).not.toMatch(/import \{[^}]*syncShellShader/)
    expect(mount).not.toMatch(/@react-three|from 'three'|shaderMaterial|https?:|setFrameloop|invalidate\(/)
    expect(mount).toMatch(/shellShaderDueLatched/)
    expect(mount).toMatch(/__twinScene/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)
    expect(probe).toMatch(/replacesSolid: false/)
    expect(probe).toMatch(/impl: 'drei-shaderMaterial'/)
    expect(runtime).toMatch(/createShellShaderMaterial/)
    expect(runtime).not.toMatch(/@react-three|MeshDiscard|discard-proxy/)
    expect(material).toMatch(/from '@react-three\/drei\/core\/shaderMaterial'/)
    expect(material).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(material).not.toMatch(/MeshDiscard|discard-proxy|Reflector|transmission|\bdiscard\b/)
    expect(apply).not.toMatch(/@react-three|MeshDiscard|discard-proxy|Reflector|transmission|\.position\s*=|invalidate\(/)
    expect(apply).toMatch(/SHELL_TINT_NAME/)
    expect(read('./material.ts') + read('./apply.ts') + read('./runtime.ts') + read('./mount.ts') + read('./plan.ts')).not.toMatch(
      /MeshDiscardMaterial|discard-proxy|Reflector|transmission/,
    )

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../scene/materials.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../scene/explode.ts',
      '../discard-proxy/DiscardProxy.tsx',
      '../discard-proxy/apply.ts',
      '../discard-proxy/mount.ts',
      '../sensor-points/SensorCloud.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/shell-shader|mountShellShader|shaderMaterial|ShellShader/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
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
