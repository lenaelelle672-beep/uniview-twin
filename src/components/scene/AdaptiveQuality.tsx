import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei/core/PerformanceMonitor'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  ADAPTIVE_DWELL_MS,
  ADAPTIVE_FIRST_PROBE_DELAY_MS,
  ADAPTIVE_ITERATIONS,
  ADAPTIVE_PROBE_GAP_MS,
  ADAPTIVE_SAMPLE_MS,
  ADAPTIVE_THRESHOLD,
  ADAPTIVE_WARMUP_MS,
  ADAPTIVE_WINDOW_MS,
  acceptAdaptiveSample,
  adaptiveAdjustmentsAllowed,
  adaptiveFpsBounds,
  decideAdaptiveTier,
  ensureAdaptiveMemory,
  noteAdaptivePumpFrame,
  phaseActivity,
  publishAdaptiveStatus,
  readAdaptiveMemory,
  readAdaptivePumpFrames,
  readLiveScheduledHz,
  resetAdaptivePumpFrames,
  resolveSampleMode,
  stampGpuTier,
  writeAdaptiveMemory,
  type AdaptivePhase,
  type AdaptiveSignal,
} from '../../scene/adaptiveQuality'
import { detectSoftwareRenderer } from '../../scene/gpuDetect'
import { useTwinStore } from '../../store/store'

/**
 * 固定连续窗口。frameloop 仍是 demand。
 * useFrame 里 invalidate 会把 internal.frames 留成 1，下一拍继续提交。
 * 卸下后循环自己停。不改画布的循环模式，避免时钟被归零。
 */
function FixedFramePump() {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    invalidate()
  }, [invalidate])
  useFrame(() => {
    noteAdaptivePumpFrame()
    invalidate()
  })
  return null
}

function pageHidden(): boolean {
  return document.visibilityState === 'hidden'
}

function adjustmentsAllowed(): boolean {
  const state = useTwinStore.getState()
  const software = window.__twinGpu?.software === true
  return adaptiveAdjustmentsAllowed({
    qualityPinned: state.qualityPinned,
    downgradeSuppressed: state.downgradeSuppressed,
    software,
  })
}

