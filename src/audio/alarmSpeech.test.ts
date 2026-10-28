import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { SPEECH_SOURCE_BLOCK } from '../../scripts/speechPlugin'
import { mountAlarmSpeech } from './AlarmSpeech'
import {
  acquireChannel,
  decideToneOutput,
  readAlarmChannel,
  releaseChannel,
  resetAlarmChannelForTests,
  setSpeechOwns,
} from './channelLatch'
import { initialSpeechEnabled, initialSpeechMuted } from './speechGate'
import {
  SPEECH_MIN_HOLD_MS,
  clearSpeechQueue,
  createSpeechMemory,
  levelTextFromFloor,
  locationText,
  preferChineseVoice,
  speechFacts,
  utteranceFor,
  utteranceHoldMs,
  watchSpeech,
  type SpeechFact,
  type SpeechMemory,
  type SpeechWatch,
  type VoiceLike,
} from './speechPolicy'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function fact(id: string, levelText: string, location: string): SpeechFact {
  return { id, levelText, location }
}

function watch(memory: SpeechMemory, partial: Partial<SpeechWatch> & Pick<SpeechWatch, 'now'>): ReturnType<typeof watchSpeech> {
  return watchSpeech(memory, {
    enabled: true,
    muted: false,
    unlocked: true,
    supported: true,
    toneBusy: false,
    facts: [],
    ...partial,
  })
}

describe('开关', () => {
  it('默认关，演示模式或 speech=1 才开，speech=0 盖过演示', () => {
    expect(initialSpeechEnabled('')).toBe(false)
    expect(initialSpeechEnabled('?q=balanced')).toBe(false)
    expect(initialSpeechEnabled('?speech=1')).toBe(true)
    expect(initialSpeechEnabled('speech=1&q=perf')).toBe(true)
    expect(initialSpeechEnabled('?demo=1')).toBe(true)
    expect(initialSpeechEnabled('?demoEdit=1')).toBe(true)
    expect(initialSpeechEnabled('?q=balanced&demo=1')).toBe(true)
    expect(initialSpeechEnabled('?demo=10')).toBe(false)
    expect(initialSpeechEnabled('?demoEdit=10')).toBe(false)
    expect(initialSpeechEnabled('?speech=0')).toBe(false)
    expect(initialSpeechEnabled('?speech=0&demo=1')).toBe(false)
    expect(initialSpeechEnabled('?speech=0&demoEdit=1&speech=1')).toBe(false)
    expect(initialSpeechEnabled('?q=balanced', 'http://127.0.0.1:5190/?speech=1')).toBe(true)
    expect(initialSpeechEnabled('?q=balanced', 'http://127.0.0.1:5190/?demoEdit=1')).toBe(true)
    expect(initialSpeechEnabled('?q=balanced', 'http://127.0.0.1:5190/?demo=1')).toBe(true)
    expect(initialSpeechEnabled('?speech=0', 'http://127.0.0.1:5190/?demo=1')).toBe(false)
    expect(initialSpeechEnabled('', null)).toBe(false)
    expect(initialSpeechEnabled('?speech=1', 'not a url')).toBe(true)
    expect(initialSpeechMuted('?muteSpeech=1')).toBe(true)
    expect(initialSpeechMuted('?muteAudio=1')).toBe(true)
    expect(initialSpeechMuted('?q=balanced', 'http://127.0.0.1:5190/?muteSpeech=1')).toBe(true)
    expect(initialSpeechMuted('?speech=1')).toBe(false)
  })
})

