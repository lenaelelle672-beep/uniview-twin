import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetTwinStore, useTwinStore } from '../../store/store'

const here = dirname(fileURLToPath(import.meta.url))

const prefetchGate = vi.hoisted(() => {
  const state = {
    promise: Promise.resolve() as Promise<void>,
    settle: (_value?: void) => {},
    reset() {
      state.promise = new Promise<void>((resolve) => {
        state.settle = resolve
      })
    },
  }
  state.reset()
  return state
})

vi.mock('./prefetchLazyChunks', () => ({
  waitFirstPrefetch: () => prefetchGate.promise,
}))

vi.mock('../labels/ProgressiveRoomLabels', () => ({
  ProgressiveRoomLabels: function ProgressiveRoomLabels() {
    return null
  },
}))

vi.mock('./textRuntime', () => ({}))

let rafQueue: FrameRequestCallback[] = []

function installWindow() {
  rafQueue = []
  const raf = (cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  }
  vi.stubGlobal('window', {
    requestAnimationFrame: raf,
  })
  vi.stubGlobal('requestAnimationFrame', raf)
}

function flushRaf() {
  const q = rafQueue
  rafQueue = []
  for (const cb of q) cb(0)
}

async function pump(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
    flushRaf()
  }
}

async function loadApi() {
  installWindow()
  prefetchGate.reset()
  resetTwinStore()
  return import('./RoomLabels')
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetTwinStore()
})

describe('D226 楼层标签不再等首次 prefetch', () => {
  beforeEach(() => {
    prefetchGate.reset()
    resetTwinStore()
  })

  it('源码：楼层等首帧后并行拉包，总览仍走 waitFirstPrefetch', () => {
    const src = readFileSync(join(here, 'RoomLabels.tsx'), 'utf8')
    expect(src).toMatch(/view !== 'floor'/)
    expect(src).toMatch(/waitFirstPrefetch/)
    expect(src).toMatch(/__twinFirstFrameAt/)
    expect(src).toMatch(/Promise\.all/)
    expect(src).toMatch(/import\('\.\.\/labels\/ProgressiveRoomLabels'\)/)
    expect(src).toMatch(/import\('\.\/textRuntime'\)/)
    expect(src).not.toMatch(/await waitFirstPrefetch\(\)\s*\n\s*const \{ ProgressiveRoomLabels \}/)
  })

  it('首帧前楼层不 import 标签包', async () => {
    const { loadRoomLabelChunk } = await loadApi()
    useTwinStore.setState({ view: 'floor' })
    let done = false
    void loadRoomLabelChunk().then(() => {
      done = true
    })
    await pump()
    expect(done).toBe(false)
    expect(prefetchGate.promise).toBeInstanceOf(Promise)
  })

  it('楼层首帧后不等 prefetch 就加载', async () => {
    const { loadRoomLabelChunk } = await loadApi()
    useTwinStore.setState({ view: 'floor' })
    window.__twinFirstFrameAt = 12
    const chunk = await Promise.race([
      loadRoomLabelChunk(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('楼层加载仍在等 prefetch')), 500)
      }),
    ])
    expect(chunk.default.name).toBe('ProgressiveRoomLabels')
  })

  it('总览即使已有首帧也要等 waitFirstPrefetch', async () => {
    const { loadRoomLabelChunk } = await loadApi()
    useTwinStore.setState({ view: 'building' })
    window.__twinFirstFrameAt = 12
    let done = false
    const pending = loadRoomLabelChunk().then((chunk) => {
      done = true
      return chunk
    })
    await pump()
    expect(done).toBe(false)
    prefetchGate.settle()
    await pending
    expect(done).toBe(true)
  })
})
