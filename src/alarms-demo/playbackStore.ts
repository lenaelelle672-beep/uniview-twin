import type { AlarmPlaybackFrame } from '../store/filterSlice'
import { useTwinStore } from '../store/store'

/** 写回放帧。已经是 null 时不再 set，避免离层多通知一次。 */
export function clearAlarmPlayback(): void {
  if (useTwinStore.getState().alarmPlayback == null) return
  useTwinStore.setState({ alarmPlayback: null })
}

export function setAlarmPlayback(frame: AlarmPlaybackFrame): void {
  useTwinStore.setState({ alarmPlayback: frame })
}
