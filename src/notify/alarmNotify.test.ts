import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  acquireChannel,
  decideToneOutput,
  notifyCoversHidden,
  releaseChannel,
  resetAlarmChannelForTests,
  setNotifyCovers,
  setSpeechOwns,
} from '../audio/channelLatch'
import { createSpeechMemory, watchSpeech, type SpeechFact } from '../audio/speechPolicy'
import { NOTIFY_SOURCE_BLOCK } from '../../scripts/notifyPlugin'
import { mountAlarmNotify } from './AlarmNotify'
import {
  NOTIFY_TAG,
  initialNotifyEnabled,
  readNotifyPermission,
  requestNotifyPermission,
  showDesktopAlarm,
  type NotifyHost,
  type NotifyOptions,
} from './notifyGate'
import {
  NOTIFY_GAP_MS,
  NOTIFY_TITLE,
  createNotifyMemory,
  notifyBody,
  watchNotify,
  type NotifyFact,
  type NotifyMemory,
  type NotifyWatch,
} from './notifyPolicy'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function fact(id: string, levelText = '12 层', location = '塔楼 F12-66'): NotifyFact {
  return { id, levelText, location }
}

function watch(memory: NotifyMemory, partial: Partial<NotifyWatch> & Pick<NotifyWatch, 'now'>): ReturnType<typeof watchNotify> {
  return watchNotify(memory, {
    enabled: true,
    permitted: true,
    hidden: true,
    facts: [],
    ...partial,
  })
}

function withDocument(hidden: boolean, run: () => void): void {
  const host = globalThis as { document?: { hidden: boolean } }
  const had = Object.prototype.hasOwnProperty.call(host, 'document')
  const previous = host.document
  Object.defineProperty(host, 'document', { configurable: true, writable: true, value: { hidden } })
  try {
    run()
  } finally {
    if (had) Object.defineProperty(host, 'document', { configurable: true, writable: true, value: previous })
    else delete host.document
  }
}

describe('开关', () => {
  it('默认关，演示模式或 notify=1 才开，notify=0 盖过演示', () => {
    expect(initialNotifyEnabled('')).toBe(false)
    expect(initialNotifyEnabled('?q=balanced')).toBe(false)
    expect(initialNotifyEnabled('?notify=1')).toBe(true)
    expect(initialNotifyEnabled('notify=1&q=perf')).toBe(true)
    expect(initialNotifyEnabled('?demo=1')).toBe(true)
    expect(initialNotifyEnabled('?demoEdit=1')).toBe(true)
    expect(initialNotifyEnabled('?q=balanced&demo=1')).toBe(true)
    expect(initialNotifyEnabled('?demo=10')).toBe(false)
    expect(initialNotifyEnabled('?notify=0')).toBe(false)
    expect(initialNotifyEnabled('?notify=0&demo=1')).toBe(false)
    expect(initialNotifyEnabled('?notify=0&demoEdit=1&notify=1')).toBe(false)
    expect(initialNotifyEnabled('?q=balanced', 'http://127.0.0.1:5190/?notify=1')).toBe(true)
    expect(initialNotifyEnabled('?q=balanced', 'http://127.0.0.1:5190/?demo=1')).toBe(true)
    expect(initialNotifyEnabled('?notify=0', 'http://127.0.0.1:5190/?demoEdit=1')).toBe(false)
    expect(initialNotifyEnabled('', null)).toBe(false)
    expect(initialNotifyEnabled('?notify=1', 'not a url')).toBe(true)
  })
})

