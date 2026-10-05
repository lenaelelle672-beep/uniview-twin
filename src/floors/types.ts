export interface FloorColumn {
  id: string
  x: number
  z: number
  w: number
  d: number
  shape: 'rect' | 'round'
}

export interface FloorCore {
  id: string
  name: string
  polygon: Array<[number, number]>
}

export interface FloorRoom {
  name: string
  label: [number, number]
  polygon: Array<[number, number]> | null
  confidence: string
}

export interface FloorWall {
  kind: string
  a: [number, number]
  b: [number, number]
}

export interface FloorDesk {
  id: string
  n: number
  x: number
  z: number
  rot: number
  size: [number, number]
  colEdgeDist_m: number
  nearestColumn: string | null
}

export interface DeskRuleHit {
  desk: string
  column: string
  centreToColumnEdge_m: number
}

export interface WalkComponent {
  name: string
  area_m2: number
  paths: number
  pathIndex: [number, number]
}

export interface FloorPlan {
  floorId: string
  outline: Array<[number, number]>
  cores: FloorCore[]
  columns: FloorColumn[]
  rooms: FloorRoom[]
  walls: FloorWall[]
  desks: FloorDesk[]
  walkPaths: Array<Array<[number, number]>>
  walkMeta: { components: WalkComponent[]; pathCount: number } | null
  deskRule: { min: number; violations: DeskRuleHit[] }
}
