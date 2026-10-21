import { useEffect, useMemo, useRef, useState } from 'react'
import { useTwinStore } from '../store/store'
import type { AlarmPlaybackFrame } from '../store/filterSlice'
import './AlarmTimeline.css'
import {
  DEMO_NOW_MS,
  DEMO_SAMPLE,
  DEMO_STEP_MS,
  DEMO_WINDOW_MS,
  buildDemoSpans,
  formatDemoClock,
  frameFromSpans,
  livePcAlarmDeskIds,
  type DemoAlarmSpan,
} from './DEMO_alarmTimeline'
import { createInvalidateThrottle, type InvalidateThrottle } from './invalidateThrottle'

function sameFrame(prev: AlarmPlaybackFrame, next: AlarmPlaybackFrame): boolean {
  if (prev.cursorMs !== next.cursorMs || prev.alarmDeskIds.length !== next.alarmDeskIds.length) return false
  if (prev.alarms.length !== next.alarms.length) return false
  for (let index = 0; index < prev.alarmDeskIds.length; index += 1) {
    if (prev.alarmDeskIds[index] !== next.alarmDeskIds[index]) return false
  }
  for (let index = 0; index < prev.alarms.length; index += 1) {
    if (prev.alarms[index]?.id !== next.alarms[index]?.id) return false
  }
  return true
}

/**
 * 进层后的告警回放条。数据和过滤都在这个分包里。
 * 滑条先改本地读数，store 写入经过节流，描边和热力的 invalidate 跟着这拍走。
 */
export function AlarmTimeline() {
  const devices = useTwinStore((state) => state.devices)
  const alarms = useTwinStore((state) => state.alarms)
  const playback = useTwinStore((state) => state.alarmPlayback)
  const [draftMs, setDraftMs] = useState(DEMO_NOW_MS)
  const draftRef = useRef(DEMO_NOW_MS)
  const throttleRef = useRef<InvalidateThrottle | null>(null)
  if (throttleRef.current == null) throttleRef.current = createInvalidateThrottle()

  const spans = useMemo(() => buildDemoSpans(devices, alarms), [alarms, devices])
  const spansRef = useRef<DemoAlarmSpan[]>(spans)
  spansRef.current = spans

  const commitRef = useRef<(cursorMs: number) => void>(() => {})
  commitRef.current = (cursorMs: number) => {
    const state = useTwinStore.getState()
    if (cursorMs >= DEMO_NOW_MS) {
      if (state.alarmPlayback) state.clearAlarmPlayback()
      return
    }
    const frame = frameFromSpans(spansRef.current, cursorMs)
    if (!frame) {
      if (state.alarmPlayback) state.clearAlarmPlayback()
      return
    }
    if (state.alarmPlayback && sameFrame(state.alarmPlayback, frame)) return
    state.setAlarmPlayback(frame)
  }

  useEffect(() => {
    if (draftRef.current >= DEMO_NOW_MS) return
    commitRef.current(draftRef.current)
  }, [spans])

  useEffect(() => {
    const throttle = throttleRef.current
    return () => {
      throttle?.cancel()
      useTwinStore.getState().clearAlarmPlayback()
    }
  }, [])

  useEffect(() => {
    window.__twinAlarmTimeline = {
      demo: true,
      live: playback == null,
      cursorMs: playback?.cursorMs ?? DEMO_NOW_MS,
      startMs: DEMO_NOW_MS - DEMO_WINDOW_MS,
      nowMs: DEMO_NOW_MS,
      alarmDeskIds: [...(playback?.alarmDeskIds ?? livePcAlarmDeskIds(devices))],
      samples: { ...DEMO_SAMPLE },
    }
    return () => {
      delete window.__twinAlarmTimeline
    }
  }, [devices, playback])

  const clear = () => {
    throttleRef.current?.cancel()
    draftRef.current = DEMO_NOW_MS
    setDraftMs(DEMO_NOW_MS)
    useTwinStore.getState().clearAlarmPlayback()
  }

  const onRange = (value: string) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    draftRef.current = next
    setDraftMs(next)
    throttleRef.current?.push(() => commitRef.current(draftRef.current))
  }

  const live = draftMs >= DEMO_NOW_MS
  const clock = live ? '现在' : formatDemoClock(draftMs)
  const startMs = DEMO_NOW_MS - DEMO_WINDOW_MS

  return (
    <div className="alarm-timeline" role="group" aria-label="告警时间回放">
      <span className="alarm-timeline-demo" title="合成历史，不是真实告警事件">
        DEMO
      </span>
      <label className="alarm-timeline-label">
        <span>告警回放</span>
        <input
          className="alarm-timeline-range"
          type="range"
          min={startMs}
          max={DEMO_NOW_MS}
          step={DEMO_STEP_MS}
          value={draftMs}
          aria-label="告警时间"
          aria-valuemin={startMs}
          aria-valuemax={DEMO_NOW_MS}
          aria-valuenow={draftMs}
          aria-valuetext={clock}
          onChange={(event) => onRange(event.currentTarget.value)}
          onPointerUp={() => throttleRef.current?.flush()}
          onKeyUp={() => throttleRef.current?.flush()}
        />
      </label>
      <span className="alarm-timeline-clock">{clock}</span>
      <button type="button" className="alarm-timeline-clear" aria-label="清空告警回放" onClick={clear}>
        清空
      </button>
    </div>
  )
}