describe('权限门闩', () => {
  it('不安全、没有接口、已拒绝都不弹，也不去请求', async () => {
    let asked = 0
    class Denied {
      static permission = 'denied'
      static requestPermission(): Promise<string> {
        asked += 1
        return Promise.resolve('granted')
      }
      constructor(_title: string, _options?: NotifyOptions) {
        asked += 1
      }
    }
    const denied: NotifyHost = { isSecureContext: true, Notification: Denied }
    expect(readNotifyPermission(denied)).toBe('denied')
    await expect(requestNotifyPermission(denied)).resolves.toBe('denied')
    expect(showDesktopAlarm(denied, '12 层，塔楼')).toBeNull()
    expect(asked).toBe(0)

    class DefaultAsk {
      static permission = 'default'
      static requestPermission(): Promise<string> {
        asked += 1
        return Promise.resolve('granted')
      }
    }
    const insecure: NotifyHost = { isSecureContext: false, Notification: DefaultAsk }
    expect(readNotifyPermission(insecure)).toBe('unsupported')
    await expect(requestNotifyPermission(insecure)).resolves.toBe('unsupported')
    expect(showDesktopAlarm(insecure, '12 层')).toBeNull()
    expect(asked).toBe(0)

    expect(readNotifyPermission(null)).toBe('unsupported')
    expect(readNotifyPermission({ isSecureContext: true })).toBe('unsupported')
    expect(readNotifyPermission({ isSecureContext: true, Notification: undefined })).toBe('unsupported')
    await expect(requestNotifyPermission({ isSecureContext: true })).resolves.toBe('unsupported')
  })

  it('只有还没选择时才在调用栈里请求，拒绝和抛错都变成静默', async () => {
    let asked = 0
    class Ask {
      static permission = 'default'
      static requestPermission(): Promise<string> {
        asked += 1
        return Promise.resolve('granted')
      }
    }
    const host: NotifyHost = { isSecureContext: true, Notification: Ask }
    await expect(requestNotifyPermission(host)).resolves.toBe('granted')
    expect(asked).toBe(1)

    class ThrowAsk {
      static permission = 'default'
      static requestPermission(): Promise<string> {
        throw new Error('blocked')
      }
    }
    await expect(requestNotifyPermission({ isSecureContext: true, Notification: ThrowAsk })).resolves.toBe('denied')

    class RejectAsk {
      static permission = 'default'
      static requestPermission(): Promise<string> {
        return Promise.reject(new Error('blocked'))
      }
    }
    await expect(requestNotifyPermission({ isSecureContext: true, Notification: RejectAsk })).resolves.toBe('denied')

    class Granted {
      static permission = 'granted'
      static requestPermission(): Promise<string> {
        asked += 1
        return Promise.resolve('granted')
      }
    }
    await expect(requestNotifyPermission({ isSecureContext: true, Notification: Granted })).resolves.toBe('granted')
    expect(asked).toBe(1)
  })

  it('构造失败或权限不够时 show 返回 null', () => {
    let built = 0
    class Boom {
      static permission = 'granted'
      constructor(_title: string, options?: NotifyOptions) {
        built += 1
        if (options?.renotify) throw new Error('no renotify')
        throw new Error('nope')
      }
    }
    expect(showDesktopAlarm({ isSecureContext: true, Notification: Boom }, '正文')).toBeNull()
    expect(built).toBe(2)

    class Ok {
      static permission = 'granted'
      options: NotifyOptions | undefined
      constructor(_title: string, options?: NotifyOptions) {
        built += 1
        this.options = options
      }
      close(): void {}
    }
    built = 0
    const handle = showDesktopAlarm({ isSecureContext: true, Notification: Ok }, '12 层，塔楼 F12-66')
    expect(handle).toBeInstanceOf(Ok)
    expect(built).toBe(1)
    expect((handle as Ok).options).toEqual({ body: '12 层，塔楼 F12-66', tag: NOTIFY_TAG, renotify: true })
  })
})

