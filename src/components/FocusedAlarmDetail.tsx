import { useMemo } from 'react'
import { buildFocusDetail } from '../alarms/focusDetail'
import { useTwinStore } from '../store/store'
import './focusedAlarmDetail.css'

export function FocusedAlarmDetail() {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const people = useTwinStore((state) => state.people)
  const alarms = useTwinStore((state) => state.alarms)

  const detail = useMemo(
    () => buildFocusDetail({ desks, devices, people, alarms }, { deskId: focusedDeskId, deviceId: focusedDeviceId }),
    [desks, devices, people, alarms, focusedDeskId, focusedDeviceId],
  )

  if (!detail || (!detail.desk && !detail.device)) return null

  const statusClass = detail.device?.status === 'alarm' ? 'cell-alarm' : 'cell-offline'

  return (
    <section
      className="focus-card"
      aria-label="选中的工位和设备"
      data-detail-desk={detail.desk?.id ?? ''}
      data-detail-device={detail.device?.id ?? ''}
    >
      <h3>工位</h3>
      {detail.desk ? (
        <dl className="detail-list">
          <div>
            <dt>工位号</dt>
            <dd>{detail.desk.id}</dd>
          </div>
          <div>
            <dt>分区</dt>
            <dd>{detail.desk.zoneLabel}</dd>
          </div>
          <div>
            <dt>使用人</dt>
            <dd>{detail.desk.personName}</dd>
          </div>
        </dl>
      ) : (
        <p className="panel-hint">该设备没有工位。</p>
      )}
      <h3>设备</h3>
      {detail.device ? (
        <dl className="detail-list">
          <div>
            <dt>编号</dt>
            <dd>
              {detail.device.typeLabel} · {detail.device.id}
            </dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd className={statusClass}>{detail.device.statusLabel}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{detail.device.time}</dd>
          </div>
          <div>
            <dt>说明</dt>
            <dd>{detail.device.message}</dd>
          </div>
        </dl>
      ) : (
        <p className="panel-hint">未选中具体设备。</p>
      )}
    </section>
  )
}
