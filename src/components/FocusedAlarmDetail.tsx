import { useMemo } from 'react'
import { buildFocusDetail } from '../alarms/focusDetail'
import { deviceTypeLabel, statusLabel } from '../alarms/labels'
import { resolveWorkstationRef, workstationIps } from '../locate/ref'
import { useTwinStore } from '../store/store'
import type { Device } from '../types'
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
  const deskDevices = detail.desk ? devices.filter((device) => device.deskId === detail.desk?.id) : []
  const selectedIp = ipOf(devices.find((device) => device.id === detail.device?.id) ?? null)

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
          {selectedIp && (
            <div>
              <dt>IP</dt>
              <dd>{selectedIp}</dd>
            </div>
          )}
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
        <DeskDeviceList devices={deskDevices} />
      )}
    </section>
  )
}

function DeskDeviceList({ devices }: { devices: Device[] }) {
  if (devices.length === 0) return <p className="panel-hint">此工位暂无设备。</p>
  return (
    <ul className="desk-devices">
      {devices.map((device) => (
        <li key={device.id}>
          <span>
            {deviceTypeLabel(device.type)} · {device.id}
          </span>
          <span>{statusLabel(device.status)}</span>
          <span>{ipOf(device) ?? '—'}</span>
        </li>
      ))}
    </ul>
  )
}

function ipOf(device: Device | null): string | null {
  if (!device?.deskId) return null
  if (device.type !== 'pc' && device.type !== 'phone') return null
  const ref = resolveWorkstationRef(device.deskId)
  if (!ref || ref.floorId !== device.floorId) return null
  const ips = workstationIps(device.floorId, device.deskId)
  return device.type === 'pc' ? ips.pc : ips.phone
}
