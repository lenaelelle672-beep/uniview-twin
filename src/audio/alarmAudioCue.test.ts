import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { mountAlarmAudioCue } from './AlarmAudioCue'
import {
  CUE_MIN_GAP_MS,
  FOCUS_BURST_MAX,
  FOCUS_QUIET_MS,
  FOCUS_REPEAT_MS,
  alarmFocusKey,
  createCueMemory,
  initialMuteAudio,
  muteAudioFromSearch,
  watchAlarms,
  type CueMemory,
  type CueWatch,
} from './cuePolicy'
import {
  CUE_DURATION_MS,
  CUE_DURATION_SEC,
  FIRST_TONE_HZ,
  SECOND_TONE_HZ,
  openCueContext,
  playAlarmCue,
  resumeCueContext,
  scheduleDualTone,
  type CueAudioContext,
  type CueGainNode,
  type CueToneNode,
} from './dualTone'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function watch(partial: Partial<CueWatch> & Pick<CueWatch, 'now'>): CueWatch {
  return {
    muted: false,
    unlocked: true,
    alarmIds: [],
    focusKey: null,
    ...partial,
  }
}

function step(memory: CueMemory, partial: Partial<CueWatch> & Pick<CueWatch, 'now'>) {
  return watchAlarms(memory, watch(partial))
}

interface FakeOsc extends CueToneNode {
  frequencyHz: number | null
  started: number | null
  stopped: number | null
}

function fakeContext(state: string, resume?: () => Promise<void>): CueAudioContext & { oscs: FakeOsc[]; gains: CueGainNode[] } {
  const oscs: FakeOsc[] = []
  const gains: CueGainNode[] = []
  return {
    state,
    currentTime: 5,
    destination: { id: 'out' },
    oscs,
    gains,
    resume,
    createOscillator() {
      const osc: FakeOsc = {
        type: '',
        frequencyHz: null,
        started: null,
        stopped: null,
        frequency: {
          setValueAtTime(value: number) {
            osc.frequencyHz = value
          },
        },
        connect() {},
        start(when: number) {
          osc.started = when
        },
        stop(when: number) {
          osc.stopped = when
        },
        onended: null,
        disconnect() {},
      }
      oscs.push(osc)
      return osc
    },
    createGain() {
      const gain: CueGainNode = {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      }
      gains.push(gain)
      return gain
    },
  }
}