describe('短句', () => {
  it('只报级别和位置，多条合并成一句', () => {
    expect(levelTextFromFloor('F12', '12 层', 12)).toBe('12 层')
    expect(levelTextFromFloor('F1', null, null)).toBe('一层')
    expect(levelTextFromFloor('B1', '', -1)).toBe('地下一层')
    expect(levelTextFromFloor('F8')).toBe('8 层')
    expect(locationText('tower', 'F12-66', 'F12-66-PC')).toBe('塔楼 F12-66')
    expect(locationText('east', null, 'F2-CAM1')).toBe('右侧楼')
    expect(locationText(null, null, 'F2-CAM1')).toBe('F2-CAM1')

    const facts = speechFacts({
      alarms: [
        { id: 'a', floorId: 'F12', deviceId: 'F12-66-PC' },
        { id: 'b', floorId: 'F1', deviceId: 'F1-2-PC' },
      ],
      floors: [
        { id: 'F12', name: '12 层', level: 12 },
        { id: 'F1', name: '一层', level: 1 },
      ],
      devices: [
        { id: 'F12-66-PC', deskId: 'F12-66', zone: 'tower' },
        { id: 'F1-2-PC', deskId: 'F1-2', zone: 'podium' },
      ],
      desks: [
        { id: 'F12-66', zone: 'tower' },
        { id: 'F1-2', zone: 'podium' },
      ],
    })
    expect(facts).toEqual([
      { id: 'a', levelText: '12 层', location: '塔楼 F12-66' },
      { id: 'b', levelText: '一层', location: '裙楼 F1-2' },
    ])
    expect(utteranceFor(facts.slice(0, 1))).toBe('告警，12 层，塔楼 F12-66')
    expect(utteranceFor(facts)).toBe('告警，一层，裙楼 F1-2，另1处')
    expect(utteranceFor([])).toBeNull()
    expect(utteranceHoldMs('告警，12 层，塔楼 F12-66')).toBeGreaterThanOrEqual(SPEECH_MIN_HOLD_MS)
  })

  it('中文语音优先 zh-CN', () => {
    const voices: VoiceLike[] = [
      { lang: 'en-US', name: 'Samantha', localService: true },
      { lang: 'zh-TW', name: '美佳', localService: true },
      { lang: 'zh-CN', name: '远程普通话', localService: false },
      { lang: 'zh-CN', name: '晓晓', localService: true },
    ]
    expect(preferChineseVoice(voices)?.name).toBe('晓晓')
    expect(preferChineseVoice([{ lang: 'zh-HK', name: '香港', localService: true }])?.lang).toBe('zh-HK')
    expect(preferChineseVoice([{ lang: '', name: 'Chinese', localService: true }])?.name).toBe('Chinese')
    expect(preferChineseVoice([{ lang: 'en-US', name: 'Alex' }])).toBeNull()
    expect(preferChineseVoice([])).toBeNull()
  })
})

describe('节流合并', () => {
  it('第一份快照先记住，解锁后只说一句，窗内再并', () => {
    const first = fact('a', '12 层', '塔楼 F12-66')
    const second = fact('b', '一层', '裙楼 F1-2')
    const third = fact('c', '8 层', '右侧楼 F8-1')

    const primed = watch(createSpeechMemory(), { now: 0, unlocked: false, facts: [first, second] })
    expect(primed.utterance).toBeNull()
    expect(primed.memory.primed).toBe(true)
    expect(primed.memory.merged.map((item) => item.id)).toEqual(['a', 'b'])
    expect(primed.ownsChannel).toBe(true)

    const spoken = watch(primed.memory, { now: 40, unlocked: true, facts: [first, second] })
    expect(spoken.cancel).toBe(true)
    expect(spoken.utterance).toBe('告警，一层，裙楼 F1-2，另1处')
    expect(spoken.memory.merged).toEqual([])
    expect(spoken.holdMs).toBeGreaterThanOrEqual(SPEECH_MIN_HOLD_MS)

    const held = watch(spoken.memory, { now: spoken.memory.holdUntil - 20, facts: [first, second, third] })
    expect(held.utterance).toBeNull()
    expect(held.memory.merged.map((item) => item.id)).toEqual(['c'])
    expect(held.retryInMs).toBe(20)

    const next = watch(held.memory, { now: spoken.memory.holdUntil, facts: [first, second, third] })
    expect(next.utterance).toBe('告警，8 层，右侧楼 F8-1')
    expect(next.cancel).toBe(true)
  })

  it('静音丢掉待播并要求清队列，提示音占着时先等', () => {
    const primed = watch(createSpeechMemory(), { now: 0, unlocked: false, facts: [fact('a', '12 层', '塔楼')] })
    const muted = watch(primed.memory, { now: 10, muted: true, unlocked: false, facts: [fact('a', '12 层', '塔楼')] })
    expect(muted.utterance).toBeNull()
    expect(muted.cancel).toBe(true)
    expect(muted.silenced).toBe(true)
    expect(muted.ownsChannel).toBe(false)
    expect(muted.memory.merged).toEqual([])

    const again = watch(createSpeechMemory(), { now: 0, facts: [] })
    const busy = watch(again.memory, {
      now: 10,
      toneBusy: true,
      facts: [fact('n', '3 层', '塔楼 F3-1')],
    })
    expect(busy.utterance).toBeNull()
    expect(busy.memory.merged).toHaveLength(1)
    expect(busy.retryInMs).toBeGreaterThanOrEqual(280)

    const off = watch(createSpeechMemory(), { now: 0, enabled: false, facts: [fact('a', '12 层', '塔楼')] })
    expect(off.ownsChannel).toBe(false)
    expect(off.memory.merged).toEqual([])
    const unsupported = watch(createSpeechMemory(), { now: 0, supported: false, facts: [fact('a', '12 层', '塔楼')] })
    expect(unsupported.ownsChannel).toBe(false)
  })

  it('cancel() 清掉队列', () => {
    let calls = 0
    clearSpeechQueue({
      cancel() {
        calls += 1
      },
    })
    expect(calls).toBe(1)
    expect(() => clearSpeechQueue({ cancel: () => {
      throw new Error('empty')
    } })).not.toThrow()
    expect(() => clearSpeechQueue(null)).not.toThrow()
    expect(() => clearSpeechQueue(undefined)).not.toThrow()
  })
})

