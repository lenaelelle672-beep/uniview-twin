import { useTwinStore } from '../store/store'
import { FocusedAlarmDetail } from './FocusedAlarmDetail'

export function DetailPanel() {
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const cam = useTwinStore((state) => state.cam)
  const floors = useTwinStore((state) => state.floors)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const status = useTwinStore((state) => state.status)

  const floor = floors.find((item) => item.id === selectedFloor)
  const deskCount = selectedFloor ? desks.filter((desk) => desk.floorId === selectedFloor).length : 0
  const deviceCount = selectedFloor ? devices.filter((device) => device.floorId === selectedFloor).length : 0

  return (
    <aside className="detail-panel" aria-label="详情">
      <div className="panel-title">{floor ? `${floor.id} · ${floor.name}` : '详情'}</div>
      <div className="detail-body">
        <FocusedAlarmDetail />
        {status === 'error' && <p className="panel-hint">数据未能加载，无法显示详情。</p>}
        {status !== 'error' && !selectedFloor && !focusedDeskId && !focusedDeviceId && (
          <p className="panel-hint">请在左侧选择楼层。</p>
        )}
        {status !== 'error' && selectedFloor && !floor && (
          <p className="panel-hint">当前数据里没有楼层 {selectedFloor}。</p>
        )}
        {floor && (
          <dl className="detail-list">
            <div>
              <dt>楼层</dt>
              <dd>
                {floor.id} {floor.name}
              </dd>
            </div>
            <div>
              <dt>工位</dt>
              <dd>{deskCount}</dd>
            </div>
            <div>
              <dt>设备</dt>
              <dd>{deviceCount}</dd>
            </div>
            <div>
              <dt>告警</dt>
              <dd>{floor.alarmCount}</dd>
            </div>
            <div>
              <dt>离线</dt>
              <dd>{floor.offlineCount}</dd>
            </div>
          </dl>
        )}
        {cam && <p className="panel-hint">固定机位 {cam}</p>}
        {!focusedDeskId && !focusedDeviceId && <p className="panel-note">设备与人员详情将在后续任务中展示。</p>}
      </div>
    </aside>
  )
}
