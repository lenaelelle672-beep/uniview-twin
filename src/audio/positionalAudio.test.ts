import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { POSITIONAL_SOURCE_BLOCK } from '../../scripts/positionalPlugin'
import { floorSpec } from '../data/floors'
import { SLAB_M } from '../scene/stage/cut'
import { workstationPosition } from '../scene/stage/workstationPosition'
import { bindSpatialClaim, decideToneOutput, resetAlarmChannelForTests, setSpeechOwns } from './channelLatch'
import { createSpatialSlot, type SpatialSlot } from './spatialSlot'
import { mountPositionalAudio } from './mountPositional'
import { desksFromPlan, flatPoint } from './positionalPlace'
import {
  ALARM_EAR_M,
  ALARM_REF_DISTANCE,
  initialSpatialEnabled,
  initialSpatialMuted,
  sourcePosition,
} from './positionalPolicy'
import { encodeCueWav } from './positionalTone'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('空间音落点', () => {
  it('refDistance 是 2 米，声源在楼板顶面加设备高度再加爆炸抬升', () => {
    expect(ALARM_REF_DISTANCE).toBe(2)
    expect(ALARM_EAR_M).toBe(1.05)
    const elevation = floorSpec('F12').elevation
    const lift = 4
    const place = sourcePosition({ x: 1.5, z: -2.5 }, elevation, lift)
    expect(place).toEqual({ x: 1.5, y: elevation + SLAB_M + ALARM_EAR_M + lift, z: -2.5 })
  })

  it('B1 平面坐标跟工位公式一致，地上层读图纸 center', () => {
    const b1 = workstationPosition('B1', 'B1-1')
    expect(flatPoint({ floorId: 'B1', deskId: 'B1-1' }, null, new Map())).toEqual({
      id: 'B1-1',
      x: b1.x,
      z: b1.z,
    })
    const raw = JSON.parse(read('../../public/floors/F12.json')) as unknown
    const desks = desksFromPlan(raw)
    const desk = desks.find((item) => item.id === 'F12-66')
    expect(desk).toEqual({ id: 'F12-66', x: 18.8185, z: 4.1032 })
    expect(flatPoint({ floorId: 'F12', deskId: 'F12-66' }, null, new Map([['F12', desks]]))).toEqual(desk)
    expect(flatPoint({ floorId: 'F12', deskId: 'F12-66' }, null, new Map())).toBeNull()
  })
})

describe('开关和声道', () => {
  beforeEach(() => {
    resetAlarmChannelForTests()
  })

  it('默认关，spatial=0 压过 spatial=1，muteAudio 只静音', () => {
    expect(initialSpatialEnabled('')).toBe(false)
    expect(initialSpatialEnabled('?spatial=1')).toBe(true)
    expect(initialSpatialEnabled('?spatial=0')).toBe(false)
    expect(initialSpatialEnabled('?q=balanced', 'http://127.0.0.1:5190/?spatial=1')).toBe(true)
    expect(initialSpatialEnabled('?spatial=1', 'http://127.0.0.1:5190/?spatial=0')).toBe(false)
    expect(initialSpatialMuted('?muteAudio=1')).toBe(true)
    expect(initialSpatialMuted('?spatial=1')).toBe(false)
    expect(initialSpatialMuted('', 'http://127.0.0.1:5190/?muteAudio=1')).toBe(true)
  })

  it('认领按原因让出提示音，没认领或别的原因照旧，语音优先', () => {
    expect(decideToneOutput(0)).toBe('play')
    expect(decideToneOutput(0, 'enqueue')).toBe('play')
    bindSpatialClaim((reason) => reason === 'enqueue')
    expect(decideToneOutput(0, 'enqueue')).toBe('yield')
    expect(decideToneOutput(0)).toBe('play')
    expect(decideToneOutput(0, 'focus')).toBe('play')
    setSpeechOwns(true)
    expect(decideToneOutput(0, 'focus')).toBe('yield')
    resetAlarmChannelForTests()
    expect(decideToneOutput(0, 'enqueue')).toBe('play')
  })
})

describe('测距槽', () => {
  it('被网格重新包住后再挂回去，调用链不会互相 flush', () => {
    let current: (SpatialSlot & { __gridBridge?: boolean }) | undefined
    const seen: unknown[] = []
    current = (node) => {
      seen.push(node)
    }
    const spatial = createSpatialSlot({
      read: () => current,
      write: (slot) => {
        current = slot
      },
      deliver: (node, upstream) => {
        upstream(['cue', node])
      },
    })
    expect(spatial.wrap()).toBe(true)

    let gridRaw: SpatialSlot & { __gridBridge?: boolean } = current
    const wrapGrid = () => {
      const slot = current
      if (!slot || slot.__gridBridge) return
      gridRaw = slot
      const wrapped: SpatialSlot & { __gridBridge?: boolean } = (node) => {
        gridRaw(node)
      }
      wrapped.__gridBridge = true
      current = wrapped
    }

    wrapGrid()
    expect(spatial.wrap()).toBe(true)
    expect(current?.__spatialBridge).toBe(true)
    expect(current?.__gridBridge).toBe(true)
    for (let index = 0; index < 20; index += 1) {
      wrapGrid()
      spatial.wrap()
    }
    expect(() => current?.('measure')).not.toThrow()
    expect(seen).toEqual([['cue', 'measure']])
    spatial.push('again', false)
    expect(seen).toEqual([
      ['cue', 'measure'],
      ['cue', 'again'],
    ])
  })
})

describe('空间音分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountPositionalAudio()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，不进首屏，也不另起音频库', () => {
    const dock = read('../viewmarks/dock.tsx')
    const cue = read('PositionalCue.tsx')
    const mount = read('mountPositional.ts')
    const plugin = read('../../scripts/positionalPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
    }
    const wav = encodeCueWav()

    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF')
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE')
    expect(wav.length).toBe(44 + Math.round(22050 * 0.24) * 2)

    expect(dock).toContain(POSITIONAL_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/audio\/mountPositional'\)/)
    expect(dock).toMatch(/mountPositionalAudio\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/audio\/mountPositional'/)
    expect(plugin).toContain(POSITIONAL_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'positional-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/PositionalAudio\.js/)
    expect(vite).toMatch(/positionalAfterHash/)

    expect(cue).toMatch(/from '@react-three\/drei\/core\/PositionalAudio'/)
    expect(cue).toMatch(/setRefDistance/)
    expect(cue).toMatch(/loop=\{false\}/)
    expect(cue).toMatch(/extend\(/)
    expect(cue).not.toMatch(/\buseFrame\s*\(/)
    expect(cue).not.toMatch(/\bautoplay\s*[=:{]/)
    expect(mount).toMatch(/pointerdown/)
    expect(mount).toMatch(/keydown/)
    expect(mount).toMatch(/bindSpatialClaim/)
    expect(mount).toMatch(/acquireChannel/)
    expect(mount).toMatch(/__twinMeasureSlot/)
    expect(mount).not.toMatch(/\buseFrame\b/)
    expect(read('spatialSlot.ts')).toMatch(/__spatialBridge/)
    expect(read('spatialSlot.ts')).toMatch(/startsWith\('__'\)/)
    expect(cue).toMatch(/removeFromParent/)
    expect(cue).toMatch(/probe\.listener = attached/)
    expect([cue, mount].join('\n')).not.toMatch(/howler|tone\.js|\.mp3['"`]/i)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../scene/stage/cameraTransition.ts',
      '../scene/fog.ts',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/PositionalCue|mountPositional|alarm-spatial-toggle/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
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
