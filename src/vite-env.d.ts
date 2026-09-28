/// <reference types="vite/client" />

declare module 'troika-three-text' {
  import type { ColorRepresentation, Material, Mesh, Object3D } from 'three'

  export class Text extends Mesh {
    text: string
    font: string | null
    fontSize: number
    color: ColorRepresentation | null
    anchorX: string | number
    anchorY: string | number
    sync: (callback?: () => void) => void
    dispose: () => void
  }

  export class BatchedText extends Text {
    add: (...objects: Object3D[]) => this
    remove: (...objects: Object3D[]) => this
    material: Material | Material[]
  }

  export function preloadFont(
    options: { font: string; characters?: string | string[]; sdfGlyphSize?: number },
    callback?: () => void,
  ): void
}

interface TwinRenderStats {
  calls: number
  triangles: number
}

interface TwinInteriorStats {
  floorId: string
  dataDesks: number
  renderedDesks: number
}

interface TwinCutStats {
  hidden: string[]
  visibleShells: number
  roofVisible: boolean
  aboveGradeVisible: boolean
}

interface Window {
  __twinReady?: boolean
  __twinStats?: TwinRenderStats
  __twinBadges?: number
  __twinFly?: { floorId: string; nonce: number } | null
  __twinProject?: (x: number, y: number, z: number) => { x: number; y: number; behind: boolean }
  __twinInterior?: TwinInteriorStats
  __twinCut?: TwinCutStats
  __twinRig?: {
    minDistance: number
    maxDistance: number
    distance: number
    polarAngle: number
    maxPolarAngle: number
    minPolarAngle: number
    camera: { fov: number; position: import('three').Vector3; updateProjectionMatrix: () => void }
    rotatePolarTo: (polarAngle: number, enableTransition?: boolean) => Promise<void>
    rotateTo: (azimuthAngle: number, polarAngle: number, enableTransition?: boolean) => Promise<void>
    dollyTo: (distance: number, enableTransition?: boolean) => Promise<void>
    setTarget: (x: number, y: number, z: number, enableTransition?: boolean) => Promise<void>
    setLookAt: (
      x: number,
      y: number,
      z: number,
      tx: number,
      ty: number,
      tz: number,
      enableTransition?: boolean,
    ) => Promise<void>
    setBoundary: (box: import('three').Box3 | null) => void
    getPosition: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    getTarget: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    update: (delta: number) => boolean
  }
}
