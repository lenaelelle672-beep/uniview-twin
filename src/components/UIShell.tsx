import { useState } from 'react'
import { useTwinData } from '../data/useTwinData'
import { useUrlSync } from '../url/useUrlSync'
import { AlarmDrawer } from './AlarmDrawer'
import { DetailPanel } from './DetailPanel'
import { FloorList } from './FloorList'
import { Stage } from './Stage'
import { TopBar } from './TopBar'

export function UIShell() {
  useUrlSync()
  useTwinData()
  const [floorListOpen, setFloorListOpen] = useState(true)
  const [alarmOpen, setAlarmOpen] = useState(false)

  return (
    <div className="app">
      <TopBar
        floorListOpen={floorListOpen}
        onToggleFloorList={() => setFloorListOpen((open) => !open)}
        alarmOpen={alarmOpen}
        onToggleAlarm={() => setAlarmOpen((open) => !open)}
      />
      <div className="workspace">
        <div className="floor-rail">
          <FloorList open={floorListOpen} />
        </div>
        <Stage />
        <DetailPanel />
      </div>
      <AlarmDrawer open={alarmOpen} floorListOpen={floorListOpen} onClose={() => setAlarmOpen(false)} />
    </div>
  )
}