describe('只在 hidden 时弹', () => {
  it('第一份快照不弹；看得见页面不弹；藏到后台才弹一条', () => {
    const first = fact('a', '12 层', '塔楼 F12-66')
    const primed = watch(createNotifyMemory(), { now: 0, hidden: true, facts: [first] })
    expect(primed.body).toBeNull()
    expect(primed.memory.primed).toBe(true)
    expect(primed.memory.pending).toEqual([])
    expect([...primed.memory.seen]).toEqual(['a'])

    const visible = watch(primed.memory, { now: 10, hidden: false, facts: [first, fact('b', '一层', '裙楼 F1-2')] })
    expect(visible.body).toBeNull()
    expect(visible.degraded).toBe(false)
    expect(visible.memory.pending).toEqual([])

    const hidden = watch(visible.memory, {
      now: 20,
      hidden: true,
      facts: [first, fact('b', '一层', '裙楼 F1-2'), fact('c', '8 层', '右侧楼 F8-1')],
    })
    expect(hidden.title).toBe(NOTIFY_TITLE)
    expect(hidden.body).toBe('8 层，右侧楼 F8-1')
    expect(hidden.degraded).toBe(false)
    expect(hidden.memory.pending).toEqual([])
  })

  it('功能关着或还没允许时，即使 hidden 也不弹，之后也不补弹旧告警', () => {
    const primed = watch(createNotifyMemory(), { now: 0, enabled: false, permitted: false, hidden: true, facts: [] })
    const denied = watch(primed.memory, {
      now: 10,
      enabled: true,
      permitted: false,
      hidden: true,
      facts: [fact('a')],
    })
    expect(denied.body).toBeNull()
    expect(denied.degraded).toBe(true)
    expect(denied.memory.pending).toEqual([])

    const off = watch(denied.memory, {
      now: 20,
      enabled: false,
      permitted: true,
      hidden: true,
      facts: [fact('a'), fact('b', '一层', '裙楼')],
    })
    expect(off.body).toBeNull()
    expect(off.degraded).toBe(true)

    const fresh = watch(off.memory, {
      now: 30,
      enabled: true,
      permitted: true,
      hidden: true,
      facts: [fact('a'), fact('b', '一层', '裙楼'), fact('c', '3 层', '塔楼 F3-1')],
    })
    expect(fresh.body).toBe('3 层，塔楼 F3-1')
    expect(notifyBody([])).toBeNull()
    expect(notifyBody([fact('a', '12 层', '塔楼')])).toBe('12 层，塔楼')
    expect(notifyBody([fact('a'), fact('b', '一层', '裙楼'), fact('c', '3 层', '塔楼')])).toBe('3 层，塔楼，另2处')
  })
})

describe('节流合并', () => {
  it('窗内后来的告警并成下一条，看得见了就丢掉，不再补弹', () => {
    const primed = watch(createNotifyMemory(), { now: 0, facts: [fact('a')] })
    const first = watch(primed.memory, { now: 10, facts: [fact('a'), fact('b', '一层', '裙楼 F1-2')] })
    expect(first.body).toBe('一层，裙楼 F1-2')

    const held = watch(first.memory, { now: 20, facts: [fact('a'), fact('b', '一层', '裙楼 F1-2'), fact('c', '8 层', '右侧楼')] })
    expect(held.body).toBeNull()
    expect(held.memory.pending.map((item) => item.id)).toEqual(['c'])
    expect(held.retryInMs).toBe(NOTIFY_GAP_MS - 10)

    const back = watch(held.memory, {
      now: 30,
      hidden: false,
      facts: [fact('a'), fact('b', '一层', '裙楼 F1-2'), fact('c', '8 层', '右侧楼')],
    })
    expect(back.body).toBeNull()
    expect(back.memory.pending).toEqual([])

    const again = watch(back.memory, {
      now: 10 + NOTIFY_GAP_MS,
      hidden: true,
      facts: [fact('a'), fact('b', '一层', '裙楼 F1-2'), fact('c', '8 层', '右侧楼')],
    })
    expect(again.body).toBeNull()

    const merged = watch(held.memory, {
      now: 10 + NOTIFY_GAP_MS,
      hidden: true,
      facts: [fact('a'), fact('b', '一层', '裙楼 F1-2'), fact('c', '8 层', '右侧楼'), fact('d', '3 层', '塔楼 F3-1')],
    })
    expect(merged.body).toBe('3 层，塔楼 F3-1，另1处')
    expect(merged.memory.lastFireAt).toBe(10 + NOTIFY_GAP_MS)
  })
})

