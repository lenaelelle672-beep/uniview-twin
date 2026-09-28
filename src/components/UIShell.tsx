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
      <h1 className="visually-hidden">宇视总部大楼数字孪生</h1>
      <TopBar floorListOpen={floorListOpen} onToggleFloorList={() => setFloorListOpen((open) => !open)} />
      <div className="workspace">
        <FloorList open={floorListOpen} />
        <Stage />
        <DetailPanel />
      </div>
    </div>
  )
}
