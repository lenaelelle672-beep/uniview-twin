import { useState } from 'react'
import { useTwinData } from '../data/useTwinData'
import { useUrlSync } from '../url/useUrlSync'
import { DetailPanel } from './DetailPanel'
import { FloorList } from './FloorList'
import { Stage } from './Stage'
import { TopBar } from './TopBar'

export function UIShell() {
  useUrlSync()
  useTwinData()
  const [floorListOpen, setFloorListOpen] = useState(true)

  return (
    <div className="app">
      <TopBar floorListOpen={floorListOpen} onToggleFloorList={() => setFloorListOpen((open) => !open)} />
      <div className="workspace">
        <FloorList open={floorListOpen} />
        <Stage />
        <DetailPanel />
      </div>
    </div>
  )
}
