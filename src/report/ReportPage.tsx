import { useEffect, useMemo, useState } from 'react'
import {
  buildingSummary,
  buildExceptionRows,
  deskCell,
  deviceCell,
  filterAlarmRows,
  floorLevel,
  rangeLabel,
  statusCell,
  statusFilterLabel,
} from '../alarms/alarmRows'
import { parseReportFilter, mainSearchFromReport } from '../alarms/reportQuery'
import { useTwinData } from '../data/useTwinData'
import { useTwinStore } from '../store/store'
import { formatChinaTime } from '../alarms/time'
import { navigateTo } from './navigate'
import { reportShotState, subscribeReportShot } from './reportShotState'
import './report.css'

export function ReportPage() {
  useTwinData()
  const floors = useTwinStore((state) => state.floors)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const people = useTwinStore((state) => state.people)
  const alarms = useTwinStore((state) => state.alarms)
  const status = useTwinStore((state) => state.status)
  const error = useTwinStore((state) => state.error)
  const filter = useMemo(() => parseReportFilter(window.location.search), [])
  const ready = status === 'ready'

  useEffect(() => {
    const previousTitle = document.title
    document.title = '告警报告 · 宇视总部大楼数字孪生'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.reportReady = ready ? 'true' : status === 'error' ? 'error' : 'false'
    return () => {
      delete document.documentElement.dataset.reportReady
    }
  }, [ready, status])

  useEffect(() => {
    const state = useTwinStore.getState()
    const sameRange =
      state.alarmFloorRange?.start === filter.range?.start && state.alarmFloorRange?.end === filter.range?.end
    if (!sameRange) state.setAlarmFloorRange(filter.range)
    if (state.statusFilter.join() !== filter.statusFilter.join()) state.setStatusFilter(filter.statusFilter)
  }, [filter])

  const summary = useMemo(
    () => buildingSummary({ floors, desks, devices, people }),
    [floors, desks, devices, people],
  )
  const floorRows = useMemo(
    () => [...floors].sort((left, right) => floorLevel(left.id) - floorLevel(right.id)),
    [floors],
  )
  const details = useMemo(
    () => filterAlarmRows(buildExceptionRows({ devices, alarms }), filter.range, filter.statusFilter),
    [devices, alarms, filter],
  )
  const generatedAt = useMemo(() => formatChinaTime(Date.now()), [])
  const [shot, setShot] = useState(reportShotState)

  useEffect(() => subscribeReportShot(setShot), [])

  function goBack() {
    navigateTo('/', mainSearchFromReport(window.location.search))
  }

  async function onEmbed() {
    try {
      const mod = await import('./reportShot')
      await mod.embedCurrentView()
    } catch {
      // 截图包没加载到时留在报告页。加载到之后的失败由包内提示。
    }
  }

  return (
    <div className="report-page">
      <div className="report-toolbar">
        <button type="button" onClick={goBack}>
          返回孪生
        </button>
        <p>A4 纵向 · 可离线打印</p>
        <button type="button" onClick={() => void onEmbed()} disabled={shot.pending}>
          嵌入当前视图
        </button>
        <button type="button" onClick={() => window.print()} disabled={!ready}>
          打印
        </button>
        {shot.note ? (
          <p className="report-toolbar-note" role="status">
            {shot.note}
          </p>
        ) : null}
      </div>
      <article className="report-sheet" data-report-ready={ready ? 'true' : 'false'}>
        <h1>宇视总部大楼数字孪生告警报告</h1>
        <p className="report-meta">
          筛选：楼层 {rangeLabel(filter.range)} · 状态 {statusFilterLabel(filter.statusFilter)} · 生成时间 {generatedAt}
        </p>
        {shot.url ? (
          <figure className="report-shot" data-report-shot>
            <img src={shot.url} alt="当前三维视图" />
            <figcaption>当前三维视图</figcaption>
          </figure>
        ) : null}
        {status === 'loading' && <p>正在加载数据…</p>}
        {status === 'error' && <p>{error ?? '数据未能加载'}</p>}
        {ready && (
          <>
            <h2>概况统计</h2>
            <dl className="stat-grid">
              <div>
                <dt>楼层</dt>
                <dd>{summary.floorCount}</dd>
              </div>
              <div>
                <dt>工位</dt>
                <dd>{summary.deskCount}</dd>
              </div>
              <div>
                <dt>设备</dt>
                <dd>{summary.deviceCount}</dd>
              </div>
              <div>
                <dt>人员</dt>
                <dd>{summary.peopleCount}</dd>
              </div>
              <div>
                <dt>告警设备</dt>
                <dd>{summary.alarmCount}</dd>
              </div>
              <div>
                <dt>离线设备</dt>
                <dd>{summary.offlineCount}</dd>
              </div>
            </dl>

            <h2>各层告警 / 离线</h2>
            <table className="report-table">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '34%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>楼层</th>
                  <th>名称</th>
                  <th>告警</th>
                  <th>离线</th>
                </tr>
              </thead>
              <tbody>
                {floorRows.map((floor) => (
                  <tr key={floor.id}>
                    <td>{floor.id}</td>
                    <td>{floor.name}</td>
                    <td className={floor.alarmCount > 0 ? 'cell-alarm' : undefined}>{floor.alarmCount}</td>
                    <td className={floor.offlineCount > 0 ? 'cell-offline' : undefined}>{floor.offlineCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>告警明细（当前筛选）</h2>
            <p className="report-note" data-detail-count={details.length}>
              共 {details.length} 条，与告警抽屉当前筛选一致。
            </p>
            <table className="report-table">
              <colgroup>
                <col style={{ width: '11%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>楼层</th>
                  <th>工位</th>
                  <th>设备</th>
                  <th>状态</th>
                  <th>时间</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {details.map((row) => (
                  <tr key={row.deviceId}>
                    <td>{row.floorId}</td>
                    <td>{deskCell(row)}</td>
                    <td>{deviceCell(row)}</td>
                    <td className={row.status === 'alarm' ? 'cell-alarm' : 'cell-offline'}>{statusCell(row)}</td>
                    <td>{row.time}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {details.length === 0 && <p className="report-note">暂无筛选结果。</p>}
          </>
        )}
      </article>
    </div>
  )
}