describe('声道门闩', () => {
  it('语音接过时提示音让出，语音正在说时也不抢', () => {
    resetAlarmChannelForTests()
    expect(decideToneOutput(0)).toBe('play')
    setSpeechOwns(true)
    expect(decideToneOutput(0)).toBe('yield')
    expect(readAlarmChannel().speechOwns).toBe(true)

    setSpeechOwns(false)
    expect(acquireChannel('speech', 0, 1000)).toBe(true)
    expect(decideToneOutput(10)).toBe('wait')
    expect(acquireChannel('tone', 10, 100)).toBe(false)
    expect(decideToneOutput(1000)).toBe('play')
    expect(acquireChannel('tone', 1000, 200)).toBe(true)
    expect(acquireChannel('speech', 1100, 100)).toBe(false)
    releaseChannel('tone')
    expect(acquireChannel('speech', 1100, 100)).toBe(true)
    setSpeechOwns(false)
    expect(readAlarmChannel().holder).toBeNull()
  })
})

describe('语音分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountAlarmSpeech()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不和提示音双开吵', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const speech = read('AlarmSpeech.ts')
    const policy = read('speechPolicy.ts')
    const gate = read('speechGate.ts')
    const latch = read('channelLatch.ts')
    const cue = read('AlarmAudioCue.ts')
    const tone = read('dualTone.ts')
    const plugin = read('../../scripts/speechPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = read('../../package.json')
    const blob = [speech, policy, gate, latch].join('\n')

    expect(dock).toContain(SPEECH_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/audio\/AlarmSpeech'\)/)
    expect(dock).toMatch(/mountAlarmSpeech\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/audio\/AlarmSpeech'/)
    expect(plugin).toContain(SPEECH_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'speech-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/AlarmSpeech\.js/)
    expect(vite).toMatch(/speechAfterHash/)
    expect(speech).toMatch(/speechSynthesis/)
    expect(speech).toMatch(/clearSpeechQueue/)
    expect(policy).toMatch(/\.cancel\(/)
    expect(speech).toMatch(/zh-CN/)
    expect(speech).toMatch(/pointerdown/)
    expect(speech).toMatch(/preferChineseVoice/)
    expect(speech).toMatch(/alarm-speech-toggle/)
    expect(cue).toMatch(/decideToneOutput/)
    expect(cue).toMatch(/setSpeechOwns/)
    expect(cue).toMatch(/acquireChannel/)
    expect(tone).toMatch(/createOscillator/)

    const imports = blob
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line))
      .join('\n')
    expect(imports).not.toMatch(/howler|tone\.js|tonejs|FogExp2|smoothTime|balancedFx|softShadows|groundTextures/)
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
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../scene/groundTextures.ts',
      '../components/AlarmTimelineGate.tsx',
      '../alarms-demo/AlarmTimeline.tsx',
      '../alarms-demo/DEMO_alarmTimeline.ts',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/AlarmSpeech|speechSynthesis|alarm-speech-toggle|mountAlarmSpeech/)
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
    expect(JSON.parse(pkg).dependencies['@react-three/drei']).toBe('10.7.9')
    expect(JSON.parse(pkg).dependencies.three).toBe('0.186.1')
  })
})
