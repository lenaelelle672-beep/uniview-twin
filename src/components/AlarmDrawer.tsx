import { useMemo, useState } from 'react'
import {
  alarmBadgeSum,
  buildExceptionRows,
  deskCell,
  deviceCell,
  effectiveStatuses,
  filterAlarmRows,
  floorLevel,
  statusCell,
  type AlarmListRow,
} from '../alarms/alarmRows'
import { alarmsToCsv, csvFilename } from '../alarms/csv'
import { downloadTextFile } from '../alarms/downloadCsv'
import { buildReportSearch } from '../alarms/reportQuery'
import { isFloorId } from '../data/floors'
import { navigateTo } from '../report/navigate'
import { useTwinStore } from '../store/store'
import '../alarms/alarm.css'

interface AlarmDrawerProps {
  open: boolean
  floorListOpen: boolean
  onClose: () => void
}

export function AlarmDrawer({ open, floorListOpen, onClose }: AlarmDrawerProps) {
  const floors = useTwinStore((state) => state.floors)
  const devices = useTwinStore((state) => state.devices)
  const alarms = useTwinStore((state) => state.alarms)
  const status = useTwinStore((state) => state.status)
  const range = useTwinStore((state) => state.alarmFloorRange)
  const statusFilter = useTwinStore((state) => state.statusFilter)
  const setAlarmFloorRange = useTwinStore((state) => state.setAlarmFloorRange)
  const setStatusFilter = useTwinStore((state) => state.setStatusFilter)
  const focusDevice = useTwinStore((state) => state.focusDevice)
  const [draftStart, setDraftStart] = useState(() => range?.start ?? '')
  const [draftEnd, setDraftEnd] = useState(() => range?.end ?? '')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusNote, setFocusNote] = useState('')

  const floorOptions = useMemo(
    () => [...floors].sort((left, right) => floorLevel(left.id) - floorLevel(right.id)),
    [floors],
  )
  const listed = useMemo(() => {
    const built = buildExceptionRows({ devices, alarms })
    return filterAlarmRows(built, range, statusFilter)
  }, [devices, alarms, range, statusFilter])
  const badgeSum = useMemo(() => alarmBadgeSum(floors, range), [floors, range])
  const statuses = effectiveStatuses(statusFilter)
  const alarmOnly = statuses.length === 1 && statuses[0] === 'alarm'
  const ready = status === 'ready'
  const partialRange = Boolean(draftStart) !== Boolean(draftEnd)

  function commitRange(start: string, end: string) {
    setDraftStart(start)
    setDraftEnd(end)
    if (start && end && isFloorId(start) && isFloorId(end)) {
      setAlarmFloorRange({ start, end })
      return
    }
    setAlarmFloorRange(null)
  }

  function toggleStatus(nextStatus: 'alarm' | 'offline') {
    const current = effectiveStatuses(statusFilter)
    const next = current.includes(nextStatus)
      ? current.filter((item) => item !== nextStatus)
      : [...current, nextStatus]
    if (next.length === 0) return
    setStatusFilter(next)
  }

  function pick(row: AlarmListRow) {
    setActiveId(row.deviceId)
    focusDevice({ floor: row.floorId, deskId: row.deskId })
    setFocusNote(
      row.deskId ? `已选择工位 ${row.deskId}，楼层 ${row.floorId}` : `已选择楼层 ${row.floorId}，该设备没有工位`,
    )
  }

  function exportCsv() {
    downloadTextFile(csvFilename(range), alarmsToCsv(listed), 'text/csv;charset=utf-8')
  }

  function openReport() {
    const state = useTwinStore.getState()
    const search = buildReportSearch({
      range: state.alarmFloorRange,
      statusFilter: state.statusFilter,
      quality: state.urlQuality,
      dataUrl: state.dataUrl,
    })
    navigateTo('/report', search)
  }

  return (
    <aside
      id="alarm-drawer"
      className={floorListOpen ? 'alarm-drawer' : 'alarm-drawer is-floor-collapsed'}
      aria-label="告警抽屉"
      hidden={!open}
    >
      <div className="alarm-head">
        <h2>告警</h2>
        <button type="button" className="alarm-close" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="alarm-count" data-list-count={listed.length} data-badge-sum={badgeSum}>
        <strong>{ready ? listed.length : '—'}</strong>
        <span>列表条数</span>
        {alarmOnly && (
          <>
            <strong>{ready ? badgeSum : '—'}</strong>
            <span>侧栏告警徽标合计{range ? `（${range.start}~${range.end}）` : ''}</span>
          </>
        )}
      </p>
      <div className="alarm-filters">
        <div className="alarm-range">
          <label>
            起始楼层
            <select
              aria-label="告警起始楼层"
              value={draftStart}
              onChange={(event) => commitRange(event.target.value, draftEnd)}
            >
              <option value="">全部</option>
              {floorOptions.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.id} · {floor.name}
                </option>
              ))}
            </select>
          </label>
          <span>至</span>
          <label>
            结束楼层
            <select
              aria-label="告警结束楼层"
              value={draftEnd}
              onChange={(event) => commitRange(draftStart, event.target.value)}
            >
              <option value="">全部</option>
              {floorOptions.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.id} · {floor.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="text-button" onClick={() => commitRange('', '')}>
            清除范围
          </button>
        </div>
        {partialRange && <p className="alarm-hint">请同时选择起始和结束楼层，范围才会生效。</p>}
        <div className="alarm-status" role="group" aria-label="状态筛选">
          <span>状态</span>
          <button
            type="button"
            className={statuses.includes('alarm') ? 'chip is-on' : 'chip'}
            aria-pressed={statuses.includes('alarm')}
            onClick={() => toggleStatus('alarm')}
          >
            告警
          </button>
          <button
            type="button"
            className={statuses.includes('offline') ? 'chip chip-offline is-on' : 'chip'}
            aria-pressed={statuses.includes('offline')}
            onClick={() => toggleStatus('offline')}
          >
            离线
          </button>
        </div>
        <div className="alarm-actions">
          <button type="button" onClick={exportCsv} disabled={!ready}>
            导出 CSV
          </button>
          <button type="button" className="secondary" onClick={openReport} disabled={!ready}>
            生成报告
          </button>
        </div>
      </div>
      <p className="alarm-focus" role="status">
        {focusNote}
      </p>
      <div className="alarm-table">
        <div className="alarm-cols" aria-hidden="true">
          <span>楼层</span>
          <span>工位</span>
          <span>设备</span>
          <span>状态</span>
          <span>时间</span>
        </div>
        {status === 'loading' && <p className="alarm-empty">正在加载告警…</p>}
        {status === 'error' && <p className="alarm-empty">数据未能加载，无法列出告警。</p>}
        {ready && listed.length === 0 && <p className="alarm-empty">当前筛选下没有记录。</p>}
        {ready &&
          listed.map((row) => (
            <button
              key={row.deviceId}
              type="button"
              className={activeId === row.deviceId ? 'alarm-row is-active' : 'alarm-row'}
              aria-label={`${row.floorId} ${deskCell(row)} ${deviceCell(row)} ${statusCell(row)} ${row.time}`}
              onClick={() => pick(row)}
            >
              <span>{row.floorId}</span>
              <span>{deskCell(row)}</span>
              <span className="cell-device">{deviceCell(row)}</span>
              <span className={row.status === 'alarm' ? 'cell-alarm' : 'cell-offline'}>{statusCell(row)}</span>
              <span className="cell-time">{row.time}</span>
            </button>
          ))}
      </div>
    </aside>
  )
}