describe('静音开关', () => {
  it('只认 muteAudio=1，原始导航地址也能读到', () => {
    expect(muteAudioFromSearch('?muteAudio=1')).toBe(true)
    expect(muteAudioFromSearch('muteAudio=1&q=balanced')).toBe(true)
    expect(muteAudioFromSearch('?q=balanced&muteAudio=1')).toBe(true)
    expect(muteAudioFromSearch('?muteAudio=0')).toBe(false)
    expect(muteAudioFromSearch('?q=perf')).toBe(false)
    expect(initialMuteAudio('?q=balanced', 'http://127.0.0.1:5190/?muteAudio=1')).toBe(true)
    expect(initialMuteAudio('?muteAudio=1', null)).toBe(true)
    expect(initialMuteAudio('', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
    expect(initialMuteAudio('?muteAudio=1', 'not a url')).toBe(true)
  })
})

describe('告警焦点', () => {
  const devices = [
    { id: 'pc-a', deskId: 'F12-1', status: 'alarm' },
    { id: 'pc-b', deskId: 'F12-2', status: 'online' },
    { id: 'cam', deskId: 'F12-9', status: 'offline' },
  ]
  const alarms = [{ deviceId: 'pc-b' }]

  it('告警设备、告警记录和告警工位才算焦点', () => {
    expect(alarmFocusKey('pc-a', 'F12-1', devices, alarms)).toBe('d:pc-a')
    expect(alarmFocusKey('pc-b', 'F12-2', devices, alarms)).toBe('d:pc-b')
    expect(alarmFocusKey(null, 'F12-1', devices, alarms)).toBe('w:F12-1')
    expect(alarmFocusKey(null, 'F12-2', devices, alarms)).toBe('w:F12-2')
    expect(alarmFocusKey('cam', 'F12-9', devices, alarms)).toBeNull()
    expect(alarmFocusKey(null, 'F12-9', devices, alarms)).toBeNull()
    expect(alarmFocusKey(null, null, devices, alarms)).toBeNull()
  })
})

describe('入队和焦点节流', () => {
  it('第一份快照不响，新 id 响一声，同一批再刷不响', () => {
    let memory = createCueMemory()
    const first = step(memory, { now: 1_000, alarmIds: ['a', 'b'] })
    expect(first.play).toBe(false)
    memory = first.memory
    expect(memory.primed).toBe(true)
    expect(memory.heard).toEqual(new Set(['a', 'b']))

    const again = step(memory, { now: 1_100, alarmIds: ['b', 'a'] })
    expect(again.play).toBe(false)

    const added = step(again.memory, { now: 1_200, alarmIds: ['a', 'b', 'c', ''] })
    expect(added.play).toBe(true)
    expect(added.reason).toBe('enqueue')
    const burst = step(added.memory, { now: 1_300, alarmIds: ['a', 'b', 'c', 'd'] })
    expect(burst.play).toBe(false)
    expect(burst.memory.pending).toBe('enqueue')
    expect(burst.retryInMs).toBe(CUE_MIN_GAP_MS - 100)

    const later = step(burst.memory, { now: 1_200 + CUE_MIN_GAP_MS, alarmIds: ['a', 'b', 'c', 'd'] })
    expect(later.play).toBe(true)
    expect(later.reason).toBe('enqueue')
    expect(later.memory.pending).toBeNull()
  })

  it('未解锁时在队告警留到第一次手势，循环再刷不响', () => {
    const primed = step(createCueMemory(), { now: 0, alarmIds: ['a', 'b'], unlocked: false })
    expect(primed.play).toBe(false)
    expect(primed.memory.pending).toBe('enqueue')
    const gesture = step(primed.memory, { now: 40, alarmIds: ['b', 'a'], unlocked: true })
    expect(gesture.play).toBe(true)
    expect(gesture.reason).toBe('enqueue')
    const loop = step(gesture.memory, { now: 4_000, alarmIds: ['a', 'b'], unlocked: true })
    expect(loop.play).toBe(false)
    const silent = step(createCueMemory(), { now: 0, alarmIds: ['a'], unlocked: false, muted: true })
    expect(silent.play).toBe(false)
    expect(silent.memory.pending).toBeNull()
  })

  it('焦点切换响一声，轮播和重复焦点不再刷', () => {
    let memory = step(createCueMemory(), { now: 0, alarmIds: ['a'] }).memory
    const first = step(memory, { now: 100, focusKey: 'd:a' })
    expect(first.play).toBe(true)
    expect(first.reason).toBe('focus')
    memory = first.memory

    const quick = step(memory, { now: 500, focusKey: 'd:b' })
    expect(quick.play).toBe(false)
    expect(quick.memory.pending).toBeNull()

    const third = step(quick.memory, { now: 900, focusKey: 'd:c' })
    expect(third.play).toBe(false)
    expect(third.memory.burst).toBeGreaterThan(FOCUS_BURST_MAX)

    const loop = step(third.memory, { now: 5_000, focusKey: 'd:a' })
    expect(loop.play).toBe(false)

    const quiet = step(loop.memory, { now: 900 + FOCUS_QUIET_MS + 50, focusKey: 'd:z' })
    expect(quiet.play).toBe(true)
    expect(quiet.reason).toBe('focus')

    const repeat = step(quiet.memory, { now: quiet.memory.lastCueAt + FOCUS_REPEAT_MS, focusKey: 'd:a' })
    expect(repeat.play).toBe(true)
  })

  it('静音丢掉待播，解锁前不响也不抛', () => {
    let memory = step(createCueMemory(), { now: 0, alarmIds: [] }).memory
    const held = step(memory, { now: 50, alarmIds: ['n1'], unlocked: false })
    expect(held.play).toBe(false)
    expect(held.memory.pending).toBe('enqueue')
    const muted = step(held.memory, { now: 80, alarmIds: ['n1'], muted: true, unlocked: false })
    expect(muted.play).toBe(false)
    expect(muted.memory.pending).toBeNull()
    const open = step(muted.memory, { now: 90, alarmIds: ['n1'], muted: false, unlocked: true })
    expect(open.play).toBe(false)
  })
})

describe('双音', () => {
  it('240ms 内两只正弦振荡接一只增益，未运行时不抛', () => {
    expect(CUE_DURATION_MS).toBeGreaterThanOrEqual(150)
    expect(CUE_DURATION_MS).toBeLessThanOrEqual(300)
    expect(FIRST_TONE_HZ).not.toBe(SECOND_TONE_HZ)

    const running = fakeContext('running')
    expect(playAlarmCue(running)).toBe(true)
    expect(running.gains).toHaveLength(1)
    expect(running.oscs).toHaveLength(2)
    expect(running.oscs.map((osc) => osc.frequencyHz)).toEqual([FIRST_TONE_HZ, SECOND_TONE_HZ])
    expect(running.oscs.every((osc) => osc.type === 'sine')).toBe(true)
    const span = Math.max(...running.oscs.map((osc) => osc.stopped ?? 0)) - Math.min(...running.oscs.map((osc) => osc.started ?? 0))
    expect(span).toBeCloseTo(CUE_DURATION_SEC)

    const suspended = fakeContext('suspended')
    expect(playAlarmCue(suspended)).toBe(false)
    expect(suspended.oscs).toHaveLength(0)
    expect(playAlarmCue(null)).toBe(false)

    const broken = fakeContext('running')
    broken.createOscillator = () => {
      throw new Error('no-gesture')
    }
    expect(playAlarmCue(broken)).toBe(false)
    expect(openCueContext(() => {
      throw new Error('blocked')
    })).toBeNull()
  })

  it('resume 被拒绝时也不抛', async () => {
    const rejected = fakeContext('suspended', () => Promise.reject(new Error('no-gesture')))
    await expect(resumeCueContext(rejected)).resolves.toBeUndefined()
    const throwing = fakeContext('suspended', () => {
      throw new Error('no-gesture')
    })
    await expect(resumeCueContext(throwing)).resolves.toBeUndefined()
    await expect(resumeCueContext(null)).resolves.toBeUndefined()
    expect(scheduleDualTone.length).toBeGreaterThan(0)
  })
})

describe('提示音分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountAlarmAudioCue()).not.toThrow()
  })

  it('逻辑只在 dock 晚加载之后的懒包里，不进首屏和正交模块', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    const dock = read('../viewmarks/dock.tsx')
    const cue = read('AlarmAudioCue.ts')
    const policy = read('cuePolicy.ts')
    const tone = read('dualTone.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const pkg = read('../../package.json')
    const blob = [cue, policy, tone].join('\n')

    expect(dock).toMatch(/import\('\.\.\/audio\/AlarmAudioCue'\)/)
    expect(dock).toMatch(/mountAlarmAudioCue\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/audio\/AlarmAudioCue'/)
    const viteConfig = read('../../vite.config.ts')
    expect(viteConfig).toMatch(/alarm-cue-after-hash/)
    expect(viteConfig).toMatch(/assets\/AlarmAudioCue\.js/)
    expect(viteConfig).toMatch(/apply: 'build'/)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(cue).toMatch(/initialMuteAudio/)
    expect(cue).toMatch(/alarm-audio-mute/)
    expect(cue).toMatch(/pointerdown/)
    expect(cue).toMatch(/resumeCueContext/)
    const imports = [cue, policy, tone]
      .join('\n')
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line))
      .join('\n')
    expect(imports).not.toMatch(/alarmPlayback|DeskFlash|deskOutline|AlarmTimeline|smoothTime|balancedFx|FogExp2/)
    expect(tone).toMatch(/createOscillator/)
    expect(tone).toMatch(/createGain/)
    expect(tone).toMatch(/OscillatorNode|createOscillator/)
    expect(blob).not.toMatch(/howler|tone\.js|tonejs|\.mp3|\.wav|\.ogg|\.aac/i)
    expect(blob).not.toMatch(/from 'three'|@react-three|postprocessing/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/stage/DeskFlash.tsx',
      '../scene/stage/DeskOutline.tsx',
      '../scene/stage/deskOutline.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../components/AlarmTimelineGate.tsx',
      '../alarms-demo/AlarmTimeline.tsx',
      '../alarms-demo/DEMO_alarmTimeline.ts',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/AlarmAudioCue|muteAudio|alarm-audio-mute/)
    }

    const dependencies = Object.keys(JSON.parse(pkg).dependencies as Record<string, string>).sort()
    expect(dependencies).toEqual(
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
    expect(pkg).not.toMatch(/howler|tone/)
  })
})