describe('和提示音、语音互斥', () => {
  it('文档 hidden 且通知接手时只留桌面这一路', () => {
    resetAlarmChannelForTests()
    withDocument(true, () => {
      setNotifyCovers(true)
      expect(notifyCoversHidden()).toBe(true)
      expect(decideToneOutput(0)).toBe('yield')

      const speechFact: SpeechFact = { id: 'a', levelText: '12 层', location: '塔楼 F12-66' }
      const primedSpeech = watchSpeech(createSpeechMemory(), {
        now: 0,
        enabled: true,
        muted: false,
        unlocked: true,
        supported: true,
        toneBusy: false,
        notifyCovering: true,
        facts: [],
      })
      const yielded = watchSpeech(primedSpeech.memory, {
        now: 10,
        enabled: true,
        muted: false,
        unlocked: true,
        supported: true,
        toneBusy: false,
        notifyCovering: true,
        facts: [speechFact],
      })
      expect(yielded.utterance).toBeNull()
      expect(yielded.yieldToNotify).toBe(true)
      expect(yielded.ownsChannel).toBe(true)

      const primed = watch(createNotifyMemory(), { now: 0, facts: [] })
      const fired = watch(primed.memory, { now: 10, facts: [fact('a')] })
      expect(fired.body).toBe('12 层，塔楼 F12-66')
    })
    resetAlarmChannelForTests()
  })

  it('看得见页面时不弹，通知也不挡住提示音；未接手时后台仍可响', () => {
    resetAlarmChannelForTests()
    withDocument(false, () => {
      setNotifyCovers(true)
      expect(notifyCoversHidden()).toBe(false)
      expect(decideToneOutput(0)).toBe('play')
      const primed = watch(createNotifyMemory(), { now: 0, hidden: false, facts: [] })
      const visible = watch(primed.memory, { now: 10, hidden: false, facts: [fact('a')] })
      expect(visible.body).toBeNull()
    })
    withDocument(true, () => {
      setNotifyCovers(false)
      setSpeechOwns(false)
      expect(notifyCoversHidden()).toBe(false)
      expect(decideToneOutput(0)).toBe('play')
      expect(acquireChannel('notify', 0, 1000)).toBe(true)
      expect(decideToneOutput(10)).toBe('wait')
      expect(acquireChannel('tone', 10, 100)).toBe(false)
      releaseChannel('notify')
      expect(decideToneOutput(10)).toBe('play')
    })
    resetAlarmChannelForTests()
  })
})

describe('通知分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountAlarmNotify()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不新加依赖', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('AlarmNotify.ts')
    const policy = read('notifyPolicy.ts')
    const gate = read('notifyGate.ts')
    const plugin = read('../../scripts/notifyPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = read('../../package.json')
    const latch = read('../audio/channelLatch.ts')
    const speech = read('../audio/AlarmSpeech.ts')
    const cue = read('../audio/AlarmAudioCue.ts')
    const blob = [mount, policy, gate].join('\n')

    expect(dock).toContain(NOTIFY_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/notify\/AlarmNotify'\)/)
    expect(dock).toMatch(/mountAlarmNotify\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/notify\/AlarmNotify'/)
    expect(plugin).toContain(NOTIFY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'notify-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/AlarmNotify\.js/)
    expect(vite).toMatch(/notifyAfterHash/)
    expect(mount).toMatch(/pointerdown/)
    expect(mount).toMatch(/keydown/)
    expect(mount).toMatch(/document\.hidden/)
    expect(mount).toMatch(/visibilitychange/)
    expect(mount).toMatch(/alarm-notify-toggle/)
    expect(mount).toMatch(/setNotifyCovers/)
    expect(gate).toMatch(/requestPermission/)
    expect(latch).toMatch(/notifyCoversHidden/)
    expect(speech).toMatch(/notifyCovering/)
    expect(speech).toMatch(/yieldToNotify/)
    expect(cue).toMatch(/decideToneOutput/)

    const mountFn = mount.slice(mount.indexOf('export function mountAlarmNotify'))
    expect(mountFn).not.toMatch(/requestNotifyPermission|askIfNeeded/)

    const imports = blob
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line))
      .join('\n')
    expect(imports).not.toMatch(/howler|tone\.js|FogExp2|smoothTime|balancedFx|softShadows/)
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
      expect(read(file), file).not.toMatch(/AlarmNotify|requestPermission|alarm-notify-toggle|mountAlarmNotify|twin-alarm/)
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
