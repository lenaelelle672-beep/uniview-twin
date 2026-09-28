import { useTwinStore } from '../store/store'
import type { QualityTier, ViewMode } from '../types'

interface TopBarProps {
  floorListOpen: boolean
  onToggleFloorList: () => void
  alarmOpen: boolean
  onToggleAlarm: () => void
}

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: 'building', label: '总览' },
  { id: 'floor', label: '单层' },
  { id: 'blueprint', label: '蓝图' },
]

const QUALITIES: Array<{ id: QualityTier; label: string }> = [
  { id: 'perf', label: '性能' },
  { id: 'balanced', label: '均衡' },
  { id: 'high', label: '高画质' },
]

export function TopBar({ floorListOpen, onToggleFloorList, alarmOpen, onToggleAlarm }: TopBarProps) {
  const view = useTwinStore((state) => state.view)
  const dayNight = useTwinStore((state) => state.dayNight)
  const quality = useTwinStore((state) => state.quality)
  const searchQuery = useTwinStore((state) => state.searchQuery)
  const setView = useTwinStore((state) => state.setView)
  const setDayNight = useTwinStore((state) => state.setDayNight)
  const setQuality = useTwinStore((state) => state.setQuality)
  const setSearchQuery = useTwinStore((state) => state.setSearchQuery)

  return (
    <header className="topbar">
      <h1 className="visually-hidden">宇视总部大楼数字孪生</h1>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          宇
        </span>
        <span className="brand-text">宇视总部数字孪生</span>
      </div>

      <div className="seg" role="group" aria-label="视图切换">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'is-active' : undefined}
            aria-label={`视图：${item.label}`}
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="昼夜切换">
        <button
          type="button"
          className={dayNight === 'day' ? 'is-active' : undefined}
          aria-label="昼夜：白天"
          aria-pressed={dayNight === 'day'}
          onClick={() => setDayNight('day')}
        >
          白天
        </button>
        <button
          type="button"
          className={dayNight === 'night' ? 'is-active' : undefined}
          aria-label="昼夜：夜间"
          aria-pressed={dayNight === 'night'}
          onClick={() => setDayNight('night')}
        >
          夜间
        </button>
      </div>

      <div className="seg" role="group" aria-label="画质切换">
        {QUALITIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={quality === item.id ? 'is-active' : undefined}
            aria-label={`画质：${item.label}`}
            aria-pressed={quality === item.id}
            onClick={() => setQuality(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="text-button"
        aria-label={floorListOpen ? '折叠楼层栏' : '展开楼层栏'}
        aria-expanded={floorListOpen}
        onClick={onToggleFloorList}
      >
        {floorListOpen ? '收起楼层' : '展开楼层'}
      </button>

      <button
        type="button"
        id="alarm-toggle"
        className={alarmOpen ? 'text-button alarm-toggle is-active' : 'text-button alarm-toggle'}
        aria-label={alarmOpen ? '关闭告警抽屉' : '打开告警抽屉'}
        aria-pressed={alarmOpen}
        aria-controls="alarm-drawer"
        onClick={onToggleAlarm}
      >
        告警
      </button>

      <input
        className="search"
        type="text"
        role="searchbox"
        placeholder="搜索工位、设备或人员"
        aria-label="搜索工位、设备或人员"
        autoComplete="off"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
    </header>
  )
}
