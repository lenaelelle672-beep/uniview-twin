import { useTwinStore } from '../store/store'
import {
  shellShaderDueLatched,
  shellShaderMix,
  shellShaderOptOutAtBoot,
  shellShaderState,
  shellAlarmTotal,
  type ShellShaderGate,
  type ShellShaderState,
} from './plan'
import { publishShellShader } from './probe'

/**
 * T121：楼壳着色开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 着色模块再等总览、并且过了同一道 2600ms 窗口、而且真有叠色才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不调用 invalidate。
 * 叠色网格挂在 window.__twinScene 里已有的实体壳上，不占格网槽。
 */

type Live = {
  syncShellShader: (
    scene: NonNullable<Window['__twinScene']>,
    mixes: { alarm: number; night: number },
  ) => number
  releaseShellShader: (scene: NonNullable<Window['__twinScene']>) => void
}

let started = false
let optOut = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let visual = ''

function readGate(): ShellShaderGate {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    dayNight: state.dayNight,
    presentation: state.presentation,
    optOut,
    alarmCount: shellAlarmTotal(state.floors),
  }
}

function currentState(): ShellShaderState {
  due = shellShaderDueLatched(due, window.__twinFirstFrameAt, performance.now())
  return shellShaderState(readGate(), due)
}

function wanted(): boolean {
  return currentState() === 'on'
}

function sceneNow(): NonNullable<Window['__twinScene']> | null {
  const scene = window.__twinScene
  if (!scene || typeof scene.traverse !== 'function') return null
  return scene
}

function kick(next: string): void {
  if (next === visual) return
  visual = next
  void window.__twinInvalidate?.()
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./runtime').then((mod) => {
    live = mod
  })
  await loading
}

async function refresh(): Promise<void> {
  const gate = readGate()
  const state = currentState()
  const show = state === 'on'
  const mix = shellShaderMix(gate)
  const scene = sceneNow()
  const next = show ? `on:${mix.alarm}:${mix.night}:${scene ? 1 : 0}` : `off:${state}`
  if (next === signature) return
  const mine = ++token
  signature = next
  if (!show) {
    if (live && scene) live.releaseShellShader(scene)
    publishShellShader({ on: false, mounted: false, state, meshes: 0, alarmMix: 0, nightMix: 0 })
    if (visual.startsWith('on:')) kick('off')
    else visual = 'off'
    return
  }
  if (!scene) {
    publishShellShader({ on: true, mounted: false, state, meshes: 0, alarmMix: mix.alarm, nightMix: mix.night })
    if (mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || !wanted()) {
    if (mine === token) signature = ''
    return
  }
  const count = live.syncShellShader(scene, mix)
  publishShellShader({
    on: true,
    mounted: true,
    state: 'on',
    meshes: count,
    alarmMix: mix.alarm,
    nightMix: mix.night,
  })
  if (count > 0) kick(`on:${count}:${mix.alarm}:${mix.night}`)
  else if (mine === token) signature = ''
}

/** dock 晚加载之后调用。白模、单层、蓝图和 `?shellShader=0` 都不加载着色模块。 */
export function mountShellShader(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = shellShaderOptOutAtBoot(location.search, navigation?.name ?? '')
  publishShellShader({ on: false, mounted: false, state: currentState(), meshes: 0, alarmMix: 0, nightMix: 0 })
  window.__twinSetShellShader = (on) => {
    optOut = !on
    signature = ''
    void refresh()
  }
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  window.setInterval(() => {
    void refresh()
  }, 200)
}