export function AdaptiveQuality() {
  const gl = useThree((state) => state.gl)
  const [phase, setPhase] = useState<AdaptivePhase>('idle')
  const noteRef = useRef<((signal: 'decline' | 'incline', fps: number) => void) | null>(null)
  const activity = phaseActivity(phase)

  useEffect(() => {
    const software = window.__twinGpu?.software === true || detectSoftwareRenderer(gl.getContext()).software
    if (software) {
      publishAdaptiveStatus({ mode: 'idle', sampling: false, frozen: true, pumpFrames: 0 })
      return
    }

    ensureAdaptiveMemory(useTwinStore.getState().quality)
    let stopped = false
    let poll = 0
    const timers = new Set<number>()

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id)
          resolve()
        }, ms)
        timers.add(id)
      })

    const clearPoll = () => {
      if (!poll) return
      window.clearInterval(poll)
      poll = 0
    }

    const setLivePhase = (next: AdaptivePhase) => {
      if (stopped) return
      setPhase(next)
      const current = readAdaptiveMemory()
      publishAdaptiveStatus({
        mode: next,
        sampling: phaseActivity(next).monitor,
        ceiling: current?.ceiling,
        frozen: current?.frozen ?? false,
        pumpFrames: readAdaptivePumpFrames(),
      })
    }

    const sample = (mode: 'fixed-window' | 'unthrottled-load') =>
      new Promise<AdaptiveSignal | null>((resolve) => {
        let signal: AdaptiveSignal | null = null
        let settled = false
        resetAdaptivePumpFrames()
        const finish = (value: AdaptiveSignal | null) => {
          if (settled) return
          settled = true
          clearPoll()
          noteRef.current = null
          resolve(value)
        }
        noteRef.current = (next, fps) => {
          if (signal === 'decline') return
          signal = next
          const current = readAdaptiveMemory()
          publishAdaptiveStatus({
            mode,
            sampling: true,
            ceiling: current?.ceiling,
            frozen: current?.frozen ?? false,
            lastFps: fps,
            pumpFrames: readAdaptivePumpFrames(),
          })
        }
        setLivePhase(mode)
        poll = window.setInterval(() => {
          if (stopped || !adjustmentsAllowed() || pageHidden()) {
            finish(null)
            return
          }
          const liveMode = resolveSampleMode({
            hidden: false,
            phase: mode,
            scheduledHz: mode === 'unthrottled-load' ? readLiveScheduledHz() : Number.POSITIVE_INFINITY,
          })
          if (liveMode === 'off') {
            finish(null)
            return
          }
          if (signal) finish(accept(signal))
        }, 100)
        const cap = window.setTimeout(() => {
          timers.delete(cap)
          finish(accept(signal ?? 'steady'))
        }, ADAPTIVE_WINDOW_MS)
        timers.add(cap)

        function accept(value: AdaptiveSignal): AdaptiveSignal | null {
          return acceptAdaptiveSample({ mode, signal: value, pumpFrames: readAdaptivePumpFrames() })
        }
      })

    const apply = (signal: AdaptiveSignal) => {
      if (stopped || !adjustmentsAllowed()) return
      const current = readAdaptiveMemory()
      if (!current || current.frozen) return
      const state = useTwinStore.getState()
      const decision = decideAdaptiveTier(current, state.quality, signal, performance.now())
      writeAdaptiveMemory(decision.memory)
      if (decision.applied === 'decline') state.declineQuality()
      else if (decision.applied === 'incline') state.inclineQuality()
      const live = useTwinStore.getState().quality
      if (decision.applied) stampGpuTier(live)
      publishAdaptiveStatus({
        mode: 'idle',
        sampling: false,
        ceiling: decision.memory.ceiling,
        frozen: decision.memory.frozen,
        lastSignal: signal,
        lastApplied: decision.applied,
        pumpFrames: readAdaptivePumpFrames(),
      })
    }

    const run = async () => {
      setLivePhase('idle')
      await sleep(ADAPTIVE_FIRST_PROBE_DELAY_MS)
      while (!stopped) {
        if (!adjustmentsAllowed() || pageHidden()) {
          setLivePhase('idle')
          await sleep(1_500)
          continue
        }
        const current = readAdaptiveMemory()
        if (!current || current.frozen) {
          setLivePhase('idle')
          return
        }
        if (current.changedAt != null) {
          const remain = ADAPTIVE_DWELL_MS - (performance.now() - current.changedAt)
          if (remain > 0) {
            setLivePhase('idle')
            await sleep(remain)
            continue
          }
        }

        if (readLiveScheduledHz() === Number.POSITIVE_INFINITY) {
          await sleep(ADAPTIVE_WARMUP_MS)
          if (stopped || readLiveScheduledHz() !== Number.POSITIVE_INFINITY) continue
          const signal = await sample('unthrottled-load')
          setLivePhase('idle')
          if (signal) apply(signal)
          await sleep(ADAPTIVE_PROBE_GAP_MS)
          continue
        }

        setLivePhase('warmup')
        await sleep(ADAPTIVE_WARMUP_MS)
        if (stopped || !adjustmentsAllowed() || pageHidden()) {
          setLivePhase('idle')
          continue
        }
        const signal = await sample('fixed-window')
        setLivePhase('idle')
        if (signal) apply(signal)
        await sleep(ADAPTIVE_PROBE_GAP_MS)
      }
    }

    void run()

    return () => {
      stopped = true
      noteRef.current = null
      clearPoll()
      for (const id of timers) window.clearTimeout(id)
      timers.clear()
      publishAdaptiveStatus({ mode: 'idle', sampling: false, pumpFrames: readAdaptivePumpFrames() })
    }
  }, [gl])

  const onSignal = (signal: 'decline' | 'incline') => (api: PerformanceMonitorApi) => {
    noteRef.current?.(signal, api.fps)
  }

  return (
    <>
      {activity.pump ? <FixedFramePump /> : null}
      {activity.monitor ? (
        <PerformanceMonitor
          ms={ADAPTIVE_SAMPLE_MS}
          iterations={ADAPTIVE_ITERATIONS}
          threshold={ADAPTIVE_THRESHOLD}
          bounds={adaptiveFpsBounds}
          onDecline={onSignal('decline')}
          onIncline={onSignal('incline')}
        />
      ) : null}
    </>
  )
}
